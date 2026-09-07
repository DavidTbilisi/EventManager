// Guards the cache-busting setup in index.html. The app has no bundler, so each
// ES module is fetched and cached under its own URL; if one module in the graph
// is missing from the import map — or carries a stale version — a deploy can
// serve a fresh main.js alongside a cached older dependency and break the app.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(resolve(root, "index.html"), "utf8");
const seedHtml = readFileSync(resolve(root, "seed.html"), "utf8");

function importMap() {
    const match = html.match(/<script type="importmap">([\s\S]*?)<\/script>/);
    expect(match, "index.html should carry an import map").toBeTruthy();
    return JSON.parse(match[1]).imports;
}

function versionOf(url) {
    const match = url.match(/\?v=([^"'&\s]+)$/);
    return match ? match[1] : null;
}

// Walk the module graph from js/main.js, following relative imports.
function reachableModules() {
    const seen = new Set();
    const queue = ["main.js"];
    while (queue.length) {
        const file = queue.shift();
        if (seen.has(file)) continue;
        seen.add(file);
        const src = readFileSync(resolve(root, "js", file), "utf8");
        const re = /(?:from|import)\s+["']\.\/([^"']+)["']/g;
        let m;
        while ((m = re.exec(src)) !== null) queue.push(m[1]);
    }
    return seen;
}

describe("asset versioning", () => {
    it("maps every module reachable from main.js", () => {
        const imports = importMap();
        const missing = [...reachableModules()]
            .filter((f) => f !== "main.js") // loaded by <script src>, not a specifier
            .filter((f) => !(`./js/${f}` in imports));
        expect(missing, `add these to the import map in index.html: ${missing}`).toEqual([]);
    });

    it("does not list modules that are no longer in the graph", () => {
        const reachable = reachableModules();
        const stale = Object.keys(importMap())
            .map((k) => k.replace("./js/", ""))
            .filter((f) => !reachable.has(f));
        expect(stale, `drop these from the import map: ${stale}`).toEqual([]);
    });

    it("points each entry at its own path plus a version query", () => {
        Object.entries(importMap()).forEach(([key, value]) => {
            expect(value.split("?")[0]).toBe(key);
            expect(versionOf(value), `${key} needs a ?v= query`).toBeTruthy();
        });
    });

    it("keeps every versioned URL on the same version", () => {
        const versions = new Set(Object.values(importMap()).map(versionOf));
        const mainSrc = html.match(/src="\.\/js\/main\.js([^"]*)"/);
        expect(mainSrc, "main.js should be loaded with a version query").toBeTruthy();
        versions.add(versionOf(`x${mainSrc[1]}`));

        html.match(/href="style\.css[^"]*"/g).forEach((tag) => {
            versions.add(versionOf(tag.slice(6, -1)));
        });
        seedHtml.match(/href="style\.css[^"]*"/g).forEach((tag) => {
            versions.add(versionOf(tag.slice(6, -1)));
        });

        expect(versions.has(null), "every local asset URL needs ?v=").toBe(false);
        expect([...versions], "all assets should share one version").toHaveLength(1);
    });

    it("declares the import map before the module script that uses it", () => {
        expect(html.indexOf('type="importmap"')).toBeLessThan(
            html.indexOf("./js/main.js?")
        );
    });
});
