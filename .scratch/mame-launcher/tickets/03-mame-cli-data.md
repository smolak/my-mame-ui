---
id: 03
labels: [wayfinder:research]
status: closed
assignee: claude
blocked_by: []
---
# MAME CLI and data sources

## Question

What does MAME 0.289's CLI give a launcher? `-listxml` schema (machine, clones/cloneof, romof, driver status, device/bios/mechanical/runnable flags, display), its size and generation time, and incremental alternatives (`-listfull`, `-listclones`, `-listroms`); `-verifyroms` output format, per-set invocation, and speed against a non-merged set over SMB; implications of a 0.280 non-merged set with a 0.289 binary; detecting MAME version and resolved paths (`-showconfig`); launch invocation, useful per-launch args, exit codes and stderr on failure.

## Resolution

- **`-listxml` is the only complete source.** It is 320 MB, has 50,368 machines and takes 2.8 s to generate (2.2 s with `-nodtd`). It must be stream-parsed (about 5 s). Run it once per MAME version, keyed on `mame -version` (`0.289 (unknown)`), and cache it in SQLite.
- **The default filter is `isdevice/isbios=no, runnable=yes`.** That leaves about 27k machines once mechanical ones are also hidden. Availability must follow `romof` (BIOS) and `device_ref`, and the 6,215 machines that need no ROMs count as Available.
- **`-listfull`, `-listclones` and `-listsource` are too thin to replace it** (0.85–0.95 s each). `-listxml <names>` is useful for single-machine re-reads (about 0.45 s).
- **`-verifyroms` is CRC-only and reads zip headers without decompressing.** Its output is `romset X [parent] is good|bad|best available`. In multi-name mode, sets that aren't found are silent. Exit code 2 means bad or missing, 5 means unknown name.
- **Batch about 500 names per process.** Each process costs about 0.45 s; 500 names took 1.2 s locally. Speed over SMB could not be measured because the share was unmounted.
- **An unmounted rompath entry is skipped silently.** Every set then reads as "not found", so the launcher must check the mount first.
- **Launch:**
  - Command: `mame [args] <machine>`.
  - Exit codes: 0 ok, 2 missing ROMs (`Fatal error: Required files are missing…` on stderr), 5 unknown machine, 6 bad option.
  - Wrong CRCs only produce a warning and the game still runs.
  - `-showconfig` paths are relative to the working directory, so MAME must be spawned with a fixed `cwd`.
- **0.280 set on the 0.289 binary:**
  - The audit is per file, so most sets verify good.
  - The roughly 1,000 machines added since 0.280 show as unavailable, which is correct.
  - Redumped sets verify bad but still launch.
  - Renamed sets look missing.
  - Verified status must therefore be cached per MAME version and stay separate from Available.

Findings: branch research/mame-cli-data, file .scratch/mame-launcher/research/mame-cli-data.md
