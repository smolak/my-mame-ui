// PROTOTYPE — throwaway. Browse round 2: ONE shell with Finder-style switchable views (List / Details / Grid / Focus).
// Settled going in: Clones folded under Parents in every view; filters = sidebar controls that write typed tokens
// into the search box (the query text is the single source of truth). Open question shown via the proto bar: fanart.
import { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type Library, type Machine, type Status, STATUS_LABEL,
  useLibrary, mediaUrl, hasMedia, realSynopsis, launch, useFavToggle, usePreview, typingInField, Toast,
} from "./lib";

type View = "list" | "details" | "grid" | "focus";
const VIEWS: { key: View; label: string; icon: string }[] = [
  { key: "list", label: "List", icon: "☰" },
  { key: "details", label: "Details", icon: "▤" },
  { key: "grid", label: "Grid", icon: "▦" },
  { key: "focus", label: "Focus", icon: "◧" },
];
type Fanart = "off" | "focus" | "everywhere";
type Sort = "title" | "year" | "maker";

// ---------- Query tokens ----------
// is:fav is:recent is:verified|available|damaged|missing  show:all  genre:shoot  year:198  maker:capcom  driver:good
// Values match by prefix, case-insensitive; quote multi-word values: genre:"beat 'em up". Anything else = free text.
type Query = { text: string[]; flags: Set<string>; all: boolean; kv: Record<string, string> };
const TOKEN = /(\w+):"([^"]*)"|(\w+):(\S+)|(\S+)/g;
function parse(q: string): Query {
  const out: Query = { text: [], flags: new Set(), all: false, kv: {} };
  for (const t of q.matchAll(TOKEN)) {
    const k = (t[1] ?? t[3])?.toLowerCase(), v = (t[2] ?? t[4])?.toLowerCase();
    if (k === "is") out.flags.add(v!);
    else if (k === "show" && v === "all") out.all = true;
    else if (k && ["genre", "year", "maker", "driver"].includes(k)) out.kv[k] = v!;
    else out.text.push((t[5] ?? t[0]).toLowerCase());
  }
  if (out.flags.has("missing")) out.all = true;
  return out;
}
const quote = (v: string) => (/\s/.test(v) ? `"${v}"` : v);
/** Replace (or remove, when value is null) the token for `key`, keeping the rest of the query as typed. */
function setToken(q: string, key: string, value: string | null): string {
  const rest = [...q.matchAll(TOKEN)].map((t) => t[0]).filter((t) => !t.toLowerCase().startsWith(key + ":"));
  return [...rest, ...(value ? [`${key}:${quote(value)}`] : [])].join(" ") + (rest.length || value ? " " : "");
}
function toggleFlag(q: string, flag: string): string {
  const toks = [...q.matchAll(TOKEN)].map((t) => t[0]);
  const has = toks.some((t) => t.toLowerCase() === `is:${flag}`);
  const next = has ? toks.filter((t) => t.toLowerCase() !== `is:${flag}`) : [...toks, `is:${flag}`];
  return next.join(" ") + (next.length ? " " : "");
}
const STATUSES: Status[] = ["verified", "available", "damaged", "missing"];
function matcher(q: Query) {
  const st = STATUSES.filter((s) => q.flags.has(s));
  return (m: Machine) => {
    if (!q.all && m.status === "missing") return false;
    if (st.length && !st.includes(m.status)) return false;
    if (q.flags.has("fav") && !m.fav) return false;
    if (q.flags.has("recent") && !m.recent) return false;
    if (q.kv.genre && !m.genre.toLowerCase().startsWith(q.kv.genre)) return false;
    if (q.kv.year && !m.year.startsWith(q.kv.year)) return false;
    if (q.kv.maker && !m.manuf.toLowerCase().startsWith(q.kv.maker)) return false;
    if (q.kv.driver && !m.driver.startsWith(q.kv.driver)) return false;
    for (const w of q.text) if (!m.desc.toLowerCase().includes(w) && !m.set.includes(w)) return false;
    return true;
  };
}

