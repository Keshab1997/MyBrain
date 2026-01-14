// js/dashboard/menu-manager.js

import { db } from "../core/firebase-config.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as DBService from "../core/firebase-service.js";
import * as Utils from "../core/utils.js";

let currentEditId = null;

// ১. মেনু ওপেন করার ফাংশন
export async function openContextMenu(e, id) {
    e.stopPropagation();
    e.preventDefault();
    
    currentEditId = id;
    const menu = document.getElementById('contextMenu');
    
    // পিন স্ট্যাটাস চেক করে টেক্সট আপডেট
    const docSnap = await getDoc(doc(db, "notes", id));
    if(docSnap.exists()) {
        const data = docSnap.data();
        const pinBtn = document.getElementById('ctx-pin');
        if(pinBtn) pinBtn.innerHTML = data.isPinned ? "🚫 Unpin" : "📌 Pin";
    }

    // মেনু পজিশন ঠিক করা (যাতে স্ক্রিনের বাইরে না যায়)
    const menuWidth = 160;
    const menuHeight = 200;
    let x = e.pageX;
    let y = e.pageY;

    if (x + menuWidth > window.innerWidth) x -= menuWidth;
    if (y + menuHeight > window.scrollY + window.innerHeight) y -= menuHeight;

    menu.style.top = `${y}px`; 
    menu.style.left = `${x}px`; 
    menu.style.display = 'block';
}

// ২. রিড মোডাল ওপেন
export function openReadModal(data, id) {
    const modal = document.getElementById('readModal');
    const content = document.getElementById('readModalContent');
    const dateEl = document.getElementById('readModalDate');
    const folderEl = document.getElementById('readModalFolder');

    if(dateEl) dateEl.innerText = data.timestamp?.toDate().toLocaleString() || '';
    if(folderEl) folderEl.innerText = data.folder || 'General';

    const embed = Utils.getUniversalEmbedHTML(data.text);
    let html = embed || (data.text ? marked.parse(data.text) : '');
    
    if(data.type === 'image') {
        html = `<img src="${data.fileUrl}" style="max-width:100%; border-radius:8px; margin-bottom:15px;">` + html;
    }
    
    content.innerHTML = html;
    modal.style.display = 'flex';
}

// ৩. সব বাটনের ইভেন্ট লিসেনার সেটআপ
export function setupModals() {
    const contextMenu = document.getElementById('contextMenu');
    const editModal = document.getElementById('editModal');
    const shareModal = document.getElementById('shareModal');
    const readModal = document.getElementById('readModal');

    // --- অ্যাকশন বাটন ---

    // Delete (Trash)
    document.getElementById('ctx-trash')?.addEventListener('click', () => {
        if(currentEditId) {
            if(confirm("Move this note to Trash?")) {
                DBService.moveToTrashDB(currentEditId);
            }
            contextMenu.style.display = 'none';
        }
    });

    // Pin / Unpin
    document.getElementById('ctx-pin')?.addEventListener('click', async () => {
        if(currentEditId) {
            const docSnap = await getDoc(doc(db, "notes", currentEditId));
            if(docSnap.exists()) {
                DBService.togglePinDB(currentEditId, docSnap.data().isPinned);
            }
            contextMenu.style.display = 'none';
        }
    });

    // Copy
    document.getElementById('ctx-copy')?.addEventListener('click', async () => {
        if(currentEditId) {
            const docSnap = await getDoc(doc(db, "notes", currentEditId));
            if(docSnap.exists()) {
                const text = docSnap.data().text || docSnap.data().fileUrl;
                navigator.clipboard.writeText(text);
                alert("Copied to clipboard!");
            }
            contextMenu.style.display = 'none';
        }
    });

    // Edit
    document.getElementById('ctx-edit')?.addEventListener('click', async () => {
        if(currentEditId) {
            const docSnap = await getDoc(doc(db, "notes", currentEditId));
            if(docSnap.exists()) {
                document.getElementById('editNoteInput').value = docSnap.data().text || "";
                editModal.style.display = 'flex';
            }
            contextMenu.style.display = 'none';
        }
    });

    // Update Note (Edit Save)
    document.getElementById('updateNoteBtn')?.addEventListener('click', async () => {
        if(currentEditId) {
            await DBService.updateNoteContentDB(currentEditId, document.getElementById('editNoteInput').value);
            editModal.style.display = 'none';
        }
    });

    // Share
    document.getElementById('ctx-share')?.addEventListener('click', () => {
        shareModal.style.display = 'flex';
        contextMenu.style.display = 'none';
    });

    // --- ক্লোজ লজিক ---
    
    // বাইরে ক্লিক করলে মেনু বন্ধ হবে
    window.addEventListener('click', (e) => {
        if(contextMenu && contextMenu.style.display === 'block') {
            if (!contextMenu.contains(e.target) && !e.target.classList.contains('context-trigger')) {
                contextMenu.style.display = 'none';
            }
        }
        if (e.target === readModal) readModal.style.display = 'none';
        if (e.target === editModal) editModal.style.display = 'none';
        if (e.target === shareModal) shareModal.style.display = 'none';
    });

    // ক্লোজ বাটনস
    document.getElementById('closeReadModalBtn')?.addEventListener('click', () => readModal.style.display = 'none');
    document.querySelector('#editModal .close-modal')?.addEventListener('click', () => editModal.style.display = 'none');
    document.querySelector('#shareModal .close-modal')?.addEventListener('click', () => shareModal.style.display = 'none');
}