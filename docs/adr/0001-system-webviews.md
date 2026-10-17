# Use each OS's system webview, not bundled CEF

The Launcher renders its UI in the system webview on every target (WKWebView on macOS, WebView2 on Windows, WebKitGTK on Linux) rather than Electrobun's bundled CEF. CEF would give one engine everywhere, but Electrobun's CEF builds lack proprietary codecs, so ScreenScraper's H.264 Preview videos would not play; it also adds ~100–150 MB per platform and makes us responsible for shipping Chromium security updates, while Linux still needs the GTK/WebKitGTK libraries regardless.

## Consequences

- Three engines: UI behaviour (CSS, JS, virtualised scrolling) must be checked on each; WebKitGTK is the weakest (performance, XWayland).
- Linux users need GStreamer H.264 plugins (gst-libav) for MP4 Preview videos; otherwise the Launcher falls back to stills or the optional WebM conversion.
- Reversal is mechanically cheap (an Electrobun build setting; React code is unchanged) but would flip the Preview-video default: WebM conversion and `ffmpeg` would become mandatory.

See [Platform support floor](https://github.com/smolak/my-mame-ui/issues/12) and `docs/research/electrobun-windows-linux.md` (branch `research/electrobun-windows-linux`).
