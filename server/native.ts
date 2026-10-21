import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { config } from "./config.js";
export type Row = Record<string, any>;
export class Native {
  private child: ChildProcessWithoutNullStreams;
  private seq = 0;
  private pending = new Map<
    number,
    {
      resolve: (v: any) => void;
      reject: (e: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  constructor(binary = config.native, database = config.database) {
    this.child = spawn(binary, [database], { stdio: ["pipe", "pipe", "pipe"] });
    createInterface({ input: this.child.stdout }).on("line", (line) => {
      try {
        const r = JSON.parse(line);
        const p = this.pending.get(r.id);
        if (!p) return;
        this.pending.delete(r.id);
        clearTimeout(p.timer);
        if (r.ok) p.resolve(r.result);
        else p.reject(new Error(r.error ?? "Error del núcleo C"));
      } catch {
        this.fail(new Error("Respuesta nativa inválida"));
      }
    });
    this.child.stderr.on("data", (s) => process.stderr.write(s));
    this.child.on("error", (e) => this.fail(e));
    this.child.on("exit", () => this.fail(new Error("El núcleo C se detuvo")));
  }
  private fail(e: Error) {
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(e);
    }
    this.pending.clear();
  }
  call<T = any>(
    op: string,
    params: unknown[] = [],
    extra: Record<string, unknown> = {},
    timeout = 60000,
  ): Promise<T> {
    const id = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new Error(
            "Tiempo de operación agotado; comprueba el registro antes de repetir",
          ),
        );
        this.child.kill();
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(
        JSON.stringify({ op, params, ...extra, id }) + "\n",
        (err) => {
          if (err) {
            const p = this.pending.get(id);
            if (p) {
              clearTimeout(p.timer);
              this.pending.delete(id);
              reject(err);
            }
          }
        },
      );
    });
  }
  batch(steps: { op: string; params: unknown[] }[]) {
    return this.call<any[]>("batch", [], { steps });
  }
  close() {
    this.child.stdin.end();
  }
}
