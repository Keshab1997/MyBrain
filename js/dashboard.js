// js/dashboard.js

import { db, auth, storage } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { collection, addDoc, query, where, onSnapshot, serverTimestamp, deleteDoc, doc, orderBy } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import { ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";

// ১. অথেনটিকেশন চেক
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html";
    } else {
        loadUserNotes(user.uid);
    }
});

// ২. লগআউট
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = "index.html");
    });
}

// ৩. সেভ লজিক
const saveBtn = document.getElementById('saveBtn');
const noteInput = document.getElementById('noteInput');
const fileInput = document.getElementById('fileInput');
const statusText = document.getElementById('uploadStatus');

if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        const text = noteInput.value;
        const file = fileInput.files[0];
        const user = auth.currentUser;

        if (!text && !file) return alert("Empty note!");

        saveBtn.disabled = true;
        saveBtn.innerText = "Saving...";
        if (statusText) statusText.style.display = 'block';

        try {
            let fileUrl = null;
            let fileType = null;

            if (file) {
                const storageRef = ref(storage, `uploads/${user.uid}/${Date.now()}_${file.name}`);
                await uploadBytes(storageRef, file);
                fileUrl = await getDownloadURL(storageRef);
                fileType = file.type.startsWith('image/') ? 'image' : 'file';
            }

            // লিংকের জন্য টাইপ ডিটেকশন
            let type = 'text';
            if (fileUrl) type = fileType;
            else if (isValidURL(text)) type = 'link';

            await addDoc(collection(db, "notes"), {
                uid: user.uid,
                text: text,
                fileUrl: fileUrl,
                type: type,
                timestamp: serverTimestamp()
            });

            noteInput.value = "";
            fileInput.value = "";

        } catch (error) {
            console.error("Error:", error);
            alert("Error saving.");
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerText = "Save to Brain";
            if (statusText) statusText.style.display = 'none';
        }
    });
}

// URL চেক করার ফাংশন
function isValidURL(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;  
    }
}

// ৪. ডাটা লোড এবং প্রিভিউ জেনারেট
function loadUserNotes(uid) {
    const q = query(collection(db, "notes"), where("uid", "==", uid), orderBy("timestamp", "desc"));
    const grid = document.getElementById('content-grid');

    onSnapshot(q, (snapshot) => {
        grid.innerHTML = ""; 
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            const card = document.createElement('div');
            card.className = 'card';
            
            let contentHTML = '';

            // ---- IMAGE ----
            if (data.type === 'image') {
                contentHTML += `<img src="${data.fileUrl}" alt="Image">`;
                if(data.text) contentHTML += `<p>${data.text}</p>`;
            }
            // ---- LINK (Advanced Preview) ----
            else if (data.type === 'link') {
                const previewId = `preview-${id}`;
                // প্রথমে লোডিং বা সাধারণ লিংক দেখাবো
                contentHTML += `
                    <div id="${previewId}" class="link-preview-box">
                        <a href="${data.text}" target="_blank" class="raw-link">🔗 Loading preview...</a>
                    </div>
                `;
                // ব্যাকগ্রাউন্ডে প্রিভিউ ফেচ করবো
                fetchLinkPreview(data.text, previewId);
            } 
            // ---- TEXT / FILE ----
            else {
                if(data.text) contentHTML += `<p>${data.text}</p>`;
                if (data.type === 'file') {
                    contentHTML += `<br><a href="${data.fileUrl}" target="_blank" class="file-btn">⬇ Download File</a>`;
                }
            }

            // Delete Button
            contentHTML += `<div class="card-footer"><button class="delete-btn" onclick="deleteNote('${id}')">🗑</button></div>`;

            card.innerHTML = contentHTML;
            grid.appendChild(card);
        });
    });
}

// ৫. লিংক প্রিভিউ নিয়ে আসার ম্যাজিক ফাংশন (API)
async function fetchLinkPreview(url, elementId) {
    try {
        // Microlink API কল করা হচ্ছে
        const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`);
        const result = await response.json();
        
        const data = result.data;
        const el = document.getElementById(elementId);

        if (el && result.status === 'success') {
            el.innerHTML = `
                <a href="${url}" target="_blank" class="preview-card-link">
                    ${data.image ? `<div class="preview-img" style="background-image: url('${data.image.url}')"></div>` : ''}
                    <div class="preview-info">
                        <h4 class="preview-title">${data.title || url}</h4>
                        <p class="preview-desc">${data.description || 'No description available'}</p>
                        <small class="preview-site">${data.publisher || new URL(url).hostname}</small>
                    </div>
                </a>
            `;
        } else {
            // যদি প্রিভিউ না পায়, সাধারণ লিংক রেখে দাও
            const el = document.getElementById(elementId);
            if(el) el.innerHTML = `<a href="${url}" target="_blank" class="raw-link">🔗 ${url}</a>`;
        }
    } catch (error) {
        console.error("Preview failed", error);
    }
}

// ৬. ডিলিট ফাংশন
window.deleteNote = async (id) => {
    if(confirm("Delete this?")) {
        await deleteDoc(doc(db, "notes", id));
    }
};