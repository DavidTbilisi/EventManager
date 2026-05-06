// Make moment available as a global, since js/Events.js relies on the
// CDN-injected `moment` symbol at runtime.
import moment from "moment";

globalThis.moment = moment;
window.moment = moment;

// jsdom doesn't implement crypto.randomUUID in older versions — polyfill if missing.
if (!globalThis.crypto || typeof globalThis.crypto.randomUUID !== "function") {
    globalThis.crypto = globalThis.crypto || {};
    globalThis.crypto.randomUUID = () =>
        "uuid-" + Math.random().toString(36).slice(2, 10) + "-" + Date.now();
}

// Reset cookies + localStorage between tests
beforeEach(() => {
    document.cookie.split(";").forEach((c) => {
        const name = c.split("=")[0].trim();
        if (name) document.cookie = `${name}=; path=/; max-age=0`;
    });
    try {
        window.localStorage.clear();
    } catch (e) { /* noop */ }
});
