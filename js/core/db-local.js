// FILE: js/core/db-local.js
export const localDB = {
    dbName: "MindVaultLocal",
    version: 2,

    async open() {
        return new Promise((resolve) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("notes")) db.createObjectStore("notes", { keyPath: "id" });
                // নতুন সিঙ্ক কিউ স্টোর
                if (!db.objectStoreNames.contains("syncQueue")) db.createObjectStore("syncQueue", { keyPath: "tempId", autoIncrement: true });
            };
            request.onsuccess = (e) => resolve(e.target.result);
        });
    },

    async saveNotes(notes) {
        const db = await this.open();
        const tx = db.transaction("notes", "readwrite");
        const store = tx.objectStore("notes");
        store.clear(); // পুরনো ডেটা মুছে নতুন ডেটা রাখা
        notes.forEach(n => store.put(n));
    },

    async getAllNotes() {
        const db = await this.open();
        return new Promise((resolve) => {
            const tx = db.transaction("notes", "readonly");
            const store = tx.objectStore("notes");
            const request = store.getAll();
            request.onsuccess = () => resolve(request.result);
        });
    },

    // সিঙ্ক কিউতে অপারেশন জমা রাখা
    async addToSyncQueue(operation) {
        const db = await this.open();
        const tx = db.transaction("syncQueue", "readwrite");
        tx.objectStore("syncQueue").add({ ...operation, timestamp: Date.now() });
    },

    async getSyncQueue() {
        const db = await this.open();
        return new Promise((resolve) => {
            const tx = db.transaction("syncQueue", "readonly");
            const request = tx.objectStore("syncQueue").getAll();
            request.onsuccess = () => resolve(request.result);
        });
    },

    async removeFromSyncQueue(tempId) {
        const db = await this.open();
        const tx = db.transaction("syncQueue", "readwrite");
        tx.objectStore("syncQueue").delete(tempId);
    }
};