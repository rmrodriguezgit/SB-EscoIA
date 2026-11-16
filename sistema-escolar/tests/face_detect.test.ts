import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { LiveFaceDetector, QUALITY_HINT } from "../server/face_detect.js";
import { config } from "../server/config.js";

// Imagen pública de muestra de OpenCV (no son datos de alumnos). Se omite si no está en este equipo.
const SAMPLE = process.env.FACE_SAMPLE ?? resolve(config.root, "../../work/opencv/opencv-4.12.0/samples/data/lena.jpg");
const binary = resolve(config.root, "build/face_extract");
const ready = existsSync(binary) && existsSync(config.detector) && existsSync(SAMPLE);

test("detección en vivo: caja, puntuación y calidad sin identificar", { skip: !ready && "detector o imagen de muestra no disponibles" }, async () => {
  const d = new LiveFaceDetector();
  try {
    const r = await d.detect(SAMPLE);
    assert.equal(r.faces.length, 1);
    assert.equal(r.quality, "ok");
    const f = r.faces[0];
    assert.ok(f.w > 80 && f.h > 80 && f.score >= 0.9 && f.x >= 0 && f.y >= 0 && f.x + f.w <= r.width + 1);
    assert.ok(!("vector" in r), "la detección en vivo no produce embeddings");
    const blank = join(mkdtempSync(join(tmpdir(), "det-")), "x.jpg");
    writeFileSync(blank, "no es imagen");
    await assert.rejects(d.detect(blank), /analizar/);
    const again = await d.detect(SAMPLE);
    assert.equal(again.faces.length, 1, "el proceso persistente sigue funcionando tras un error");
  } finally { d.close(); }
});

test("una petición a la vez y rutas con saltos de línea rechazadas", async () => {
  const d = new LiveFaceDetector("/bin/cat", "x");
  const first = d.detect("/tmp/a.jpg", 300).catch((e) => e.message);
  await assert.rejects(d.detect("/tmp/b.jpg"), /OCUPADO/);
  assert.match(await first, /Respuesta inválida|tardó|se detuvo/);
  await assert.rejects(d.detect("/tmp/a.jpg\n/etc/passwd"), /Ruta inválida/);
  d.close();
  assert.ok(Object.keys(QUALITY_HINT).length >= 8);
});
