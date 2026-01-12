import { auth, db } from "./firebase-config.js";
import { collection, addDoc, query, where, orderBy, serverTimestamp, deleteDoc, doc, updateDoc, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { CLOUDINARY_URL, CLOUDINARY_PRESET } from "./constants.js";

// Cloudinary Upload
export async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_PRESET);
    let uploadUrl = CLOUDINARY_URL;
    if (file.type.startsWith('audio/') || file.type.startsWith('video/')) {
        formData.append('resource_type', 'video');
        uploadUrl = uploadUrl.replace('/image/upload', '/video/upload');
    }
    const res = await fetch(uploadUrl, { method: 'POST', body: formData });
    if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error?.message || "Upload failed");
    }
    return await res.json();
}

// Add Note
export async function addNoteToDB(uid, data) {
    const cleanData = { ...data };
    Object.keys(cleanData).forEach(key => {
        if (cleanData[key] === undefined) cleanData[key] = null;
    });
    return await addDoc(collection(db, "notes"), {
        uid: uid, ...cleanData, timestamp: serverTimestamp()
    });
}

// Restore / Delete / Update
export async function restoreNoteDB(id) {
    await updateDoc(doc(db, "notes", id), { status: 'active', timestamp: serverTimestamp() });
}

export async function deleteNoteForeverDB(id) {
    await deleteDoc(doc(db, "notes", id));
}

export async function moveToTrashDB(id) {
    await updateDoc(doc(db, "notes", id), { status: 'trash', trashDate: serverTimestamp() });
}

export async function updateNoteContentDB(id, text) {
    await updateDoc(doc(db, "notes", id), { text: text });
}

export async function togglePinDB(id, currentStatus) {
    await updateDoc(doc(db, "notes", id), { isPinned: !currentStatus });
}

// 🔥 Batch Delete (Multi-Select)
export async function batchDeleteNotesDB(ids, isPermanentDelete) {
    const batch = writeBatch(db);
    ids.forEach(id => {
        const ref = doc(db, "notes", id);
        if (isPermanentDelete) {
            batch.delete(ref);
        } else {
            batch.update(ref, { status: 'trash', trashDate: serverTimestamp() });
        }
    });
    await batch.commit();
}

// Trash Management
export async function emptyTrashDB(uid) {
    const batch = writeBatch(db);
    const q = query(collection(db, "notes"), where("uid", "==", uid), where("status", "==", "trash"));
    const snapshot = await getDocs(q);
    snapshot.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
}

export async function cleanupOldTrashDB(uid) {
    const q = query(collection(db, "notes"), where("uid", "==", uid), where("status", "==", "trash"));
    const snapshot = await getDocs(q);
    const batch = writeBatch(db);
    let hasOldNotes = false;
    const now = new Date();
    const sevenDaysInMillis = 7 * 24 * 60 * 60 * 1000;

    snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const noteDate = data.trashDate ? data.trashDate.toDate() : data.timestamp?.toDate();
        if (noteDate && (now - noteDate) > sevenDaysInMillis) {
            batch.delete(docSnap.ref);
            hasOldNotes = true;
        }
    });
    if (hasOldNotes) await batch.commit();
}

// Folder Logic
export async function createFolderDB(uid, name) {
    await addDoc(collection(db, "folders"), { uid, name, createdAt: serverTimestamp() });
}

export async function deleteFolderDB(uid, folderId, folderName) {
    const batch = writeBatch(db);
    const q = query(collection(db, "notes"), where("uid", "==", uid), where("folder", "==", folderName));
    const snaps = await getDocs(q);
    snaps.forEach((doc) => batch.update(doc.ref, { folder: "General" }));
    batch.delete(doc(db, "folders", folderId));
    await batch.commit();
}