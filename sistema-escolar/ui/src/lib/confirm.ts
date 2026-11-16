// Diálogo de confirmación accesible (reemplaza window.confirm, que bloquea la página).
// Esc o "Cancelar" devuelven false; el foco inicia en "Cancelar" (opción segura).
let seq = 0;
export function confirmDialog(
  message: string,
  { confirmLabel = "Confirmar", cancelLabel = "Cancelar" } = {},
): Promise<boolean> {
  return new Promise((resolve) => {
    const id = `confirm-msg-${++seq}`;
    const dialog = document.createElement("dialog");
    dialog.className = "confirm-dialog";
    dialog.setAttribute("aria-labelledby", id);
    const text = document.createElement("p");
    text.id = id;
    text.textContent = message;
    const actions = document.createElement("div");
    actions.className = "actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "secondary";
    cancel.textContent = cancelLabel;
    const ok = document.createElement("button");
    ok.type = "button";
    ok.textContent = confirmLabel;
    actions.append(cancel, ok);
    dialog.append(text, actions);
    cancel.onclick = () => dialog.close("cancel");
    ok.onclick = () => dialog.close("ok");
    dialog.addEventListener("close", () => {
      resolve(dialog.returnValue === "ok");
      dialog.remove();
    });
    document.body.append(dialog);
    dialog.showModal();
    cancel.focus();
  });
}
