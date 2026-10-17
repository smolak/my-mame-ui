// PROTOTYPE — Variant A "Table": filter sidebar · sortable table with Clones folded under Parents · detail pane.
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type Filters, type Library, type Machine, type Status, STATUS_LABEL,
  useGroups, mediaUrl, hasMedia, launch, useFavToggle, usePreview, typingInField,
} from "./lib";

export const name = "Table";

type Row = { m: Machine; depth: 0 | 1; groupKey: string; cloneCount: number };

export function VariantA({ lib, f, setF, onSel }: { lib: Library; f: Filters; setF: (f: Filters) => void; onSel: (m?: Machine) => void }) {
  const groups = useGroups(lib, f);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const g of groups) {
      const key = g.parent.set;
      out.push({ m: g.head, depth: 0, groupKey: key, cloneCount: g.members.length - 1 });
      if (expanded.has(key)) for (const m of g.members) if (m !== g.head) out.push({ m, depth: 1, groupKey: key, cloneCount: 0 });
    }
    return out;
  }, [groups, expanded]);
  const [sel, setSel] = useState(0);
  const [pending, setPending] = useState<Machine | null>(null);
  useEffect(() => { if (pending) { const i = rows.findIndex((x) => x.m === pending); if (i >= 0) setSel(i); setPending(null); } }, [rows]);
  const cur = rows[Math.min(sel, rows.length - 1)];
  useEffect(() => onSel(cur?.m), [cur?.m]);
  const toggleFav = useFavToggle(lib);
  const parentRef = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const v = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => 26, overscan: 20 });

  useEffect(() => { setSel(0); }, [f]);
  useEffect(() => { v.scrollToIndex(sel, { align: "auto" }); }, [sel]);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.key === "/" || (e.metaKey && e.key === "f")) { e.preventDefault(); search.current?.focus(); return; }
      if (e.key === "Escape") { (document.activeElement as HTMLElement)?.blur(); if (f.q) setF({ ...f, q: "" }); return; }
      if (typingInField(e) && !["ArrowDown", "ArrowUp", "Enter"].includes(e.key)) return;
      const r = rows[sel];
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, rows.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === "PageDown") { e.preventDefault(); setSel((s) => Math.min(s + 20, rows.length - 1)); }
      else if (e.key === "PageUp") { e.preventDefault(); setSel((s) => Math.max(s - 20, 0)); }
      else if (e.key === "ArrowRight" && r?.cloneCount) setExpanded((x) => new Set(x).add(r.groupKey));
      else if (e.key === "ArrowLeft" && r) {
        if (r.depth === 1) setSel(rows.findIndex((x) => x.groupKey === r.groupKey && x.depth === 0));
        else setExpanded((x) => { const n = new Set(x); n.delete(r.groupKey); return n; });
      }
      else if (e.key === "Enter" && r) { (document.activeElement as HTMLElement)?.blur(); launch(r.m); }
      else if (e.key.toLowerCase() === "f" && !e.metaKey && r) toggleFav(r.m);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [rows, sel, f]);

  const toggleStatus = (s: Status) => setF({ ...f, statuses: f.statuses.includes(s) ? f.statuses.filter((x) => x !== s) : [...f.statuses, s] });
  const sortBy = (s: Filters["sort"]) => setF({ ...f, sort: s });

  return (
    <div className="va">
      <aside className="va-side">
        <input ref={search} className="search" placeholder="Search  ( / )" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
        <h4>Library</h4>
        <label><input type="checkbox" checked={f.fav} onChange={(e) => setF({ ...f, fav: e.target.checked })} /> ★ Favorites</label>
        <label><input type="checkbox" checked={f.recent} onChange={(e) => setF({ ...f, recent: e.target.checked })} /> Recents</label>
        <label className="muted"><input type="checkbox" checked={f.showAll} onChange={(e) => setF({ ...f, showAll: e.target.checked, statuses: [] })} /> Show Missing too</label>
        <h4>Status</h4>
        {(["verified", "available", "damaged", ...(f.showAll ? ["missing"] : [])] as Status[]).map((s) => (
          <label key={s}><input type="checkbox" checked={f.statuses.includes(s)} onChange={() => toggleStatus(s)} /> <span className={`dot ${s}`} /> {STATUS_LABEL[s]}</label>
        ))}
        <h4>Genre</h4>
        <select value={f.genre} onChange={(e) => setF({ ...f, genre: e.target.value })}><option value="">Any</option>{lib.genres.map((g) => <option key={g}>{g}</option>)}</select>
        <h4>Decade</h4>
        <select value={f.decade} onChange={(e) => setF({ ...f, decade: e.target.value })}><option value="">Any</option>{lib.decades.map((g) => <option key={g}>{g}</option>)}</select>
        <h4>Manufacturer</h4>
        <select value={f.manuf} onChange={(e) => setF({ ...f, manuf: e.target.value })}><option value="">Any</option>{lib.manufs.map((g) => <option key={g}>{g}</option>)}</select>
        <h4>Driver</h4>
        <select value={f.driver} onChange={(e) => setF({ ...f, driver: e.target.value })}><option value="">Any</option><option>good</option><option>imperfect</option><option>preliminary</option></select>
        <p className="hint">↑↓ move · → expand clones · ← collapse · Enter launch · F favorite · / search</p>
      </aside>

      <section className="va-table">
        <div className="va-head">
          <span className="c-fav" />
          <span className="c-title" onClick={() => sortBy("desc")}>Title {f.sort === "desc" && "▾"}</span>
          <span className="c-year" onClick={() => sortBy("year")}>Year {f.sort === "year" && "▾"}</span>
          <span className="c-manuf" onClick={() => sortBy("manuf")}>Manufacturer {f.sort === "manuf" && "▾"}</span>
          <span className="c-status">Status</span>
          <span className="c-set">Set</span>
        </div>
        <div ref={parentRef} className="va-scroll">
          <div style={{ height: v.getTotalSize(), position: "relative" }}>
            {v.getVirtualItems().map((it) => {
              const r = rows[it.index];
              const m = r.m;
              return (
                <div key={it.key} className={`va-row ${it.index === sel ? "sel" : ""} ${r.depth ? "clone" : ""} st-${m.status}`}
                  style={{ transform: `translateY(${it.start}px)` }}
                  onClick={() => setSel(it.index)} onDoubleClick={() => launch(m)}>
                  <span className="c-fav" onClick={(e) => { e.stopPropagation(); toggleFav(m); }}>{m.fav ? "★" : "☆"}</span>
                  <span className="c-title">
                    {r.depth === 0 && r.cloneCount > 0
                      ? <span className="twisty" onClick={(e) => { e.stopPropagation(); setExpanded((x) => { const n = new Set(x); n.has(r.groupKey) ? n.delete(r.groupKey) : n.add(r.groupKey); return n; }); }}>{expanded.has(r.groupKey) ? "▾" : "▸"}</span>
                      : <span className="twisty" />}
                    {m.desc}
                    {r.depth === 0 && r.cloneCount > 0 && <span className="badge">+{r.cloneCount}</span>}
                    {m.driver !== "good" && <span className={`badge drv-${m.driver}`}>{m.driver}</span>}
                  </span>
                  <span className="c-year">{m.year}</span>
                  <span className="c-manuf">{m.manuf}</span>
                  <span className="c-status"><span className={`dot ${m.status}`} />{STATUS_LABEL[m.status]}</span>
                  <span className="c-set">{m.set}</span>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {cur && <Detail lib={lib} m={cur.m} toggleFav={toggleFav} pick={(c) => {
        setPending(c);
        setExpanded((x) => new Set(x).add(cur.groupKey));
      }} />}
    </div>
  );
}

function Detail({ lib, m, toggleFav, pick }: { lib: Library; m: Machine; toggleFav: (m: Machine) => void; pick: (m: Machine) => void }) {
  const [tab, setTab] = useState<"ss" | "sstitle">("ss");
  const playing = usePreview(m.set);
  const parentSet = m.parent && lib.bySet.has(m.parent) ? m.parent : m.set;
  const family = [lib.bySet.get(parentSet)!, ...(lib.clones.get(parentSet) ?? [])];
  const media = hasMedia(m);
  return (
    <aside className="va-detail">
      <div className={`shot ${m.rotate % 180 ? "vert" : ""}`}>
        {media ? <img src={mediaUrl(m, tab)} /> : <div className="ph">No Media yet<br /><small>queued for scrape</small></div>}
        {media && playing && tab === "ss" && <div className="playing">▶ Preview video</div>}
      </div>
      <div className="tabs"><button className={tab === "ss" ? "on" : ""} onClick={() => setTab("ss")}>Screenshot</button><button className={tab === "sstitle" ? "on" : ""} onClick={() => setTab("sstitle")}>Title</button></div>
      {media && <img className="wheel" src={mediaUrl(m, "wheel")} />}
      <h2>{m.desc}</h2>
      <dl>
        <dt>Set</dt><dd><code>{m.set}</code>{m.parent && <> · clone of <code>{m.parent}</code></>}</dd>
        <dt>Year / Maker</dt><dd>{m.year} · {m.manuf}</dd>
        <dt>Genre</dt><dd>{m.genre}</dd>
        <dt>Status</dt><dd><span className={`dot ${m.status}`} />{STATUS_LABEL[m.status]}{m.status === "damaged" && " — may still run"}</dd>
        <dt>Driver</dt><dd>{m.driver}</dd>
        {m.recent && <><dt>Play time</dt><dd>2 h 14 min · last played 3 days ago</dd></>}
      </dl>
      <div className="actions">
        <button className="primary" disabled={m.status === "missing"} onClick={() => launch(m)}>▶ Launch</button>
        <button onClick={() => toggleFav(m)}>{m.fav ? "★ Favorite" : "☆ Favorite"}</button>
      </div>
      <p className="synopsis">{media ? "Synopsis from ScreenScraper would sit here: a paragraph or two about the game, its story and how it plays." : ""}</p>
      {family.length > 1 && (
        <>
          <h4>Versions ({family.length})</h4>
          <ul className="family">
            {family.map((c) => (
              <li key={c.set} className={c === m ? "on" : ""} onClick={() => pick(c)}>
                <span className={`dot ${c.status}`} />{c.desc.replace(/^[^(]*/, "") || "(parent)"} <code>{c.set}</code>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
