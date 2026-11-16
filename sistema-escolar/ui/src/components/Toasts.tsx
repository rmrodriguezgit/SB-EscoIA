import { useEffect, useState } from "react";
import { onNotice, type Notice } from "../lib/notify";
export function Toasts() {
  const [items, setItems] = useState<Notice[]>([]);
  useEffect(
    () =>
      onNotice((n) => {
        setItems((old) => [...old.slice(-3), n]);
        setTimeout(() => setItems((old) => old.filter((x) => x.id !== n.id)), 9000);
      }),
    [],
  );
  if (!items.length) return null;
  return (
    <div className="toasts" role="alert" aria-live="assertive">
      {items.map((n) => (
        <div className="toast" key={n.id}>
          <span aria-hidden="true">⚠</span>
          <p>{n.message}</p>
          <button
            aria-label="Cerrar aviso"
            onClick={() => setItems((old) => old.filter((x) => x.id !== n.id))}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