// ---------- Grouping: one entry per Parent; Clones folded ----------
type Group = { key: string; parent: Machine; head: Machine; members: Machine[] };
type Row = { m: Machine; depth: 0 | 1; g: Group };
const groupKey = (lib: Library, m: Machine) => (m.parent && lib.bySet.has(m.parent) ? m.parent : m.set);
const cmp = (s: Sort) => (a: Machine, b: Machine) =>
  s === "year" ? a.year.localeCompare(b.year) || a.desc.localeCompare(b.desc)
  : s === "maker" ? a.manuf.localeCompare(b.manuf) || a.desc.localeCompare(b.desc)
  : a.desc.localeCompare(b.desc);
function useGroups(lib: Library, q: Query, sort: Sort) {
  return useMemo(() => {
    const ok = matcher(q), map = new Map<string, Group>();
    for (const m of lib.all) {
      if (!ok(m)) continue;
      const key = groupKey(lib, m);
      let g = map.get(key);
      if (!g) map.set(key, (g = { key, parent: lib.bySet.get(key)!, head: m, members: [] }));
      g.members.push(m);
      if (m.set === key) g.head = m;
    }
    return [...map.values()].sort((a, b) => cmp(sort)(a.head, b.head));
  }, [lib, q, sort]);
}

// ---------- Shell ----------
function Shell() {
  const lib = useLibrary();
  const params = new URLSearchParams(location.search);
  const [view, setView] = useState<View>((params.get("view") as View) || "list");
  const [fanart, setFanart] = useState<Fanart>((params.get("fanart") as Fanart) || "focus");
  const [pane, setPane] = useState(true);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Sort>("title");
  const [tile, setTile] = useState(180);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [selM, setSelM] = useState<Machine | null>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const p = new URLSearchParams({ view, fanart });
    history.replaceState(null, "", `?${p}`);
  }, [view, fanart]);

  if (!lib) return <div className="loading">Loading Library snapshot…</div>;
  return <Loaded {...{ lib, view, setView, fanart, setFanart, pane, setPane, q, setQ, sort, setSort, tile, setTile, expanded, setExpanded, selM, setSelM, search }} />;
}

