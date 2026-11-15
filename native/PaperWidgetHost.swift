import AppKit
import WidgetKit
import PDFKit

final class HostDelegate: NSObject, NSApplicationDelegate {
    var receivedURL = false
    func application(_ application: NSApplication, open urls: [URL]) {
        receivedURL = true
        guard let source = urls.first, source.scheme == "papercompanion-widget",
              ["library", "weekly", "reader", "card", "pdf"].contains(source.host ?? ""),
              source.query == nil, source.fragment == nil,
              var components = URLComponents(url: source, resolvingAgainstBaseURL: false) else {
            application.terminate(nil); return
        }
        components.scheme = "papercompanion"
        guard let url = components.url else { application.terminate(nil); return }
        // Xcode also registers its Products directory. Never pass an unchecked
        // ancestor such as "Build" to LaunchServices as if it were an app.
        guard let mainApp = resolveMainApp(host: Bundle.main.bundleURL,
            home: FileManager.default.homeDirectoryForCurrentUser,
            registered: NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.mw.papercompanion")) else {
            let alert = NSAlert(); alert.messageText = "未找到文献伴读主软件"; alert.informativeText = "请先打开已安装的文献伴读，再使用小组件入口。"; alert.runModal(); application.terminate(nil); return
        }
        NSWorkspace.shared.open([url], withApplicationAt: mainApp, configuration: NSWorkspace.OpenConfiguration()) { _, error in
            DispatchQueue.main.async {
                if let error { let alert = NSAlert(); alert.messageText = "无法打开文献伴读"; alert.informativeText = error.localizedDescription; alert.runModal() }
                NSApp.terminate(nil)
            }
        }
    }
    func applicationDidFinishLaunching(_ notification: Notification) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            guard !self.receivedURL else { return }
            let alert = NSAlert()
            alert.messageText = "文献伴读 · 系统小组件"
            alert.informativeText = "在桌面空白处右键，选择「编辑小组件」，搜索「文献伴读」。\n\n支持阅读统计、最近阅读、卡片和译文 PDF 入口。"
            alert.addButton(withTitle: "知道了")
            NSApp.activate(ignoringOtherApps: true)
            alert.runModal(); NSApp.terminate(nil)
        }
    }
}

@main struct PaperWidgetHost {
    static func main() {
        if CommandLine.arguments.dropFirst().first == "--thumbnail" {
            // File rendering only: this path never starts NSApplication or opens a URL.
            let args = CommandLine.arguments
            guard args.count == 4, let document = PDFDocument(url: URL(fileURLWithPath: args[2])),
                  let page = document.page(at: 0),
                  let tiff = page.thumbnail(of: NSSize(width: 240, height: 320), for: .cropBox).tiffRepresentation,
                  let bitmap = NSBitmapImageRep(data: tiff),
                  let png = bitmap.representation(using: .png, properties: [:]) else {
                fputs("无法生成 PDF 首页缩略图\n", stderr); exit(1)
            }
            do {
                try png.write(to: URL(fileURLWithPath: args[3]), options: .atomic)
                try FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: args[3])
            } catch { fputs("首页缩略图保存失败\n", stderr); exit(1) }
            return
        }
        if CommandLine.arguments.contains("--reload") {
            WidgetCenter.shared.reloadTimelines(ofKind: "com.mw.papercompanion.reading")
            RunLoop.main.run(until: Date().addingTimeInterval(1))
            return
        }
        let app = NSApplication.shared
        let delegate = HostDelegate()
        app.delegate = delegate
        app.setActivationPolicy(.accessory)
        app.run()
        withExtendedLifetime(delegate) {}
    }
}
