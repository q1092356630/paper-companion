import Foundation

func resolveMainApp(host: URL, home: URL, registered: URL?) -> URL? {
    let containing = host.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    let candidates = [containing, home.appendingPathComponent("Applications/文献伴读.app"), URL(fileURLWithPath: "/Applications/文献伴读.app")] + (registered.map { [$0] } ?? [])
    return candidates.first { url in
        guard url.pathExtension == "app", let bundle = Bundle(url: url),
              bundle.bundleIdentifier == "com.mw.papercompanion",
              let executable = bundle.executableURL else { return false }
        return FileManager.default.isExecutableFile(atPath: executable.path)
    }
}
