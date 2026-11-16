<script setup lang="ts">
// Constelación de agentes de EscoIA (Vue 3, embebida en la app React).
// Cada agente y modelo local es una estrella; las líneas son las rutas reales
// de una solicitud (Entrada → Orquestador → Agente MCP → Núcleo C · SQLite).
// Los eventos en vivo encienden la estrella y lanzan un cometa por la ruta.
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";

type Row = Record<string, any>;
const props = defineProps<{ events: Row[]; health: Row; connected: boolean }>();

type Kind = "io" | "hub" | "agent" | "model";
interface Star {
  id: string;
  label: string;
  kind: Kind;
  x: number;
  y: number;
  desc: string;
  healthKey?: string;
}
const stars: Star[] = [
  { id: "Entrada", label: "Entrada", kind: "io", x: 90, y: 250, desc: "Solicitudes por texto o voz desde Inicio." },
  { id: "whisper", label: "Whisper", kind: "model", x: 115, y: 440, desc: "Transcripción de voz local (whisper.cpp).", healthKey: "whisper" },
  { id: "laya", label: "LAYA · MLX", kind: "model", x: 330, y: 75, desc: "Enrutador de intención con Qwen 2.5 en MLX.", healthKey: "ai" },
  { id: "Reglas de autorización", label: "Orquestador", kind: "hub", x: 330, y: 250, desc: "Valida intención, permisos y argumentos antes de ejecutar." },
  { id: "mcp_curriculum_tool", label: "Curricular", kind: "agent", x: 495, y: 80, desc: "Programas, materias, planes y búsqueda semántica." },
  { id: "mcp_scheduler_tool", label: "Horarios", kind: "agent", x: 616, y: 152, desc: "Sesiones, aulas, cierres y solución de horarios." },
  { id: "mcp_biometrics_tool", label: "Asistencia", kind: "agent", x: 660, y: 262, desc: "Registro de asistencia facial y manual." },
  { id: "mcp_grades_tool", label: "Calificaciones", kind: "agent", x: 610, y: 365, desc: "Captura y vista previa de calificaciones." },
  { id: "mcp_surveys_tool", label: "Investigación", kind: "agent", x: 495, y: 438, desc: "Encuestas, consentimiento y análisis cualitativo." },
  { id: "qwen", label: "Qwen", kind: "model", x: 300, y: 455, desc: "Modelo local para análisis cualitativo (Ollama).", healthKey: "ai" },
  { id: "face", label: "Visión facial", kind: "model", x: 805, y: 105, desc: "YuNet + ArcFace para identificar rostros.", healthKey: "face" },
  { id: "Sistema", label: "Núcleo C · SQLite", kind: "io", x: 895, y: 262, desc: "Servicio nativo que valida y guarda cada operación." },
];
const byId = new Map(stars.map((s) => [s.id, s]));
const agents = stars.filter((s) => s.kind === "agent").map((s) => s.id);
const edges: [string, string][] = [
  ["whisper", "Entrada"],
  ["Entrada", "Reglas de autorización"],
  ["laya", "Reglas de autorización"],
  ...agents.map((a) => ["Reglas de autorización", a] as [string, string]),
  ...agents.map((a) => [a, "Sistema"] as [string, string]),
  ["qwen", "mcp_surveys_tool"],
  ["face", "mcp_biometrics_tool"],
];
const edgeKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const edgeSet = new Set(edges.map(([a, b]) => edgeKey(a, b)));

// Cielo de fondo determinista (no cambia entre recargas)
let seed = 20261020;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const sky = Array.from({ length: 150 }, (_, i) => ({
  i,
  x: rand() * 1000,
  y: rand() * 520,
  r: rand() * 1.1 + 0.25,
  d: (rand() * 6).toFixed(2),
  o: (rand() * 0.5 + 0.25).toFixed(2),
}));

// Estado de actividad por estrella
interface Activity { state: string; at: number; message: string; count: number }
const activity = reactive<Record<string, Activity>>({});
const lastAgentOfRun = new Map<string, string>();
const seen = new Set<string>();
const hotEdges = reactive<Record<string, number>>({});
interface Comet { id: number; from: Star; to: Star; born: number; error: boolean }
const comets = ref<Comet[]>([]);
const now = ref(Date.now());
const selected = ref<string>("Reglas de autorización");
const reduceMotion =
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
let cometSeq = 0;
const COMET_MS = 1100;

