"""Download public engine assets into the build directory, never a user cache."""
import os
import sys
from pathlib import Path
if __name__ == '__main__':
    import babeldoc.const as const
    root = Path(sys.argv[1]).resolve()
    const.CACHE_FOLDER = root
    const.TIKTOKEN_CACHE_FOLDER = root / 'tiktoken'
    const.TIKTOKEN_CACHE_FOLDER.mkdir(parents=True, exist_ok=True)
    os.environ['TIKTOKEN_CACHE_DIR'] = str(const.TIKTOKEN_CACHE_FOLDER)
    from babeldoc.assets.assets import warmup
    warmup()
    from rapidocr import RapidOCR, LangRec, OCRVersion, ModelType
    RapidOCR(params={
        'Global.model_root_dir': str(root / 'rapidocr'),
        'Global.log_level': 'error',
        'Rec.lang_type': LangRec.EN,
        'Rec.ocr_version': OCRVersion.PPOCRV5,
        'Rec.model_type': ModelType.MOBILE,
    })
    print('PDF fonts, layout model and English OCR models ready.')
