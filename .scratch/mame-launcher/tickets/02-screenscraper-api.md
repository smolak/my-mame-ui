---
id: 02
labels: [wayfinder:research]
status: closed
assignee: claude
blocked_by: []
---
# ScreenScraper API

## Question

How does the screenscraper.fr API (v2) work for a MAME launcher? Auth (devid/devpassword/softname + user ssid/sspassword) and how to obtain dev credentials; quotas, thread limits, rate limiting by account tier; MAME/arcade system id; matching a game by MAME set name vs CRC/MD5/filename (`jeuInfos`); available text metadata (descriptions, genres, players, languages) and media types (screenshot, title, marquee, box, wheel, video, video-normalized, manual) with region/language selection; terms regarding local caching; error/response shape.

## Resolution

- **Auth**: plain GET to `https://api.screenscraper.fr/api2/*.php` with `devid` + `devpassword` + `softname` (app credentials, obtained by presenting the app in the screenscraper.fr developer forum) plus optional user `ssid` + `sspassword` (free account; strongly recommended). v2 is officially "beta".
- **Limits** are per user and returned live by `ssuserInfos` / every `jeuInfos` (`maxthreads`, `maxrequestspermin`, `maxrequestsperday`, `maxrequestskoperday`); client-side quota handling is mandatory. Community practice: about 1 req/s per thread; anonymous = 1 thread; about 20k/day registered (unverified).
- **Errors**: HTTP status codes with plain-text French bodies: 403 bad dev creds, 404 no match, 429 slow down, 430/431 stop for the day, 401/423 server closed, 426 blacklisted software.
- **MAME** = `systemeid=75`. Match with `jeuInfos.php?romnom=<set>.zip&systemeid=75&romtype=rom` (+ `romtaille` and hash when cheap; zip hashes are unreliable for non-merged sets). Fallback: `jeuRecherche`.
- **Text**: per-region `noms`, per-language `synopsis`/`genres`, `joueurs`, `note`/20, `dates`, `editeur`/`developpeur`, arcade-only `rotation`/`resolution`.
- **Media** `type` ids: `ss`, `sstitle`, `marquee`, `screenmarquee`, `wheel`/`wheel-hd`, `flyer`, `box-2D`, `video`/`video-normalized` (no region), `manuel` (pdf), `fanart`, bezels. Region is picked client-side from each entry's `region` field.
- **Caching**: content is CC BY-NC-SA 4.0. Local caching is the norm and is supported (`CRCOK` refresh); cache "not found" results too. Use only in free, non-distributed apps unless authorized.

Findings: branch research/screenscraper-api, file .scratch/mame-launcher/research/screenscraper-api.md
