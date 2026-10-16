# Electrobun capabilities on macOS

Research for ticket 01. Researched 2026-10-16.

## Sources

- Repo `blackboardsh/electrobun`, shallow clone of `main` at commit `c4bbeca` (2026-10-15). MIT, ~12.9k stars, 137 open issues. Docs live in the repo under `docs/src/content/docs/electrobun/` (cited below as `docs/...`). The rendered site moved: `electrobun.dev` now 302-redirects to `blackboard.sh/electrobun/`. The README links `framework.blackboard.sh/electrobun/`.
- GitHub Releases (via `gh api`).
- GitHub Issues (via `gh`), cited by number.

## Versions and maturity

- **Latest stable: v2.0.2 (2026-09-29).** Before that came v2.0.1 (2026-08-22) and v1.18.1 (2026-05-04). `main` is on **v2.0.3-beta.26 (2026-10-15)**. Betas ship almost every day: beta.16 through beta.26 came out between 10-10 and 10-15.
- 2.0 was a big rewrite. **Hutch**, a new build/package CLI, replaces the old vendored CLI. There are six main-process runtimes: Cottontail, Bun, Zig, Rust, Go and Odin. The 2.0 reconciliation closed 138 issues and 47 PRs (`docs/guides/changelog/v2-x.mdx`).
- **The default runtime has changed between releases.** Stable 2.0.2 defaults to **Cottontail**, an experimental JSC-based runtime from the same vendor. The 2.0.3 betas default to **Bun 1.4.0**, which Hutch pins and packages (`docs/guides/compatability.mdx`, `docs/guides/migrating-to-v2.mdx`). Set `build.mainProcess: "bun"` explicitly. Issue #573 (2026-10-09) reports that Cottontail is "much less efficient than Bun".
- Verdict: the project is active and broad, but its toolchain and runtime defaults are still changing from week to week. Pin an exact version (`electrobun.version` in `hutch.config.ts`). Expect to deal with breaking changes on upgrade.

## Platform / webview engine

