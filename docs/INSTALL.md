# 安装与使用

## Windows

1. 在 [Releases](https://github.com/q1092356630/paper-companion/releases) 下载 `windows-x64.zip`。
2. 右键“全部解压”。不要直接在压缩包里运行，也不要只复制 exe；同目录的 `resources` 等文件是必需的。
3. 双击 `PaperCompanion.exe`。预览版没有商业代码签名，系统可能显示未知发布者；仅在确认文件来自本仓库且校验一致时决定是否信任，不需要关闭防病毒或全局系统保护。
4. 首次使用点击设置，配置自己的 AI 服务，再导入 PDF。

## Mac

1. “关于本机”显示 Apple M 系列芯片，下载 `mac-arm64.zip`；显示 Intel，下载 `mac-x64.zip`。
2. 解压，将 `文献伴读.app` 拖入“应用程序”，再打开。
3. 预览版未经过 Apple 公证，可能提示无法验证开发者。确认下载来源后，可按系统“隐私与安全性”页面提供的方式允许本次打开。不要关闭 Gatekeeper 或系统完整性保护。
4. 如果提示应用损坏，先重新下载并校验，不要把删除隔离属性当作默认解决办法。

## 校验下载

每个 ZIP 同时提供 `.sha256` 文件。计算值应与该文件一致：

Windows PowerShell：

```powershell
Get-FileHash .\PaperCompanion-0.3.0-windows-x64.zip -Algorithm SHA256
```

macOS 终端：

```sh
shasum -a 256 PaperCompanion-0.3.0-mac-arm64.zip
```

## 给第一次使用的人

先导入一篇 PDF，可以直接阅读和标注。配置好自己的 AI 后再尝试单页翻译和提问。问答与翻译可以使用不同服务；Qwen-MT-Flash 的密钥地域必须与设置中的地域一致。翻译完成的页面会保存，遇到失败可以继续。

Codex 模式需要预先安装并登录 Codex CLI。Windows 使用原生 `codex.exe`；程序会检查 PATH 和常见 npm 安装目录。安装后重启文献伴读。高级使用者可用 `PAPER_COMPANION_CODEX` 环境变量指定本机 CLI 的可执行文件完整路径。无法连接时可以切换 API 模式。

点击保存阅读卡片后才会标记为已读。分享时可以导出卡片 PDF/PNG；分享完整软件只需发送本仓库 Releases 链接，每个人维护自己的资料库和服务账户。

升级前退出软件并备份 Library，然后替换应用文件。不要用新包覆盖个人资料库。遇到问题请在 Issues 提供系统版本、软件版本、操作步骤和已去除个人信息的错误文本；不要上传 API Key 或私人论文。
