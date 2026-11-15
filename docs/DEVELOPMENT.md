# 发布与维护

- 主代码：`desktop/` 为 Electron 主进程及本地服务，`src/desktop/` 为阅读界面。
- `desktop/platform.cjs` 统一系统缓存、Python 可执行文件和 asar 路径。
- `scripts/pdf-runtime-lock.txt` 锁定 Python 依赖；`pnpm-lock.yaml` 锁定 JavaScript 依赖。
- `scripts/prepare-pdf-runtime.mjs` 使用 uv 的独立 Python，在目标系统本地准备运行环境。`UV_BIN` 可指定 uv 可执行文件路径。
- `scripts/smoke-runtime.mjs` 生成临时多页和扫描页 PDF，验证中文路径、索引、元数据、OCR；不使用个人资料库、不调用模型服务。
- `scripts/package-desktop.mjs` 只接受与运行环境 manifest 一致的 OS/CPU，打包后复测包内 Python。
- `scripts/archive-release.mjs` 生成 ZIP 和 SHA-256。

GitHub Actions 的分支构建产物保留 14 天，正式版本通过 GitHub Releases 长期分发。发布时先修改 `package.json` 版本、重新生成锁文件，并更新 `docs/RELEASE_NOTES.md`，再推送匹配的 `v*` 标签。三个平台全部成功才发布。

默认分发没有 Developer ID、公证或 Windows 代码签名。如后续配置正式签名，请仅使用 GitHub Secrets，不能将证书、私钥或密码写入仓库。原生 WidgetKit 代码只保留作 macOS 开发参考，通用包不构建或安装该扩展。

网页原型仍保留。`pnpm build` 后才能运行包括 Sites 产物检查在内的 `pnpm test`；桌面专项使用 `pnpm test:desktop`。不要将原型的浏览器数据说成桌面或 Zotero 的真实数据。

也可在 Actions 选择 `Publish verified build`，填写当前 main 上成功的 `Build desktop releases` 运行 ID。它核对提交一致性、三个平台包和 SHA-256 后发布预览版，无需重复构建。