- macOS support is **arm64 only** (`docs/guides/compatability.mdx`). Electrobun 2 dropped the Intel builds that 1.18.1 shipped (#560, open). The dev machine is Apple Silicon, so this is fine.
- The default renderer is **WKWebView**, the system WebKit, so it uses the installed Safari engine. CEF (bundled Chromium) is optional: set `bundleCEF: true` and choose `renderer: "cef"` per window or view (`docs/guides/architecture/overview.mdx`). Electrobun pins one CEF version per release.
- Main-thread model: Electrobun Core owns the native main-thread event loop. Bun runs app JS on a worker (`docs/guides/architecture/overview.mdx`).

## Bun to webview RPC

- **Typed.** You declare one shared `RPCSchema` with a `bun` side and a `webview` side. Each side has `requests` (typed params and response, awaited) and `messages` (one-way). The main process uses `BrowserView.defineRPC<T>()` and the browser uses `Electroview.defineRPC<T>()` (`docs/apis/browser-view.mdx` §Typed RPC, `docs/apis/browser/electroview-class.mdx`).
- Timeouts: `maxRequestTime` sets a default per request. You can override it per call, and `Infinity` disables it.
- **Transport:** JSON. Each message is `JSON.stringify`'d, encrypted with a per-webview AES-256-GCM key, and sent over a local WebSocket on `127.0.0.1`, with a native bridge as fallback (`package/src/sdks/main/core/Socket.ts`, `electroview-class.mdx`, #518).
- **Streaming / large payloads:** there is **no streaming or binary channel**. Every message is a whole serialized UTF-8 JSON value. The host queue sends in byte-limited batches and yields between turns. It has no queue size limit (`browser-view.mdx` §Host message queue diagnostics, 2.0.3 betas). The WebSocket payload cap is **500 MB** (#518, open, which asks to lower it). Electrobun's docs give no throughput numbers. **Not verified:** how fast a single ~5–15 MB JSON payload (48k machines) crosses the JSON, AES and WS layers. Measure it in a spike, or page the data.
- Footguns:
  - #156 (open, filed 2026-02 against v1): `Utils.openFileDialog` awaited inside an RPC request handler deadlocks. **Not verified whether this still happens in 2.x.** The 2.0 changelog mentions "unbounded user-controlled dialog timeouts" and "JSON-array dialog results". Workaround: start the dialog from a message or menu instead of an awaited request, or test it.
  - #499 (closed): non-English text was corrupted over RPC. Fixed, but worth a regression check with Japanese machine titles.
  - Event payloads on `BrowserView` instance events are typed `unknown`.

## Spawning / monitoring child processes

- Electrobun does not wrap this. The main process is real Bun 1.4.0, so `Bun.spawn` and `node:child_process` are available. The official `ui-launcher` template calls `Bun.spawn(["open", app.path])` (`templates/ui-launcher/src/main.ts`). Exit codes, stdout/stderr pipes and `proc.exited` come from Bun's own APIs. Electrobun's docs do not document them.
- Footgun (general macOS behaviour, not Electrobun-specific): an app launched from Finder or the Dock does not inherit the shell `PATH`. Call the MAME binary by absolute path, or make the path configurable.
- **Not verified:** whether child processes survive or are reaped when the app quits, and how stdio behaves from the Bun worker thread. Test this in a spike.

## SQLite (`bun:sqlite`)

- Works. The official `sqlite-crud` template uses `import Database from "bun:sqlite"` with `mainProcess: "bun"` and puts the DB file under `Utils.paths.userData` (`templates/sqlite-crud/src/bun/index.ts`).
- Under Cottontail, `bun:sqlite` is also recognised as a "capability" that the bundle scanner must detect. Dynamic imports can make it miss the module (`docs/apis/cli/build-configuration.mdx`, `docs/guides/cottontail.mdx`). Pinning `mainProcess: "bun"` avoids this.
- Footgun: `userData` is scoped by **app identifier + channel** (`docs/apis/paths.mdx`, `nativeWrapper.mm` `buildAppDataPath`). Dev, canary and stable builds therefore get **separate** userData directories, each with its own DB and media cache.

## Native menus, dialogs, windows

- Application menu with roles (about, quit, hide, copy/paste, toggleFullScreen, and others), stateful items, context menus, tray (`docs/apis/application-menu.mdx`, `context-menu.mdx`, `tray.mdx`).
- `Utils`: `openFileDialog` (files and/or directories, type filter, multi-select), message boxes, notifications, clipboard, dock icon, `openExternal`, `openPath`, `showItemInFolder`, `moveToTrash`, quit (`docs/apis/utils.mdx`).
- `BrowserWindow`: frame, title, `titleBarStyle` (`hidden` / `hiddenInset`), traffic-light offset, transparent, hidden, plus lifecycle and position/size APIs and events. **Window-state persistence (remembering size and position) is not built in.** Store it yourself.
- Open macOS issues worth knowing about: #566 (a window created `hidden: true` shows blank frames on first `show()`), #575 (the webview does not refit after a display or backing-scale change), #513 (a background window swallows the first click), #572 (a submenu-only item is built as a clickable command), #561 (double-click on a drag region does not zoom), #550 (**the webview can freeze permanently after sleep/wake. Only a relaunch fixes it**).

## Packaging / codesign for a personal .app

- `hutch run build:stable` (or `build:canary`) produces the `.app` wrapped in a Zstd self-extractor, a DMG (unless `build.mac.createDmg: false`), an `.app.tar.zst` update archive and update metadata. Dev builds skip distribution artifacts and are **never signed** (`docs/guides/bundling-and-distribution.mdx`, `docs/guides/code-signing.mdx`).
- Signing and notarization use `build.mac.codesign` / `notarize` and need a **Developer ID Application** certificate (`ELECTROBUN_DEVELOPER_ID`) plus notarization credentials. **Not documented:** ad-hoc signing with no Apple Developer account. Signing logic lives in Hutch, a separate repo, which I did not inspect. For a personal app built locally, the documented fallback is an unsigned build plus `xattr -cr` when quarantined. Arm64 binaries are linker ad-hoc signed by default (the build script says it "no longer remove[s] adhoc signatures"), so a locally built app should run, but this is **not verified**.
- First launch self-extracts into a managed location (`overview.mdx` §Distribution wrapper). Updates use a static-hosted feed with bsdiff patches, which is optional for a personal app.
- Builds are for the host only: no cross-compilation.

## Performance with a virtualized ~48k-row list

- With TanStack Virtual only a few dozen rows are in the DOM, so WKWebView rendering is not the concern. The cost is in data: getting 48k records into the webview (see the RPC section above) and filtering/sorting them in page JS (JSC is fine at this size). Electrobun publishes no benchmarks. **Not verified.** Spike plan: send the full library once as one compact JSON payload, time it, and fall back to paged or query-driven RPC if it is slow.
- The template `react-tailwind-vite` is official. Vite builds to `dist/`, which is copied into `views/mainview`, and `hutch run dev:hmr` gives Vite HMR without relaunching the app (`templates/react-tailwind-vite/electrobun.config.ts`, `docs/guides/hot-reloading.mdx`). Issue #578 (open): severe memory leak in `--watch` mode.

## Serving local media (images / video) to the webview

- `views://` serves bundled, read-only assets.
- `appdata://` serves files under `Utils.paths.userData`. It is opt-in per webview (`allowedProtocols: { appData: true }`). Paths are confined to the root: **absolute paths, `..` traversal and symlink escapes are rejected** (`docs/apis/bundled-assets.mdx`). A ScreenScraper media cache therefore has to live inside userData. You cannot point it at arbitrary folders, such as MAME's `snap/` directory or the NAS, or symlink to them.
- **Red flag for video:** the macOS `WKURLSchemeHandler` reads the whole file with `[NSData dataWithContentsOfFile:]` and always answers `200` with no `Accept-Ranges` / `Content-Range` support (`package/src/native/macos/nativeWrapper.mm` ~L824–839, L2360–2400). WebKit's `<video>` normally needs byte-range (206) responses to play and seek. **Not verified by test**, but `appdata://` is likely unsuitable for video snaps, and large files are loaded fully into memory. Electrobun has no API for registering arbitrary custom schemes (`app.urlSchemes` is for deep links). Workaround: run a `Bun.serve` HTTP server on 127.0.0.1 in the main process and serve media through it with Range support. **Not verified:** how far `Bun.file` responses handle Range automatically.

## Red flags summary

1. Toolchain churn: the default runtime flipped from Cottontail in stable 2.0.2 to Bun in the 2.0.3 betas, and betas ship daily. Pin the version and `mainProcess: "bun"`.
2. Video media over `appdata://` likely fails (no Range support). Plan on a local `Bun.serve` for media.
3. RPC is JSON-only with no streaming. A bulk 48k-row transfer has no published benchmark, so measure it.
4. macOS webview freeze after sleep/wake (#550, open) matters for a launcher that stays open for long periods.
5. Possible `openFileDialog` deadlock inside RPC request handlers (#156, open, v1-era, unconfirmed on 2.x).
6. Signing without a Developer ID is undocumented. Personal builds are effectively unsigned or ad-hoc.
7. arm64 only, and userData is scoped per channel.
