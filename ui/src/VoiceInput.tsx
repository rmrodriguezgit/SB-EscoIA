import { useState, useRef, useEffect } from "react";
type Capture = {
  stream: MediaStream;
  context: AudioContext;
  node: ScriptProcessorNode;
  chunks: Float32Array[];
  timer: ReturnType<typeof setTimeout>;
};
export function VoiceInput({
  transcribe,
  onText,
  onError,
}: {
  transcribe: (pcm: string) => Promise<{ text: string }>;
  onText: (text: string) => void;
  onError: (text: string) => void;
}) {
  const capture = useRef<Capture | null>(null);
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  async function stop() {
    const c = capture.current;
    if (!c) return;
    capture.current = null;
    clearTimeout(c.timer);
    c.node.disconnect();
    c.stream.getTracks().forEach((t) => t.stop());
    await c.context.close();
    setRecording(false);
    setProcessing(true);
    try {
      const total = c.chunks.reduce((n, x) => n + x.length, 0);
      const values = new Float32Array(total);
      let n = 0;
      for (const a of c.chunks) {
        values.set(a, n);
        n += a.length;
      }
      const bytes = new Uint8Array(values.buffer);
      let raw = "";
      for (let i = 0; i < bytes.length; i += 8192)
        raw += String.fromCharCode(...bytes.subarray(i, i + 8192));
      const result = await transcribe(btoa(raw));
      onText(result.text);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setProcessing(false);
    }
  }
  async function start() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1 },
        video: false,
      });
      const context = new AudioContext({ sampleRate: 16000 });
      if (context.sampleRate !== 16000) {
        stream.getTracks().forEach((t) => t.stop());
        await context.close();
        throw Error("El dispositivo no admite audio a 16 kHz");
      }
      const node = context.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      node.onaudioprocess = (e) => {
        if (chunks.reduce((n, c) => n + c.length, 0) < 16000 * 30)
          chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      };
      context.createMediaStreamSource(stream).connect(node);
      node.connect(context.destination);
      capture.current = {
        stream,
        context,
        node,
        chunks,
        timer: setTimeout(() => void stop(), 29000),
      };
      setRecording(true);
    } catch (e) {
      onError((e as Error).message);
    }
  }
  useEffect(
    () => () => {
      const c = capture.current;
      if (c) {
        clearTimeout(c.timer);
        c.stream.getTracks().forEach((t) => t.stop());
        c.node.disconnect();
        void c.context.close();
      }
    },
    [],
  );
  return (
    <button
      type="button"
      className={"voice-button " + (recording ? "recording" : "")}
      disabled={processing}
      onClick={() => (recording ? stop() : start())}
    >
      {processing
        ? "Transcribiendo…"
        : recording
          ? "■ Terminar grabación"
          : "🎙 Hablar"}
      <span className="sr-only">
        {" "}
        Audio local en español; revisa el texto antes de enviar
      </span>
    </button>
  );
}
