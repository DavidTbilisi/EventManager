import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock the firebase-config module so importing HybridStorage doesn't
// touch the real Firebase SDK.
const firebaseMocks = {
    addDoc: vi.fn(),
    getDocs: vi.fn(),
    deleteDoc: vi.fn(),
    updateDoc: vi.fn(),
    collection: vi.fn((..._args) => ({ __collection: true })),
    query: vi.fn((..._args) => ({ __query: true })),
    where: vi.fn((..._args) => ({ __where: true })),
    doc: vi.fn((db, name, id) => ({ __doc: true, name, id })),
    db: { __db: true },
};

vi.mock("../js/firebase-config.js", () => firebaseMocks);

const { default: HybridStorage } = await import("../js/HybridStorage.js");

function makeAuth({ authed, uid = "user-1" } = {}) {
    return {
        isAuthenticated: () => authed,
        getUserId: () => (authed ? uid : null),
        getUserInfo: () => (authed ? { name: "Test", email: "t@e.com" } : null),
    };
}

describe("HybridStorage — cookie path (anonymous)", () => {
    let storage;
    beforeEach(() => {
        storage = new HybridStorage(makeAuth({ authed: false }));
    });

    it("returns [] when no cookie is set", async () => {
        expect(await storage.getEvents()).toEqual([]);
    });

    it("saveEvent assigns a stable id and persists to cookie", async () => {
        const id = await storage.saveEvent({ title: "A", start: "2025-01-01T10:00" });
        expect(id).toBeTruthy();
        const events = await storage.getEvents();
        expect(events).toHaveLength(1);
        expect(events[0].id).toBe(id);
        expect(events[0].title).toBe("A");
    });

    it("backfills ids on read for legacy cookie data without ids", async () => {
        const legacy = [{ title: "Old", start: "2024-01-01T10:00" }];
        document.cookie = `events=${encodeURIComponent(JSON.stringify(legacy))}; path=/`;
        const events = await storage.getEvents();
        expect(events).toHaveLength(1);
        expect(events[0].id).toBeTruthy();
        // Subsequent read should preserve the same id (it was written back).
        const again = await storage.getEvents();
        expect(again[0].id).toBe(events[0].id);
    });

    it("updateEvent mutates by id, not index", async () => {
        const idA = await storage.saveEvent({ title: "A", start: "2025-01-01T10:00" });
        const idB = await storage.saveEvent({ title: "B", start: "2025-02-01T10:00" });
        await storage.updateEvent(idA, { title: "A2", start: "2025-01-02T10:00" });
        const events = await storage.getEvents();
        const a = events.find((e) => e.id === idA);
        const b = events.find((e) => e.id === idB);
        expect(a.title).toBe("A2");
        expect(b.title).toBe("B");
    });

    it("removeEvent deletes by id without disturbing siblings", async () => {
        const idA = await storage.saveEvent({ title: "A", start: "2025-01-01T10:00" });
        const idB = await storage.saveEvent({ title: "B", start: "2025-02-01T10:00" });
        await storage.removeEvent(idA);
        const events = await storage.getEvents();
        expect(events).toHaveLength(1);
        expect(events[0].id).toBe(idB);
    });

    it("rejects update/remove without an id", async () => {
        await expect(storage.updateEvent(undefined, { title: "X" })).rejects.toThrow();
        await expect(storage.removeEvent(undefined)).rejects.toThrow();
    });
});

