# Context

Glossary for the MAME launcher. Terms only — no implementation detail.

- **Launcher** — this app. Browses the Library and starts MAME as a separate program; never emulates itself.
- **Machine** — MAME's unit of emulation (an arcade game or standalone system), identified by its short set name (e.g. `pacman`). Preferred over "game" or "ROM".
- **Parent / Clone** — a Clone is a variant of a Parent Machine (region, revision, bootleg).
- **ROM set** — the files a Machine needs. The principal's collection is non-merged: each set is self-contained.
- **Library** — every Machine the installed MAME knows about, with the principal's status for each.
- **Missing** — a Machine for which at least one required file (its own ROM set, BIOS, device ROMs or CHD) is not present.
- **Available** — a Machine for which every required file is present. Says nothing about correctness.
- **Verified** — an Available Machine that passes MAME's own verification for the installed MAME version, including sets MAME rates "best available" (a file no one has ever dumped).
- **Damaged** — an Available Machine that fails MAME's verification. It may still run.
- **ROMs offline** — the state where a rompath folder is unreachable (share not mounted). Statuses are frozen, not recomputed.
- **Media** — descriptive text and assets about a Machine (screenshots, titles, marquees, videos, descriptions) obtained from ScreenScraper.
- **Preview video** — a short Media clip of a Machine played inside the Launcher while browsing. Not gameplay: gameplay audio and video are always MAME's own.
- **Favorite / Recent** — the principal's personal marks on Machines; owned by the Launcher, not by MAME.
