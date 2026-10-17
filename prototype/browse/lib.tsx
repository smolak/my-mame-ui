// PROTOTYPE — throwaway. Shared data, filtering and fake Media for the Browse variants.
import { useEffect, useMemo, useState } from "react";

export type Status = "missing" | "available" | "verified" | "damaged";
export type Machine = {
  set: string; desc: string; year: string; manuf: string; parent: string;
  driver: string; rotate: number; status: Status; genre: string; fav: boolean; recent: boolean;
};

export type Filters = {
  q: string;
  showAll: boolean; // settled: Available by default, show-all toggle
  statuses: Status[]; // empty = any (within scope)
  fav: boolean; recent: boolean;
  genre: string; decade: string; manuf: string; driver: string;
  sort: "desc" | "year" | "manuf";
};
export const defaultFilters: Filters = {
  q: "", showAll: false, statuses: [], fav: false, recent: false,
  genre: "", decade: "", manuf: "", driver: "", sort: "desc",
};

export type Library = {
  all: Machine[];
  bySet: Map<string, Machine>;
  clones: Map<string, Machine[]>;
  genres: string[]; decades: string[]; manufs: string[];
};

export function useLibrary(): Library | null {
  const [lib, setLib] = useState<Library | null>(null);
  useEffect(() => {
    fetch("/machines.json").then((r) => r.json()).then((rows: any[]) => {
      const all: Machine[] = rows.map((r) => ({
        set: r[0], desc: r[1], year: r[2], manuf: r[3], parent: r[4], driver: r[5],
        rotate: r[6], status: r[7], genre: r[8], fav: !!(r[9] & 1), recent: !!(r[9] & 2),
      }));
      const bySet = new Map(all.map((m) => [m.set, m]));
      const clones = new Map<string, Machine[]>();
      for (const m of all) if (m.parent && bySet.has(m.parent)) {
        if (!clones.has(m.parent)) clones.set(m.parent, []);
        clones.get(m.parent)!.push(m);
      }
      const count = (k: (m: Machine) => string) => {
        const c = new Map<string, number>();
        for (const m of all) c.set(k(m), (c.get(k(m)) ?? 0) + 1);
        return c;
      };
      const manufCount = count((m) => m.manuf.replace(/ \(.*\)$/, ""));
      setLib({
        all, bySet, clones,
        genres: [...new Set(all.map((m) => m.genre))].sort(),
        decades: [...new Set(all.map((m) => decadeOf(m.year)))].filter(Boolean).sort(),
        manufs: [...manufCount].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([k]) => k).sort(),
      });
    });
  }, []);
  return lib;
}

export const decadeOf = (y: string) => (/^\d{3}/.test(y) ? y.slice(0, 3) + "0s" : "");
export const isAvailable = (m: Machine) => m.status !== "missing";

export function matches(m: Machine, f: Filters): boolean {
  if (!f.showAll && !isAvailable(m)) return false;
  if (f.statuses.length && !f.statuses.includes(m.status)) return false;
  if (f.fav && !m.fav) return false;
  if (f.recent && !m.recent) return false;
  if (f.genre && m.genre !== f.genre) return false;
  if (f.decade && decadeOf(m.year) !== f.decade) return false;
  if (f.manuf && !m.manuf.startsWith(f.manuf)) return false;
  if (f.driver && m.driver !== f.driver) return false;
  if (f.q) {
    const q = f.q.toLowerCase();
    if (!m.desc.toLowerCase().includes(q) && !m.set.includes(q)) return false;
  }
  return true;
}

export const sorter = (f: Filters) => (a: Machine, b: Machine) =>
  f.sort === "year" ? a.year.localeCompare(b.year) || a.desc.localeCompare(b.desc)
  : f.sort === "manuf" ? a.manuf.localeCompare(b.manuf) || a.desc.localeCompare(b.desc)
  : a.desc.localeCompare(b.desc);

/** Flat list of every matching Machine. */
export function useFlat(lib: Library, f: Filters) {
  return useMemo(() => lib.all.filter((m) => matches(m, f)).sort(sorter(f)), [lib, f]);
}

