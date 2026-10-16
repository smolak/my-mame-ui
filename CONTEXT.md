# Context

Glossary for the MAME launcher. Terms only — no implementation detail.

- **Launcher** — this app. Browses the Library and starts MAME as a separate program; never emulates itself.
- **Machine** — MAME's unit of emulation (an arcade game or standalone system), identified by its short set name (e.g. `pacman`). Preferred over "game" or "ROM".
- **Parent / Clone** — a Clone is a variant of a Parent Machine (region, revision, bootleg).
- **ROM set** — the files a Machine needs. The principal's collection is non-merged: each set is self-contained.
- **Library** — every Machine the installed MAME knows about, with the principal's status for each.
- **Available** — a Machine whose ROM set is present in the rompath. Says nothing about correctness.
- **Verified** — an Available Machine whose ROM set passes MAME's own verification for the installed MAME version.
- **Media** — descriptive text and assets about a Machine (screenshots, titles, marquees, videos, descriptions) obtained from ScreenScraper.
- **Favorite / Recent** — the principal's personal marks on Machines; owned by the Launcher, not by MAME.
