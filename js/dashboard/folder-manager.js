// js/dashboard-core/folder-manager.js
import { db } from "../core/firebase-config.js";
import { collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as DBService from "../core/firebase-service.js";
import { loadNotes } from "./note-manager.js"; // ফোল্ডারে ক্লিক করলে নোট লোড হবে

let unsubscribeFolders = null;

export function setupFolders(uid) {
    // ১. ফোল্ডার লোড
    const q = query(collection(db, "folders"), where("uid", "==", uid), orderBy("createdAt", "asc"));
    if(unsubscribeFolders) unsubscribeFolders();

    unsubscribeFolders = onSnapshot(q, (snapshot) => {
        const list = document.getElementById('custom-folder-list');
        const select = document.getElementById('folderSelect');
        if(list) list.innerHTML = "";
        if(select) select.innerHTML = `<option value="General">General</option>`;

        // General Folder
        if(list) {
            const div = document.createElement('div');
            div.className = 'folder-chip'; div.innerText = "📁 General";
            div.onclick = () => filterByFolder(uid, 'General', div);
            list.appendChild(div);
        }

        snapshot.forEach((d) => {
            const fName = d.data().name;
            if(select) select.innerHTML += `<option value="${fName}">${fName}</option>`;
            
            if(list) {
                const btn = document.createElement('div');
                btn.className = 'folder-chip';
                btn.innerHTML = `<span>📁 ${fName}</span> <span class="del">×</span>`;
                btn.querySelector('.del').onclick = (e) => {
                    e.stopPropagation();
                    if(confirm("Delete folder?")) DBService.deleteFolderDB(uid, d.id, fName);
                };
                btn.onclick = () => filterByFolder(uid, fName, btn);
                list.appendChild(btn);
            }
        });
    });

    // ২. ফোল্ডার তৈরি
    const createBtn = document.getElementById('createFolderBtn');
    if(createBtn) {
        createBtn.onclick = () => {
            const name = prompt("Folder Name:");
            if(name) DBService.createFolderDB(uid, name.trim());
        };
    }
}

function filterByFolder(uid, name, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.folder-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    loadNotes(uid, 'folder', name);
}