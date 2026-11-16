import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { existsSync } from "node:fs";
export const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
if (existsSync(resolve(root, ".env")))
  process.loadEnvFile(resolve(root, ".env"));
export const config = {
  root,
  bind: process.env.BIND_HOST ?? "127.0.0.1",
  origin:
    process.env.PUBLIC_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 8787}`,
  tlsCert: process.env.TLS_CERT,
  tlsKey: process.env.TLS_KEY,
  port: Number(process.env.PORT ?? 8787),
  database: resolve(root, process.env.DATABASE ?? "data/sistema.db"),
  native: resolve(root, process.env.NATIVE_BIN ?? "build/sistema_service"),
  artifacts: resolve(root, "artifacts"),
  uploads: resolve(root, process.env.UPLOADS_DIR ?? "data/uploads"),
  ai: process.env.AI_ENABLED === "true",
  laya: process.env.LAYA_URL ?? "http://127.0.0.1:8081/v1/chat/completions",
  ollama: process.env.OLLAMA_URL ?? "http://127.0.0.1:11434",
  qwen: process.env.QWEN_MODEL ?? "qwen2.5:7b-instruct-q4_K_M",
  embedding: process.env.EMBED_MODEL ?? "nomic-embed-text",
  whisper: resolve(root, process.env.WHISPER_BIN ?? "build/sistema_transcribe"),
  whisperModel: resolve(
    root,
    process.env.WHISPER_MODEL ?? "models/ggml-base.bin",
  ),
  detector: resolve(root, process.env.FACE_DETECTOR ?? "models/face_detection_yunet_2023mar.onnx"),
  recognizer: resolve(root, process.env.FACE_MODEL ?? "models/w600k_mbf.onnx"),
  faceThreshold: Number(process.env.FACE_THRESHOLD ?? 0.55),
  faceMargin: Number(process.env.FACE_MARGIN ?? 0.08),
  /** Minutos de tolerancia tras el inicio de clase; después, el reconocimiento facial registra «Retardo». */
  lateToleranceMin: Number(process.env.LATE_TOLERANCE_MIN ?? 10),
  allowWeb: process.env.ALLOW_WEB_REFERENCES === "true",
};
for (const url of [config.laya, config.ollama]) {
  const u = new URL(url);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))
    throw new Error("Los modelos deben usar direcciones locales");
}

if (config.bind !== "127.0.0.1")
 throw Error("El acceso directo sin contraseña solo puede ejecutarse en 127.0.0.1");
