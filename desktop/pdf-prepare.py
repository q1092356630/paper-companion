"""Local OCR and preservation of non-prose regions for the pinned PDF engine."""
import re
import os
from pathlib import Path
import numpy as np
import pymupdf


def reading_order(blocks, width):
    # Full-width headings divide a page into bands; within each band read columns.
    center = width / 2
    spanning = sorted([b for b in blocks if b[0] < center-30 and b[2] > center+30], key=lambda b: b[1])
    remaining = [b for b in blocks if b not in spanning]
    ordered = []
    def columns(items):
        left = sorted([b for b in items if (b[0]+b[2])/2 < center], key=lambda b: b[1])
        right = sorted([b for b in items if (b[0]+b[2])/2 >= center], key=lambda b: b[1])
        return left + right
    for span in spanning:
        above = [b for b in remaining if b[1] < span[1]]
        ordered += columns(above) + [span]
        remaining = [b for b in remaining if b not in above]
    ordered += columns(remaining)
    return ordered


def reading_blocks(page):
    blocks = [b for b in page.get_text("blocks") if b[6] == 0 and b[4].strip()]
    ordered = reading_order(blocks, page.rect.width)
    return [{"id": f"b{i}", "x": b[0], "y": b[1], "w": b[2]-b[0], "h": b[3]-b[1],
             "font": 10, "text": re.sub(r"[\x00-\x08]", " ", b[4]).strip()}
            for i, b in enumerate(ordered)]


def ocr_pages(doc, numbers, emit):
    engine = None
    recognized = []
    for n in numbers:
        page = doc[n-1]
        if len(page.get_text().strip()) >= 40:
            continue
        if not page.get_images():
            continue
        emit({"type": "progress_update", "stage": f"正在识别扫描页 {n}", "page": n})
        if engine is None:
            from rapidocr import RapidOCR, LangRec, OCRVersion, ModelType
            engine = RapidOCR(params={"Global.log_level": "error",
                                      **({"Global.model_root_dir": str(Path(os.environ["PAPER_ENGINE_CACHE"]) / "rapidocr")} if os.environ.get("PAPER_ENGINE_CACHE") else {}), "Global.max_side_len": 3000,
                                      "Rec.lang_type": LangRec.EN, "Rec.ocr_version": OCRVersion.PPOCRV5,
                                      "Rec.model_type": ModelType.MOBILE})
        pix = page.get_pixmap(matrix=pymupdf.Matrix(3, 3), alpha=False)
        image = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, 3)
        result = engine(image)
        if result.boxes is None or not result.txts:
            continue
        lines = []
        for points, text, confidence in zip(result.boxes, result.txts, result.scores):
            if confidence < 0.5 or not text.strip():
                continue
            points = np.asarray(points) / 3
            x0, y0 = points.min(axis=0); x1, y1 = points.max(axis=0)
            rect = pymupdf.Rect(float(x0), float(y0), float(x1), float(y1)) & page.rect
            if rect.is_empty:
                continue
            lines.append((rect.x0, rect.y0, rect.x1, rect.y1, text))
        count = 0
        # OCR returns alternating left/right rows. PDF content streams must follow
        # columns, or BabelDOC treats every switch of column as a new paragraph.
        for x0, y0, x1, y1, text in reading_order(lines, page.rect.width):
            rect = pymupdf.Rect(x0, y0, x1, y1)
            # Invisible search text leaves the original scanned pixels intact.
            fontname = "china-s" if re.search(r"[\u4e00-\u9fff]", text) else "helv"
            font = pymupdf.Font(fontname)
            fontsize = min(rect.height*.8, rect.width / max(1,font.text_length(text, fontsize=1)))
            page.insert_text((rect.x0, rect.y1-rect.height*.15), text, fontsize=max(2,fontsize), fontname=fontname, render_mode=3)
            count += len(text)
        if count:
            recognized.append(n)
    return recognized


