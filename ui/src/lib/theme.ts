// Tema: "sistema" sigue prefers-color-scheme; "oscuro"/"claro" se guardan por navegador.
export type ThemeChoice = "system" | "dark" | "light";
const KEY = "escoia.theme";
export function loadTheme(): ThemeChoice {
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
