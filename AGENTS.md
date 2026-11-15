# Paper Companion

Preserve the calm white/blue bilingual reading UI. Completion requires a saved reading card. Never substitute demo content for live model responses. Do not expose API keys or copy Codex login tokens.

This repository is the cross-platform distribution copy. Windows x64, macOS arm64, and macOS x64 must build on their matching native runners. Keep all private libraries, caches, credentials, outputs, node_modules and Python runtimes out of Git. Runtime preparation may only download public dependencies and model assets, not copy a developer's user cache.

Generic releases include the Electron floating companion. The macOS WidgetKit extension is local-development-only until cross-user signing and storage are redesigned. Do not claim it is included in public ZIPs.

Before release run pnpm build, pnpm test, pnpm setup:pdf, pnpm test:runtime, pnpm test:desktop, pnpm package:desktop, and pnpm release:archive. Paid provider calls are not required by the automated suite. Do not operate on a user's real library to test deletion or migration.
