// PROTOTYPE — throwaway. Builds machines.json from the installed MAME's -listxml.
// Statuses, genres, favourites and recents are FAKE (hash-derived) — only the
// catalog columns (set, description, year, manufacturer, parent, driver, rotate) are real.
const proc = Bun.spawn(["mame", "-listxml"], { stdout: "pipe" });

const GENRES = ["Shooter", "Platform", "Fighting", "Sports", "Puzzle", "Racing", "Maze", "Beat'em up", "Casino", "Quiz", "Mahjong", "Pinball"];
const hash = (s: string) => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const unesc = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");

type Row = [string, string, string, string, string, string, number, string, string, number]; // set, desc, year, manuf, parent, driver, rotate, status, genre, flags(1=fav,2=recent)
const rows: Row[] = [];
let cur: any = null;
let buf = "";
const dec = new TextDecoder();
for await (const chunk of proc.stdout) {
  buf += dec.decode(chunk, { stream: true });
  const lines = buf.split("\n");
  buf = lines.pop()!;
  for (const l of lines) {
    let m;
    if ((m = l.match(/^\t<machine name="([^"]+)"(.*)>/))) {
      const attrs = m[2];
      const skip = /isbios="yes"|isdevice="yes"|runnable="no"|ismechanical="yes"/.test(attrs);
      cur = skip ? null : { set: m[1], parent: attrs.match(/cloneof="([^"]+)"/)?.[1] ?? "", desc: "", year: "", manuf: "", driver: "", rotate: 0, hasSoft: false };
    } else if (!cur) continue;
    else if ((m = l.match(/<description>(.*)<\/description>/))) cur.desc = unesc(m[1]);
    else if ((m = l.match(/<year>(.*)<\/year>/))) cur.year = m[1];
    else if ((m = l.match(/<manufacturer>(.*)<\/manufacturer>/))) cur.manuf = unesc(m[1]);
    else if ((m = l.match(/<display .*rotate="(\d+)"/)) && !cur.rotate) cur.rotate = +m[1];
    else if ((m = l.match(/<driver status="(\w+)"/))) cur.driver = m[1];
    else if (l.includes("<softwarelist")) cur.hasSoft = true;
    else if (l.startsWith("\t</machine>")) {
      if (!cur.hasSoft) {
        const h = hash(cur.set);
        const r = h % 100;
        const status = r < 45 ? "missing" : r < 62 ? "available" : r < 95 ? "verified" : "damaged";
        const flags = status !== "missing" && h % 97 === 0 ? 1 : 0 | (status !== "missing" && h % 211 === 0 ? 2 : 0);
        rows.push([cur.set, cur.desc, cur.year, cur.manuf, cur.parent, cur.driver, cur.rotate, status, GENRES[(h >> 8) % GENRES.length], flags]);
      }
      cur = null;
    }
  }
}
for (const fav of ["pacman", "dkong", "sf2", "mslug", "galaga", "1942", "outrun", "ddragon", "bublbobl", "tmnt"]) {
  const r = rows.find((r) => r[0] === fav);
  if (r) { r[7] = "verified"; r[9] |= 1; }
}
for (const rec of ["sf2", "mslug", "dkong", "outrun"]) { const r = rows.find((r) => r[0] === rec); if (r) r[9] |= 2; }
await Bun.write(new URL("./machines.json", import.meta.url), JSON.stringify(rows));
console.log(`machines.json: ${rows.length} machines`);
