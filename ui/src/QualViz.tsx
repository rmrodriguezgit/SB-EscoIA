import { useMemo, useState } from "react";

// Visualización del análisis cualitativo: polaridad, grafo de temas (códigos ↔ palabras,
// con co-ocurrencias reales entre códigos) y términos con su balance de polaridad.
type Item = { quote: string; codes: string[]; sentiment: string };
const POL: Record<string, string> = { Positivo: "#4fb38a", Neutro: "#7d88a6", Negativo: "#d0675f", "Sin clasificar": "#4a536b" };
const THEME = ["#7f9cf5", "#e0a458", "#b18be0", "#5fc3c9", "#e87ba4", "#9cc46b", "#c9a0dc", "#f0b86e"];
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function QualViz({ items, words, onPick }: { items: Item[]; words: Record<string, number>; onPick: (w: string) => void }) {
  const [hover, setHover] = useState<string | null>(null);
  const d = useMemo(() => {
    const pol: Record<string, number> = {};
    items.forEach(c => (pol[c.sentiment] = (pol[c.sentiment] || 0) + 1));
    const cat = (code: string) => code.split("/")[0].trim();
    const themes: Record<string, { n: number; pol: Record<string, number> }> = {};
    const co: Record<string, number> = {};
    items.forEach(c => {
      const cs = [...new Set(c.codes.map(cat).filter(Boolean))];
      cs.forEach(t => { const th = (themes[t] ||= { n: 0, pol: {} }); th.n++; th.pol[c.sentiment] = (th.pol[c.sentiment] || 0) + 1; });
      cs.forEach((a, i) => cs.slice(i + 1).forEach(b => { const k = [a, b].sort().join("|"); co[k] = (co[k] || 0) + 1; }));
    });
    const top = Object.entries(themes).sort((a, b) => b[1].n - a[1].n).slice(0, 8).map(([t]) => t);
    const wl = Object.entries(words).sort((a, b) => b[1] - a[1]).slice(0, 24);
    const wordInfo = wl.map(([w, n]) => {
      const nw = norm(w), hits = items.filter(c => norm(c.quote).includes(nw));
      const by: Record<string, number> = {}, p: Record<string, number> = {};
      hits.forEach(c => { p[c.sentiment] = (p[c.sentiment] || 0) + 1; c.codes.map(cat).forEach(t => top.includes(t) && (by[t] = (by[t] || 0) + 1)); });
      const theme = Object.entries(by).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      return { w, n, theme, pos: p.Positivo || 0, neg: p.Negativo || 0, neu: p.Neutro || 0 };
    });
    return { pol, themes, top, co, wordInfo, total: items.length };
  }, [items, words]);

  const W = 720, H = 460, cx = W / 2, cy = H / 2, rT = 110, rW = 195;
  const tPos: Record<string, [number, number]> = {};
  d.top.forEach((t, i) => { const a = (2 * Math.PI * i) / Math.max(1, d.top.length) - Math.PI / 2; tPos[t] = [cx + rT * Math.cos(a), cy + rT * Math.sin(a)]; });
  // Palabras ordenadas por tema para que queden junto a su nodo.
  const ws = [...d.wordInfo].sort((a, b) => (d.top.indexOf(a.theme ?? "") - d.top.indexOf(b.theme ?? "")) || b.n - a.n);
  const wPos = ws.map((w, i) => { const a = (2 * Math.PI * i) / Math.max(1, ws.length) - Math.PI / 2; return { ...w, x: cx + rW * Math.cos(a), y: cy + rW * Math.sin(a), a }; });
  const maxW = Math.max(1, ...d.wordInfo.map(w => w.n)), maxT = Math.max(1, ...d.top.map(t => d.themes[t].n));
  const color = (t: string | null) => (t ? THEME[d.top.indexOf(t) % THEME.length] : "#4a536b");
  const dim = (k: string | null) => hover && k !== hover ? 0.18 : 1;
  const polOrder = ["Negativo", "Neutro", "Positivo", "Sin clasificar"].filter(k => d.pol[k]);
  const maxBal = Math.max(1, ...d.wordInfo.map(w => Math.max(w.pos, w.neg)));

  if (!d.total) return <p>Sin narrativas analizadas.</p>;
  return <div className="qviz">
    <div className="qviz-kpis">
      <div><small>Narrativas</small><b>{d.total}</b></div>
      {polOrder.map(k => <div key={k}><small>{k}</small><b style={{ color: POL[k] }}>{Math.round(100 * d.pol[k] / d.total)}%</b><small>{d.pol[k]}</small></div>)}
      <div><small>Temas (códigos)</small><b>{Object.keys(d.themes).length}</b></div>
    </div>
    <div className="qviz-bar" role="img" aria-label={"Polaridad: " + polOrder.map(k => `${k} ${d.pol[k]}`).join(", ")}>
      {polOrder.map(k => <span key={k} style={{ flex: d.pol[k], background: POL[k] }} title={`${k}: ${d.pol[k]}`} />)}
    </div>

    <h3>Grafo de temas</h3>
    <p className="qviz-note">Centro: temas (categoría del código), tamaño = narrativas codificadas, anillo = mezcla de polaridad. Líneas punteadas = co-ocurrencia real en la misma narrativa. Exterior: términos frecuentes unidos al tema donde más aparecen. Pasa el cursor para aislar; clic en un término filtra las narrativas.</p>
    {d.top.length === 0 && <p className="research-warning">Aún no hay códigos: confirma la codificación de algunas narrativas para ver los temas.</p>}
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Grafo de temas y términos">
      {Object.entries(d.co).map(([k, n]) => { const [a, b] = k.split("|"); if (!tPos[a] || !tPos[b]) return null;
        return <line key={k} x1={tPos[a][0]} y1={tPos[a][1]} x2={tPos[b][0]} y2={tPos[b][1]} stroke="#8a93ad" strokeWidth={1 + n} strokeDasharray="5 4" opacity={hover ? (hover === a || hover === b ? .8 : .08) : .45}><title>{`${a} + ${b}: ${n} narrativas`}</title></line>; })}
      {wPos.map(w => w.theme && tPos[w.theme] && <line key={"l" + w.w} x1={tPos[w.theme][0]} y1={tPos[w.theme][1]} x2={w.x} y2={w.y} stroke={color(w.theme)} opacity={.35 * dim(w.theme) * (hover === w.w ? 3 : 1)} />)}
      {d.top.map(t => { const [x, y] = tPos[t], r = 14 + 18 * d.themes[t].n / maxT, p = d.themes[t].pol, tot = d.themes[t].n; let acc = 0;
        return <g key={t} opacity={dim(t)} onMouseEnter={() => setHover(t)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
          {["Negativo", "Neutro", "Positivo", "Sin clasificar"].filter(k => p[k]).map(k => { const R = r + 5, c = 2 * Math.PI * R, len = c * p[k] / tot, off = acc; acc += len;
            return <circle key={k} cx={x} cy={y} r={R} fill="none" stroke={POL[k]} strokeWidth={4} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform={`rotate(-90 ${x} ${y})`} />; })}
          <circle cx={x} cy={y} r={r} fill={color(t)} />
          <text x={x} y={y + 4} textAnchor="middle" fontSize={11} fill="#0b0f20" fontWeight={600}>{tot}</text>
          <text x={x} y={y + r + 20} textAnchor="middle" fontSize={12} fill="#dfe4f5">{t}</text>
          <title>{`${t}: ${tot} narrativas · ` + Object.entries(p).map(([k, v]) => `${k} ${v}`).join(", ")}</title>
        </g>; })}
      {wPos.map(w => { const r = 4 + 9 * w.n / maxW, out = Math.cos(w.a) >= 0, pt = w.pos + w.neg + w.neu, tone = !pt ? POL.Neutro : w.neg > w.pos ? POL.Negativo : w.pos > w.neg ? POL.Positivo : POL.Neutro;
        return <g key={w.w} opacity={hover && hover !== w.w && hover !== w.theme ? .18 : 1} onMouseEnter={() => setHover(w.w)} onMouseLeave={() => setHover(null)} onClick={() => onPick(w.w)} style={{ cursor: "pointer" }}>
          <circle cx={w.x} cy={w.y} r={r} fill={color(w.theme)} stroke={tone} strokeWidth={2.5} />
          <text x={w.x + (out ? r + 5 : -r - 5)} y={w.y + 4} textAnchor={out ? "start" : "end"} fontSize={11} fill="#aeb8d3">{w.w} <tspan fill="#6f7894">{w.n}</tspan></text>
          <title>{`${w.w}: ${w.n} apariciones · narrativas +${w.pos} / ${w.neu} neutras / −${w.neg}${w.theme ? " · tema " + w.theme : ""}`}</title>
        </g>; })}
    </svg>

    <h3>Términos y polaridad de las narrativas donde aparecen</h3>
    <div className="qviz-legend"><span style={{ background: POL.Negativo }} />Negativo<span style={{ background: POL.Positivo }} />Positivo<i>· punto = frecuencia del término</i></div>
    <div className="qviz-div">
      {[...d.wordInfo].sort((a, b) => b.n - a.n).slice(0, 16).map(w => <button key={w.w} onClick={() => onPick(w.w)} title={`${w.w}: ${w.n} · +${w.pos} / −${w.neg}`}>
        <span className="neg"><i style={{ width: `${100 * w.neg / maxBal}%` }} /></span>
        <b>{w.w}<small>{w.n}</small></b>
        <span className="pos"><i style={{ width: `${100 * w.pos / maxBal}%` }} /></span>
      </button>)}
    </div>
  </div>;
}
