# Research: MAME 0.289 CLI and data sources

Ticket: [03 — MAME CLI and data sources](../tickets/03-mame-cli-data.md)
Date: 2026-10-16. Binary: Homebrew build, `mame -version` → `0.289 (unknown)`.

Sources:
- **[local]**: measurements on this Mac with the installed 0.289 binary (wall-clock times, warm cache, Apple Silicon).
- **[src]**: MAME source at tag `mame0289` on GitHub: `src/frontend/mame/clifront.cpp`, `src/frontend/mame/audit.{h,cpp}`, `src/emu/fileio.cpp`, `src/emu/romload.cpp`, `src/emu/main.h` (exit codes taken from `master`; they haven't changed in years).
- **[docs]**: https://docs.mamedev.org/commandline/commandline-all.html
- **[whatsnew]**: `whatsnew_0281.txt` … `whatsnew_0289.txt` from the GitHub release assets.

**SMB status during this research:** the network-share rompath was an empty directory and nothing was mounted (`mount` showed no SMB volumes). So I could **not** measure `-verifyroms` against the real 0.280 set. All verify output shown below came from a fake rompath I built in scratch with `-rompath` (zero-filled ROMs, one file missing, wrong lengths). See §5 for what an unmounted share does.

## 1. Timings and sizes [local]

Every invocation has a fixed process cost of about **0.45 s**: MAME builds its driver list even for a single-name query.

| Command | Wall time | stdout size | Notes |
|---|---|---|---|
| `-listxml` (full) | **2.78 s** (2.15 s with `-nodtd`) | **320 MB** (21.5 MB gzipped) | 50,368 `<machine>` elements |
| `-listxml pacman` / `-listxml -nodtd pacman sf2 mslug` | 0.47 s / 0.45 s | 13 KB / 53 KB | accepts several names and wildcards |
| `-listfull` | 0.85 s | 2.8 MB | `name "description"` |
| `-listclones` | 0.95 s | 0.7 MB | `clone parent` |
| `-listsource` | 0.84 s | 1.9 MB | `name sourcefile` |
| `-listbios` | 2.56 s | 5.4 MB | per-machine `-bios` choices |
| `-listroms pacman`, `-listcrc pacman`, `-listdevices pacman`, `-listbrothers pacman` | ~0.46–0.51 s | <7 KB | |
| `-verifyroms <one set>` | 0.46–0.8 s | — | local fake rompath |
| `-verifyroms` with 500 names in one process | 1.22 s | — | ≈1.5 ms per extra name of pattern-matching overhead (driver list × args) |
| `-showconfig` | ~0.45 s | 395 lines | |

Parsing the full XML with a streaming parser (Python `iterparse`) took 5.0 s. A Bun SAX or streaming parser should be in the same range. Don't load all 320 MB at once.

## 2. `-listxml` schema (what a launcher needs)

The DTD is embedded at the top of the output (163 lines; `-nodtd` drops it). Root: `<mame build="0.289 (unknown)" debug="no" mameconfig="10">`. [local]

`<machine>` attributes: `name` (required), `sourcefile`, `isbios`, `isdevice`, `ismechanical` (yes/no, default no), `runnable` (default yes), `cloneof`, `romof`, `sampleof`.

Child elements used by the launcher:
- `description`, `year`, `manufacturer` (text)
- `driver status|emulation (good|imperfect|preliminary)`, `cocktail`, `savestate (supported|unsupported)`, plus flags `requiresartwork`, `unofficial`, `nosoundhardware`, `incomplete`
- `feature type=… status|overall=(unemulated|imperfect)` (e.g. protection, sound, graphics)
- `display type=(raster|vector|lcd|svg|unknown) rotate=(0|90|180|270) width height refresh …` (zero or more; multi-screen machines have several)
- `input players coins service tilt` with `control type player buttons ways`
- `biosset name description default`; `rom name size crc sha1 merge bios status=(baddump|nodump|good) optional`; `disk name sha1 merge status` (CHDs)
- `device_ref` (devices whose ROMs the set may also need), `sample`, `softwarelist`, `slot`, `dipswitch`, `configuration`, …

Counts across the 0.289 output [local]:

| | count |
|---|---|
| total `<machine>` | 50,368 |
| `isdevice="yes"` (all also `runnable="no"`) | 7,318 |
| `isbios="yes"` | 80 |
| `ismechanical="yes"` (fruit machines, pinball, electromechanical) | 15,851 |
| not device / bios / mechanical, and runnable | **27,119** |
| `cloneof` set (Clones) | 27,730 |
| `romof` without `cloneof` (Parents that depend on a BIOS, e.g. `mslug romof="neogeo"`) | 1,695 |
| driver status good / imperfect / preliminary | 11,794 / 4,000 / 27,256 |
| no `rom` and no `disk` (need no files) | 6,215 |
| has at least one `disk` (CHD) | 1,260 |
| display raster / lcd / svg / vector; no display | 22,876 / 1,012 / 368 / 109; 26,572 machines |

Examples [local]:
- `pacman`: `cloneof="puckman" romof="puckman"`, rotate 90, driver good.
- `mslug`: Parent with `romof="neogeo"` and 33 `biosset`s.
- `neogeo`: `isbios="yes"`.

**Note:** a Parent can still have `romof`, which points to its BIOS. Availability checks have to follow the `romof` chain to the BIOS set, and to `device_ref` ROMs.

**Incremental alternatives.** `-listfull`, `-listclones` and `-listsource` are fast and small but carry only names, descriptions, the parent link and the source file. They have no year, manufacturer, status or device/bios/mechanical flags, so they can't replace `-listxml`. `-listxml <names…>` returns a subset in about 0.45 s, which is useful for re-reading single machines. Practical plan: run one full `-listxml` per MAME version (about 3 s plus about 5 s to parse) and cache it in SQLite, keyed by `mame -version` (or the `build` attribute).

## 3. `-verifyroms`

**Invocation** [src `clifront.cpp` verifyroms]:
- Accepts one or more patterns, wildcards allowed. Wildcard or multi-name mode is on when `args.size() != 1` or the pattern contains a wildcard.
- It loops over all drivers once and audits every name that matches.
- It calls `audit_media(AUDIT_VALIDATE_FAST)`. `AUDIT_VALIDATE_FAST` is `"R"`, which means **CRC only** [src `audit.h`].
- Files are opened with `OPEN_FLAG_NO_PRELOAD` [src `audit.cpp`]. For a zipped ROM the CRC is taken from the archive header (`m_hashes.add_crc(m_zipfile->current_crc())`, no preload) [src `fileio.cpp`].
- **So verification reads zip directories and does not decompress.** That keeps the I/O cost low over SMB.
- ROMs are looked up by name and CRC (`file.open(name, crc)`) across a search path made of the set, its parent(s) and its BIOS [src `audit.cpp`]. A renamed file inside a zip still passes if its CRC matches.

**Output** [src `print_summary`, local]:
- Per-file problem lines go to stdout:
  ```
  pacman      : pacman.6e (4096 bytes) - INCORRECT CHECKSUM:
  EXPECTED: CRC(c1e6ab10) SHA1(e87e…)
     FOUND: CRC(c71c0011)
  pacman      : pacman.5f (4096 bytes) - NOT FOUND
  puckman     : pm1_prg1.6e (2048 bytes) - INCORRECT LENGTH: 100 bytes
  ```
  The source also emits `NO GOOD DUMP KNOWN` for nodump entries.
- Per-set verdict, on stdout: `romset <name> [<parent>] is good|is bad|is best available`.
  - `best available` means it passes but has known bad dumps or nodumps. It is also printed for sets that need no ROMs at all in multi-name mode.
- Sets that are **not found** print nothing in multi-name mode. Treat a requested name that is missing from the output as "not found".
- Summary line: `N romsets found, M were OK.`
  - On stdout with exit code 0 when nothing was bad.
  - Thrown as a fatal error, so it goes to **stderr** with **exit code 2**, when any set was bad.
- Single-name special cases, both on stderr with exit code 2:
  - `romset "sf2" not found!`
  - `romset "x" has no roms!` (a machine that needs no ROMs)
- Unknown name: `No matching systems found for 'x'` with exit code 5.
- Parser rule: key on lines matching `^romset (\S+)(?: \[(\S+)\])? (is good|is bad|is best available)$`, and on the exit code.

**Batching.** Run one process with many names, not one process per set. The fixed cost is about 0.45 s per process, so 10k separate calls would take about 75 min of startup alone. Matching cost grows with names × drivers (≈1.5 ms per name measured), so chunks of about 500–1000 names per process work well. The macOS `ARG_MAX` limit (1 MB) is not a constraint at that size.

**Speed over SMB: not measured** (share unmounted). Expected cost:
- 0.45 s per process.
- Per set: a few SMB opens or misses. MAME tries a directory and zip/7z variants for the set, its parent and its BIOS in each rompath entry, then reads only the zip central directory.
- At LAN round-trip times (≈1–5 ms) that is roughly 10–50 ms per set. A few thousand Available sets would take minutes, not hours.
- This is an estimate. Measure `-verifyroms pacman sf2 mslug` and a 500-name chunk once the share is mounted.
- `-verifyroms '*'` (a full run) is the slow path and should be a rare background job.

## 4. Launch: invocation, useful args, exit codes, stderr

Invocation: `mame [options] <machine>` (options may come before or after the name). Per-launch options are CLI args, so `mame.ini` stays read-only. Options listed by `-showusage` that are useful to a launcher [local]:
- Window: `-window` / `-nowindow`, `-maximize` / `-nomaximize`, `-resolution WxH[@Hz]`, `-keepaspect`, `-switchres`
- Video: `-video opengl|bgfx|accel|soft|none`, `-bgfx_screen_chains …` (shaders)
- Startup: `-skip_gameinfo`, `-bios <name>` (choices from `-listbios` / `<biosset>`), `-autosave`, `-state <slot>`
- Input: `-joystick`, `-mouse`, `-joystick_map`
- UI: `-ui simple|cabinet`, `-confirm_quit`, `-language`
- Plugins: `-plugins` / `-plugin a,b`, `-autoboot_command`, `-autoboot_script`
- Diagnostics: `-verbose`, `-log`, `-oslog`, `-output console|network`
- Paths: `-rompath`, `-cfg_directory`, `-nvram_directory`, `-snapshot_directory`, `-state_directory`, `-inipath`
- `-noreadconfig` ignores all ini files.

Exit codes [src `main.h`; local where marked ✓]:

| code | name | when |
|---|---|---|
| 0 | `EMU_ERR_NONE` | normal quit ✓ (list commands) |
| 1 | `FAILED_VALIDITY` | `-validate` failed |
| 2 | `MISSING_FILES` | required ROMs missing at launch ✓; `-verifyroms` found bad or missing sets ✓ |
| 3 | `FATALERROR` | other fatal error |
| 4 | `DEVICE` | device init error |
| 5 | `NO_SUCH_SYSTEM` | unknown machine ✓ |
| 6 | `INVALID_CONFIG` | unknown option ✓ (`Error: unknown option: -bogusoption`) |
| 7/8/9 | `IDENT_*` | `-romident` results (8 ✓ for a partial match) |

Failure stderr [local]:
- **Missing ROMs at launch** (exit 2):
  - one line per problem: `pacman.6e WRONG CHECKSUMS: EXPECTED … FOUND …`, `pacman.5f NOT FOUND (tried in pacman puckman)`
  - then `Fatal error: Required files are missing, the machine cannot be run.`
  - Wrong checksums alone are **warnings**: MAME still runs and shows its own warning screen. Only missing required files are fatal [src `romload.cpp` ~L620–675].
- **Unknown machine** (exit 5): `Unknown system 'x'` plus a "best match first" list of suggestions.
- **Noise**: every run prints `**Error loading plugin.ini**`. The principal's `plugin.ini` is only a 3-byte UTF-8 BOM. It's harmless, but the stderr parser should ignore it.

The launcher should keep about the last 4 KB of stderr and map the exit code to a message: 2 → "ROMs missing" (show the NOT FOUND lines), 5 → "Unknown machine, the Library is stale", 6 → "bad option override".

## 5. Version and resolved paths (`-showconfig`)

- `mame -version` prints `0.289 (unknown)`. The same build string is in `-listxml`'s `<mame build=…>`. Use either as the cache key for the Library and Verified results.
- `-showconfig` prints the merged effective options as `name<spaces>value`, with values containing spaces or `;` quoted. Values are **not** made absolute. On this machine:
  ```
  homepath   .
  rompath    "roms;<rompath>"
  inipath    "$HOME/Library/Application Support/mame;$HOME/.mame;.;ini"
  cfg_directory cfg   nvram_directory nvram   snapshot_directory snap   state_directory sta
  ```
- Relative paths resolve against the **current working directory** [docs]. The launcher has to:
  1. Spawn MAME with a fixed `cwd`. Otherwise `cfg/`, `nvram/` and `snap/` end up wherever the launcher happened to start. Which directory to use is a decision for the Launch flow ticket.
  2. Expand `$HOME` and split on `;`.
  3. Resolve relative entries against that same `cwd` before its own file-presence scan.

**Unmounted SMB effect** [local]:
- MAME skips a rompath entry that doesn't exist **without any warning**. Every set on the share then reports `romset "x" not found!` with exit code 2, exactly like a set you don't own.
- The launcher must check that each rompath entry exists (and that the share is mounted) **before** scanning or verifying. While the share is offline it should mark results as "storage offline", not overwrite cached Available/Verified status with "missing".

## 6. A 0.280 non-merged set with a 0.289 binary

- MAME has no concept of a set version. The audit is per file: name+CRC lookup, CRC-only in fast verify [src]. Most 0.280 sets will verify `good` on 0.289.
- Causes of drift across nine releases (0.281–0.289) [whatsnew]:
  - **New machines** since 0.280: about 63 new working systems, 265 working clones, 473 non-working systems and 198 non-working clones, roughly 1,000 in total and many of them non-arcade. They show as not Available, which is correct.
  - **Changed ROM definitions** (redumps, added or corrected ROMs) on a few hundred source-change entries, by rough keyword count: about 224 dump/verify mentions and about 67 rename mentions. Those sets verify `bad`. Most of them still **launch**: wrong CRC is a warning, and only a missing required file is fatal.
  - **Renamed set short names**: the zip under the old name is invisible, so the machine shows as not Available even though the file is present.
- Practical impact:
  - The Available/Verified split decided in the map is necessary, not just nice to have. Available (file present) will overcount slightly compared with Verified.
  - Verified results must be cached per MAME version and fully re-run after every MAME upgrade.
  - A Verified=bad set should still be launchable, with a warning badge rather than being blocked.

## 7. Recommendations for downstream tickets

- **Library index (05):**
  - One full `-listxml -nodtd`, stream-parsed into SQLite, keyed on the MAME version.
  - Default filter: `isdevice=no AND isbios=no AND runnable=yes`, which gives 27,119 machines if mechanical ones are also hidden. Hiding `ismechanical` is a product decision.
  - Treat the 6,215 machines that need no ROMs as Available without any file.
  - Availability must follow `romof` (BIOS) and `device_ref`.
- **Verification:** background chunks of about 500 names per `-verifyroms` call. Parse the `romset … is …` lines plus the exit code. A requested name with no output line means not found. Skip the run when the rompath is offline.
- **Launch flow (08):** fixed `cwd`, per-launch CLI args only, keep the stderr tail, and use the exit-code mapping in §4.
