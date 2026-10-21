import type { WebSocket } from "ws";
import type { Event } from "./orchestrator.js";
import type { Principal } from "./contracts.js";
export class EventHub {
  private subscribers = new Map<number, Set<WebSocket>>();
  /* Call only after session authentication and Origin allowlist checks. */
  subscribe(actor: Principal, socket: WebSocket) {
    let set = this.subscribers.get(actor.id);
    if (!set) {
      set = new Set();
      this.subscribers.set(actor.id, set);
    }
    set.add(socket);
    socket.on("close", () => {
      set!.delete(socket);
      if (!set!.size) this.subscribers.delete(actor.id);
    });
  }
  publish(actor: Principal, event: Event) {
    for (const socket of this.subscribers.get(actor.id) ?? []) {
      if (socket.readyState === 1) {
        if (socket.bufferedAmount > 256000) socket.close(1013, "Cliente lento");
        else socket.send(JSON.stringify(event));
      }
    }
  }
}
