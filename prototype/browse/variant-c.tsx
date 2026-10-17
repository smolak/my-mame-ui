// PROTOTYPE — Variant C "Focus": full-window fanart of the selection · narrow flat text list (every Machine its own row) ·
// one always-live search box where filters are typed tokens (fav, recent, verified, g:shooter, y:198, m:capcom, d:good, all).
import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  type Filters, type Library, type Machine, type Status, STATUS_LABEL, defaultFilters,
  useFlat, mediaUrl, hasMedia, launch, useFavToggle, usePreview,
} from "./lib";

export const name = "Focus";

/** Parse the query string into Filters. Unknown words are free-text search. */
function parse(q: string, sort: Filters["sort"]): Filters {
  const f: Filters = { ...defaultFilters, sort };
  const words: string[] = [];
  for (const w of q.trim().split(/\s+/).filter(Boolean)) {
    const [k, ...rest] = w.split(":"); const val = rest.join(":").toLowerCase();
    if (w === "fav") f.fav = true;
    else if (w === "recent") f.recent = true;
    else if (w === "all") f.showAll = true;
    else if (["verified", "available", "damaged", "missing"].includes(w)) { f.statuses.push(w as Status); if (w === "missing") f.showAll = true; }
    else if (k === "g" && val) f.genre = val;
    else if (k === "y" && val) f.decade = val; // prefix match, handled below
    else if (k === "m" && val) f.manuf = val;
    else if (k === "d" && val) f.driver = val;
    else words.push(w);
  }
  f.q = words.join(" ");
  return f;
}

export function VariantC({ lib, setF: setShared, onSel }: { lib: Library; f: Filters; setF: (f: Filters) => void; onSel: (m?: Machine) => void }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<Filters["sort"]>("desc");
  const parsed = useMemo(() => parse(q, sort), [q, sort]);
  // case-insensitive / prefix tokens: adapt to lib's exact-match filters
  const f = useMemo<Filters>(() => ({
    ...parsed,
    genre: lib.genres.find((g) => g.toLowerCase().startsWith(parsed.genre)) && parsed.genre ? lib.genres.find((g) => g.toLowerCase().startsWith(parsed.genre))! : "",
    decade: "",
    manuf: parsed.manuf ? lib.manufs.find((x) => x.toLowerCase().startsWith(parsed.manuf)) ?? "~none~" : "",
  }), [parsed, lib]);
  const flatAll = useFlat(lib, f);
  const flat = useMemo(() => (parsed.decade ? flatAll.filter((m) => m.year.startsWith(parsed.decade)) : flatAll), [flatAll, parsed.decade]);
  useEffect(() => setShared(f), [f]);

  const [sel, setSel] = useState(0);
  const m = flat[Math.min(sel, flat.length - 1)];
  useEffect(() => onSel(m), [m]);
  useEffect(() => setSel(0), [q, sort]);
  const toggleFav = useFavToggle(lib);
  const playing = usePreview(m?.set);
  const parentRef = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const v = useVirtualizer({ count: flat.length, getScrollElement: () => parentRef.current, estimateSize: () => 30, overscan: 20 });
  useEffect(() => { v.scrollToIndex(sel, { align: "center" }); }, [sel]);

  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      // the search box always owns typing; arrows/Enter/Esc are navigation
      if (e.key === "ArrowDown") { e.preventDefault(); setSel((s) => Math.min(s + 1, flat.length - 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
      else if (e.key === "PageDown") { e.preventDefault(); setSel((s) => Math.min(s + 15, flat.length - 1)); }
      else if (e.key === "PageUp") { e.preventDefault(); setSel((s) => Math.max(s - 15, 0)); }
      else if (e.key === "Enter" && m) launch(m);
      else if (e.key === "Escape") setQ("");
      else if ((e.metaKey || e.ctrlKey) && e.key === "d" && m) { e.preventDefault(); toggleFav(m); }
      else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey && document.activeElement !== input.current && e.key !== "[" && e.key !== "]") input.current?.focus();
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [flat, sel, m]);

  const media = m && hasMedia(m);
  const parentSet = m && (m.parent && lib.bySet.has(m.parent) ? m.parent : m.set);
  const clones = m ? (lib.clones.get(parentSet!)?.length ?? 0) : 0;

  return (
    <div className="vc" style={media ? { backgroundImage: `url("${mediaUrl(m, "fanart")}")` } : undefined}>
      <div className="vc-left">
        <input ref={input} autoFocus className="vc-search" placeholder="Type to search…  fav  recent  verified  g:shoot  y:198  m:capcom  d:good  all" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="vc-meta">
          {flat.length.toLocaleString()} machines{!f.showAll && " · Available only (type “all”)"}
          <span className="spacer" />
          <select value={sort} onChange={(e) => setSort(e.target.value as Filters["sort"])}><option value="desc">A–Z</option><option value="year">Year</option><option value="manuf">Maker</option></select>
        </div>
        <div ref={parentRef} className="vc-list">
          <div style={{ height: v.getTotalSize(), position: "relative" }}>
            {v.getVirtualItems().map((it) => {
              const x = flat[it.index];
              return (
                <div key={it.key} className={`vc-row ${it.index === sel ? "sel" : ""} st-${x.status} ${x.parent ? "clone" : ""}`} style={{ transform: `translateY(${it.start}px)` }}
                  onClick={() => setSel(it.index)} onDoubleClick={() => launch(x)}>
                  <span className={`dot ${x.status}`} />
                  <span className="vc-title">{x.desc}</span>
                  {x.fav && <span className="star">★</span>}
                  <span className="vc-year">{x.year}</span>
                </div>
              );
            })}
          </div>
        </div>
        <p className="hint">type to search · ↑↓ move · Enter launch · ⌘D favorite · Esc clear</p>
      </div>

      {m && (
        <div className="vc-stage">
          {media ? <img className="vc-wheel" src={mediaUrl(m, "wheel")} /> : <h1>{m.desc}</h1>}
          <div className={`vc-shot ${m.rotate % 180 ? "vert" : ""}`}>
            {media ? <img src={mediaUrl(m, playing ? "ss" : "sstitle")} /> : <div className="ph">No Media yet</div>}
            {media && playing && <div className="playing">▶ Preview video</div>}
          </div>
          <div className="vc-facts">
            <span>{m.desc}</span>
            <span>{m.year} · {m.manuf}</span>
            <span>{m.genre} · <span className={`dot ${m.status}`} />{STATUS_LABEL[m.status]} · driver {m.driver}</span>
            <span><code>{m.set}</code>{m.parent && <> · clone of <code>{m.parent}</code></>}{clones > 0 && !m.parent && <> · {clones} clones in list</>}</span>
            {m.recent && <span>Played 2 h 14 min · 3 days ago</span>}
          </div>
          <div className="actions">
            <button className="primary" disabled={m.status === "missing"} onClick={() => launch(m)}>▶ Launch</button>
            <button onClick={() => toggleFav(m)}>{m.fav ? "★ Favorite" : "☆ Favorite"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
