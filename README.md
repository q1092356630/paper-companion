# 文献伴读 · Paper Companion

本地文献精读桌面软件：双栏中英对照、保留版式的 PDF 翻译、带页码证据的 AI 问答，以及可以分享的阅读卡片。

**[下载 Windows / Mac 版本](https://github.com/q1092356630/paper-companion/releases)** · [构建状态](https://github.com/q1092356630/paper-companion/actions) · [安装与使用](docs/INSTALL.md)

## 下载哪个文件

| 电脑 | 下载文件 | 启动方式 |
|---|---|---|
| Windows 10/11，Intel 或 AMD 64 位 | `PaperCompanion-版本-windows-x64.zip` | 完整解压，打开 `PaperCompanion.exe` |
| Mac，Apple Silicon M 系列 | `PaperCompanion-版本-mac-arm64.zip` | 解压，将 `文献伴读.app` 拖到应用程序 |
| Mac，Intel | `PaperCompanion-版本-mac-x64.zip` | 解压，将 `文献伴读.app` 拖到应用程序 |

预览版以 Releases 中实际出现的附件为准。每个发布包内置 Python、PDF 引擎、OCR 和模型资源，无需另装 Python、Node.js 或开发工具。Windows ARM 原生包暂不提供。macOS 构建使用 macOS 15；较旧系统尚未人工验收。代码未做商业签名或 Apple 公证，首次打开可能出现系统提示，详见安装说明。

## 能做什么

- 导入本地 PDF 或从本机 Zotero 导入，保持原文件不变。
- 原文、译文及等宽双栏对照；按页或全文翻译，复用缓存，失败后继续。
- 扫描页 OCR、选段翻译、高亮和笔记；导出完整中文 PDF。
- 根据论文内容提问，回答保留原文页码和证据。
- 整理含术语表、结论、发现、局限、个人思考、问答和证据的阅读卡片；导出 Markdown、HTML、PDF 或 PNG 长图。
- 保存阅读卡片后才计入“已读”；回收站支持恢复和确认后的永久清除。
- 悬浮阅读组件显示近期论文、进度和统计，在 Windows 与 Mac 均可用。
- 自选关键词与 AND/OR 检索；可选每周推荐。期刊指标来自注明来源和版本的社区数据，未知或过期指标不冒充已核实数据。

分享版从空资料库开始，推荐默认关闭。软件不附带个人论文、阅读记录、模型密钥或 Codex 登录信息。

## 首次配置 AI

打开右上角“设置”，分别选择伴读与翻译服务：

- **伴读/问答/卡片**：本机已登录的 Codex CLI，或 DeepSeek / 兼容 API。
- **翻译**：可以独立选择 Qwen-MT-Flash，或跟随伴读服务。

API Key 由使用者在软件内填写，经操作系统安全存储加密。Codex 需要使用者自己安装并登录，不随软件附送账户或额度。AI 操作会将相关论文文字、问题或笔记发送到所选服务，并使用该账户的额度；无需 AI 的本地阅读不收费。使用软件的对话不会自动与其他聊天共享。

## 平台范围

通用包提供 Electron 悬浮阅读组件。`native/` 中的 WidgetKit 是 macOS 本机开发组件，旧实现绑定构建用户的快照目录，**不包含在通用发布包中**。跨用户分发需另行完成正式签名与 App Group 改造；Windows 不宣称支持 macOS 系统小组件。

资料库位置：

- macOS：`~/Library/Application Support/文献伴读/Library`
- Windows：`%APPDATA%\文献伴读\Library`

退出软件后复制整个 Library 文件夹可备份。更换电脑后需要重新填写 API Key。软件没有云同步。

## 开发与构建

需要 Node.js 24、pnpm 11.25.0、uv 0.13.8。首次准备 PDF 运行环境需要联网下载依赖、字体和模型。

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm test
pnpm setup:pdf
pnpm test:runtime
pnpm test:desktop
pnpm build:desktop
pnpm start:desktop
```

在目标操作系统及 CPU 上生成完整便携包：

```sh
pnpm package:desktop
pnpm release:archive
```

输出在 `release/`。Windows Python 与 macOS Python 不通用，不能直接把 Mac 运行环境复制进 Windows 包。`setup:pdf` 自动下载独立 Python，安装锁定依赖，准备公共资源，并验证含空格及中文路径下的迁移运行。

GitHub Actions 分别在 Windows x64、macOS arm64 和 macOS x64 上测试、构建。推送 `v*` 标签后，三个构建全部成功才发布 Release。运行环境和安装包不提交到 Git 历史。版本发布细节见 [开发说明](docs/DEVELOPMENT.md)。

## 测试范围

自动测试覆盖资料库、翻译缓存与错误恢复、模型桥接、卡片、回收站、推荐、期刊数据、平台路径，以及真实 PDF 多页索引、中文编码、OCR 和译文合并。打包后还会在包内运行 Python 冒烟测试。

实际模型翻译需要使用者自己的账号或密钥；自动构建不调用付费模型。自动测试通过不等于所有 Windows/macOS 版本均经过人工验收。

## 许可与第三方组件

项目采用 [AGPL-3.0](LICENSE)。PDFMathTranslate-next、BabelDOC、PyMuPDF 等第三方项目保留各自许可，详见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。社区期刊数据在使用时从上游下载，仓库不打包该数据集。
