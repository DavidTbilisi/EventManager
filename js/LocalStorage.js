export default class LocalStorage {
    constructor() {
        if (!localStorage) {
            throw new Error("Local Storage is not supported");
        }
    }

    set(key, value) {
        localStorage.setItem(key, JSON.stringify(value));
    }

    get(key) {
        return JSON.parse(localStorage.getItem(key));
    }
}
