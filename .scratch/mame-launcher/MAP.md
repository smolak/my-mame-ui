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
