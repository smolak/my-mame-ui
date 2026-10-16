---
id: 01
labels: [wayfinder:research]
status: closed
assignee: claude
blocked_by: []
---
# Electrobun capabilities on macOS

## Question

What can Electrobun (current release) do on macOS, and how mature is it? Specifically: Bun↔webview RPC model (typed? streaming/large payloads?), spawning and monitoring child processes (`mame`) from the Bun side, SQLite via `bun:sqlite`, native menus/dialogs/window management, packaging/codesign for a personal .app, which webview engine is used and its performance with a virtualized ~48k-row list, serving local media files (images/video) to the webview, and known gaps or footguns.

## Resolution

Electrobun is usable for this launcher on Apple Silicon, but plan around a few gaps (researched 2026-10-16):

- **Version:** stable v2.0.2 (2026-09-29). `main` is on v2.0.3-beta.26 with near-daily betas. The default runtime flipped from Cottontail (2.0.2) to Bun 1.4.0 (2.0.3 betas). Pin the exact version and set `build.mainProcess: "bun"`. macOS support is arm64 only.
- **Webview:** WKWebView by default, CEF optional per view. A virtualized 48k-row list is fine for DOM rendering. The open question is how fast the data crosses into the webview.
- **RPC:** typed `RPCSchema` (requests + one-way messages, `maxRequestTime`). It sends JSON with AES-GCM encryption over a loopback WebSocket (500 MB cap) and has no streaming or binary channel. Bulk-transfer speed is unbenchmarked, so measure it or page the data.
- **Processes / SQLite:** these are plain Bun APIs (`Bun.spawn`, `bun:sqlite`), used in official templates. Call MAME by absolute path because Finder-launched apps lack the shell PATH. `userData` is scoped per channel (dev, canary and stable each get a separate DB).
- **Native:** app menu with roles, context menus, tray, file/message dialogs, `openPath`/`showItemInFolder`, hiddenInset title bars. No built-in window-state persistence.
- **Media:** `appdata://` serves only files inside userData (no absolute paths or symlinks). It reads whole files and returns 200 with no Range support, so it is likely unsuitable for video. Plan on a 127.0.0.1 `Bun.serve` for media, or at least for video.
- **Packaging:** Hutch builds the .app and DMG. Signing and notarization need a Developer ID. Ad-hoc or unsigned personal builds are undocumented (unsigned + `xattr -cr` is the documented fallback).
- **Footguns:** webview freezes after sleep/wake (#550, open). `openFileDialog` may deadlock inside an awaited RPC handler (#156, v1-era, unverified on 2.x). Hidden-then-shown windows paint blank (#566). `--watch` leaks memory (#578).

Findings: branch research/electrobun-capabilities, file .scratch/mame-launcher/research/electrobun-capabilities.md
