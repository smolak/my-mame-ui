// PROTOTYPE — Variant B "Shelf": top filter bar · virtual grid of screenshot tiles (one per Parent group) ·
// bottom drawer with fanart backdrop and a version picker for Clones.
import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type Filters, type Library, type Machine, type Status, STATUS_LABEL,
  useGroups, mediaUrl, hasMedia, launch, useFavToggle, usePreview, typingInField,
} from "./lib";

export const name = "Shelf";
const TILE_W = 196, TILE_H = 196;

export function VariantB({ lib, f, setF, onSel }: { lib: Library; f: Filters; setF: (f: Filters) => void; onSel: (m?: Machine) => void }) {
  const groups = useGroups(lib, f);
  const [sel, setSel] = useState(0);
  const [version, setVersion] = useState<Machine | null>(null); // chosen Clone inside the selected group
  const [fanart, setFanart] = useState(true);
  const g = groups[Math.min(sel, groups.length - 1)];
  const m = version && g?.members.includes(version) ? version : g?.parent && (g.parent.status !== "missing" || f.showAll) ? g.parent : g?.head;
  useEffect(() => onSel(m), [m]);
  useEffect(() => setVersion(null), [sel]);
  useEffect(() => setSel(0), [f]);
  const toggleFav = useFavToggle(lib);

  const parentRef = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const [cols, setCols] = useState(6);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setCols(Math.max(1, Math.floor(e.contentRect.width / TILE_W))));
    ro.observe(parentRef.current!);
    return () => ro.disconnect();
  }, []);
  const rowCount = Math.ceil(groups.length / cols);
  const v = useVirtualizer({ count: rowCount, getScrollElement: () => parentRef.current, estimateSize: () => TILE_H, overscan: 3 });
  useEffect(() => { v.scrollToIndex(Math.floor(sel / cols), { align: "auto" }); }, [sel, cols]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "/" || (e.metaKey && e.key === "f")) { e.preventDefault(); search.current?.focus(); return; }
      if (e.key === "Escape") { (document.activeElement as HTMLElement)?.blur(); if (f.q) setF({ ...f, q: "" }); return; }
      if (typingInField(e) && !["ArrowDown", "Enter"].includes(e.key)) return;
      if (typingInField(e) && e.key === "ArrowDown") { (document.activeElement as HTMLElement).blur(); e.preventDefault(); return; }
      const n = groups.length - 1;
      if (e.key === "ArrowRight") { e.preventDefault(); setSel((s) => Math.min(s + 1, n)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + cols, n)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - cols, 0)); }
      else if (e.key === "Enter" && m) { (document.activeElement as HTMLElement)?.blur(); launch(m); }
      else if (e.key.toLowerCase() === "f" && !e.metaKey && m) toggleFav(m);
      else if (e.key.toLowerCase() === "v" && g && g.members.length > 1) {
        const fam = [g.parent, ...(lib.clones.get(g.parent.set) ?? [])];
        setVersion(fam[(fam.indexOf(m!) + 1) % fam.length]);
      }
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [groups, sel, cols, m, f]);

  const chip = (on: boolean, label: string, click: () => void) => <button className={`chip ${on ? "on" : ""}`} onClick={click}>{label}</button>;
  const toggleStatus = (s: Status) => setF({ ...f, statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s] });

  return (
    <div className="vb">
      <header className="vb-bar">
        <input ref={search} className="search" placeholder="Search  ( / )" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        {chip(f.fav, "★ Favorites", () => setF({ ...f, fav: !f.fav }))}
        {chip(f.recent, "Recents", () => setF({ ...f, recent: !f.recent }))}
        {chip(f.statuses.includes("verified"), "Verified", () => toggleStatus("verified"))}
        <select value={f.genre} onChange={(e) => setF({ ...f, genre: e.target.value })}><option value="">Genre</option>{lib.genres.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={f.decade} onChange={(e) => setF({ ...f, decade: e.target.value })}><option value="">Decade</option>{lib.decades.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={f.manuf} onChange={(e) => setF({ ...f, manuf: e.target.value })}><option value="">Maker</option>{lib.manufs.map((x) => <option key={x}>{x}</option>)}</select>
        <select value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })}><option value="">Driver</option><option>good</option><option>imperfect</option><option>preliminary</option></select>
        <select value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value as Filters["sort"] })}><option value="desc">A–Z</option><option value="year">Year</option><option value="manuf">Maker</option></select>
        <span className="spacer" />
        <label className="muted"><input type="checkbox" checked={f.showAll} onChange={(e) => setF({ ...f, showAll: e.target.checked, statuses: [] })} /> Show Missing</label>
      </header>

      <div ref={parentRef} className="vb-grid">
        <div style={{ height: v.getTotalSize(), position: "relative" }}>
          {v.getVirtualItems().map((row) => (
            <div key={row.key} className="vb-row" style={{ transform: `translateY(${row.start}px)` }}>
              {groups.slice(row.index * cols, row.index * cols + cols).map((gr, i) => {
                const idx = row.index * cols + i;
                const t = gr.head;
                return (
                  <div key={gr.parent.set} className={`tile ${idx === sel ? "sel" : ""} st-${t.status}`} onClick={() => setSel(idx)} onDoubleClick={() => launch(t)}>
                    <div className="tile-img">
                      {hasMedia(t) ? <img src={mediaUrl(t, "ss")} loading="lazy" /> : <div className="ph">{t.desc.replace(/ \(.*$/, "")}</div>}
                      {t.fav && <span className="tile-fav">★</span>}
                      {gr.members.length > 1 && <span className="tile-count">{gr.members.length}</span>}
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

      {m && g && <Drawer lib={lib} m={m} g={g} fanart={fanart} setFanart={setFanart} setVersion={setVersion} toggleFav={toggleFav} />}
    </div>
  );
}

function Drawer({ lib, m, g, fanart, setFanart, setVersion, toggleFav }: any) {
  const playing = usePreview(m.set);
  const media = hasMedia(m);
  const fam: Machine[] = [g.parent, ...(lib.clones.get(g.parent.set) ?? [])];
  return (
    <section className="vb-drawer" style={fanart && media ? { backgroundImage: `linear-gradient(90deg, rgba(10,10,14,.95) 30%, rgba(10,10,14,.55)), url("${mediaUrl(m, "fanart")}")` } : undefined}>
      <div className={`vb-shot ${m.rotate % 180 ? "vert" : ""}`}>
        {media ? <img src={mediaUrl(m, "ss")} /> : <div className="ph">No Media yet</div>}
        {media && playing && <div className="playing">▶ Preview video</div>}
      </div>
      <div className="vb-info">
        {media ? <img className="wheel" src={mediaUrl(m, "wheel")} /> : <h2>{m.desc}</h2>}
        <div className="meta">{m.year} · {m.manuf} · {m.genre} · <span className={`dot ${m.status}`} />{STATUS_LABEL[m.status as Status]} · driver {m.driver}{m.recent && " · 2 h 14 min played"}</div>
        <p className="synopsis">{media ? "Synopsis from ScreenScraper would sit here: a paragraph or two about the game, its story and how it plays." : "Not scraped yet."}</p>
        <div className="actions">
          <button className="primary" disabled={m.status === "missing"} onClick={() => launch(m)}>▶ Launch</button>
          <button onClick={() => toggleFav(m)}>{m.fav ? "★" : "☆"}</button>
          {fam.length > 1 && (
            <select value={m.set} onChange={(e) => setVersion(lib.bySet.get(e.target.value))} title="Version (V)">
              {fam.map((c) => <option key={c.set} value={c.set}>{c.status === "missing" ? "✕ " : ""}{c.desc} — {c.set}</option>)}
            </select>
          )}
          <label className="muted"><input type="checkbox" checked={fanart} onChange={(e) => setFanart(e.target.checked)} /> fanart backdrop</label>
        </div>
        <p className="hint">←↑↓→ move · V next version · Enter launch · F favorite · / search</p>
      </div>
    </section>
  );
}
