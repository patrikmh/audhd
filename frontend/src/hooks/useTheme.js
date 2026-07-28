import { useEffect } from "react";

/** Applies settings.theme ("system" | "light" | "dark") to <html data-theme>.
 * "system" löses upp här mot prefers-color-scheme så att attributet alltid är
 * satt — då behöver styles/theme.css bara ett mörkt block istället för två
 * identiska (ett för mediafrågan, ett för det explicita valet). */
export function useTheme(theme) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme !== "system") {
      root.dataset.theme = theme;
      return;
    }

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      root.dataset.theme = query.matches ? "dark" : "light";
    };
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, [theme]);
}
