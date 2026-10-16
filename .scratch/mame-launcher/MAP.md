---
labels: [wayfinder:map]
status: open
---
# MAME Launcher (Electrobun)

## Destination

A build-ready spec for a personal, desktop-only macOS **launcher** for MAME (MAME runs as a separate process), built in Electrobun with React + TanStack Virtual — every decision locked, ready to hand to implementation sessions.

## Notes

- Tracker: local markdown. Tickets live in `tickets/`; frontmatter carries `labels`, `status` (open/closed), `assignee` (the claim), `blocked_by` (ticket ids). Frontier = open, unassigned, all `blocked_by` closed.
- Each session: consult `CONTEXT.md` (glossary) at repo root; grilling tickets call `grilling` + `domain-modeling`.
- Dev environment: machine-specific; kept out of the repo and tracker.
- Standing preferences: launcher treats `mame.ini` as read-only (per-launch options via CLI args); app's own state in SQLite (`bun:sqlite`); ScreenScraper (screenscraper.fr API) is the media/metadata source; keep cross-platform-capable where free, but macOS is the only target.
- Settled while charting: library shows Available machines by default with a show-all toggle; availability = fast file-presence scan, then background `-verifyroms` cached per MAME version; favorites + recents in scope, play time nice-to-have.

## Decisions so far

- [Electrobun capabilities on macOS](tickets/01-electrobun-capabilities.md): Usable on arm64 with the Bun runtime pinned (v2.0.x, changing fast). RPC is typed but JSON-only (no streaming). Bun.spawn and bun:sqlite work as-is. appdata:// is confined to userData and has no Range support, so serve media from a local Bun.serve. Watch for the webview freezing after sleep/wake.
- [ScreenScraper API](tickets/02-screenscraper-api.md): GET api2 with dev creds (via forum) + user ssid/sspassword; MAME systemeid=75, match by `romnom=<set>.zip`; obey per-user quotas returned by `ssuserInfos`/`jeuInfos` (~1 req/s/thread, 430/431 = stop for the day); media types ss/sstitle/marquee/wheel/flyer/video-normalized/manuel; CC BY-NC-SA, cache locally.
- [MAME CLI and data sources](tickets/03-mame-cli-data.md): one cached `-listxml` per MAME version (320 MB, ~3 s, stream-parse) is the Library source; Verified comes from batched CRC-only `-verifyroms` (~0.45 s/process, ~500 names/chunk, check SMB mount first since missing rompaths fail silently); launch is `mame [args] <machine>` from a fixed cwd with exit codes 0/2/5/6; the 0.280 set mostly verifies on 0.289, and drifted sets verify bad but still launch.

## Not yet specified

- Per-machine option overrides (video/shader/input options passed as CLI args) — shape depends on Launch flow.
- Settings screen: what's user-configurable vs read from `mame.ini`.
- Testing strategy for scanner/parser/scraper and UI.
- Build & update path for a personal app (signing, where the .app lives, MAME version upgrades).

## Out of scope

- Couch/cabinet mode (fullscreen, gamepad-driven) — desktop only for now.
- Software lists (consoles/computers) — second browsing model; arcade/standalone machines only.
- Embedded emulation (libmame / WASM) — this is a launcher.
- Writing `mame.ini` / `ui.ini`.
- Distribution to others / non-macOS platforms.
