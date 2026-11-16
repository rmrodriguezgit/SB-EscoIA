import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {QuantAIClient} from './quant-client.js';
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { config } from "./config.js";
import { intentSchema } from "./contracts.js";
const exec = promisify(execFile);
const remoteFile=resolve(config.root,'../second-brain/config/remote-ai.json');
const remoteEnabled=existsSync(remoteFile);
function remoteClient(){
 const settings=JSON.parse(readFileSync(remoteFile,'utf8'));
 if(statSync(settings.env_file).mode&0o077)throw Error('Archivo privado requiere permisos 600');
 const env=readFileSync(settings.env_file,'utf8');
 const line=env.split('\n').find(s=>s.startsWith('QUANT_AI_API_TOKEN='));
 const token=line?.slice('QUANT_AI_API_TOKEN='.length).trim().replace(/^['"]|['"]$/g,'');
 if(!token)throw Error('Falta token privado de Quant-AI');
 return new QuantAIClient(settings.base_url,token);
}
let tail: Promise<void> = Promise.resolve();
let waiting = 0;
export async function modelGate<T>(
  job: () => Promise<T>,
  signal: AbortSignal = AbortSignal.timeout(120000),
): Promise<T> {
  if (waiting >= 8) throw Error("Cola de modelos llena");
  waiting++;
  const previous = tail;
  let release!: () => void;
  tail = new Promise((r) => (release = r));
  await previous;
  try {
    signal.throwIfAborted();
    const snapshot = JSON.parse(
      (await exec(config.native, ["--memory"], { timeout: 5000 })).stdout,
    );
    if (snapshot.committedGiB > Number(process.env.MEMORY_BUDGET_GIB ?? 12.5))
      throw Error(
        "Presupuesto de RAM superado; cierra aplicaciones antes de continuar",
      );
    const { stdout } = await exec("/usr/bin/memory_pressure", ["-Q"], {
      timeout: 5000,
    });
    const match = stdout.match(/free percentage:\s*(\d+)%/i);
    if (match && Number(match[1]) < 10)
      throw Error(
        "Memoria insuficiente: cierra aplicaciones o descarga un modelo",
      );
    return await job();
  } finally {
    waiting--;
    release();
  }
}
async function jsonFetch(url: string, body: unknown, signal: AbortSignal) {
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) throw Error("El modelo local no está disponible");
  return r.json();
}
export async function route(text: string, signal: AbortSignal) {
  const normalized=text.toLowerCase();
  const tool=/asistencia/.test(normalized)?"mcp_biometrics_tool":/horario/.test(normalized)?"mcp_scheduler_tool":/encuesta|grupo focal/.test(normalized)?"mcp_surveys_tool":/califica/.test(normalized)?"mcp_grades_tool":"mcp_curriculum_tool";
  return intentSchema.parse({tool,reason:"Ruta por intención; permisos verificados por reglas deterministas"});
}

export async function embed(text: string, signal: AbortSignal) {
  if(remoteEnabled)throw Error('Embeddings locales deshabilitados: Quant-AI no expone embeddings');
  if (!config.ai) throw Error("Los embeddings requieren AI_ENABLED");
  return modelGate(async () => {
    const d = await jsonFetch(
      `${config.ollama}/api/embed`,
      { model: config.embedding, input: text.slice(0, 12000), keep_alive: 0 },
      signal,
    );
    const v = d.embeddings?.[0];
    if (
      !Array.isArray(v) ||
      v.length > 4096 ||
      !v.every((x) => typeof x === "number" && Number.isFinite(x))
    )
      throw Error("Embedding inválido");
    return v as number[];
  }, signal);
}
export async function generate(
  system: string,
  text: string,
  signal: AbortSignal,
) {
  if(remoteEnabled){
    let content='';await remoteClient().chat([{role:'user',content:'Instrucciones de la aplicación: '+system+'\nSolicitud: '+text}],chunk=>{content+=chunk;if(content.length>200000)throw Error('Respuesta excesiva')},signal);return content;
  }
  if (!config.ai)
    throw Error("Activa el modelo Qwen para el análisis cualitativo");
  return modelGate(async () => {
    const d = await jsonFetch(
      `${config.ollama}/api/chat`,
      {
        model: config.qwen,
        stream: false,
        keep_alive: 0,
        options: { temperature: 0, num_ctx: 2048, num_predict: 600 },
        messages: [
          { role: "system", content: system },
          { role: "user", content: text.slice(0, 7000) },
        ],
      },
      signal,
    );
    if (typeof d.message?.content !== "string")
      throw Error("Respuesta del modelo inválida");
    return d.message.content;
  }, signal);
}
export async function transcribe(path: string, signal: AbortSignal) {
  return modelGate(async () => {
    const pcm = `${path}.pcm`;
    await exec(
      "ffmpeg",
      [
        "-nostdin",
        "-v",
        "error",
        "-y",
        "-i",
        path,
        "-t",
        "30",
        "-ar",
        "16000",
        "-ac",
        "1",
        "-f",
        "f32le",
        pcm,
      ],
      { signal, timeout: 60000 },
    );
    try {
      const { stdout } = await exec(
        config.whisper,
        [config.whisperModel, pcm],
        { signal, timeout: 90000, maxBuffer: 1024 * 1024 },
      );
      return stdout.trim();
    } finally {
      await import("node:fs/promises").then((fs) =>
        fs.rm(pcm, { force: true }),
      );
    }
  }, signal);
}
export async function extractFace(path: string, signal: AbortSignal) {
  return modelGate(async () => {
    const { stdout } = await exec(
      `${config.root}/build/face_extract`,
      [path, config.detector, config.recognizer],
      { signal, timeout: 30000, maxBuffer: 200000 },
    );
    const d = JSON.parse(stdout);
    if (
      !Array.isArray(d.vector) ||
      d.vector.length !== 512 ||
      !d.vector.every(
        (x: unknown) => typeof x === "number" && Number.isFinite(x),
      ) ||
      !Number.isFinite(d.pose)
    )
      throw Error("Captura facial inválida");
    return d as { vector: number[]; pose: number };
  }, signal);
}

export async function extractFaces(paths: string[], signal: AbortSignal) {
  if (paths.length === 1) return [await extractFace(paths[0],signal)];
  if (paths.length !== 3) throw Error("Se requieren tres capturas automáticas");
  return modelGate(async () => {
    try {
      const {stdout} = await exec(`${config.root}/build/face_extract`,
        ["--batch",config.detector,config.recognizer,...paths],{signal,timeout:30000,maxBuffer:600000});
      const rows = JSON.parse(stdout);
      if (!Array.isArray(rows) || rows.length !== paths.length || rows.some(d =>
        !Array.isArray(d.vector) || d.vector.length !== 512 || !d.vector.every((x:unknown)=>typeof x === "number" && Number.isFinite(x)) || !Number.isFinite(d.pose)))
        throw Error("Captura facial inválida");
      return rows as {vector:number[];pose:number}[];
    } catch(error:any) {
      const stderr=String(error.stderr || "");
      if (/Captura facial invalida: 2/.test(stderr)) throw Error("No hay un único rostro visible");
      if (/Captura facial invalida: 3/.test(stderr)) throw Error("Rostro demasiado pequeño; acércate a la cámara");
      if (/Captura facial invalida: 7/.test(stderr)) throw Error("Imagen borrosa u oscura; espera frente a la cámara");
      throw error;
    }
  },signal);
}
