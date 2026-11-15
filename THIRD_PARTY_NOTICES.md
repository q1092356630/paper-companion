# Third-party components

This is a Windows/macOS source distribution. Application source is supplied in this repository (`desktop/`, `src/desktop/`, and `scripts/`) under AGPL-3.0-only. Upstream source and licenses are linked below. Python wheel license files remain in the bundled runtime's `lib/python3.12/site-packages/*dist-info/` (macOS) or `Lib/site-packages/*dist-info/` (Windows) directories. Electron and PDF.js asset licenses remain with their distributions.

| Component | Pinned/runtime version | License / source |
|---|---|---|
| PDFMathTranslate-next | 2.9.0 | AGPL-3.0 — https://github.com/PDFMathTranslate-next/PDFMathTranslate-next/tree/v2.9.0 |
| BabelDOC | 0.6.2 | AGPL-3.0 — https://github.com/funstory-ai/BabelDOC |
| PyMuPDF | 1.25.2 | AGPL-3.0 — https://github.com/pymupdf/PyMuPDF |
| RapidOCR | 3.9.2 | Apache-2.0 — https://github.com/RapidAI/RapidOCR |
| ONNX Runtime | 1.30.0 | MIT — https://github.com/microsoft/onnxruntime |
| OpenCV wheels | 4.11.0.86 | Apache-2.0 and bundled notices — https://github.com/opencv/opencv-python |
| NumPy | 2.2.6 | BSD-3-Clause and bundled notices — https://github.com/numpy/numpy |
| PDF.js | 6.3.289 | Apache-2.0 — https://github.com/mozilla/pdf.js |
| Electron | 44.4.5 | MIT and Chromium notices — https://github.com/electron/electron |
| React | 19.2.0 | MIT — https://github.com/facebook/react |

OCR and layout model assets are those distributed/downloaded by the pinned RapidOCR and BabelDOC packages. Complete Python dependency versions are in `scripts/pdf-runtime-lock.txt`; JavaScript dependencies are in `pnpm-lock.yaml`. No upstream Python package source was modified; adaptation is in the supplied `desktop/pdf-prepare.py`, `pdf-worker.py`, and the local model bridge.

## Optional downloaded journal data — ShowJCR

Source: https://github.com/hitfyd/ShowJCR (repository GPL-3.0). The independently implemented CSV adapter downloads the public CAS and JCR source tables to the local user library; it does not incorporate ShowJCR executable code. Repository license text: https://github.com/hitfyd/ShowJCR/blob/master/LICENSE. Original journal-metric data and trademarks remain attributable to their original providers; repository licensing is not represented as ownership of those data. Every cache records exact repository commit, source paths, edition years and synchronization time. Community data is not an official live subscription service.

Standalone CPython is downloaded through uv from https://github.com/astral-sh/python-build-standalone . Python and bundled library licenses remain in the runtime. uv is a build tool and is not bundled with the application.
