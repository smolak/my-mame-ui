# Launch process: MAME as a child of the Launcher

Spike for the "Launch process spike" ticket. Run 2026-10-18 with MAME 0.289, Electrobun 2.0.2 (Hutch 0.27.1, `mainProcess: "bun"`, Bun 1.4.0). Code: `spike/launch/` on branch `spike/launch-process`.

Status: **all three OSes measured.** macOS locally (macOS 26 arm64, the principal's MAME 0.289) and on CI (`macos-15`, Homebrew MAME 0.289). Windows and Linux only on GitHub-hosted CI: `windows-2025` (Windows Server 2025, official MAME 0.289 x64) and `ubuntu-24.04` (distro MAME **0.264**, under Xvfb). Workflow: `.github/workflows/launch-spike.yml`. CI uses `pong`, which needs no ROMs.

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

## Linux (ubuntu-24.04 CI, MAME 0.264, Xvfb)

Same as macOS:
- SIGTERM and SIGINT are ignored. SIGQUIT and SIGHUP kill MAME without saving.
- The Lua stop file gives exit 0 in ~200 ms.
- MAME **survives** both a normal Launcher quit and a crash.
- before-quit + stop file + re-quit works (MAME exits in ~95 ms).

## Windows (windows-2025 CI, MAME 0.289 x64)

The Launcher is started **detached** (no inherited console), as it would be from Explorer.

| check | result |
|---|---|
| PE subsystems | `launcher.exe` GUI (2). `bun.exe` and `mame.exe` are console (3). |
| Console window when spawning `mame.exe` (default options) | **none**. Diffing top-level windows against a baseline finds only MAME's game window and the Launcher window. |
| `windowsHide: true` | **hides MAME's game window too**. Never use it. |
| `proc.kill()` (TerminateProcess) | instant, no save |
| Lua stop file | exit 0 in ~200 ms |
| Normal Launcher quit with no before-quit handling | **MAME dies** with the Launcher (not orphaned, unlike macOS/Linux). Abrupt, so no save. |
| Launcher crash (TerminateProcess on the Bun process) | **MAME dies** |
| before-quit + stop file + re-quit | MAME exits 0 in ~140 ms, then the app quits |

Electrobun's Windows launcher appears to tear down the whole process tree when the app exits. Its `[electrobun:process]` spawn/exit tracking shows in the dev-build stderr. We don't know which mechanism (a job object or an explicit kill), and it didn't matter for these results.

## Cross-OS summary

- **Graceful stop = the Lua stop file on all three OSes.** No signal-based graceful stop exists: macOS and Linux ignore SIGTERM and SIGINT, and Windows has no signals. Hard stop = SIGKILL / TerminateProcess, which loses cfg and nvram.
- **Quitting while MAME runs needs the before-quit veto flow on every OS.** Without it, macOS and Linux leave MAME orphaned, and Windows kills it without saving.
- **A Launcher crash** leaves MAME running on macOS and Linux and kills it on Windows. Either way, the Play session has no recorded end.
- **Windows spawn options:** the defaults are right. No console window appears, and `windowsHide` must stay off.

## Caveats

- Windows was measured on Server 2025, not Windows 11. Linux was measured on MAME 0.264 under Xvfb, not 0.289 on a desktop session.
- Console behaviour was checked only for the dev build launched detached. A packaged and installed build wasn't tried.
