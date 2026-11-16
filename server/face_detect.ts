import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { resolve } from "node:path";
import { config } from "./config.js";

export type FaceBox = { x: number; y: number; w: number; h: number; score: number };
export type Detection = { width: number; height: number; quality: "ok" | "none" | "multiple" | "weak" | "small" | "blur" | "dark" | "bright"; faces: FaceBox[] };

/**
 * Detector persistente para el recuadro en vivo: `face_extract --detect-stdin` (solo YuNet, sin ArcFace ni embeddings).
 * Una petición a la vez; si llega otra mientras se procesa, se descarta (la interfaz pide el siguiente cuadro).
 * El proceso se cierra tras 60 s sin uso para no ocupar memoria.
 */
export class LiveFaceDetector {
  private child: ChildProcessWithoutNullStreams | null = null;
  private waiting: { resolve: (d: Detection) => void; reject: (e: Error) => void; timer: NodeJS.Timeout } | null = null;
  private idle: NodeJS.Timeout | null = null;
  constructor(private binary = resolve(config.root, "build/face_extract"), private detector = config.detector, private idleMs = 60000) {}
  get busy() { return this.waiting !== null; }
  private start() {
    const child = spawn(this.binary, ["--detect-stdin", this.detector], { stdio: ["pipe", "pipe", "pipe"] });
    createInterface({ input: child.stdout }).on("line", (line) => {
      const w = this.waiting; if (!w) return;
      this.waiting = null; clearTimeout(w.timer);
      try {
        const d = JSON.parse(line);
        if (d.error) w.reject(Error("No se pudo analizar el cuadro"));
        else w.resolve(d as Detection);
      } catch { w.reject(Error("Respuesta inválida del detector")); }
    });
    child.stderr.on("data", () => {});
    child.on("exit", () => { if (this.child === child) this.child = null; this.fail(Error("El detector facial se detuvo")); });
    child.on("error", (e) => this.fail(e));
    this.child = child;
    return child;
  }
  private fail(e: Error) { const w = this.waiting; this.waiting = null; if (w) { clearTimeout(w.timer); w.reject(e); } }
  detect(path: string, timeout = 3000): Promise<Detection> {
    if (this.waiting) return Promise.reject(Error("DETECTOR_OCUPADO"));
    if (/[\r\n]/.test(path)) return Promise.reject(Error("Ruta inválida"));
    const child = this.child ?? this.start();
    if (this.idle) clearTimeout(this.idle);
    this.idle = setTimeout(() => this.close(), this.idleMs);
    this.idle.unref();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.fail(Error("El detector tardó demasiado")); this.close(); }, timeout);
      this.waiting = { resolve, reject, timer };
      child.stdin.write(path + "\n");
    });
  }
  close() { const c = this.child; this.child = null; if (c) { c.stdin.end(); c.kill(); } }
}

/** Mensaje para la persona frente a la cámara, con los mismos criterios que la extracción biométrica. */
export const QUALITY_HINT: Record<Detection["quality"], string> = {
  ok: "Rostro listo", none: "Buscando un rostro", multiple: "Solo una persona frente a la cámara", weak: "Mira de frente a la cámara",
  small: "Acércate un poco", blur: "Imagen borrosa: quédate quieto", dark: "Falta luz", bright: "Demasiada luz",
};