function Loaded(p: any) {
  const { lib, view, setView, fanart, setFanart, pane, setPane, q, setQ, sort, setSort, tile, setTile, expanded, setExpanded, selM, setSelM, search } = p as {
    lib: Library; view: View; setView: (v: View) => void; fanart: Fanart; setFanart: (f: Fanart) => void; pane: boolean; setPane: (b: boolean) => void;
    q: string; setQ: (s: string) => void; sort: Sort; setSort: (s: Sort) => void; tile: number; setTile: (n: number) => void;
    expanded: Set<string>; setExpanded: (f: (s: Set<string>) => Set<string>) => void; selM: Machine | null; setSelM: (m: Machine | null) => void;
    search: React.RefObject<HTMLInputElement>;
  };
  const query = useMemo(() => parse(q), [q]);
  const groups = useGroups(lib, query, sort);
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const g of groups) {
      out.push({ m: g.head, depth: 0, g });
      if (expanded.has(g.key)) for (const m of g.members) if (m !== g.head) out.push({ m, depth: 1, g });
    }
    return out;
  }, [groups, expanded]);
  const isGrid = view === "grid";
  const count = isGrid ? groups.length : rows.length;

  // Selection is a Machine, kept across view switches and filter edits when still visible.
  const idx = useMemo(() => {
    if (!selM) return 0;
    if (isGrid) { const i = groups.findIndex((g) => g.key === groupKey(lib, selM)); return i < 0 ? 0 : i; }
    let i = rows.findIndex((r) => r.m === selM);
    if (i < 0) i = rows.findIndex((r) => r.g.key === groupKey(lib, selM));
    return i < 0 ? 0 : i;
  }, [selM, rows, groups, isGrid]);
  const curGroup = isGrid ? groups[idx] : rows[idx]?.g;
  const visible = selM && curGroup?.members.includes(selM);
  const cur: Machine | undefined = visible ? selM! : isGrid ? curGroup?.head : rows[idx]?.m;
  const pick = (i: number) => {
    const j = Math.max(0, Math.min(i, count - 1));
    setSelM(isGrid ? groups[j]?.head ?? null : rows[j]?.m ?? null);
  };
  const toggleFav = useFavToggle(lib);
  const [cols, setCols] = useState(1);
  const expand = (key: string, on?: boolean) => setExpanded((s) => { const n = new Set(s); (on ?? !n.has(key)) ? n.add(key) : n.delete(key); return n; });

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && /^[1-4]$/.test(e.key)) { e.preventDefault(); setView(VIEWS[+e.key - 1].key); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === "i") { e.preventDefault(); setPane(!pane); return; }
      if (e.key === "/" && !typingInField(e) || (e.metaKey && e.key === "f")) { e.preventDefault(); search.current?.focus(); return; }
      if (e.key === "Escape") { if (document.activeElement === search.current && q) setQ(""); else (document.activeElement as HTMLElement)?.blur(); return; }
      if (typingInField(e)) { if (e.key === "ArrowDown" || e.key === "Enter") { (document.activeElement as HTMLElement).blur(); e.preventDefault(); } return; }
      const step = isGrid ? cols : 1, page = isGrid ? cols * 3 : 15, row = rows[idx];
      const k = e.key;
      if (k === "ArrowDown") { e.preventDefault(); pick(idx + step); }
      else if (k === "ArrowUp") { e.preventDefault(); pick(idx - step); }
      else if (k === "PageDown") { e.preventDefault(); pick(idx + page); }
      else if (k === "PageUp") { e.preventDefault(); pick(idx - page); }
      else if (isGrid && k === "ArrowRight") { e.preventDefault(); pick(idx + 1); }
      else if (isGrid && k === "ArrowLeft") { e.preventDefault(); pick(idx - 1); }
      else if (!isGrid && k === "ArrowRight" && row && row.depth === 0 && row.g.members.length > 1) expand(row.g.key, true);
      else if (!isGrid && k === "ArrowLeft" && row) { if (row.depth === 1) setSelM(row.g.head); else expand(row.g.key, false); }
      else if (k === "Enter" && cur) launch(cur);
      else if (k.toLowerCase() === "f" && !e.metaKey && cur) toggleFav(cur);
      else if (k.toLowerCase() === "v" && cur && curGroup && curGroup.members.length > 1) {
        const fam = family(lib, curGroup);
        setSelM(fam[(fam.indexOf(cur) + 1) % fam.length]);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [idx, rows, groups, cols, isGrid, cur, q, pane]);

  const fanartWanted = fanart === "everywhere" || (fanart === "focus" && view === "focus");
  const fanartOn = fanartWanted && cur && hasMedia(cur);
  const showPane = pane && view !== "focus";
  const viewProps = { lib, rows, groups, idx, cur, pick, setSelM, expand, expanded, toggleFav, sort, setSort };

  return (
    <div className={`s ${showPane ? "with-pane" : ""} ${view === "focus" ? "focus" : ""}`}>
      {fanartOn && <Backdrop m={cur!} strong={view === "focus"} />}
      {fanartWanted && cur && !hasMedia(cur) && <div className="fanart-note">no fanart: {cur.set} not scraped yet</div>}
      {!fanartWanted && fanart === "focus" && <div className="fanart-note">fanart shows in Focus view (⌘4), or set “everywhere” below</div>}
      <header className="s-bar">
        <div className="s-search">
          <input ref={search} className="search" placeholder="Search or filter  ( / )   e.g. street is:fav year:199 maker:capcom" value={q} onChange={(e) => setQ(e.target.value)} />
          <TokenEcho query={query} />
        </div>
        <span className="s-count">{groups.length.toLocaleString()} machines{!query.all && " · Available"}</span>
        <span className="spacer" />
        {view === "grid" && <input type="range" min={120} max={300} value={tile} onChange={(e) => setTile(+e.target.value)} title="Tile size" />}
        <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}><option value="title">Title</option><option value="year">Year</option><option value="maker">Maker</option></select>
        <div className="seg">
          {VIEWS.map((v, i) => <button key={v.key} className={view === v.key ? "on" : ""} onClick={() => setView(v.key)} title={`${v.label} (⌘${i + 1})`}>{v.icon} {v.label}</button>)}
        </div>
        <button className={pane ? "on" : ""} disabled={view === "focus"} onClick={() => setPane(!pane)} title="Detail pane (⌘I)">ⓘ</button>
      </header>
      {view !== "focus" && <Sidebar lib={lib} q={q} setQ={setQ} query={query} />}
      <main className="s-main">
        {view === "list" && <ListView {...viewProps} />}
        {view === "details" && <DetailsView {...viewProps} />}
        {view === "grid" && <GridView {...viewProps} tile={tile} setCols={setCols} />}
        {view === "focus" && <FocusView {...viewProps} />}
      </main>
      {showPane && cur && curGroup && <Pane lib={lib} m={cur} g={curGroup} toggleFav={toggleFav} setSelM={setSelM} fanart={fanart === "everywhere"} />}
      <Toast />
      <div className="proto-bar">
        <b>Round 2</b>
        <span>view: <b>{view}</b> (⌘1–4)</span>
        <span>fanart:</span>
        {(["off", "focus", "everywhere"] as Fanart[]).map((f) => <button key={f} className={`txt ${fanart === f ? "on" : ""}`} onClick={() => setFanart(f)}>{f === "focus" ? "Focus only" : f}</button>)}
        <span className="proto-state">query → {describe(query)} · selected: {cur?.set ?? "—"} · <a href="/round1?variant=A">round 1</a></span>
      </div>
    </div>
  );
}