function ingest(list: Row[]) {
  const fresh = Date.now() - 10_000;
  const sorted = [...list].sort((a, b) => String(a.at).localeCompare(String(b.at)) || a.revision - b.revision);
  for (const e of sorted) {
    const key = `${e.runId}:${e.revision}`;
    if (seen.has(key) || typeof e.agent !== "string") continue;
    seen.add(key);
    const at = Date.parse(e.at) || Date.now();
    const agent = byId.has(e.agent) ? e.agent : null;
    if (agent) {
      const a = (activity[agent] ??= { state: "", at: 0, message: "", count: 0 });
      a.state = e.state;
      a.at = at;
      a.message = e.message ?? "";
      if (e.state === "ejecutando" || byId.get(agent)!.kind !== "agent") a.count++;
    }
    const prev = lastAgentOfRun.get(e.runId);
    if (agent && prev && prev !== agent && edgeSet.has(edgeKey(prev, agent))) {
      hotEdges[edgeKey(prev, agent)] = at;
      if (at >= fresh && !reduceMotion)
        comets.value.push({ id: ++cometSeq, from: byId.get(prev)!, to: byId.get(agent)!, born: performance.now(), error: e.state === "error" });
    }
    if (agent) lastAgentOfRun.set(e.runId, agent);
    if (e.state === "completado" || e.state === "error") lastAgentOfRun.delete(e.runId);
  }
  if (comets.value.length) loop();
}
watch(() => props.events, (v) => ingest(v ?? []), { immediate: true });

// Animación de cometas (requestAnimationFrame solo mientras hay cometas)
const frame = ref(0);
let raf = 0;
function loop() {
  if (raf) return;
  const step = () => {
    const t = performance.now();
    comets.value = comets.value.filter((c) => t - c.born < COMET_MS);
    frame.value = t;
    raf = comets.value.length ? requestAnimationFrame(step) : 0;
  };
  raf = requestAnimationFrame(step);
}
function cometPos(c: Comet) {
  const p = Math.min(1, (frame.value - c.born) / COMET_MS);
  const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
  return { x: c.from.x + (c.to.x - c.from.x) * e, y: c.from.y + (c.to.y - c.from.y) * e, tail: Math.max(0, e - 0.12) };
}
let clock: ReturnType<typeof setInterval>;
onMounted(() => (clock = setInterval(() => (now.value = Date.now()), 1000)));
onBeforeUnmount(() => {
  clearInterval(clock);
  cancelAnimationFrame(raf);
});

