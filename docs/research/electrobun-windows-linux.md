# Electrobun on Windows and Linux

Research for ticket [Electrobun on Windows and Linux](https://github.com/smolak/my-mame-ui/issues/11). Researched 2026-10-17. Companion to `electrobun-capabilities.md` (the macOS findings). This file only records what differs on Windows and Linux, or what the macOS file left open.

## Sources

- Repo `blackboardsh/electrobun`, shallow clone of `main` at commit `7c6ca54` (2026-10-16). Docs are under `docs/src/content/docs/electrobun/` (cited below as `docs/...`). Native code is under `package/src/native/{win,linux,shared}/`.
- GitHub Releases and Issues (via `gh`), cited by number.
- Bun docs: `bun.com/docs/runtime/child-process`, `bun.com/docs/runtime/http/routing`, `bun.com/docs/runtime/sqlite`.
- Nothing here was run on a Windows or Linux machine. Every behavioural claim comes from docs or source. Items that need a test are marked **Not verified**.

## Versions and maturity

- Same release line as on macOS. Stable is **v2.0.2** (2026-09-29), and `main` is on **v2.0.3-beta.27** (2026-10-16). Pin the version and `build.mainProcess: "bun"` on every OS, for the reasons given in the macOS file.
- Supported targets (`docs/guides/compatability.mdx`): **Windows x64**, Windows arm64 (beta only, needs the Hutch canary), **Linux x64 and arm64**. Electrobun's own release CI builds on `windows-2025`, `windows-11-arm`, `ubuntu-24.04` and `ubuntu-24.04-arm` (`.github/workflows/release.yml`).
- Windows and Linux get less attention than macOS. Several basics are still open bugs (see the blockers below), and Linux in particular is missing features that macOS has.

## Webview engine per OS

| OS | Default (system) renderer | Optional bundled renderer |
| --- | --- | --- |
| Windows | **WebView2** (Edge Chromium, updated by the OS) | CEF (`build.win.bundleCEF: true`) |
| Linux | **WebKitGTK 4.1** (GTK 3) | CEF (`build.linux.bundleCEF: true`) |

Sources: `docs/guides/compatability.mdx`, `docs/apis/bundling-cef.mdx`.

- **Windows / WebView2.** The app needs the Evergreen WebView2 Runtime to be installed. Electrobun checks for it with `GetAvailableCoreWebView2BrowserVersionString` and marks the view as failed when it is missing ("Please install Microsoft Edge WebView2 Runtime", `win/nativeWrapper.cpp` ~L7299). The runtime ships with Windows 11, so this is a non-issue on a current personal machine. Electrobun does not bootstrap the runtime.
- **Linux / WebKitGTK.** The native wrapper links GTK 3, WebKitGTK 4.1, Ayatana AppIndicator and librsvg. These are needed **even when CEF is bundled**. The user installs them as distro packages, for example `libwebkit2gtk-4.1-0` (`docs/guides/cross-platform-development.mdx` §Linux Runtime Packages).
- **Linux: one renderer per process.** With CEF bundled, every view uses CEF. Without it, every view uses GTK WebKit. You cannot mix them as you can on macOS and Windows (`docs/apis/bundling-cef.mdx`).
- This means three different engines across three OSes: WebKit on macOS, Chromium on Windows and WebKitGTK on Linux. The docs say to test layout, media, keyboard handling and context menus on every platform (`cross-platform-development.mdx` §Renderer Differences). Bundling CEF on every OS would give one engine everywhere, but it makes the app much larger, and it creates a video codec problem (see the media section below).
- Quirks found in the source and issues:
  - **Linux forces X11.** `initializeGTK()` runs `setenv("GDK_BACKEND","x11",1)`, so on a Wayland session every window goes through XWayland, and the user cannot override this (`linux/nativeWrapper.cpp` L6505, #568, open). Expect resize stutter and HiDPI quirks on mixed-scale Wayland setups.
  - **No application menu on Linux.** "Application menus are currently implemented on macOS and Windows. Linux apps should expose essential actions in application UI or a supported tray menu" (`docs/apis/application-menu.mdx`). Tray click events on Linux are also broken (#374, open).
  - Windows: Ctrl+N in a WebView2 window opens an empty browser window that the app cannot stop (#569, open). Every keyboard shortcut needs checking against WebView2's built-in accelerators. The WebView2 status bar cannot be disabled (#534, open). Live resize shows white bands (#484, open). `hiddenInset` windows maximize over the taskbar (#558, open). The window icon is never set (#565, open). The installed launcher shows a second, blurry taskbar entry that uses the Bun icon (#514, open).
  - Linux CEF: the `bun Helper` process aborts with a harmless `SIGABRT` at exit and writes a core dump each time (#537, open).

## Typed RPC

- The same TypeScript API on every OS: one `RPCSchema`, with `BrowserView.defineRPC` / `Electroview.defineRPC`. The schema and its usage are platform-neutral (`docs/apis/browser-view.mdx`).
- The transport differs only in a detail. On Linux the host pre-encrypts packets in TypeScript and hands them to the native transport. Other platforms pass JSON to the native transport, which encrypts it (`package/src/sdks/main/core/Socket.ts` L18–33). The macOS limits apply on every OS: JSON only, no streaming, and no published throughput numbers. Measure the bulk 48k-row transfer on each OS. **Not verified** on Windows or Linux.

## Spawning the external MAME process

- The main process is real Bun (1.4.0 on the 2.0.3 betas), so `Bun.spawn` works the same way on every OS. Electrobun adds no wrapper around it.
- Bun has Windows-only spawn options, `windowsHide` and `windowsVerbatimArguments`, but its docs do not describe them (`bun.com/docs/runtime/child-process`). The packaged Windows app is a GUI-subsystem executable (`cross-platform-development.mdx` §Windows Console Output). Official `mame.exe` is a console-subsystem program, so spawning it from a GUI parent can open an extra console window. **Not verified:** whether `windowsHide: true` suppresses only the console window or also hides MAME's own game window. Test both settings.
- Path handling: on Windows, MAME is wherever the user unpacked the zip, since there is no Homebrew equivalent. On Linux it is usually `/usr/games/mame` or `/usr/bin/mame` from the distro package. The MAME path must be a setting, as the macOS file already suggests. Pass arguments as an array, never as a shell string. Windows argument quoting is a separate concern (`windowsVerbatimArguments`).
- Launcher argv is dropped on both Windows and Linux. The native launcher starts the Bun main process without forwarding its own arguments (#483, #554, both open). This does not affect spawning MAME. It only matters if the app ever needs to be launched with an argument (file association, `--rom pacman`, and so on).
- **Not verified** (same open item as on macOS): whether a running MAME child survives or is killed when the app quits. On Windows, Bun does not document whether children are tied to the parent through a job object.

## SQLite (`bun:sqlite`)

- Works the same way. On **Linux and Windows, Bun statically links its own upstream SQLite build**. On macOS it uses Apple's system SQLite (`bun.com/docs/runtime/sqlite`).
- Consequences: SQLite versions and compile options differ by OS. On macOS, WAL sidecar files persist after close. On Windows and Linux they are normally removed. `Database.setCustomSQLite()` is macOS-only and returns `false` elsewhere. Keep the schema to features all three builds share. Never commit WAL files and never assume they exist.
- `Utils.paths.userData` resolves to `%LOCALAPPDATA%\<identifier>\<channel>\...` on Windows and `$XDG_DATA_HOME` (default `~/.local/share`) on Linux (`package/src/sdks/main/core/Utils.ts` `getAppDataDir`). The per-channel split from the macOS file applies here too.

## Serving local media: `Bun.serve` with HTTP Range

- **`appdata://` has the same video problem on Windows and Linux as on macOS.**
  - Windows (WebView2): the `WebResourceRequested` handler loads the whole file into memory (`loadAppDataFile`), wraps it in an `HGLOBAL` stream and always answers `200 OK`. The only headers are `Content-Type` and `Access-Control-Allow-Origin`, with no `Accept-Ranges` or `Content-Range` (`win/nativeWrapper.cpp` ~L7531–7620).
  - Linux (WebKitGTK): `handleAppDataURIScheme` reads the file fully (`readContainedFile`), copies it into a `g_memory_input_stream` and finishes with a fixed response. The only headers are ACAO and `nosniff`, with no Range handling (`linux/nativeWrapper.cpp` ~L6268–6305).
  - The CEF handlers on both OSes use the same "read whole file" pattern (`ViewsSchemeHandler`, `win/nativeWrapper.cpp` ~L1123, `linux/nativeWrapper.cpp` ~L720).
- **Conclusion: a local `Bun.serve` on `127.0.0.1` is the cross-platform answer for media**, as the macOS file recommended. Bun's own docs say that static **file routes** (`routes: { "/x": Bun.file(...) }`) handle Range requests automatically, including `If-Range`. In a dynamic `fetch` handler, `Bun.file(path).slice(start, end)` makes Bun set `Content-Range` and `Content-Length` itself. Bun uses `sendfile(2)` where it can (`bun.com/docs/runtime/http/routing`). The handler still has to parse the `Range` header and return status 206 itself (**not verified**: whether a sliced-file `Response` defaults to 206).
- Loading `http://127.0.0.1:<port>/...` media from a page whose origin is `views://` is allowed in principle. `views://` is registered as a secure scheme on both OSes (`put_TreatAsSecure(TRUE)` on Windows, `webkit_security_manager_register_uri_scheme_as_secure` on Linux), and loopback HTTP counts as a "potentially trustworthy" origin. So `<img>` and `<video>` should not be blocked as mixed content. **Not verified on WebKitGTK.** Test this first.
- **Video codec sharp edges** (general engine behaviour, not Electrobun code):
  - WebView2 plays H.264/AAC MP4, because Edge includes proprietary codecs.
  - WebKitGTK plays media through **GStreamer**. Playing H.264 MP4 needs the distro's GStreamer plugins (for example `gst-plugins-good` and `gst-libav`). Fedora ships these only through RPM Fusion or `openh264`. Electrobun's list of required packages does not include GStreamer. **Not verified** which plugins Electrobun's own test images have installed.
  - **Bundled CEF** comes from the standard Spotify CEF builds (`package/build.ts` downloads `cef-builds.spotifycdn.com/cef_binary_..._minimal.tar.bz2`). Those builds are compiled without proprietary codecs, so **H.264/AAC MP4 will not play under CEF**. VP8, VP9, AV1 and WebM will. If CEF is ever enabled, ScreenScraper's MP4 videos would need transcoding. **Not verified** by playing a file.

## Packaging, installers and code signing

From `docs/guides/bundling-and-distribution.mdx` and `docs/guides/code-signing.mdx`.

| OS | Installer artifact (stable) | Update archive | Signing |
| --- | --- | --- | --- |
| macOS | `macos-arm64-<App>.dmg` | `.app.tar.zst` | Hutch signs and notarizes with a Developer ID |
| Windows | `win-x64-<App>-Setup.zip` (a setup `.exe` plus a hidden payload) | `.tar.zst` | **Not part of Hutch:** "Windows release signing is not currently part of Hutch's packaging pipeline" |
| Linux | `linux-x64-<App>-Setup.tar.gz` (a self-extracting `installer` plus a README) | `.tar.zst` | None (not applicable). Optional Flatpak manifest; Hutch does not run `flatpak-builder` |

- **Windows:** no MSI, MSIX or NSIS output. An unsigned setup `.exe` triggers a SmartScreen warning ("Windows protected your PC"). For a personal app, click through it, or sign it yourself in a `postPackage` build hook with `signtool`. That hook is **not documented** for this purpose. The unattended updater is broken on Windows: the `schtasks` command is silently truncated, so updates never apply (#535, open). This is irrelevant if the built-in updater is not used. The installer had earlier bugs that are now fixed (#532 `InvalidUninstallLocation`, #249 stall).
- **Linux:** no `.deb`, `.rpm` or AppImage. Flatpak support is only partial (#315, open). Release binaries are built on Ubuntu 24.04 runners, and they fail with `GLIBC_2.38 not found` on Ubuntu 22.04 (#240, open). **The practical floor is a distro with glibc 2.38 or newer** (Ubuntu 24.04+, Fedora 39+, any current Arch).
- Debugging a packaged Windows build: set `ELECTROBUN_CONSOLE=1` to see stdout and stderr (`cross-platform-development.mdx`).

## Cross-compiling

- **No.** "Hutch builds for the current host operating system and architecture. Produce a cross-platform release with native CI runners" (`docs/guides/compatability.mdx`). The bundling guide adds a host-native matrix with one runner per target. macOS signing must run on macOS.
- A Mac can build only the macOS arm64 artifact. Windows and Linux artifacts need a Windows machine or VM and a Linux machine or VM, or GitHub Actions runners (`windows-2025`, `ubuntu-24.04`, mirroring Electrobun's own `release.yml`).
- Windows toolchain pitfalls when building there (only relevant for native main-process runtimes or vendoring, not for `mainProcess: "bun"`): a missing cmake launches a blocking Visual Studio Build Tools installer (#548). Vendoring fails from Git Bash (#547). Dev builds on a Dev Drive (ReFS) panic (#490). All three are open.

## Red flags / blockers summary

1. **Linux has no native application menu.** Every menu action must live in the React UI or the tray, and tray clicks are buggy on Linux (#374).
2. **Linux forces XWayland** (#568). The app works, but expect resize jank and HiDPI issues on Wayland desktops.
3. **Linux glibc floor is 2.38** (#240). Ubuntu 22.04 and older are out.
4. **Video codecs:** WebKitGTK needs GStreamer H.264 plugins installed by the user. Bundled CEF cannot play H.264 at all. WebView2 is fine. This argues for staying on system webviews and testing MP4 playback on Linux early.
5. **`appdata://` cannot stream video on any OS.** Use a `Bun.serve` with Range support everywhere, which also gives one code path for all three OSes.
6. **Windows signing is not done by the toolchain.** Expect SmartScreen warnings. The Windows auto-updater is broken (#535).
7. **No cross-compiling.** Releases need one CI job per OS.
8. Windows polish bugs: a stray Ctrl+N window (#569), a second taskbar icon (#514), no window icon (#565), resize flicker (#484). #571 (idle memory growth) was reported for a Cottontail tray app on 2.0.1. It is **not verified** whether this also happens with `mainProcess: "bun"` and a webview window.
9. MAME spawn on Windows: console-window and `windowsHide` behaviour, and child lifetime on quit, are untested.
10. Launcher argv is dropped on Windows and Linux (#483, #554). This only matters if command-line launch options are ever wanted.