const describe = (q: Query) =>
  [...(q.all ? ["show:all"] : ["Available only"]), ...[...q.flags].map((f) => `is:${f}`), ...Object.entries(q.kv).map(([k, v]) => `${k}^${v}`), ...(q.text.length ? [`text “${q.text.join(" ")}”`] : [])].join(" · ");

function TokenEcho({ query }: { query: Query }) {
  const chips = [...[...query.flags].map((f) => `is:${f}`), ...(query.all ? ["show:all"] : []), ...Object.entries(query.kv).map(([k, v]) => `${k}:${v}`)];
  return chips.length ? <div className="s-tokens">{chips.map((c) => <span key={c} className="tok">{c}</span>)}</div> : null;
}

const family = (lib: Library, g: Group) => [g.parent, ...(lib.clones.get(g.key) ?? [])];

// ---------- Sidebar: controls that write tokens ----------
function Sidebar({ lib, q, setQ, query }: { lib: Library; q: string; setQ: (s: string) => void; query: Query }) {
  const src = query.flags.has("fav") ? "fav" : query.flags.has("recent") ? "recent" : "all";
  const setSrc = (s: string) => {
    let n = q;
    if (query.flags.has("fav") !== (s === "fav")) n = toggleFlag(n, "fav");
    if (query.flags.has("recent") !== (s === "recent")) n = toggleFlag(n, "recent");
    setQ(n);
  };
  const sel = (key: string, opts: string[], label: string, fmt = (x: string) => x) => (
    <>
      <h4>{label}</h4>
      <select value={opts.find((o) => query.kv[key] && fmt(o).toLowerCase() === query.kv[key]) ?? (query.kv[key] ? "__typed" : "")}
        onChange={(e) => setQ(setToken(q, key, e.target.value ? fmt(e.target.value).toLowerCase() : null))}>
        <option value="">Any</option>
        {query.kv[key] && !opts.some((o) => fmt(o).toLowerCase() === query.kv[key]) && <option value="__typed">“{query.kv[key]}…” (typed)</option>}
        {opts.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </>
  );
  return (
    <aside className="s-side">
      <h4>Library</h4>
      {[["all", "All"], ["fav", "★ Favorites"], ["recent", "◷ Recents"]].map(([k, l]) => (
        <div key={k} className={`src ${src === k ? "on" : ""}`} onClick={() => setSrc(k)}>{l}</div>
      ))}
      <h4>Status</h4>
      {(["verified", "available", "damaged"] as Status[]).map((s) => (
        <label key={s}><input type="checkbox" checked={query.flags.has(s)} onChange={() => setQ(toggleFlag(q, s))} /><span className={`dot ${s}`} />{STATUS_LABEL[s]}</label>
      ))}
      <label className="muted"><input type="checkbox" checked={query.all} onChange={() => setQ(query.all ? setToken(q, "show", null).replace(/\bis:missing\s?/i, "") : setToken(q, "show", "all"))} />Show Missing too</label>
      {sel("genre", lib.genres, "Genre")}
      {sel("year", lib.decades, "Decade", (d) => d.slice(0, 3))}
      {sel("maker", lib.manufs, "Manufacturer")}
      {sel("driver", ["good", "imperfect", "preliminary"], "Driver")}
      <p className="hint">Controls write tokens into the search box; typing tokens moves the controls. Values are prefix matches.</p>
      <p className="hint">↑↓ move · → / ← clones · V next version · Enter launch · F favorite · ⌘I pane · ⌘1–4 views</p>
    </aside>
  );
}

// ---------- Views ----------
type VP = {
  lib: Library; rows: Row[]; groups: Group[]; idx: number; cur?: Machine; pick: (i: number) => void; setSelM: (m: Machine) => void;
  expand: (k: string, on?: boolean) => void; expanded: Set<string>; toggleFav: (m: Machine) => void; sort: Sort; setSort: (s: Sort) => void;
};

function useList(count: number, size: number, idx: number, align: "auto" | "center" = "auto") {
  const ref = useRef<HTMLDivElement>(null);
  const v = useVirtualizer({ count, getScrollElement: () => ref.current, estimateSize: () => size, overscan: 15 });
  useEffect(() => { if (count) v.scrollToIndex(idx, { align }); }, [idx, count]);
  return { ref, v };
}

function Twisty({ r, p }: { r: Row; p: VP }) {
  const n = r.g.members.length - 1;
  if (r.depth === 1 || n === 0) return <span className="twisty" />;
  return <span className="twisty" onClick={(e) => { e.stopPropagation(); p.expand(r.g.key); }}>{p.expanded.has(r.g.key) ? "▾" : "▸"}</span>;
}

function ListView(p: VP) {
  const { ref, v } = useList(p.rows.length, 24, p.idx);
  const th = (s: Sort, l: string, c: string) => <span className={c} onClick={() => p.setSort(s)}>{l}{p.sort === s && " ▾"}</span>;
  return (
    <div className="lv">
      <div className="lv-head"><span />{th("title", "Title", "")}{th("year", "Year", "")}{th("maker", "Manufacturer", "")}<span>Status</span><span>Set</span></div>
      <div ref={ref} className="scroll">
        <div style={{ height: v.getTotalSize(), position: "relative" }}>
          {v.getVirtualItems().map((it) => {
            const r = p.rows[it.index], m = r.m;
            return (
              <div key={it.key} className={`lv-row ${it.index === p.idx ? "sel" : ""} ${r.depth ? "clone" : ""} st-${m.status}`} style={{ transform: `translateY(${it.start}px)` }}
                onClick={() => p.setSelM(m)} onDoubleClick={() => launch(m)}>
                <span className="star" onClick={(e) => { e.stopPropagation(); p.toggleFav(m); }}>{m.fav ? "★" : "☆"}</span>
                <span className="t"><Twisty r={r} p={p} />{m.desc}{r.depth === 0 && r.g.members.length > 1 && <span className="badge">+{r.g.members.length - 1}</span>}{m.driver !== "good" && <span className={`badge drv-${m.driver}`}>{m.driver}</span>}</span>
                <span className="mut">{m.year}</span>
                <span className="mut">{m.manuf}</span>
                <span><span className={`dot ${m.status}`} />{STATUS_LABEL[m.status]}</span>
                <span className="set">{m.set}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DetailsView(p: VP) {
  const { ref, v } = useList(p.rows.length, 68, p.idx);
  return (
    <div ref={ref} className="scroll dv">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((it) => {
          const r = p.rows[it.index], m = r.m, media = hasMedia(m);
          return (
            <div key={it.key} className={`dv-row ${it.index === p.idx ? "sel" : ""} ${r.depth ? "clone" : ""} st-${m.status}`} style={{ transform: `translateY(${it.start}px)` }}
              onClick={() => p.setSelM(m)} onDoubleClick={() => launch(m)}>
              <Twisty r={r} p={p} />
              <div className={`dv-thumb ${m.rotate % 180 ? "vert" : ""}`}>{media ? <img src={mediaUrl(m, "ss")} loading="lazy" /> : <div className="ph">—</div>}</div>
              <div className="dv-text">
                <div className="dv-title">{m.desc}{m.fav && <span className="star"> ★</span>}</div>
                <div className="mut">{m.year} · {m.manuf} · {m.genre}</div>
                <div className="dv-tags">
                  <span><span className={`dot ${m.status}`} />{STATUS_LABEL[m.status]}</span>
                  {m.driver !== "good" && <span className={`badge drv-${m.driver}`}>{m.driver}</span>}
                  {r.depth === 0 && r.g.members.length > 1 && <span className="badge">{r.g.members.length - 1} clones</span>}
                  {m.recent && <span className="mut">◷ 2 h 14 min · 3 days ago</span>}
                  <span className="set">{m.set}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GridView(p: VP & { tile: number; setCols: (n: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(5);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => { const c = Math.max(1, Math.floor(e.contentRect.width / (p.tile + 12))); setCols(c); p.setCols(c); });
    ro.observe(ref.current!);
    return () => ro.disconnect();
  }, [p.tile]);
  const h = Math.round(p.tile * 0.75) + 52;
  const v = useVirtualizer({ count: Math.ceil(p.groups.length / cols), getScrollElement: () => ref.current, estimateSize: () => h, overscan: 3 });
  useEffect(() => { v.measure(); }, [h]);
  useEffect(() => { v.scrollToIndex(Math.floor(p.idx / cols), { align: "auto" }); }, [p.idx, cols]);
  return (
    <div ref={ref} className="scroll gv">
      <div style={{ height: v.getTotalSize(), position: "relative" }}>
        {v.getVirtualItems().map((row) => (
          <div key={row.key} className="gv-row" style={{ transform: `translateY(${row.start}px)`, height: h }}>
            {p.groups.slice(row.index * cols, row.index * cols + cols).map((g, i) => {
              const k = row.index * cols + i, t = k === p.idx && p.cur ? p.cur : g.head;
              return (
                <div key={g.key} className={`tile ${k === p.idx ? "sel" : ""} st-${t.status}`} style={{ width: p.tile }} onClick={() => p.setSelM(g.head)} onDoubleClick={() => launch(t)}>
                  <div className="tile-img" style={{ height: Math.round(p.tile * 0.75) }}>
                    {hasMedia(t) ? <img src={mediaUrl(t, "ss")} loading="lazy" /> : <div className="ph">{t.desc.replace(/ \(.*$/, "")}</div>}
                    {t.fav && <span className="tile-fav">★</span>}
                    {g.members.length > 1 && <span className="tile-count">{g.members.length} versions</span>}
                    <span className={`tile-dot dot ${t.status}`} />
                  </div>
                  <div className="tile-title">{t.desc.replace(/ \(.*$/, "")}</div>
                  <div className="tile-sub">{t.year} · {t.manuf.replace(/ \(.*$/, "")}</div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function FocusView(p: VP) {
  const { ref, v } = useList(p.rows.length, 30, p.idx, "center");
  const m = p.cur, media = m && hasMedia(m);
  const playing = usePreview(m?.set);
  return (
    <div className="fv">
      <div ref={ref} className="scroll fv-list">
        <div style={{ height: v.getTotalSize(), position: "relative" }}>
          {v.getVirtualItems().map((it) => {
            const r = p.rows[it.index], x = r.m;
            return (
              <div key={it.key} className={`fv-row ${it.index === p.idx ? "sel" : ""} ${r.depth ? "clone" : ""} st-${x.status}`} style={{ transform: `translateY(${it.start}px)` }}
                onClick={() => p.setSelM(x)} onDoubleClick={() => launch(x)}>
                <Twisty r={r} p={p} /><span className={`dot ${x.status}`} />
                <span className="t">{r.depth ? x.desc.replace(/^[^(]*/, "") || x.desc : x.desc}</span>
                {x.fav && <span className="star">★</span>}
                {r.depth === 0 && r.g.members.length > 1 && <span className="badge">+{r.g.members.length - 1}</span>}
                <span className="mut">{x.year}</span>
              </div>
            );
          })}
        </div>
      </div>
      {m && (
        <div className="fv-stage">
          {media ? <img className="fv-wheel" src={mediaUrl(m, "wheel")} /> : <h1>{m.desc}</h1>}
          <div className={`fv-shot ${m.rotate % 180 ? "vert" : ""}`}>
            {media ? <img src={mediaUrl(m, playing ? "ss" : "sstitle")} /> : <div className="ph">No Media yet</div>}
            {media && playing && <div className="playing">▶ Preview video</div>}
          </div>
          <div className="fv-facts">
            <span className="big">{m.desc}</span>
            <span>{m.year} · {m.manuf} · {m.genre}</span>
            <span><span className={`dot ${m.status}`} />{STATUS_LABEL[m.status]} · driver {m.driver} · <code>{m.set}</code></span>
            {m.recent && <span>◷ 2 h 14 min · 3 days ago</span>}
          </div>
          <div className="actions">
            <button className="primary" disabled={m.status === "missing"} onClick={() => launch(m)}>▶ Launch</button>
            <button onClick={() => p.toggleFav(m)}>{m.fav ? "★ Favorite" : "☆ Favorite"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------- Detail pane (List / Details / Grid) ----------
function Pane({ lib, m, g, toggleFav, setSelM, fanart }: { lib: Library; m: Machine; g: Group; toggleFav: (m: Machine) => void; setSelM: (m: Machine) => void; fanart: boolean }) {
  const [tab, setTab] = useState<"ss" | "sstitle">("ss");
  const playing = usePreview(m.set);
  const media = hasMedia(m);
  const fam = family(lib, g);
  return (
    <aside className="s-pane">
      {fanart && media && <div className="pane-fanart" style={{ backgroundImage: `url("${mediaUrl(m, "fanart")}")` }}><span>fanart</span></div>}
      <div className={`shot ${m.rotate % 180 ? "vert" : ""}`}>
        {media ? <img src={mediaUrl(m, tab)} /> : <div className="ph">No Media yet<br /><small>queued for scrape</small></div>}
        {media && playing && tab === "ss" && <div className="playing">▶ Preview video</div>}
      </div>
      <div className="tabs"><button className={tab === "ss" ? "on" : ""} onClick={() => setTab("ss")}>Screenshot</button><button className={tab === "sstitle" ? "on" : ""} onClick={() => setTab("sstitle")}>Title</button></div>
      {media && <img className="wheel" src={mediaUrl(m, "wheel")} />}
      <h2>{m.desc}</h2>
      <div className="actions">
        <button className="primary" disabled={m.status === "missing"} onClick={() => launch(m)}>▶ Launch</button>
        <button onClick={() => toggleFav(m)}>{m.fav ? "★ Favorite" : "☆ Favorite"}</button>
      </div>
      <dl>
        <dt>Year / Maker</dt><dd>{m.year} · {m.manuf}</dd>
        <dt>Genre</dt><dd>{m.genre}</dd>
        <dt>Status</dt><dd><span className={`dot ${m.status}`} />{STATUS_LABEL[m.status]}{m.status === "damaged" && " (may still run)"}</dd>
        <dt>Driver</dt><dd>{m.driver}</dd>
        <dt>Set</dt><dd><code>{m.set}</code>{m.parent && <> · clone of <code>{m.parent}</code></>}</dd>
        {m.recent && <><dt>Play time</dt><dd>2 h 14 min · last played 3 days ago</dd></>}
      </dl>
      <p className="synopsis">{realSynopsis(m) ?? (media ? "Synopsis from ScreenScraper would sit here: a paragraph or two about the game, its story and how it plays." : "")}</p>
      {fam.length > 1 && (
        <>
          <h4>Versions ({fam.length}) · V cycles</h4>
          <ul className="family">
            {fam.map((c) => (
              <li key={c.set} className={`${c === m ? "on" : ""} st-${c.status}`} onClick={() => setSelM(c)}>
                <span className={`dot ${c.status}`} />{c.desc.replace(/^[^(]*/, "") || "(parent)"} <code>{c.set}</code>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}

/** Fanart: fetched lazily for the selected Machine, so it fades in after a beat. */
function Backdrop({ m, strong }: { m: Machine; strong: boolean }) {
  const [shown, setShown] = useState<string | null>(null);
  useEffect(() => { setShown(null); const t = setTimeout(() => setShown(m.set), 350); return () => clearTimeout(t); }, [m.set]);
  return <div className={`backdrop ${strong ? "strong" : ""} ${shown ? "in" : ""}`} style={{ backgroundImage: `url("${mediaUrl(m, "fanart")}")` }} />;
}

createRoot(document.getElementById("root")!).render(<Shell />);
