import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {runtimePython} from '../desktop/platform.cjs';
import {runPDFWorker} from '../desktop/layout.mjs';
const resources = path.resolve(process.argv[2] || '.runtime');
const runtime = {available: true, python: runtimePython(path.join(resources, 'pdf-runtime')), worker: process.argv[2] ? path.join(resources, 'app.asar.unpacked/desktop/pdf-worker.py') : path.resolve('desktop/pdf-worker.py'), assets: path.join(resources, 'pdf-assets')};
const work = await fs.mkdtemp(path.join(os.tmpdir(), 'paper smoke 中文 '));
try {
  const source = path.join(work, '多页 sample.pdf');
  const scanned = path.join(work, '扫描 sample.pdf');
  execFileSync(runtime.python, ['-c', `import pymupdf,sys
with pymupdf.open() as d:
 for n in range(2):
  p=d.new_page(); p.insert_text((50,70),'Research evidence page %s: accurate analysis and reading.'%(n+1)); p.insert_text((50,100),'中文编码测试',fontname='china-s')
 d.save(sys.argv[1])
 pix=d[0].get_pixmap(matrix=pymupdf.Matrix(2,2))
 with pymupdf.open() as image:
  p=image.new_page(); p.insert_image(p.rect,stream=pix.tobytes('png')); image.save(sys.argv[2])
`, source, scanned], {stdio: 'inherit', env: {...process.env, PYTHONUTF8: '1'}});
  const metadata = await runPDFWorker({operation: 'metadata', input: source, output: path.join(work, 'metadata')}, {runtime});
  assert.match(metadata.text, /中文编码测试/);
  const index = await runPDFWorker({operation: 'index', input: source, output: path.join(work, 'index')}, {runtime});
  assert.equal(index.pages.length, 2); assert.match(index.pages[1].text, /page 2/);
  const ocr = await runPDFWorker({operation: 'index', input: scanned, output: path.join(work, 'ocr')}, {runtime});
  assert.equal(ocr.pages.length, 1); assert.match(ocr.pages[0].text, /Research/i);
  console.log('PDF runtime smoke passed: Unicode paths, multipage indexing, metadata, scanned-page OCR.');
} finally {await fs.rm(work, {recursive: true, force: true});}
