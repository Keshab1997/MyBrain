// firebase-service.js
import { auth, db } from "../firebase-config.js"; 
import { collection, addDoc, query, where, orderBy, serverTimestamp, deleteDoc, doc, updateDoc, writeBatch, getDocs, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { CLOUDINARY_URL, CLOUDINARY_PRESET } from "./constants.js";

// Cloudinary Upload
export async function uploadToCloudinary(file) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', CLOUDINARY_PRESET); 
    const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
    return await res.json();
}

// Add Note
export async function addNoteToDB(uid, data) {
    return await addDoc(collection(db, "notes"), {
        uid: uid,
        ...data,
        timestamp: serverTimestamp()
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
    await updateDoc(doc(db, "notes", id), { status: 'trash' });
}

export async function updateNoteContentDB(id, text) {
    await updateDoc(doc(db, "notes", id), { text: text });
}

export async function togglePinDB(id, currentStatus) {
    await updateDoc(doc(db, "notes", id), { isPinned: !currentStatus });
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