function offline(s: Star) {
  return !!s.healthKey && props.health && Object.keys(props.health).length > 0 && !props.health[s.healthKey];
}
function status(s: Star): "idle" | "active" | "done" | "error" | "offline" {
  if (offline(s)) return "offline";
  const a = activity[s.id];
  if (!a) return "idle";
  const age = now.value - a.at;
  if (a.state === "error" && age < 15_000) return "error";
  if (["recibido", "validando", "ejecutando"].includes(a.state) && age < 60_000) return "active";
  if (age < 6_000) return "done";
  return "idle";
}
const stateText: Record<string, string> = {
  idle: "En reposo",
  active: "Trabajando",
  done: "Completado",
  error: "Error",
  offline: "Sin activar",
};
function edgeHot(a: string, b: string) {
  const t = hotEdges[edgeKey(a, b)];
  return !!t && now.value - t < 5_000;
}
function radius(s: Star) {
  return s.kind === "hub" ? 9 : s.kind === "agent" ? 7.5 : s.kind === "io" ? 6.5 : 5;
}
function labelAnchor(s: Star) {
  return s.x > 850 ? "end" : s.x < 140 ? "start" : "middle";
}
// Estrellas de la franja superior: etiqueta y contador arriba; resto: abajo
function labelY(s: Star) {
  return s.y < 120 ? s.y - radius(s) - 26 : s.y + radius(s) + 20;
}
function countY(s: Star) {
  return s.y < 120 ? s.y - radius(s) - 11 : s.y + radius(s) + 35;
}
function countText(s: Star) {
  const n = activity[s.id]?.count ?? 0;
  const unit = s.kind === "agent" ? "ejecución" : "evento";
  return `${n} ${n === 1 ? unit : s.kind === "agent" ? "ejecuciones" : "eventos"}`;
}
const current = computed(() => byId.get(selected.value)!);
const currentActivity = computed(() => activity[selected.value]);
function select(id: string) {
  selected.value = id;
}
function when(at?: number) {
  if (!at) return "—";
  return new Date(at).toLocaleTimeString("es-MX", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}
const summary = computed(() =>
  stars.map((s) => `${s.label}: ${stateText[status(s)]}`).join("; "),
);
</script>

<template>
  <div class="constellation">
    <svg
      viewBox="0 0 1000 520"
      role="group"
      aria-label="Constelación de agentes de EscoIA"
      class="constellation-sky"
    >
      <defs>
        <radialGradient id="cg-sky" cx="50%" cy="40%" r="75%">
          <stop offset="0%" stop-color="var(--sky-2)" />
          <stop offset="100%" stop-color="var(--sky)" />
        </radialGradient>
        <radialGradient id="cg-glow">
          <stop offset="0%" stop-color="var(--star-glow)" stop-opacity="0.9" />
          <stop offset="100%" stop-color="var(--star-glow)" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="cg-glow-ok">
          <stop offset="0%" stop-color="#4ade80" stop-opacity="0.9" />
          <stop offset="100%" stop-color="#4ade80" stop-opacity="0" />
        </radialGradient>
        <radialGradient id="cg-glow-err">
          <stop offset="0%" stop-color="#f87171" stop-opacity="0.95" />
          <stop offset="100%" stop-color="#f87171" stop-opacity="0" />
        </radialGradient>
      </defs>
      <rect width="1000" height="520" rx="18" fill="url(#cg-sky)" />
      <g aria-hidden="true">
        <circle
          v-for="s in sky"
          :key="s.i"
          :cx="s.x"
          :cy="s.y"
          :r="s.r"
          class="twinkle"
          :style="{ animationDelay: s.d + 's', opacity: s.o }"
        />
      </g>
      <g aria-hidden="true">
        <line
          v-for="[a, b] in edges"
          :key="a + b"
          :x1="byId.get(a)!.x"
          :y1="byId.get(a)!.y"
          :x2="byId.get(b)!.x"
          :y2="byId.get(b)!.y"
          :class="['link', { hot: edgeHot(a, b), dim: offline(byId.get(a)!) || offline(byId.get(b)!) }]"
        />
      </g>
      <g aria-hidden="true">
        <g v-for="c in comets" :key="c.id">
          <line
            :x1="c.from.x + (c.to.x - c.from.x) * cometPos(c).tail"
            :y1="c.from.y + (c.to.y - c.from.y) * cometPos(c).tail"
            :x2="cometPos(c).x"
            :y2="cometPos(c).y"
            :class="['comet-tail', { error: c.error }]"
          />
          <circle :cx="cometPos(c).x" :cy="cometPos(c).y" r="3.6" :class="['comet', { error: c.error }]" />
        </g>
      </g>
      <g
        v-for="s in stars"
        :key="s.id"
        :class="['star', s.kind, status(s), { selected: selected === s.id }]"
        role="button"
        tabindex="0"
        :aria-label="`${s.label}: ${stateText[status(s)]}. ${s.desc}`"
        :aria-pressed="selected === s.id"
        @click="select(s.id)"
        @keydown.enter.prevent="select(s.id)"
        @keydown.space.prevent="select(s.id)"
      >
        <circle
          class="halo"
          :cx="s.x"
          :cy="s.y"
          :r="radius(s) * 4.2"
          :fill="status(s) === 'error' ? 'url(#cg-glow-err)' : status(s) === 'done' ? 'url(#cg-glow-ok)' : 'url(#cg-glow)'"
        />
        <circle class="hit" :cx="s.x" :cy="s.y" r="26" />
        <circle class="core" :cx="s.x" :cy="s.y" :r="radius(s)" />
        <circle v-if="selected === s.id" class="ring" :cx="s.x" :cy="s.y" :r="radius(s) + 7" />
        <text :x="s.x" :y="labelY(s)" :text-anchor="labelAnchor(s)" class="label">{{ s.label }}</text>
        <text
          v-if="activity[s.id]?.count"
          :x="s.x"
          :y="countY(s)"
          :text-anchor="labelAnchor(s)"
          class="count"
        >{{ countText(s) }}</text>
      </g>
    </svg>

    <div class="constellation-detail" aria-live="polite">
      <div>
        <small>{{ current.kind === "agent" ? "AGENTE MCP" : current.kind === "model" ? "MODELO LOCAL" : current.kind === "hub" ? "ORQUESTADOR" : "SERVICIO" }}</small>
        <strong>{{ current.label }}</strong>
        <p>{{ current.desc }}</p>
      </div>
      <dl>
        <div><dt>Estado</dt><dd :class="['pill', status(current)]">{{ stateText[status(current)] }}</dd></div>
        <div><dt>Último evento</dt><dd>{{ currentActivity?.message || "Sin actividad en esta sesión" }}</dd></div>
        <div><dt>Hora</dt><dd>{{ when(currentActivity?.at) }}</dd></div>
      </dl>
    </div>
    <ul class="constellation-legend" aria-label="Simbología">
      <li><span class="key active"></span>Trabajando</li>
      <li><span class="key done"></span>Completado</li>
      <li><span class="key error"></span>Error</li>
      <li><span class="key offline"></span>Modelo sin activar</li>
      <li class="hint">Selecciona una estrella (clic o Tab + Enter) para ver su detalle.</li>
    </ul>
    <p class="sr-only">{{ summary }}</p>
  </div>
</template>

<style scoped>
.constellation { display: grid; gap: 14px; }
.constellation-sky { width: 100%; height: auto; display: block; border-radius: 18px; border: 1px solid var(--border); }
.twinkle { fill: #fff; animation: twinkle 4.5s ease-in-out infinite alternate; }
@keyframes twinkle { from { opacity: 0.15; } to { opacity: 0.85; } }
.link { stroke: var(--star-line); stroke-width: 1.2; stroke-dasharray: 2 5; transition: stroke 0.6s, stroke-width 0.6s; }
.link.hot { stroke: var(--star-glow); stroke-width: 2.2; stroke-dasharray: none; }
.link.dim { opacity: 0.35; }
.comet { fill: #fff; filter: drop-shadow(0 0 6px var(--star-glow)); }
.comet.error { fill: #fecaca; filter: drop-shadow(0 0 6px #f87171); }
.comet-tail { stroke: var(--star-glow); stroke-width: 2.4; stroke-linecap: round; opacity: 0.55; }
.comet-tail.error { stroke: #f87171; }
.star { cursor: pointer; outline: none; }
.star .hit { fill: transparent; }
.star .core { fill: var(--star); filter: drop-shadow(0 0 4px #fff8); transition: r 0.3s, fill 0.3s; }
.star.model .core { fill: #c7d2fe; }
.star.hub .core { fill: #fde68a; }
.star .halo { opacity: 0.22; transition: opacity 0.6s; }
.star.active .halo { opacity: 1; animation: pulse 1.1s ease-in-out infinite alternate; }
.star.done .halo { opacity: 0.85; }
.star.error .halo { opacity: 1; }
.star.error .core { fill: #fecaca; }
.star.offline .core { fill: var(--star-dim); opacity: 0.55; }
.star.offline .halo { opacity: 0; }
.star .ring { fill: none; stroke: var(--star); stroke-width: 1.4; stroke-dasharray: 3 3; }
.star:focus-visible .ring, .star:focus-visible .core { stroke: #fde68a; stroke-width: 3; }
.star .label { fill: #e7ecff; font: 600 14px Inter, system-ui, sans-serif; paint-order: stroke; stroke: var(--sky); stroke-width: 4px; }
.star.offline .label { fill: var(--star-dim); }
.star .count { fill: #a3afd4; font: 11px ui-monospace, monospace; paint-order: stroke; stroke: var(--sky); stroke-width: 3px; }
@keyframes pulse { from { opacity: 0.55; } to { opacity: 1; } }
.constellation-detail {
  display: grid; grid-template-columns: 1.1fr 1fr; gap: 18px;
  padding: 16px 18px; border-radius: 14px; background: var(--surface-2); border: 1px solid var(--border);
}
.constellation-detail small { font-size: 10px; letter-spacing: 0.14em; font-weight: 700; color: var(--muted); }
.constellation-detail strong { display: block; font-size: 17px; margin: 4px 0; }
.constellation-detail p { margin: 0; font-size: 13px; color: var(--muted); }
.constellation-detail dl { margin: 0; display: grid; gap: 8px; font-size: 13px; }
.constellation-detail dl div { display: grid; grid-template-columns: 110px 1fr; gap: 10px; }
.constellation-detail dt { color: var(--muted); }
.constellation-detail dd { margin: 0; }
.pill { display: inline-block; padding: 2px 10px; border-radius: 99px; font-size: 12px; font-weight: 700; background: var(--surface); border: 1px solid var(--border); justify-self: start; }
.pill.active { color: var(--info); border-color: var(--info-border); background: var(--info-soft); }
.pill.done { color: var(--success); border-color: var(--success-border); background: var(--success-soft); }
.pill.error { color: var(--danger); border-color: var(--danger-border); background: var(--danger-soft); }
.pill.offline { color: var(--muted); }
.constellation-legend { list-style: none; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 8px 18px; font-size: 12px; color: var(--muted); }
.constellation-legend li { display: flex; align-items: center; gap: 7px; }
.constellation-legend .hint { flex-basis: 100%; }
.key { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
.key.active { background: #7dd3fc; box-shadow: 0 0 8px #7dd3fc; }
.key.done { background: #4ade80; box-shadow: 0 0 8px #4ade80; }
.key.error { background: #f87171; box-shadow: 0 0 8px #f87171; }
.key.offline { background: #8d99c2; opacity: 0.6; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 720px) {
  .constellation-detail { grid-template-columns: 1fr; }
  .star .label { font-size: 26px; }
  .star .count { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .twinkle, .star.active .halo { animation: none; }
}
</style>
