# Launch process: MAME as a child of the Launcher

Spike for the "Launch process spike" ticket. Run 2026-10-18 with MAME 0.289, Electrobun 2.0.2 (Hutch 0.27.1, `mainProcess: "bun"`, Bun 1.4.0). Code: `spike/launch/` on branch `spike/launch-process`.

Status: **macOS measured. Windows and Linux not yet run.**

## macOS 26 (arm64)

### Process tree

`launcher` (native) → `bun` (main process) → `mame`. All three share one process group. MAME is a direct child of the Bun process, so `Bun.spawn`'s `exited`, `exitCode` and `signalCode` behave normally.

### Stop signals: MAME ignores SIGTERM and SIGINT

`probe/signals.ts` starts a fresh `mame -window -skip_gameinfo pacman` for each case, waits 6 s, sends the signal, then waits up to 5 s.

| stop | result | exit | cfg/nvram saved |
|---|---|---|---|
| SIGTERM | **ignored** (alive after 5 s, then SIGKILLed) | — | no |
| SIGINT | **ignored** | — | no |
| SIGQUIT | dies in ~10 ms | signal SIGQUIT | no |
| SIGHUP | dies in ~15 ms | signal SIGHUP | no |
| Lua stop file (below) | clean exit in **~170 ms** | **0** | **yes** (`cfg/<set>.cfg` mtime updated) |

The Launch flow decision assumed "SIGTERM, then kill after a timeout". That doesn't work: SIGTERM never ends the session, and every signal that does end it skips MAME's save.

### Graceful stop that works: Lua stop file

`probe/stop.lua` is passed as `-autoboot_script`. It registers `emu.add_machine_frame_notifier`. Every 6 frames it checks for the file named by the env var `MYMAME_STOP_FILE`. When the file appears, the script deletes it and calls `manager.machine:exit()`. The result is MAME's normal exit path: exit 0, with cfg and nvram written.

- It works while the machine is paused (`emu.pause()`), because frame notifiers keep firing.
- `register_periodic` and `add_machine_periodic_notifier` are deprecated or absent in 0.289. `machine:pause()` doesn't exist; use `emu.pause()`.
- If the autoboot script fails (bad Lua), MAME exits **3** before starting the machine. A bug in the launcher's script therefore looks like a Failed launch.
- It takes over `-autoboot_script`. A per-machine Launch option that sets its own `-autoboot_script` would replace it, or be replaced by it.
- It uses no signals, so the same mechanism should work on Windows (unverified).

### Launcher quit and crash (Electrobun, `src/bun/index.ts`)

| launcher event | MAME |
|---|---|
| `Utils.quit()` with no before-quit handling | **survives** (orphaned, keeps running) |
| Launcher crash (SIGKILL to the Bun process; the whole app goes down) | **survives** |
| `Utils.quit()` with a before-quit handler that vetoes, writes the stop file, awaits `exited`, then calls `Utils.quit()` again | MAME exits 0 in ~1.3 s, then the app quits |
| AppleEvent quit (`osascript … to quit`, which is what Dock Quit and logout send) | **before-quit fires** too. The same flow works. The veto returns "user cancelled" (-128) to the sender, as expected. |

`before-quit` is synchronous: the handler must set `e.response = { allow: false }` immediately. An async confirm dialog ("MAME is running … Quit both?") therefore has to veto first, ask, and then call `Utils.quit()` again.

## Windows / Linux

Not run yet. To do:

1. `bun spike/launch/probe/signals.ts <mame-home-dir> <machine>` (set `MAME_BIN` if `mame` isn't on PATH). Record the JSON lines. On Windows the cases are `luastop` and plain `kill` (TerminateProcess).
2. Build the spike app (`hutch electrobun build`) and run it once per mode (`quit`, `crash`, `graceful`) with `SPIKE_CTL` pointing at a control JSON. Record the log, and whether `mame` is still running afterwards.
3. Windows only: does `Bun.spawn` of `mame.exe` from the packaged app flash a console window? Does `windowsHide: true` remove it, and does it also hide MAME's game window?
