# ScreenScraper API (v2) for the MAME Launcher

Research for ticket [02](https://github.com/smolak/my-mame-ui/issues/3). Gathered 2026-10-16. No authenticated calls were made and no accounts were registered.

## Sources

- **[SS-API]**: official API v2 docs, `https://api.screenscraper.fr/webapi2.php` (French; also served at `www.screenscraper.fr/webapi2.php`). Fetched 2026-10-16. The page header says: *"la version 2 est en mode betatest, des modifications peuvent etre apportées a tout moment ... sans préavis"*. In other words v2 is officially still beta and can change without notice.
- **[SS-FOOTER]**: site-wide footer on screenscraper.fr: *"licensed under the terms of Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International"*, followed by a list of upstream credits.
- **[ESDE]**: ES-DE scraper source, `gitlab.com/es-de/emulationstation-de` `es-app/src/scrapers/ScreenScraper.{cpp,h}` (master, fetched 2026-10-16).
- **[SKY]**: Skyscraper (Gemba fork, the maintained one), `github.com/Gemba/skyscraper` `src/screenscraper.cpp` (last commit 2026-09-20), `src/skyscraper.cpp`, `docs/SCRAPINGMODULES.md`.
- **Not reachable**: the FAQ (`faq.php`, which holds the per-level quota and thread tables) and the developer forum section (`forumsujets.php?frub=12`). Both returned an empty content area to an anonymous fetch, probably because the content is rendered by JS or needs a login. Everything marked **UNVERIFIED** below comes from those pages and needs checking.

## 1. Authentication

Every call is an HTTP GET to `https://api.screenscraper.fr/api2/<endpoint>.php` with query parameters [SS-API]:

| Param | Meaning | Required |
|---|---|---|
| `devid` | developer ID | yes |
| `devpassword` | developer password | yes |
| `softname` | name of the calling software | yes |
| `output` | `xml` (default) or `json` | no |
| `ssid` | the end user's ScreenScraper username | optional ("non obligatoire") on most endpoints |
| `sspassword` | the end user's ScreenScraper password | optional |

- Both credential pairs go in the URL query string as plain text. ES-DE and Skyscraper both send `ssid`/`sspassword` URL-encoded in clear text [ESDE] [SKY]. There is no OAuth, token or HMAC.
- **How to get dev credentials** [SS-API]: *"Si vous êtes développeur et voulez intégrer notre API, contactez-nous via le forum pour présenter votre logiciel et obtenir vos identifiants et mot de passe"*. That is: post in the forum's developer section (`https://www.screenscraper.fr/forumsujets.php?frub=12&numpage=0`), describe the app, and the team issues a `devid` and `devpassword`. You need a ScreenScraper member account to post. Turnaround time and any requirements are **UNVERIFIED**.
- **Usage rule** [SS-API]: *"L'API ScreenScraper ne peut être intégré que dans les applications entièrement gratuites et distribuées, ou, dans le cas contraire, avec l'autorisation préalable et les conditions dictées par l'équipe"*. Breaking it can lead to account suspension or legal action. A private, free, undistributed personal launcher is not literally "distributed", so say so plainly in the forum request (personal, non-commercial, not distributed) and let the team decide.
- Open-source clients embed their dev credentials lightly obfuscated: ES-DE XOR-scrambles them, Skyscraper uses `unMagic` [ESDE] [SKY]. Borrowing another app's devid would misrepresent `softname` and break the "present your software" rule. Don't do it.
- **User account** (`ssid`/`sspassword`): free registration at screenscraper.fr. Not strictly required, but anonymous users get the lowest limits, and the API is closed to them whenever the servers are busy (see §2).
- **Blacklisting**: HTTP 426 means *"Le logiciel de scrape utilisé a été blacklisté (non conforme / version obsolète)"*. Send a stable, versioned `softname`, e.g. `my-mame-ui 0.1`.

## 2. Quotas, threads, rate limits

The model [SS-API]:
- A **thread** is one concurrent request. You get threads in return for contributing data (proposals accepted by moderators) or money (Tipeee or Patreon). `contribution` in `ssuserInfos`: *"2 = 1 Thread Supplémentaire / 3 et + = 5 Threads Supplémentaires"*.
- **Quotas** (in place since mid-2019) limit requests per minute and per day, depending on user level and financial support. Client-side quota handling is **mandatory**: *"Cette gestion de « Quota » par logiciel est désormais obligatoire"*.
- **Your own limits come back from the API.** You don't hard-code them. `ssuserInfos.php`, and the `ssuser` block in every `jeuInfos` response, return:
  - `maxthreads`: concurrent threads allowed
  - `maxdownloadspeed`: KB/s
  - `requeststoday`, `requestskotoday`: requests used today, and how many of those were not-found
  - `maxrequestspermin`: per-minute cap. In the jeuInfos section of the docs it is spelled `maxrequestsperdmin`, a typo, so read both names.
  - `maxrequestsperday`, `maxrequestskoperday`: daily caps on all requests and on not-found results
- `ssinfraInfos.php` gives server-wide state: CPU %, `closefornomember`, `closeforleecher` (closed to members with no validated contributions), and `maxthreadformember` / `maxthreadfornonmember`.
- Live site counters on 2026-10-16: "threads open 164 / 4096", "guest threads open 25 / 256".

Concrete numbers (**UNVERIFIED**, the FAQ was unreachable):
- Skyscraper docs: "API request limit: 20k per day for registered users" [SKY].
- Skyscraper forces 1 thread for anonymous use ("This limit was set by request from ScreenScraper") and paces requests at 1.2 s ("set a bit above 1.0 as requested by the good folks at ScreenScraper. Don't change!") [SKY]. Treat **about 1 request/second per thread** as the community-observed rule.
- ES-DE logs `requeststoday/maxrequestsperday` from each response and reports what's left [ESDE].

**What this means for the Launcher:** call `ssuserInfos` once at startup. Size the worker pool to `maxthreads`, throttle to about 1 req/s per worker and stay under `maxrequestspermin`. Track `requeststoday` and `requestskotoday` from each response, and stop before the daily caps.

## 3. Errors and response shape

Errors come as HTTP status codes with a short **plain-text French body**, not JSON [SS-API]. Skyscraper matches on substrings of the body for this reason [SKY].

| HTTP | Meaning | Launcher action |
|---|---|---|
| 400 | malformed URL, missing required field, rom filename contains a path, badly formatted crc/md5/sha1 | bug: fix the request |
| 401 | *"API fermé pour les non membres ou les membres inactifs"* (server CPU > 60%) | back off and retry later; tell the user that an account helps |
| 403 | *"Erreur de login : Vérifier vos identifiants développeur !"* | bad devid/devpassword: stop |
| 404 | *"Erreur : Jeu non trouvée ! / Rom/Iso/Dossier non trouvée !"* | record "no match" (this counts toward `requestskotoday`) |
| 423 | *"API totalement fermé"* | stop the whole session |
| 426 | software blacklisted / outdated | stop |
| 429 | thread limit, threads-per-minute limit, or the leecher/global thread pool is full | slow down, retry with backoff |
| 430 | *"Votre quota de scrape est dépassé pour aujourd'hui !"* | stop until tomorrow |
| 431 | too many unrecognised ROMs today (*"Faite du tri dans vos fichiers roms et repassez demain !"*) | stop until tomorrow |

- **Bad user login**: Skyscraper detects it by the substring `Erreur de login` on `ssuserInfos` [SKY]. Which HTTP status comes with a bad `ssid`/`sspassword` is **UNVERIFIED**.
- **Success (JSON)**: a top-level `response` object containing `serveurs`, `ssuser` and `jeu` [SKY reads `response.ssuser.requeststoday` and `response.jeu`].
- **Media URLs in the `jeu.medias` array**: each entry has `type`, `region`, `url` and `format`. Real responses also carry `parent`, `crc`, `md5`, `sha1` and `size`; Skyscraper and ES-DE parse `type`, `region` and `format` [SKY] [ESDE]. The docs page still describes an older nested layout (`media_wheels.media_wheel_xx`, ...). Trust the client code over the docs here.
- **Quirks**:
  - Skyscraper patches malformed JSON before parsing: `data.replace("],\n\t\t}", "]\n\t\t}")` [SKY].
  - ES-DE drops results named `ZZZ(notgame)` because these are sometimes returned by mistake [ESDE].
  - Skyscraper notes that `gameid=` lookups may time out (issue #195) [SKY].

## 4. MAME / arcade system id

- **`systemeid=75` is "Mame".** Site media path `medias/75/wheels/...` with title " : Mame" [SS-API page]. ES-DE maps `{ARCADE, 75}` [ESDE].
- The arcade family is split into sub-platforms (Capcom, Sega, Namco, Taito, SNK, ... in the site menu). Skyscraper warns that exact filename matching "does not work well for arcade derived platforms... Each of those subplatforms have a high chance of containing the same file name entry... ScreenScraper cannot determine a unique game and will return an empty result" [SKY docs]. So **always send `systemeid=75`** to narrow the lookup.

## 5. Matching a Machine (`jeuInfos.php`)

Parameters [SS-API]:
- `crc`, `md5`, `sha1`: hash of the local rom file, iso, or folder
- `systemeid`
- `romtype`: `rom`, `iso` or `dossier`
- `romnom`: filename with extension, and no path
- `romtaille`: size in bytes
- `serialnum`
- `gameid`: force a lookup by ScreenScraper game id. No rom info is returned in this case.

Footnote [SS-API]: *"a moins d'une dérogation, vous devez envoyer au moins un (le mieux serait les 3) de ces calculs ... ET la taille"*. Officially, at least one hash plus the size is required unless you have an exemption.

What clients actually do for arcade:
- ES-DE, for arcade systems, sends `jeuInfos.php?...&romnom=<set name>&systemeid=75`. It adds `&md5=..&romtaille=..` only when file hashing is enabled [ESDE]. The comment explains: *"If the game is an arcade game ... search using the individual ROM name rather than running a wider text matching search."* So **set-name lookups without a hash work in practice.**
- Skyscraper by default sends `crc+md5+sha1` of the whole file, plus `romnom=<filename>` and `romtaille` [SKY].

**Recommendation:** match on the set name. Request `romnom=<setname>.zip&systemeid=75&romtype=rom`, and include `romtaille` (the zip size) plus the zip's crc/md5/sha1 when cheap.

Caveats (**inference, UNVERIFIED**):
- A whole-zip hash depends on how the zip was packed (non-merged vs split, compression, timestamps), so it will often fail to match ScreenScraper's stored `romcrc`. The set name is the stable key.
- Whether `romnom=pacman` (no extension) and `romnom=pacman.zip` behave the same for system 75 is untested. ES-DE's clean name drops the extension.
- The returned `jeu` has `romid`, `cloneof` and `rom.romcloneof`, which can be checked against MAME's parent/clone data.
- `rotation` and `resolution` are returned **only for arcade games** [SS-API].
- **Fallback**: `jeuRecherche.php?recherche=<description>&systemeid=75` gives up to 30 games ranked by probability, without rom info [SS-API]. Search strings shorter than 4 characters fail [ESDE comment].

## 6. Text metadata in `jeu`

From [SS-API], with the localization keys used by [ESDE] and [SKY]:

- **Identity**:
  - `id` (game id), `romid`
  - `noms[]`: per-region titles, keyed `region` (`ss` = internal name, `wor`, `us`, `eu`, `jp`, `fr`, ...)
  - `regionshortnames`, `cloneof`
  - `systeme{id,nom,parentid}`
- **Credits**: `editeur`, `developpeur` (with logo URLs)
- **Players**: `joueurs`. The format is a string such as "1-2"; the exact form is **UNVERIFIED**, and `nbJoueursListe.php` lists the values.
- **Rating**: `note`, out of 20. `topstaff` is 0 or 1.
- **Description**: `synopsis[]`, keyed by `langue` (`en`, `fr`, `de`, `es`, ...). ES-DE falls back user language, then `en`, then `wor` [ESDE].
- **Dates**: `dates[]`, keyed by `region`
- **Genres**: `genres[]` with ids, a `principale` flag, `parentid`, and names per language. ES-DE picks by `langue` [ESDE].
- **Also**: `modes`, `familles` (series), `numeros`, `themes`, `styles`, `classifications` (age ratings)
- **Arcade-specific**: `rotation`, `resolution`. Recalbox-oriented extras: `tips`, `actions` (controls text), `couleurs`, `sp2kcfg`.
- **Per-rom block `rom{}`**: `romregions`, `romlangues`, flags `beta`, `demo`, `hack`, `unl`, `alt`, `best`, and rom-specific overrides of players, dates and synopsis.
- **Reference lists** (cache once): `regionsListe`, `languesListe`, `genresListe`, `nbJoueursListe`, `mediasJeuListe`, `systemesListe`.

## 7. Media types

Media `type` ids, from the docs' media table and confirmed by client code [SS-API] [ESDE] [SKY]:

| Launcher need | SS `type` | Format | Region-specific? |
|---|---|---|---|
| In-game screenshot | `ss` | jpg/png | yes |
| Title screen | `sstitle` | jpg/png | yes |
| Marquee (cabinet header art) | `marquee` | png | — |
| Screen marquee (marquee art fitted to a screen) | `screenmarquee` | png | yes |
| Wheel / logo | `wheel`, `wheel-hd` (ES-DE treats them as the same and picks the closer region), `wheel-carbon`, `wheel-steel` | png | yes |
| Box (rare for arcade) | `box-2D`, `box-2D-back`, `box-2D-side`, `box-3D`, `box-texture` | png | yes |
| Flyer (arcade substitute for a cover; Skyscraper uses it as the "cover" for arcade platforms) | `flyer` (multi-page: `flyer` + page number) | jpg | yes |
| Video | `video`, `video-normalized` | mp4 | **no region** (ES-DE comment: *"Videos and fan art don't have any region attributes"*) |
| Manual | `manuel` | pdf | yes, e.g. `manuel(eu)` |
| Also available | `fanart`, `bezel-4-3`, `bezel-16-9` (+`-v` / `-cocktail`), `support-2D`, `support-texture`, `maps`, `figurine`, `steamgrid`, `overlay`, `themehs` | | |

- `video-normalized` is a re-encoded, size- and format-normalized copy of `video`. Skyscraper prefers it when `videoPreferNormalized` is set, and otherwise falls back to `video` [SKY]. **Inferred:** use it for the launcher's preview player.
- **Region selection is client-side.** Each media entry has a `region` (`wor`, `us`, `eu`, `jp`, `fr`, `ss`, `cus`, ...). ES-DE's fallback chain is `[user region, wor, us, eu, jp, cus, first-returned]` [ESDE]. Text uses `langue` instead.
- **Downloading.** The `url` in `medias[]` points at `mediaJeu.php` / `mediaVideoJeu.php` / `mediaManuelJeu.php` with credentials already embedded, so treat stored URLs as secrets. These endpoints accept:
  - `maxwidth`, `maxheight`, `outputformat=png|jpg`: server-side resize
  - `crc`, `md5`, `sha1` of your local copy. The reply is the text `CRCOK`, `MD5OK` or `SHA1OK` when unchanged, which makes cheap refresh checks possible.
  - The text `NOMEDIA` comes back when the media is missing [SS-API]. Your user's `maxdownloadspeed` caps bandwidth.

## 8. Local caching terms

- **Nothing in the API docs forbids local caching.** The docs explicitly support incremental refresh via the `CRCOK` mechanism [SS-API]. Every major client (ES-DE, Skyscraper, Batocera, Recalbox) is built around downloading media to disk once.
- **Licence.** The site licenses its content **CC BY-NC-SA 4.0**, with credits to upstream sources (Wikipedia, GameFAQs, MobyGames, EmuMovies, Progetto Snaps, arcade-museum flyers, ...) [SS-FOOTER]. A private, non-commercial local cache fits. Attribution is cheap: an "Data & media: ScreenScraper.fr (CC BY-NC-SA 4.0)" line in About/Settings.
- **Implied by the quota rules** [SS-API]: cache aggressively, never re-scrape what you have, and avoid repeated not-found lookups (`maxrequestskoperday`, HTTP 431). Store the "no match" result per set and MAME version, and don't retry it automatically.
- Any forum-specific rules on caching or redistributing are **UNVERIFIED** (the forum was unreachable).

## 9. Open items to verify after credentials arrive

1. Actual `maxthreads`, `maxrequestspermin` and `maxrequestsperday` for the principal's account (one `ssuserInfos` call).
2. `romnom=pacman.zip` vs `romnom=pacman` with `systemeid=75`; hit rate for clones.
3. Which HTTP status comes back for a bad user password.
4. The exact shape of a JSON `medias[]` entry (`parent`, `crc`, `size`, ...) and of `joueurs`.
