// Tema: "sistema" sigue prefers-color-scheme; "oscuro"/"claro" se guardan por navegador.
export type ThemeChoice = "system" | "dark" | "light";
const KEY = "escoia.theme";
// EscoIA (segundo cerebro) incrusta los módulos con ?embed=1&theme=dark para unificar la interfaz;
// ese tema llega por URL y no se guarda, así la app independiente conserva el elegido por la persona.
function urlTheme(): ThemeChoice | null {
  const v = new URLSearchParams(location.search).get("theme");
  return v === "dark" || v === "light" ? v : null;
}
export function loadTheme(): ThemeChoice {
  const forced = urlTheme();
  if (forced) return forced;
  try {
    const v = localStorage.getItem(KEY);
    return v === "dark" || v === "light" ? v : "system";
  } catch {
    return "system";
  }
}
export function applyTheme(choice: ThemeChoice) {
  const root = document.documentElement;
  if (choice === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", choice);
  if (urlTheme()) return;
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* almacenamiento no disponible: el tema vale solo para esta sesión */
  }
}
export const themeLabel: Record<ThemeChoice, string> = {
  system: "Tema: sistema",
  dark: "Tema: cielo nocturno",
  light: "Tema: día",
};
export const nextTheme: Record<ThemeChoice, ThemeChoice> = {
  system: "dark",
  dark: "light",
  light: "system",
};