describe("HybridStorage — cloud path (authenticated)", () => {
    let storage;
    beforeEach(() => {
        Object.values(firebaseMocks).forEach((m) => {
            if (typeof m === "function" && m.mockClear) m.mockClear();
        });
        storage = new HybridStorage(makeAuth({ authed: true }));
    });

    it("getEvents reads via Firestore query and returns doc.id as id", async () => {
        firebaseMocks.getDocs.mockResolvedValueOnce({
            forEach(fn) {
                fn({ id: "doc-1", data: () => ({ title: "Cloud", start: "2025-01-01T10:00", end: undefined }) });
                fn({ id: "doc-2", data: () => ({ title: "Cloud 2", start: "2025-02-01T10:00", end: undefined }) });
            },
        });
        const events = await storage.getEvents();
        expect(events).toEqual([
            { id: "doc-1", title: "Cloud", start: "2025-01-01T10:00", end: undefined },
            { id: "doc-2", title: "Cloud 2", start: "2025-02-01T10:00", end: undefined },
        ]);
        expect(firebaseMocks.where).toHaveBeenCalledWith("userId", "==", "user-1");
    });

    it("saveEvent strips any incoming id and returns the new doc id", async () => {
        firebaseMocks.addDoc.mockResolvedValueOnce({ id: "new-doc" });
        const id = await storage.saveEvent({ id: "stale-id", title: "X", start: "2025-01-01T10:00" });
        expect(id).toBe("new-doc");
        const payload = firebaseMocks.addDoc.mock.calls[0][1];
        expect(payload.id).toBeUndefined();
        expect(payload.title).toBe("X");
        expect(payload.userId).toBe("user-1");
    });

    it("updateEvent calls updateDoc on the targeted doc, not a full rewrite", async () => {
        firebaseMocks.updateDoc.mockResolvedValueOnce(undefined);
        await storage.updateEvent("doc-1", { title: "Patched", start: "2025-01-02T10:00" });
        expect(firebaseMocks.updateDoc).toHaveBeenCalledTimes(1);
        const [docRef, payload] = firebaseMocks.updateDoc.mock.calls[0];
        expect(docRef.id).toBe("doc-1");
        expect(payload.title).toBe("Patched");
        expect(payload.id).toBeUndefined();
        // Critical: should NOT clear the collection.
        expect(firebaseMocks.deleteDoc).not.toHaveBeenCalled();
    });

    it("removeEvent calls deleteDoc on the targeted doc", async () => {
        firebaseMocks.deleteDoc.mockResolvedValueOnce(undefined);
        await storage.removeEvent("doc-7");
        expect(firebaseMocks.deleteDoc).toHaveBeenCalledTimes(1);
        expect(firebaseMocks.deleteDoc.mock.calls[0][0].id).toBe("doc-7");
    });

    describe("migrateCookiesToCloud", () => {
        it("appends cookie events to cloud and clears the cookie on success", async () => {
            const cookieEvents = [
                { id: "local-1", title: "A", start: "2025-01-01T10:00" },
                { id: "local-2", title: "B", start: "2025-02-01T10:00" },
            ];
            document.cookie = `events=${encodeURIComponent(JSON.stringify(cookieEvents))}; path=/`;

            firebaseMocks.addDoc.mockResolvedValue({ id: "new" });

            await storage.migrateCookiesToCloud();

            expect(firebaseMocks.addDoc).toHaveBeenCalledTimes(2);
            for (const call of firebaseMocks.addDoc.mock.calls) {
                expect(call[1].id).toBeUndefined();
            }
            // Cookie should be cleared.
            expect(storage.getEventsFromCookie()).toEqual([]);
            // CRITICAL: must NOT call clear/delete on the existing cloud collection.
            expect(firebaseMocks.deleteDoc).not.toHaveBeenCalled();
        });

        it("leaves the cookie in place if migration throws", async () => {
            const cookieEvents = [{ id: "local-1", title: "A", start: "2025-01-01T10:00" }];
            document.cookie = `events=${encodeURIComponent(JSON.stringify(cookieEvents))}; path=/`;
            firebaseMocks.addDoc.mockRejectedValueOnce(new Error("network"));
            const errSpy = vi.spyOn(console, "error").mockImplementation(() => { });

            await expect(storage.migrateCookiesToCloud()).rejects.toThrow();
            // Cookie still has the original events.
            const events = storage.getEventsFromCookie();
            expect(events).toHaveLength(1);
            expect(events[0].title).toBe("A");
            errSpy.mockRestore();
        });

        it("is a no-op when the cookie is empty", async () => {
            await storage.migrateCookiesToCloud();
            expect(firebaseMocks.addDoc).not.toHaveBeenCalled();
        });
    });
});