def preserve_regions(doc, numbers, emit):
    from babeldoc.docvision.doclayout import OnnxModel
    model = OnnxModel.from_pretrained()
    protected = {}
    for n in numbers:
        page = doc[n-1]
        pix = page.get_pixmap(alpha=False)
        image = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width, 3)[:, :, ::-1]
        result = model.predict(image)[0]
        regions = []
        for box in result.boxes:
            label = result.names[box.cls]
            if label in ("figure", "table", "isolate_formula") and float(box.conf) >= .35:
                regions.append(pymupdf.Rect(*map(float,box.xyxy)))
        if n == 1:
            text_blocks=[b for b in page.get_text("dict")["blocks"] if b["type"] == 0]
            lines=[line for b in text_blocks for line in b["lines"] if abs(line["dir"][1]) < .1]
            abstract=[line for line in lines if re.fullmatch(r"\s*(?:Abstract|摘要)\s*", "".join(s["text"] for s in line["spans"]), re.I)]
            if abstract:
                abstract_top=min(line["bbox"][1] for line in abstract)
                above=[s for line in lines for s in line["spans"] if s["bbox"][3] < abstract_top and s["text"].strip()]
                if above:
                    largest=max(s["size"] for s in above)
                    title_bottom=max(s["bbox"][3] for s in above if s["size"] >= largest*.95)
                    # Author names and affiliations are identifiers, preserve their spelling.
                    for block in text_blocks:
                        if block["bbox"][1] > title_bottom+2 and block["bbox"][3] < abstract_top-2:
                            regions.append(pymupdf.Rect(block["bbox"]))
        for block in page.get_text("dict")["blocks"]:
            if block["type"] != 0 or len(block.get("lines",[])) < 3:
                continue
            spans = [s for line in block["lines"] for s in line["spans"]]
            total = sum(len(s["text"]) for s in spans)
            mono = sum(len(s["text"]) for s in spans if s["flags"] & 8)
            if total > 100 and mono / total > .45:
                regions.append(pymupdf.Rect(block["bbox"]))
        merged=[]
        for rect in regions:
            rect=(rect+(-1,-1,1,1)) & page.rect
            overlap=[other for other in merged if other.intersects(rect)]
            for other in overlap:
                rect |= other;merged.remove(other)
            merged.append(rect)
        snapshots=[(rect,page.get_pixmap(matrix=pymupdf.Matrix(3,3),clip=rect,alpha=False).tobytes("png")) for rect in merged]
        for rect,_ in snapshots:
            page.add_redact_annot(rect,fill=(1,1,1))
        if snapshots:
            # Rasterize only these regions; body text and original PDF stay intact.
            page.apply_redactions(images=2,graphics=2,text=0)
            for rect,png in snapshots:
                page.insert_image(rect,stream=png)
        protected[n]=len(snapshots)
        emit({"type":"progress_update","stage":"正在保护图表与公式","page":n})
    return protected


def index_file(source, output, emit):
    doc=pymupdf.open(source)
    if doc.needs_pass:
        raise RuntimeError("此 PDF 已加密，请先导入可直接阅读的副本")
    if len(doc)>600:
        raise RuntimeError("当前支持 600 页以内的 PDF")
    scanned=ocr_pages(doc,list(range(1,len(doc)+1)),emit)
    pages=[]
    for i,page in enumerate(doc):
        blocks=reading_blocks(page)
        pages.append({"width":page.rect.width,"height":page.rect.height,"text":"\n".join(b["text"] for b in blocks),"blocks":blocks,"ocr":i+1 in scanned})
    searchable=None
    if scanned:
        searchable=str(Path(output)/"searchable.pdf")
        doc.save(searchable,garbage=4,deflate=True)
    title=doc.metadata.get("title","")
    if not title and not scanned:
        heading_lines=[]
        for block in doc[0].get_text("dict")["blocks"]:
            for line in block.get("lines",[]):
                if line["bbox"][1] < doc[0].rect.height*.28 and abs(line["dir"][1]) < .1:
                    for span in line["spans"]:
                        if span["text"].strip():
                            heading_lines.append(span)
        if heading_lines:
            largest=max(s["size"] for s in heading_lines)
            title=" ".join(s["text"].strip() for s in heading_lines if s["size"] >= largest*.95)
            if len(title)>250 or len(title)<5:
                title=""
    doc.close()
    return {"type":"finish","pages":pages,"searchable":searchable,"title":title,"ocrPages":scanned}
