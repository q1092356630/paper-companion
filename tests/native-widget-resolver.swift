import Foundation
@main struct ResolverTests {
 static func main() throws {
  let fm=FileManager.default, root=fm.temporaryDirectory.appendingPathComponent(UUID().uuidString)
  try fm.createDirectory(at:root,withIntermediateDirectories:true)
  defer {try? fm.removeItem(at:root)}
  func app(_ url:URL,_ id:String) throws {
   try fm.createDirectory(at:url.appendingPathComponent("Contents/MacOS"),withIntermediateDirectories:true)
   let data=try PropertyListSerialization.data(fromPropertyList:["CFBundleIdentifier":id,"CFBundleExecutable":"Reader","CFBundlePackageType":"APPL"],format:.xml,options:0)
   try data.write(to:url.appendingPathComponent("Contents/Info.plist"))
   let executable=url.appendingPathComponent("Contents/MacOS/Reader")
   try Data("fixture".utf8).write(to:executable);try fm.setAttributes([.posixPermissions:0o755],ofItemAtPath:executable.path)
  }
  let installed=root.appendingPathComponent("Applications/文献伴读.app")
  try app(installed,"com.mw.papercompanion")
  let buildHost=root.appendingPathComponent("Build/Products/Release/文献伴读小组件.app")
  print("resolved:",resolveMainApp(host:buildHost,home:root,registered:nil)?.path ?? "nil","expected:",installed.path); assert(resolveMainApp(host:buildHost,home:root,registered:nil)?.standardizedFileURL.path==installed.standardizedFileURL.path)
  let nested=installed.appendingPathComponent("Contents/Helpers/文献伴读小组件.app")
  assert(resolveMainApp(host:nested,home:root,registered:nil)?.standardizedFileURL.path==installed.standardizedFileURL.path)
  let wrong=root.appendingPathComponent("Wrong.app")
  try app(wrong,"unrelated.app")
  assert(resolveMainApp(host:wrong.appendingPathComponent("Contents/Helpers/Host.app"),home:root,registered:wrong)?.standardizedFileURL.path==installed.standardizedFileURL.path)
  print("PASS: build-directory fallback, packaged host, unrelated bundle rejection")
 }
}