/** One entry per Parent group that has any matching member; head = Parent if it matches, else first matching Clone. */
export type Group = { head: Machine; parent: Machine; members: Machine[] };
export function useGroups(lib: Library, f: Filters) {
  return useMemo(() => {
    const groups = new Map<string, Group>();
    for (const m of lib.all) {
      if (!matches(m, f)) continue;
      const key = m.parent && lib.bySet.has(m.parent) ? m.parent : m.set;
      const parent = lib.bySet.get(key)!;
      let g = groups.get(key);
      if (!g) groups.set(key, (g = { head: m, parent, members: [] }));
      g.members.push(m);
      if (m.set === key) g.head = m;
    }
    return [...groups.values()].sort((a, b) => sorter(f)(a.head, b.head));
  }, [lib, f]);
}

// ---------- Fake Media (stand-ins for ScreenScraper ss / sstitle / wheel / fanart) ----------
const hue = (s: string) => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
export function mediaUrl(m: Machine, kind: "ss" | "sstitle" | "wheel" | "fanart"): string {
  const h = hue(m.parent || m.set); // Clones inherit the Parent's Media
  const vert = m.rotate === 90 || m.rotate === 270;
  const [w, hgt] = kind === "wheel" ? [400, 120] : kind === "fanart" ? [1600, 900] : vert ? [300, 400] : [400, 300];
  const title = esc(m.desc.replace(/ \(.*$/, "").slice(0, 28));
  let body = "";
  if (kind === "wheel") body = `<text x="200" y="76" font-size="38" font-weight="900" font-style="italic" text-anchor="middle" fill="hsl(${h},90%,60%)" stroke="#000" stroke-width="2">${title}</text>`;
  else if (kind === "fanart") body = `<defs><radialGradient id="g" cx="30%" cy="40%"><stop offset="0" stop-color="hsl(${h},70%,35%)"/><stop offset="1" stop-color="hsl(${(h + 60) % 360},60%,8%)"/></radialGradient></defs><rect width="1600" height="900" fill="url(#g)"/>`;
  else {
    body = `<rect width="${w}" height="${hgt}" fill="hsl(${h},45%,${kind === "ss" ? 18 : 10}%)"/>`;
    for (let i = 0; i < 9; i++) body += `<rect x="${(h * (i + 3)) % (w - 40)}" y="${(h * (i + 7) * 3) % (hgt - 40)}" width="${16 + (i % 3) * 10}" height="${16 + (i % 2) * 12}" fill="hsl(${(h + i * 40) % 360},80%,60%)"/>`;
    body += `<text x="${w / 2}" y="${kind === "sstitle" ? hgt / 2 : hgt - 16}" font-family="monospace" font-size="${kind === "sstitle" ? 22 : 13}" text-anchor="middle" fill="#fff">${kind === "sstitle" ? title : "SCORE 001230  HI 050000"}</text>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" width="${w}" height="${hgt}">${body}</svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}

/** Fake "not scraped yet" for ~15% so placeholders are visible in every variant. */
export const hasMedia = (m: Machine) => hue(m.set) % 7 !== 0;

export const STATUS_LABEL: Record<Status, string> = { missing: "Missing", available: "Available", verified: "Verified", damaged: "Damaged" };

// ---------- Stub actions ----------
let toastSink: ((s: string) => void) | null = null;
export function Toast() {
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    toastSink = (s) => { setMsg(s); setTimeout(() => setMsg((cur) => (cur === s ? null : cur)), 2500); };
  }, []);
  return msg ? <div className="toast">{msg}</div> : null;
}
export const launch = (m: Machine) =>
  toastSink?.(m.status === "missing" ? `Can't launch ${m.set}: Missing` : `(stub) mame -skip_gameinfo ${m.set}`);

export function useFavToggle(lib: Library) {
  const [, bump] = useState(0);
  return (m: Machine) => { m.fav = !m.fav; bump((n) => n + 1); toastSink?.(`${m.fav ? "★ Favorited" : "Unfavorited"} ${m.desc}`); };
}

/** Preview video stand-in: after the selection dwells ~1s, the screenshot "plays". */
export function usePreview(set: string | undefined) {
  const [playing, setPlaying] = useState(false);
  useEffect(() => { setPlaying(false); const t = setTimeout(() => setPlaying(true), 1000); return () => clearTimeout(t); }, [set]);
  return playing;
}

export const typingInField = (e: KeyboardEvent) => {
  const t = e.target as HTMLElement;
  return t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA" || t.isContentEditable;
};
