# Launch process spike

Throwaway spike for the "Launch process spike" ticket. Findings: `docs/research/launch-process.md`.

- `probe/signals.ts` — plain Bun: MAME's reaction to stop signals and to the Lua stop file.
- `probe/stop.lua` — `-autoboot_script` that exits MAME cleanly when `MYMAME_STOP_FILE` appears.
- `src/bun/index.ts` — Electrobun app: spawns MAME, then quits / crashes / quits via before-quit. Control file via `SPIKE_CTL`.

Build: `hutch electrobun build`, then run `build/<env>/launch-spike-dev.app/Contents/MacOS/launcher` (or the per-OS equivalent) with `SPIKE_CTL=<ctl.json>`.
