import SwiftUI
import WidgetKit
import Foundation
import AppKit

private let blue = Color(red: 0.19, green: 0.40, blue: 0.71)
private let ink = Color(red: 0.15, green: 0.22, blue: 0.34)
let readingWidgetBackground = LinearGradient(colors: [Color(red: 0.98, green: 0.99, blue: 1), Color(red: 0.91, green: 0.95, blue: 1)], startPoint: .topLeading, endPoint: .bottomTrailing)

// ImageRenderer cannot rasterize Link. Static design previews render its label;
// production widgets always retain the native WidgetKit Link action.
private struct WidgetLink<Label: View>: View {
    let destination: URL
    let label: Label
    init(destination: URL, @ViewBuilder label: () -> Label) { self.destination = destination; self.label = label() }
    var body: some View {
        #if WIDGET_PREVIEW
        label
        #else
        Link(destination: destination) { label }
        #endif
    }
}

struct ReadingPaper: Decodable, Identifiable {
    let id: String
    let title: String
    let page: Int
    let total: Int
    let hasCard: Bool
    let complete: Bool
    let pdfReady: Bool
    let cover: String?
    let zoneLabel: String?
    let metricLabel: String?
    let zoneDetail: String?
    let zoneValidUntil: Double?
    func zoneText(at date: Date) -> String {
        if let deadline = zoneValidUntil, date.timeIntervalSince1970 >= deadline { return "中科院分区待更新" }
        return zoneLabel ?? "中科院分区待核实"
    }
    func link(_ action: String) -> URL { URL(string: "papercompanion-widget://\(action)/\(id)")! }
}
struct ReadingSnapshot: Decodable {
    var recommended: Int
    var readThisWeek: Int
    var totalRead: Int
    var inProgress: Int
    var weeklyCurrent: Bool
    var papers: [ReadingPaper]
    var weekStart: String
    var updatedAt: String
    static let empty = ReadingSnapshot(recommended: 0, readThisWeek: 0, totalRead: 0, inProgress: 0, weeklyCurrent: false, papers: [], weekStart: "", updatedAt: "")
    func current(at date: Date) -> ReadingSnapshot {
        var value = self
        let parser = ISO8601DateFormatter(); parser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let start = parser.date(from: weekStart), let end = Calendar.current.date(byAdding: .day, value: 7, to: start), date >= end {
            value.recommended = 0; value.readThisWeek = 0; value.weeklyCurrent = false
        }
        return value
    }
}
struct ReadingEntry: TimelineEntry {
    let date: Date
    let snapshot: ReadingSnapshot
    var covers: [String: NSImage] = [:]
}
struct ReadingProvider: TimelineProvider {
    func read() -> ReadingEntry {
        let path = Bundle.main.object(forInfoDictionaryKey: "PaperWidgetSnapshot") as? String ?? ""
        let snapshot = (try? Data(contentsOf: URL(fileURLWithPath: path))).flatMap { try? JSONDecoder().decode(ReadingSnapshot.self, from: $0) } ?? .empty
        var covers: [String: NSImage] = [:]
        // Load images in the provider so the timeline has no library-file dependency.
        for paper in snapshot.papers.prefix(5) {
            guard let name = paper.cover, name.range(of: "^[a-f0-9]{24}-[a-f0-9]{16}\\.png$", options: .regularExpression) != nil else { continue }
            let file = URL(fileURLWithPath: path).deletingLastPathComponent().appendingPathComponent(name)
            if let bytes = try? Data(contentsOf: file), bytes.count < 2_000_000, let image = NSImage(data: bytes) { covers[paper.id] = image }
        }
        return ReadingEntry(date: Date(), snapshot: snapshot.current(at: Date()), covers: covers)
    }
    func placeholder(in context: Context) -> ReadingEntry { ReadingEntry(date: Date(), snapshot: .empty) }
    func getSnapshot(in context: Context, completion: @escaping (ReadingEntry) -> Void) { completion(read()) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<ReadingEntry>) -> Void) {
        completion(Timeline(entries: [read()], policy: .after(Date().addingTimeInterval(900))))
    }
}

