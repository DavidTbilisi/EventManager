export const THEME_KEY = "chronicle-theme";
export const THEME_LABELS = { auto: "Auto", light: "Light", dark: "Dark" };
export const THEME_CYCLE = ["auto", "light", "dark"];

export function getUserTheme(storage) {
    const store = storage || (typeof window !== "undefined" ? window.localStorage : null);
    try {
        const t = store && store.getItem(THEME_KEY);
        return t === "light" || t === "dark" ? t : "auto";
    } catch (e) {
        return "auto";
    }
}

export function setUserTheme(theme, storage) {
    const store = storage || (typeof window !== "undefined" ? window.localStorage : null);
    try {
        if (!store) return;
        if (theme === "auto") store.removeItem(THEME_KEY);
        else store.setItem(THEME_KEY, theme);
    } catch (e) { /* ignore */ }
}

export function nextTheme(current) {
    const idx = THEME_CYCLE.indexOf(current);
    if (idx === -1) return THEME_CYCLE[0];
    return THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
}

export function effectiveTheme(userTheme, isDarkSystem) {
    if (userTheme === "auto") return isDarkSystem ? "dark" : "light";
    return userTheme;
}
