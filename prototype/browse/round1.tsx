// PROTOTYPE — throwaway. Browse screen variants switchable via ?variant= and the floating bar ([ / ] keys,
// because arrow keys are the screen's own navigation). Answers ticket "Browse screen".
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { type Filters, type Machine, defaultFilters, useLibrary, Toast } from "./lib";
import * as A from "./variant-a";
import * as B from "./variant-b";
import * as C from "./variant-c";

const VARIANTS = { A: { name: A.name, C: A.VariantA }, B: { name: B.name, C: B.VariantB }, C: { name: C.name, C: C.VariantC } } as const;
type Key = keyof typeof VARIANTS;
const KEYS = Object.keys(VARIANTS) as Key[];

function App() {
  const lib = useLibrary();
  const [variant, setVariant] = useState<Key>(() => (new URLSearchParams(location.search).get("variant") as Key) || "A");
  const [f, setF] = useState<Filters>(defaultFilters);
  const [sel, setSel] = useState<Machine | undefined>();
  const go = (d: number) => {
    const next = KEYS[(KEYS.indexOf(variant) + d + KEYS.length) % KEYS.length];
    history.replaceState(null, "", `/round1?variant=${next}`);
    setVariant(next);
  };
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" && (t as HTMLInputElement).type !== "checkbox") return;
      if (e.key === "[") go(-1); else if (e.key === "]") go(1);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [variant]);

  if (!lib) return <div className="loading">Loading Library snapshot…</div>;
  const V = VARIANTS[variant].C;
  const active = Object.entries(f).filter(([k, v]) => k !== "sort" && (Array.isArray(v) ? v.length : v)).map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(",") : v}`);
  return (
    <>
      <V key={variant} lib={lib} f={f} setF={setF} onSel={setSel} />
      <Toast />
      <div className="proto-bar">
        <button onClick={() => go(-1)}>‹</button>
        <b>{variant}</b> ({VARIANTS[variant].name})
        <button onClick={() => go(1)}>›</button>
        <span className="proto-state">
          {lib.all.length.toLocaleString()} machines · filters: {active.join(" ") || "default (Available)"} · selected: {sel?.set ?? "—"}
        </span>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
