/** Vistas que pueden abrirse en una ventana independiente (lista cerrada, igual que en desktop/main.cjs). */
export type ExplorerView = "cuerdas";
type Bridge = { openWindow: (view: ExplorerView) => Promise<boolean> };
declare global { interface Window { escoia?: Bridge } }

/**
 * Abre la vista en una ventana aparte sin perder el hilo de la conversación.
 * Electron: IPC a través del preload seguro, que crea una BrowserWindow nativa.
 * Navegador: window.open. Devuelve false si no se pudo abrir (ventana emergente bloqueada).
 */
export function openExplorer(view: ExplorerView): boolean {
  if (window.escoia?.openWindow) {
    void window.escoia.openWindow(view);
    return true;
  }
  const child = window.open(`/?vista=${view}`, `escoia-${view}`, "popup,width=1280,height=820");
  if (!child) return false;
  child.focus();
  return true;
}
