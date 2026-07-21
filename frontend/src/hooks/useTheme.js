import { useEffect } from "react";

/** Applies settings.theme ("system" | "light" | "dark") to <html data-theme>.
 * The actual color values live as CSS variables in index.html — this hook only
 * ever sets/clears one attribute, never touches colors directly. */
export function useTheme(theme) {
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "light" || theme === "dark") root.dataset.theme = theme;
    else delete root.dataset.theme; // "system" — let prefers-color-scheme decide
  }, [theme]);
}