struct ReadingWidgetContent: View {
    let entry: ReadingEntry
    let large: Bool
    private var data: ReadingSnapshot { entry.snapshot }
    private var papers: [ReadingPaper] { Array(data.papers.prefix(5)) }
    private var compact: Bool { large ? papers.count > 2 : papers.count > 1 }
    private var dense: Bool { !large && papers.count >= 4 }
    private var rowHeight: CGFloat { large ? 40 : (dense ? 18 : (papers.count == 3 ? 26 : 38)) }
    var body: some View {
        VStack(alignment: .leading, spacing: large ? 6 : 4) {
            HStack(spacing: 6) {
                Image(systemName: "book.closed.fill").foregroundStyle(blue)
                Text("文献伴读").fontWeight(.semibold)
                if !papers.isEmpty {
                    WidgetLink(destination: URL(string: "papercompanion-widget://library")!) {
                        Text("最近 \(papers.count) 篇").font(.system(size: 9)).foregroundStyle(.secondary)
                    }
                }
                Spacer()
                WidgetLink(destination: URL(string: "papercompanion-widget://weekly")!) {
                    Label("每周推荐", systemImage: "arrow.up.right").font(.system(size: 10)).foregroundStyle(blue)
                }
            }.font(.system(size: 13)).foregroundStyle(ink)
            if compact && !large {
                HStack(spacing: 0) {
                    inlineMetric("周推荐", data.recommended, link: "weekly")
                    inlineMetric("周读完", data.readThisWeek, link: "library")
                    inlineMetric("累计已读", data.totalRead, link: "library")
                }.frame(height: 18).background(.white.opacity(0.68), in: RoundedRectangle(cornerRadius: 6))
            } else {
                HStack(spacing: 0) {
                    metric("本周推荐", data.recommended, link: "weekly")
                    Divider().frame(height: large ? 32 : 26)
                    metric("本周读完", data.readThisWeek, link: "library")
                    Divider().frame(height: large ? 32 : 26)
                    metric("累计已读", data.totalRead, link: "library")
                }.padding(.vertical, large ? 6 : 3).background(.white.opacity(0.68), in: RoundedRectangle(cornerRadius: 11))
            }
            if data.papers.isEmpty {
                Spacer(minLength: 0)
                WidgetLink(destination: URL(string: "papercompanion-widget://library")!) {
                    Label("打开文献库，开始一篇阅读", systemImage: "plus.circle").font(.system(size: 12)).foregroundStyle(blue)
                }
                Spacer(minLength: 0)
            } else {
                if large && !compact {
                    HStack {
                        Text("最近阅读").fontWeight(.medium)
                        Spacer()
                        Text("从上次停下的地方继续")
                    }.font(.system(size: 9)).foregroundStyle(.secondary)
                }
                VStack(spacing: large ? 4 : (dense ? 1 : 4)) {
                    ForEach(papers) { paper in
                        if compact { compactRow(paper) } else { paperRow(paper) }
                    }
                }
                if large { Spacer(minLength: 0) }
            }
            if large {
                HStack {
                    Text(data.weeklyCurrent ? "\(data.inProgress) 篇阅读中" : "本周推荐待更新")
                    Spacer()
                    WidgetLink(destination: URL(string: "papercompanion-widget://library")!) { Text("文献库 →") }.foregroundStyle(blue)
                }.font(.system(size: 10)).foregroundStyle(.secondary)
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
    private func inlineMetric(_ title: String, _ value: Int, link: String) -> some View {
        WidgetLink(destination: URL(string: "papercompanion-widget://\(link)")!) {
            HStack(spacing: 4) {
                Text(title).foregroundStyle(.secondary)
                Text("\(value)").fontWeight(.semibold).foregroundStyle(blue)
            }.font(.system(size: 9)).frame(maxWidth: .infinity)
        }.accessibilityLabel("\(title) \(value) 篇")
    }
    private func compactRow(_ paper: ReadingPaper) -> some View {
        HStack(spacing: large ? 7 : 5) {
            WidgetLink(destination: paper.link("reader")) {
                Group {
                    if let image = entry.covers[paper.id] { Image(nsImage: image).resizable().scaledToFit() }
                    else { Image(systemName: "doc.text").resizable().scaledToFit().foregroundStyle(blue.opacity(0.5)).padding(2) }
                }.frame(width: rowHeight * 0.65, height: rowHeight - 2)
                    .background(.white, in: RoundedRectangle(cornerRadius: 2))
            }.accessibilityLabel("打开文献：首页预览：" + paper.title)
            WidgetLink(destination: paper.link("reader")) {
                VStack(alignment: .leading, spacing: dense ? 0 : 2) {
                    Text(paper.title).font(.system(size: large ? 11 : (dense ? 8.5 : 10), weight: .medium, design: .serif))
                        .foregroundStyle(ink).lineLimit(1)
                    HStack(spacing: 4) {
                        Text(paper.zoneText(at: entry.date)).foregroundStyle(blue).lineLimit(1)
                        Spacer(minLength: 0)
                        Text(paper.total > 0 ? "\(paper.page)/\(paper.total)页" : "待阅读").foregroundStyle(.secondary).fixedSize()
                    }.font(.system(size: dense ? 6.5 : 8))
                }.frame(maxWidth: .infinity, alignment: .leading)
            }.accessibilityLabel("继续阅读：" + paper.title + "；" + paper.zoneText(at: entry.date))
            if paper.hasCard { compactShortcut("note.text", action: "card", paper: paper) }
            if paper.pdfReady { compactShortcut("doc.richtext", action: "pdf", paper: paper) }
        }.padding(.horizontal, large ? 5 : 0).frame(height: rowHeight)
            .background(large ? Color.white.opacity(0.78) : .clear, in: RoundedRectangle(cornerRadius: 6))
    }
    private func compactShortcut(_ icon: String, action: String, paper: ReadingPaper) -> some View {
        WidgetLink(destination: paper.link(action)) {
            Image(systemName: icon).font(.system(size: dense ? 9 : 11)).foregroundStyle(blue)
                .frame(width: dense ? 14 : 20, height: rowHeight)
        }.accessibilityLabel((action == "card" ? "查看卡片：" : "打开译文 PDF：") + paper.title)
    }
    private func metric(_ title: String, _ value: Int, link: String) -> some View {
        WidgetLink(destination: URL(string: "papercompanion-widget://\(link)")!) {
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.system(size: 9)).foregroundStyle(.secondary)
                Text("\(value)").font(.system(size: large ? 26 : 21, weight: .semibold, design: .rounded)).foregroundStyle(blue)
            }.frame(maxWidth: .infinity, alignment: .leading).padding(.leading, 10)
        }.accessibilityLabel("\(title) \(value) 篇")
    }
    private func cover(_ paper: ReadingPaper) -> some View {
        WidgetLink(destination: paper.link("reader")) {
            ZStack {
                RoundedRectangle(cornerRadius: 4).fill(.white)
                if let image = entry.covers[paper.id] {
                    Image(nsImage: image).resizable().scaledToFit().padding(2)
                } else {
                    Image(systemName: "doc.text").font(.system(size: large ? 25 : 21, weight: .light)).foregroundStyle(blue.opacity(0.45))
                }
            }
            .frame(width: large ? 52 : 44, height: large ? 70 : 60)
            .clipShape(RoundedRectangle(cornerRadius: 4))
            .overlay(RoundedRectangle(cornerRadius: 4).strokeBorder(blue.opacity(0.12), lineWidth: 0.5))
            .shadow(color: ink.opacity(0.10), radius: 3, x: 0, y: 2)
        }.accessibilityLabel("打开文献首页预览：" + paper.title)
    }
    private func shortcut(_ title: String, icon: String, action: String, paper: ReadingPaper) -> some View {
        WidgetLink(destination: paper.link(action)) {
            Label(title, systemImage: icon).font(.system(size: 9, weight: .medium)).foregroundStyle(blue)
                .padding(.horizontal, 6).padding(.vertical, 3)
                .background(blue.opacity(0.07), in: RoundedRectangle(cornerRadius: 5))
        }.accessibilityLabel((action == "card" ? "查看卡片：" : "打开译文 PDF：") + paper.title)
    }
    private func paperRow(_ paper: ReadingPaper) -> some View {
        HStack(alignment: .center, spacing: large ? 11 : 9) {
            cover(paper)
            VStack(alignment: .leading, spacing: 3) {
                WidgetLink(destination: paper.link("reader")) {
                    Text(paper.title).font(.system(size: large ? 13 : 11, weight: .medium, design: .serif))
                        .foregroundStyle(ink).lineLimit(large ? 2 : 1).fixedSize(horizontal: false, vertical: true).frame(maxWidth: .infinity, alignment: .leading)
                }.accessibilityLabel("继续阅读：" + paper.title)
                Text(paper.zoneText(at: entry.date))
                    .font(.system(size: large ? 9 : 8, weight: .medium)).foregroundStyle(blue)
                    .lineLimit(1).minimumScaleFactor(0.75)
                    .accessibilityLabel(paper.zoneText(at: entry.date) + "；" + (paper.zoneDetail ?? ""))
                HStack(spacing: 5) {
                    Text(paper.total > 0 ? "第 \(paper.page) / \(paper.total) 页" : "开始阅读")
                    if paper.complete { Image(systemName: "checkmark.circle.fill").foregroundStyle(blue.opacity(0.7)) }
                    Spacer(minLength: 0)
                    GeometryReader { geometry in
                        Capsule().fill(blue.opacity(0.10)).overlay(alignment: .leading) {
                            Capsule().fill(blue.opacity(0.55)).frame(width: geometry.size.width * min(1, max(0, Double(paper.page) / Double(max(1, paper.total)))))
                        }
                    }.frame(width: large ? 48 : 34, height: 3)
                }.font(.system(size: 9)).foregroundStyle(.secondary)
                HStack(spacing: 6) {
                    if paper.hasCard { shortcut("卡片", icon: "note.text", action: "card", paper: paper) }
                    if paper.pdfReady { shortcut("译文", icon: "doc.richtext", action: "pdf", paper: paper) }
                    if !paper.hasCard && !paper.pdfReady {
                        WidgetLink(destination: paper.link("reader")) {
                            Label("继续阅读", systemImage: "arrow.right").font(.system(size: 9, weight: .medium)).foregroundStyle(blue)
                        }
                    }
                }
            }.frame(maxWidth: .infinity, alignment: .leading)
        }.padding(large ? 7 : 0).background(large ? Color.white.opacity(0.78) : .clear, in: RoundedRectangle(cornerRadius: 11))
    }
}
struct ReadingWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: ReadingEntry
    var body: some View {
        ReadingWidgetContent(entry: entry, large: family == .systemLarge)
            .containerBackground(for: .widget) { readingWidgetBackground }
            .widgetURL(URL(string: "papercompanion-widget://library"))
            .preferredColorScheme(.light)
    }
}

#if !WIDGET_PREVIEW
@main struct PaperReadingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "com.mw.papercompanion.reading", provider: ReadingProvider()) { entry in ReadingWidgetView(entry: entry) }
            .configurationDisplayName("文献伴读 · 阅读进度")
            .description("查看每周推荐与阅读进度，浏览文献首页，快捷打开卡片和中文 PDF。")
            .supportedFamilies([.systemMedium, .systemLarge])
    }
}
#endif
