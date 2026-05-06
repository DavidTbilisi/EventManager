import { describe, it, expect, beforeEach } from "vitest";
import {
    THEME_KEY,
    THEME_LABELS,
    THEME_CYCLE,
    getUserTheme,
    setUserTheme,
    nextTheme,
    effectiveTheme,
} from "../js/theme.js";

function memStore() {
    const m = new Map();
    return {
        getItem: (k) => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => m.set(k, String(v)),
        removeItem: (k) => m.delete(k),
        _map: m,
    };
}

describe("theme constants", () => {
    it("exposes the canonical cycle order and labels", () => {
        expect(THEME_CYCLE).toEqual(["auto", "light", "dark"]);
        expect(THEME_LABELS).toEqual({ auto: "Auto", light: "Light", dark: "Dark" });
        expect(THEME_KEY).toBe("chronicle-theme");
    });
});

describe("getUserTheme / setUserTheme", () => {
    let store;
    beforeEach(() => {
        store = memStore();
    });

    it("defaults to 'auto' when nothing is stored", () => {
        expect(getUserTheme(store)).toBe("auto");
    });

    it("reads 'light' and 'dark' when stored", () => {
        store.setItem(THEME_KEY, "light");
        expect(getUserTheme(store)).toBe("light");
        store.setItem(THEME_KEY, "dark");
        expect(getUserTheme(store)).toBe("dark");
    });

    it("treats unknown stored values as 'auto'", () => {
        store.setItem(THEME_KEY, "neon");
        expect(getUserTheme(store)).toBe("auto");
    });

    it("setUserTheme('auto') removes the stored value (so OS is followed)", () => {
        store.setItem(THEME_KEY, "dark");
        setUserTheme("auto", store);
        expect(store.getItem(THEME_KEY)).toBeNull();
        expect(getUserTheme(store)).toBe("auto");
    });

    it("setUserTheme persists explicit choices", () => {
        setUserTheme("dark", store);
        expect(store.getItem(THEME_KEY)).toBe("dark");
        setUserTheme("light", store);
        expect(store.getItem(THEME_KEY)).toBe("light");
    });

    it("survives a throwing storage", () => {
        const bad = {
            getItem: () => { throw new Error("denied"); },
            setItem: () => { throw new Error("denied"); },
            removeItem: () => { throw new Error("denied"); },
        };
        expect(getUserTheme(bad)).toBe("auto");
        expect(() => setUserTheme("dark", bad)).not.toThrow();
    });
});

describe("nextTheme", () => {
    it("cycles auto → light → dark → auto", () => {
        expect(nextTheme("auto")).toBe("light");
        expect(nextTheme("light")).toBe("dark");
        expect(nextTheme("dark")).toBe("auto");
    });

    it("falls back to the start of the cycle for unknown values", () => {
        expect(nextTheme("neon")).toBe("auto");
    });
});

describe("effectiveTheme", () => {
    it("passes through explicit user choices regardless of system", () => {
        expect(effectiveTheme("light", true)).toBe("light");
        expect(effectiveTheme("light", false)).toBe("light");
        expect(effectiveTheme("dark", true)).toBe("dark");
        expect(effectiveTheme("dark", false)).toBe("dark");
    });

    it("follows the OS preference when user is on auto", () => {
        expect(effectiveTheme("auto", true)).toBe("dark");
        expect(effectiveTheme("auto", false)).toBe("light");
    });
});
