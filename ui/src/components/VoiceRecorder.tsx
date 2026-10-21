import { useEffect, useRef, useState } from "react";
import { csrf } from "../api";
import { useTask, Status } from "./common";
export function VoiceRecorder({
  onText,
  onBlob,
}: {
  onText?: (text: string) => void;
  onBlob?: (b: Blob) => void;
}) {
  const rec = useRef<MediaRecorder | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    mounted = useRef(true);
  const [active, setActive] = useState(false),
    task = useTask();
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      rec.current?.stream.getTracks().forEach((t) => t.stop());
      if (rec.current?.state === "recording") rec.current.stop();
    };
  }, []);
  async function start() {
    await task.run(async () => {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        s.getTracks().forEach((t) => t.stop());
        return;
      }
      const r = new MediaRecorder(s);
      rec.current = r;
      const chunks: Blob[] = [];
      let pending = false,
        lastPartial = Date.now(),
        sequence = 0;
      async function sendAudio(b: Blob, version: number) {
        const form = new FormData();
        form.append("audio", b, "voz.webm");
        const res = await fetch("/api/voice", {
          method: "POST",
          headers: { "X-CSRF-Token": csrf },
          body: form,
        });
        const data = await res.json();
        if (!res.ok) throw Error(data.error);
        if (mounted.current && version === sequence) onText?.(data.text);
        return { transcripcion: data.text };
      }
      r.ondataavailable = (e) => {
        chunks.push(e.data);
        if (
          onText &&
          !onBlob &&
          !pending &&
          r.state === "recording" &&
          Date.now() - lastPartial >= 5000
        ) {
          pending = true;
          lastPartial = Date.now();
          const version = ++sequence;
          void sendAudio(new Blob(chunks, { type: r.mimeType }), version)
            .catch(() => {})
            .finally(() => (pending = false));
        }
      };
      r.onstop = async () => {
        s.getTracks().forEach((t) => t.stop());
        if (timer.current) clearTimeout(timer.current);
        if (!mounted.current) return;
        setActive(false);
        const b = new Blob(chunks, { type: r.mimeType });
        const version = ++sequence;
        if (onBlob) {
          onBlob(b);
          return;
        }
        await task.run(() => sendAudio(b, version));
      };
      r.start(1000);
      setActive(true);
      timer.current = setTimeout(() => {
        if (r.state === "recording") r.stop();
      }, 30000);
    });
  }
  return (
    <div>
      <div className="actions">
        <button disabled={active || task.busy} onClick={start}>
          🎙 Grabar voz
        </button>
        <button
          className="secondary"
          disabled={!active}
          onClick={() => rec.current?.stop()}
        >
          Terminar
        </button>
        {active && <span>Grabando · máximo 30 segundos</span>}
      </div>
      <Status task={task} />
    </div>
  );
}
