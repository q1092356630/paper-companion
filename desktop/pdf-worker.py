"""Pinned pdf2zh-next adapter. Input/output are newline JSON over stdio."""
import asyncio
import json
import logging
import os
import sys
from pathlib import Path
import importlib.util

protocol_output = sys.stdout
sys.stdout = sys.stderr

# Executed in spawned workers as well, before the engine is imported.
if os.environ.get("PAPER_ENGINE_CACHE"):
    import babeldoc.const as engine_constants
    engine_constants.CACHE_FOLDER = Path(os.environ["PAPER_ENGINE_CACHE"])
    engine_constants.TIKTOKEN_CACHE_FOLDER = engine_constants.CACHE_FOLDER / "tiktoken"
    engine_constants.TIKTOKEN_CACHE_FOLDER.mkdir(parents=True, exist_ok=True)
    os.environ["TIKTOKEN_CACHE_DIR"] = str(engine_constants.TIKTOKEN_CACHE_FOLDER)


def emit(value):
    protocol_output.write(json.dumps(value, ensure_ascii=False) + "\n")
    protocol_output.flush()


async def main(request):
    if request.get("operation") == "metadata":
        import pymupdf
        with pymupdf.open(request["input"]) as doc:
            if doc.needs_pass or not len(doc):
                raise RuntimeError("PDF 无法读取首页信息")
            page = doc[0]
            text = page.get_text("text", sort=True)
            spans = [s for b in page.get_text("dict")["blocks"] for line in b.get("lines", []) if line["bbox"][1] < page.rect.height * .5 for s in line["spans"] if s["text"].strip()]
            largest = max((s["size"] for s in spans), default=0)
            title = " ".join(s["text"].strip() for s in spans if s["size"] >= largest * .95)
            emit({"type": "finish", "text": text[:16000], "title": title if 25 <= len(title) <= 500 else ""})
        return
    if request.get("operation") == "merge-translations":
        import pymupdf
        inputs, pages = request["inputs"], request["pages"]
        if not inputs or len(inputs) != len(pages):
            raise RuntimeError("译文页数不完整，请先完成全文翻译")
        target = Path(request["output"]).resolve() / "translated.pdf"
        with pymupdf.open() as merged:
            for number, (file, dimensions) in enumerate(zip(inputs, pages), 1):
                try:
                    with pymupdf.open(file) as source:
                        if not source.is_pdf or source.needs_pass or len(source) != 1:
                            raise ValueError("应为未加密的单页 PDF")
                        rect = source[0].rect
                        if any(abs(actual - dimensions[key]) > 1 for key, actual in (("width", rect.width), ("height", rect.height))):
                            raise ValueError("译文尺寸与原文不一致")
                        merged.insert_pdf(source)
                except Exception as error:
                    raise RuntimeError(f"第 {number} 页译文 PDF 无法导出：{error}") from error
            merged.set_metadata({"title": str(request.get("title", "文献")) + " - 中文译文", "creator": "文献伴读"})
            merged.save(target, garbage=4, deflate=True)
        with pymupdf.open(target) as verified:
            if len(verified) != len(inputs):
                raise RuntimeError("导出的译文 PDF 页数不完整")
        emit({"type": "finish", "pdf": str(target), "pageCount": len(inputs)})
        return
    if request.get("operation") == "card-png":
        import pymupdf
        with pymupdf.open(request["input"]) as document:
            if len(document) != 1:
                raise RuntimeError("卡片长图分页异常，请改用 PDF 导出，内容不会截断。")
            page = document[0]
            if page.rect.width * page.rect.height * 4 > 50000000:
                raise RuntimeError("卡片长图过大，请使用分页 PDF 导出。")
            image = Path(request["output"]).resolve() / "card.png"
            page.get_pixmap(matrix=pymupdf.Matrix(2, 2), alpha=False).save(image)
            emit({"type": "finish", "image": str(image)})
        return
    spec = importlib.util.spec_from_file_location("pdf_prepare", Path(__file__).with_name("pdf-prepare.py"))
    prepare = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(prepare)
    output = Path(request["output"]).resolve()
    output.mkdir(parents=True, exist_ok=True)
    if request.get("operation") == "index":
        emit(prepare.index_file(request["input"], output, emit))
        return
    from pdf2zh_next.config.model import SettingsModel
    from pdf2zh_next.high_level import do_translate_async_stream
    import pymupdf

    pages = request["pages"]
    source = pymupdf.open(request["input"])
    recognized = prepare.ocr_pages(source, pages, emit)
    protected = prepare.preserve_regions(source, pages, emit)
    prepared = output / "prepared.pdf"
    source.save(prepared, garbage=4, deflate=True)
    source.close()
    settings = SettingsModel.model_validate({
        "translation": {
            "lang_in": "en", "lang_out": "zh-CN" if request.get("provider") == "qwen-mt" else "zh", "output": str(output),
            "qps": 1 if request.get("provider") == "qwen-mt" else 8, "pool_max_workers": 2 if request.get("provider") == "qwen-mt" else 8,
            "no_auto_extract_glossary": True,
            "primary_font_family": "serif",
        },
        "pdf": {
            "pages": ",".join(str(n) for n in pages),
            "no_dual": True, "watermark_output_mode": "no_watermark",
            "translate_table_text": False,
            "only_include_translated_page": True,
            "ocr_workaround": bool(recognized or request.get("ocr")),
            "skip_scanned_detection": bool(recognized or request.get("ocr")),
        },
        "translate_engine_settings": {
            "translate_engine_type": "QwenMt",
            "qwenmt_model": request["model"],
            "qwenmt_base_url": request["baseUrl"],
            "qwenmt_api_key": request["key"],
        } if request.get("provider") == "qwen-mt" else {
            "translate_engine_type": "OpenAI",
            "openai_model": request.get("model", "paper-codex-layout-v1"),
            "openai_base_url": request["baseUrl"],
            "openai_api_key": request["key"],
            "openai_timeout": "600", "openai_enable_json_mode": True,
        },
    })
    async for event in do_translate_async_stream(settings, prepared):
        if event["type"] == "error":
            raise RuntimeError(str(event.get("error", "PDF translation failed")))
        if event["type"] == "finish":
            result = event["translate_result"]
            translated = Path(result.mono_pdf_path)
            doc = pymupdf.open(translated)
            if len(doc) != len(pages):
                raise RuntimeError("译文页数与所选原文页数不一致")
            translated_pages = []
            for index, original_number in enumerate(pages):
                page = doc[index]
                text = page.get_text()
                # A successful process exit must not masquerade as translation.
                if sum("\u4e00" <= c <= "\u9fff" for c in text) < 8:
                    raise RuntimeError(f"第 {original_number} 页未生成足够的中文译文，请核对页面内容后重试")
                target = output / f"page-{original_number}.pdf"
                part = pymupdf.open()
                part.insert_pdf(doc, from_page=index, to_page=index)
                part.save(target, garbage=4, deflate=True)
                part.close()
                blocks = prepare.reading_blocks(page)
                translated_pages.append({"page": original_number, "path": str(target),
                                         "width": page.rect.width, "height": page.rect.height,
                                         "text": text, "blocks": blocks,
                                         "protectedRegions":protected[original_number]})
            doc.close()
            emit({"type": "finish", "pages": translated_pages,
                  "engine": "pdf2zh-next-2.9.0/babeldoc-0.6.2"})
        elif event["type"].startswith("progress"):
            emit({k: event[k] for k in ("type", "stage", "overall_progress", "stage_progress") if k in event})


if __name__ == "__main__":
    logging.basicConfig(level=logging.WARNING, stream=sys.stderr)
    try:
        asyncio.run(main(json.loads(sys.stdin.readline())))
    except Exception as error:
        emit({"type": "error", "message": str(error)[:1000]})
        raise SystemExit(1)
