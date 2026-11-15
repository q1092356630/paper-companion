# macOS WidgetKit 开发组件

这里保留原 macOS 原生 WidgetKit 宿主与扩展源码，仅用于本机开发。通用发布包不包含它；Windows 和 Mac 通用包使用 Electron 悬浮阅读组件。

原扩展的沙盒快照目录在构建时绑定当前用户，不能直接复制给其他账户。跨用户正式分发需要签名、App Group 共享目录及相应安装验证，当前未完成。

在装有 Xcode 的 Mac 上可运行 `pnpm build:native-widget` 研究本机版本。不要将该本机扩展作为通用发布附件。快照只包含阅读统计、标题、进度和小尺寸封面，不应包含模型凭据、笔记或完整 PDF。
