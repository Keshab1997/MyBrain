// ১. কনফিগারেশন ইমপোর্ট
import { auth, db } from "./firebase-config.js"; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, deleteDoc, doc, updateDoc, getDoc, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================
// 👇 Cloudinary সেটআপ
const CLOUDINARY_CLOUD_NAME = "dfi0mg8bb"; 
const CLOUDINARY_PRESET = "i2tvy1m9";    
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// 👇 Cloudflare Worker URL
const WORKER_URL = "https://royal-rain-33fa.keshabsarkar2018.workers.dev";
// ============================================

// স্পিনার স্টাইল
const style = document.createElement('style');
style.innerHTML = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  .loader-spin { animation: spin 1s linear infinite; border: 2px solid #ddd; border-top: 2px solid #007bff; border-radius: 50%; width: 16px; height: 16px; display: inline-block; }
`;
document.head.appendChild(style);

// --- গ্লোবাল ভেরিয়েবল ---
let unsubscribeNotes = null;
let unsubscribeFolders = null; 
let androidSharedImage = null; 
let currentActiveFolder = 'All'; // ডিফল্ট ভিউ

// --- DOM এলিমেন্টস ---
const logoutBtn = document.getElementById('menu-logout-btn'); 
const saveBtn = document.getElementById('saveBtn');
const noteInput = document.getElementById('noteInput');
const fileInput = document.getElementById('fileInput');
const statusText = document.getElementById('uploadStatus');
const searchInput = document.getElementById('searchInput');

// ফোল্ডার এলিমেন্টস
const createFolderBtn = document.getElementById('createFolderBtn');
const customFolderList = document.getElementById('custom-folder-list');
const folderSelect = document.getElementById('folderSelect');

// প্রিভিউ এলিমেন্টস
const previewContainer = document.getElementById('image-preview-container');
const previewImage = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image-btn');
const triggerFile = document.getElementById('triggerFile');

// মোডাল এবং মেনু
const editModal = document.getElementById('editModal');
const editNoteInput = document.getElementById('editNoteInput');
const updateNoteBtn = document.getElementById('updateNoteBtn');
const closeModalBtn = document.querySelector('.close-modal');
const contextMenu = document.getElementById('contextMenu');
const shareModal = document.getElementById('shareModal');

let currentEditId = null; 

// --- [অ্যাপ কানেকশন] ---
window.receiveImageFromApp = function(base64Data) {
    if (base64Data) {
        androidSharedImage = base64Data;
        if (previewImage && previewContainer) {
            previewImage.src = base64Data;
            previewContainer.style.display = 'block';
            if(statusText) {
                statusText.innerText = "Image received from App! Click Save.";
                statusText.style.display = 'block';
                statusText.style.color = "green";
            }
        }
    }
};

// --- ১. অথেনটিকেশন ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        if (unsubscribeNotes) unsubscribeNotes();
        if (unsubscribeFolders) unsubscribeFolders();
        window.location.href = "index.html"; 
    } else {
        loadUserFolders(user.uid);
        loadUserNotes(user.uid, 'All');
        handleSharedContent(user.uid);
        
        const navUserName = document.getElementById('nav-user-name');
        const navUserImg = document.getElementById('nav-user-img');
        const navProfileDiv = document.getElementById('nav-mini-profile');

        if(navProfileDiv) navProfileDiv.style.display = 'flex';
        if(navUserName) navUserName.textContent = user.displayName || user.email.split('@')[0];
        if(navUserImg && user.photoURL) navUserImg.src = user.photoURL;
    }
});

// --- ২. ফোল্ডার ম্যানেজমেন্ট (Create, Load, Delete) ---

// A. নতুন ফোল্ডার তৈরি
if(createFolderBtn) {
    createFolderBtn.addEventListener('click', async () => {
        const folderName = prompt("Enter new folder name:");
        if(folderName && folderName.trim() !== "") {
            const cleanName = folderName.trim();
            const user = auth.currentUser;
            try {
                await addDoc(collection(db, "folders"), {
                    uid: user.uid,
                    name: cleanName,
                    createdAt: serverTimestamp()
                });
            } catch (e) {
                console.error("Error creating folder:", e);
                alert("Could not create folder.");
            }
        }
    });
}

// B. ফোল্ডার লোড (UI জেনারেশন)
function loadUserFolders(uid) {
    const q = query(collection(db, "folders"), where("uid", "==", uid), orderBy("createdAt", "asc"));
    
    if(unsubscribeFolders) unsubscribeFolders();

    unsubscribeFolders = onSnapshot(q, (snapshot) => {
        if(customFolderList) customFolderList.innerHTML = "";
        if(folderSelect) folderSelect.innerHTML = `<option value="General">General</option>`;

        // "General" বাটন (স্থায়ী)
        if(customFolderList) {
            const genBtn = document.createElement('div');
            genBtn.className = `folder-chip ${currentActiveFolder === 'General' ? 'active' : ''}`;
            genBtn.innerText = "📁 General";
            genBtn.onclick = () => filterByFolder('General', genBtn);
            customFolderList.appendChild(genBtn);
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const fName = data.name;
            const fId = docSnap.id;

            // 1. লিস্টে চিপ যোগ করা
            if(customFolderList) {
                const btn = document.createElement('div');
                btn.className = `folder-chip ${currentActiveFolder === fName ? 'active' : ''}`;
                
                // নাম
                const nameSpan = document.createElement('span');
                nameSpan.innerText = `📁 ${fName}`;
                btn.appendChild(nameSpan);

                // ❌ ডিলিট বাটন
                const delIcon = document.createElement('span');
                delIcon.className = 'folder-delete-btn';
                delIcon.innerHTML = '×';
                delIcon.title = "Delete Folder";
                
                // ডিলিট ইভেন্ট
                delIcon.onclick = (e) => {
                    e.stopPropagation(); // ফোল্ডার ওপেন যেন না হয়
                    deleteCustomFolder(fId, fName);
                };

                btn.appendChild(delIcon);

                // চিপে ক্লিক করলে ফিল্টার হবে
                btn.onclick = () => filterByFolder(fName, btn);
                customFolderList.appendChild(btn);
            }

            // 2. ড্রপডাউনে অপশন যোগ করা
            if(folderSelect) {
                const option = document.createElement('option');
                option.value = fName;
                option.innerText = fName;
                folderSelect.appendChild(option);
            }
        });
    });
}

// C. ফোল্ডার ডিলিট লজিক (নোট মুভ করা সহ)
async function deleteCustomFolder(folderId, folderName) {
    if(!confirm(`Delete folder "${folderName}"?\n\nNotes inside will be moved to 'General'.`)) {
        return;
    }

    try {
        const uid = auth.currentUser.uid;
        const batch = writeBatch(db);

        // এই ফোল্ডারের সব নোট খুঁজে General এ পাঠানো
        const q = query(collection(db, "notes"), where("uid", "==", uid), where("folder", "==", folderName));
        const notesSnapshot = await getDocs(q);

        notesSnapshot.forEach((noteDoc) => {
            batch.update(noteDoc.ref, { folder: "General" });
        });

        // ফোল্ডার ডিলিট
        const folderRef = doc(db, "folders", folderId);
        batch.delete(folderRef);

        await batch.commit();

        // ভিউ রিসেট
        if(currentActiveFolder === folderName) {
            if(customFolderList.firstChild) filterByFolder('General', customFolderList.firstChild);
        }

    } catch (error) {
        console.error("Error deleting folder:", error);
        alert("Failed to delete folder.");
    }
}

// D. ফোল্ডার ফিল্টার ফাংশন
function filterByFolder(folderName, clickedBtn) {
    currentActiveFolder = folderName;
    const uid = auth.currentUser.uid;
    
    // UI আপডেট
    document.querySelectorAll('.folder-chip').forEach(b => b.classList.remove('active'));
    if(clickedBtn) clickedBtn.classList.add('active');

    // সিস্টেম ফিল্টার রিসেট
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));

    // ফোল্ডার বদলালে সার্চ বক্স খালি করা
    if(searchInput) searchInput.value = "";

    loadUserNotes(uid, 'folder', folderName);
}

// --- ৩. সার্চ লজিক ---
function applySearchFilter(searchText) {
    const lowerText = searchText.toLowerCase();
    const cards = document.querySelectorAll('.note-card');

    cards.forEach(card => {
        const textContent = card.innerText.toLowerCase();
        const type = card.getAttribute('data-type') || '';
        
        if (textContent.includes(lowerText) || type.includes(lowerText)) {
            card.style.display = 'inline-block'; 
        } else {
            card.style.display = 'none';
        }
    });
}

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        applySearchFilter(e.target.value);
    });
}

// --- ৪. নোট সেভ (Create) ---
if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        const rawText = noteInput.value;
        const file = fileInput.files[0];
        const user = auth.currentUser;
        
        const selectedColor = document.querySelector('input[name="noteColor"]:checked')?.value || "#ffffff";
        const targetFolder = folderSelect ? folderSelect.value : "General";

        if (!rawText && !file && !androidSharedImage) return alert("Write something or add a file!");

        const text = normalizeUrl(rawText);
        saveBtn.disabled = true;
        
        try {
            let fileUrl = null;
            let type = 'text';
            let linkMeta = {};

            if (file || androidSharedImage) {
                saveBtn.innerText = "Uploading Image...";
                const formData = new FormData();
                if (file) formData.append('file', file);
                else if (androidSharedImage) formData.append('file', androidSharedImage);
                formData.append('upload_preset', CLOUDINARY_PRESET); 

                const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
                if (!response.ok) throw new Error('Image upload failed');
                const cloudData = await response.json();
                fileUrl = cloudData.secure_url; 
                type = 'image';
            } 
            else if (isValidURL(text)) {
                type = 'link';
                saveBtn.innerText = "Fetching Preview..."; 
                linkMeta = await getLinkPreviewData(text);
            }

            saveBtn.innerText = "Saving...";
            await addDoc(collection(db, "notes"), {
                uid: user.uid,
                text: text, 
                fileUrl: fileUrl, 
                type: type,
                color: selectedColor,
                folder: targetFolder, // ফোল্ডার সেভ
                isPinned: false,
                status: 'active',
                metaTitle: linkMeta.title || null,
                metaDesc: linkMeta.description || null,
                metaImg: linkMeta.image || null,
                metaDomain: linkMeta.domain || null,
                isLoadingMeta: false, 
                timestamp: serverTimestamp()
            });

            noteInput.value = "";
            clearFileInput(); 
            if(document.querySelector('input[value="#ffffff"]')) 
                document.querySelector('input[value="#ffffff"]').checked = true;

        } catch (error) {
            console.error("Error saving:", error);
            alert("Error: " + error.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerText = "Save to Brain";
        }
    });
}

// --- ৫. নোট লোড (Read & Filter) ---
function loadUserNotes(uid, filterType = 'All', filterValue = null) {
    const notesRef = collection(db, "notes");
    let q;

    // A. Trash
    if (filterType === 'trash') {
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "trash"), orderBy("timestamp", "desc"));
        if(document.getElementById('pinned-section')) 
            document.getElementById('pinned-section').style.display = 'none';
    } 
    // B. Folder
    else if (filterType === 'folder') {
        loadPinnedNotes(uid); 
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), where("folder", "==", filterValue), orderBy("timestamp", "desc"));
    }
    // C. Type
    else if (filterType !== 'All' && filterType !== 'all') {
        loadPinnedNotes(uid);
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), where("type", "==", filterType), orderBy("timestamp", "desc"));
    } 
    // D. All
    else {
        loadPinnedNotes(uid);
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), orderBy("timestamp", "desc"));
    }
    
    const grid = document.getElementById('content-grid'); 
    if (unsubscribeNotes) unsubscribeNotes();

    unsubscribeNotes = onSnapshot(q, (snapshot) => {
        if(!grid) return;
        grid.innerHTML = ""; 
        
        if(snapshot.empty) {
            grid.innerHTML = `<p style="text-align:center; color:#999; width:100%; margin-top:20px;">No notes found here.</p>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (filterType !== 'trash' && data.isPinned) return;
            const card = createNoteCard(docSnap);
            grid.appendChild(card);
        });
        
        // লোড হওয়ার পর যদি সার্চ বক্সে কিছু লেখা থাকে, তবে ফিল্টার করা
        if (searchInput && searchInput.value.trim() !== "") {
            applySearchFilter(searchInput.value);
        }
        
        // ড্র্যাগ কনফিগারেশন
        if (typeof Sortable !== 'undefined') {
             if (grid.sortableInstance) grid.sortableInstance.destroy();
             grid.sortableInstance = new Sortable(grid, { 
                 animation: 150, 
                 ghostClass: 'sortable-ghost',
                 handle: '.drag-handle',
                 delay: 0, 
             });
        }
    });
}

// --- ৬. পিন নোট লোড ---
function loadPinnedNotes(uid) {
    const q = query(collection(db, "notes"), where("uid", "==", uid), where("isPinned", "==", true), where("status", "==", "active"));
    const pinSection = document.getElementById('pinned-section');
    const pinGrid = document.getElementById('pinned-grid');
    
    if(!pinSection || !pinGrid) return;

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            pinSection.style.display = 'none';
        } else {
            pinSection.style.display = 'block';
            pinGrid.innerHTML = "";
            snapshot.forEach((docSnap) => {
                const card = createNoteCard(docSnap);
                pinGrid.appendChild(card);
            });
        }
    });
}

// --- ৭. কার্ড জেনারেটর ---
function createNoteCard(docSnap) {
    const data = docSnap.data();
    const id = docSnap.id;
    
    const card = document.createElement('div');
    card.className = 'note-card'; 
    card.setAttribute('data-id', id);
    card.setAttribute('data-type', data.type || 'text');
    
    if(data.color) card.style.backgroundColor = data.color;

    // Drag Handle
    const dragIcon = document.createElement('div');
    dragIcon.className = 'drag-handle';
    dragIcon.innerHTML = '⋮⋮'; 
    card.appendChild(dragIcon);
    
    // Pin Icon
    if(data.isPinned) {
        const pinIcon = document.createElement('div');
        pinIcon.className = 'pin-indicator';
        pinIcon.innerHTML = '📌';
        card.appendChild(pinIcon);
    }

    // Folder Badge (যদি General না হয়)
    if(data.folder && data.folder !== 'General') {
        const folderBadge = document.createElement('span');
        folderBadge.style.cssText = "position:absolute; top:8px; right:8px; background:rgba(0,0,0,0.1); font-size:10px; padding:2px 6px; border-radius:10px; color:#555;";
        folderBadge.innerText = data.folder;
        card.appendChild(folderBadge);
    }

    let contentHTML = '';

    // A. Image
    if (data.type === 'image') {
        contentHTML += `<img src="${data.fileUrl}" loading="lazy" alt="Image" style="width:100%; border-radius: 8px; display:block;">`;
        if(data.text) contentHTML += `<div class="note-text" style="margin-top:10px;">${processNoteContent(data.text)}</div>`;
    }
    // B. Link
    else if (data.type === 'link') {
        if (data.metaTitle) {
            contentHTML += `
            <a href="${data.text}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:inherit; display:block; border:1px solid rgba(0,0,0,0.1); border-radius:10px; overflow:hidden; background: rgba(255,255,255,0.5);">
                ${data.metaImg ? `<div style="height:140px; background-image: url('${data.metaImg}'); background-size: cover; background-position: center;"></div>` : ''}
                <div style="padding:10px;">
                    <h4 style="margin:0 0 5px 0; font-size:14px; line-height:1.4;">${escapeHtml(data.metaTitle)}</h4>
                    <div style="font-size:11px; opacity:0.7;">🔗 ${escapeHtml(data.metaDomain || 'Link')}</div>
                </div>
            </a>`;
        } else if (data.isLoadingMeta) {
            contentHTML += `<div style="padding:10px; font-size:12px; opacity:0.7;">Loading preview...</div>`;
        } else {
            contentHTML += `<a href="${data.text}" target="_blank" style="word-break:break-all;">${data.text}</a>`;
        }
    } 
    // C. Text
    else {
        contentHTML += `<div class="note-text">${processNoteContent(data.text)}</div>`;
    }

    const dateString = data.timestamp ? data.timestamp.toDate().toLocaleDateString() : '';
    
    // Footer
    contentHTML += `
        <div class="card-footer">
            <small class="card-date">${dateString}</small>
            <button class="delete-btn" onclick="openContextMenu(event, '${id}')">⋮</button> 
        </div>
    `;

    card.innerHTML += contentHTML; 
    
    card.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showContextMenu(e.pageX, e.pageY, id, data);
    });

    return card;
}

// --- ৮. কনটেক্সট মেনু ---
function showContextMenu(x, y, id, data) {
    currentEditId = id;
    if(!contextMenu) return;

    contextMenu.style.top = `${y}px`;
    contextMenu.style.left = `${x}px`;
    contextMenu.style.display = 'block';
    
    const trashBtn = document.getElementById('ctx-trash');
    if(trashBtn) trashBtn.onclick = () => moveToTrash(id);

    const editBtn = document.getElementById('ctx-edit');
    if(editBtn) editBtn.onclick = () => openEditModal(id, data ? data.text : "");

    const copyBtn = document.getElementById('ctx-copy');
    if(copyBtn) copyBtn.onclick = () => {
        navigator.clipboard.writeText(data ? data.text : "");
        contextMenu.style.display = 'none';
        alert("Copied!");
    };
    
    const pinBtn = document.getElementById('ctx-pin');
    if(pinBtn) {
        pinBtn.innerHTML = data && data.isPinned ? "🚫 Unpin" : "📌 Pin";
        pinBtn.onclick = () => togglePin(id, !data.isPinned);
    }

    const shareBtn = document.getElementById('ctx-share');
    if (shareBtn) shareBtn.onclick = () => handleShare(data);

    const downloadBtn = document.getElementById('ctx-download');
    if (downloadBtn) downloadBtn.onclick = () => handleDownload(data);
}

// --- শেয়ার লজিক ---
async function handleShare(data) {
    if(contextMenu) contextMenu.style.display = 'none';
    if (!data) return;

    const shareTitle = 'MyBrain Note';
    const shareText = data.text || '';
    const shareUrl = (data.type === 'image' || data.type === 'link') ? (data.fileUrl || data.text) : ''; 
    const fullShareText = `${shareText}\n${shareUrl}`.trim();

    // মোবাইল নেটিভ শেয়ার
    if (navigator.share) {
        try {
            await navigator.share({
                title: shareTitle,
                text: shareText,
                url: shareUrl || window.location.href 
            });
            return; 
        } catch (err) { console.log('Native share closed'); }
    }

    // ডেস্কটপ মোডাল
    if(shareModal) {
        shareModal.style.display = 'flex';
        const encodedText = encodeURIComponent(fullShareText);
        const encodedUrl = encodeURIComponent(shareUrl);

        document.getElementById('share-wa').onclick = () => window.open(`https://api.whatsapp.com/send?text=${encodedText}`, '_blank');
        document.getElementById('share-fb').onclick = () => {
            if(shareUrl) window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank');
            else alert("Needs a link/image!");
        };
        document.getElementById('share-tg').onclick = () => window.open(`https://t.me/share/url?url=${encodedUrl}&text=${encodeURIComponent(shareText)}`, '_blank');
        document.getElementById('share-mail').onclick = () => window.open(`mailto:?subject=${encodeURIComponent(shareTitle)}&body=${encodedText}`, '_self');
        document.getElementById('share-copy').onclick = () => {
            navigator.clipboard.writeText(fullShareText);
            alert("Copied!");
            shareModal.style.display = 'none';
        };
    } else {
        navigator.clipboard.writeText(fullShareText);
        alert("Copied!");
    }
}

// --- ডাউনলোড লজিক ---
async function handleDownload(data) {
    if(contextMenu) contextMenu.style.display = 'none';
    if (!data) return;

    if (data.type === 'image' && data.fileUrl) {
        try {
            const response = await fetch(data.fileUrl);
            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `image_${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (e) { window.open(data.fileUrl, '_blank'); }
    } 
    else if (data.type === 'link') {
        const shortcutContent = `[InternetShortcut]\nURL=${data.text}`;
        const blob = new Blob([shortcutContent], { type: 'text/plain' });
        const a = document.createElement('a');
        a.download = `link_${Date.now()}.url`;
        a.href = window.URL.createObjectURL(blob);
        a.click();
    } 
    else {
        const blob = new Blob([data.text], { type: 'text/plain' });
        const a = document.createElement('a');
        a.download = `note_${Date.now()}.txt`;
        a.href = window.URL.createObjectURL(blob);
        a.click();
    }
}

// --- অন্যান্য ইভেন্ট হ্যান্ডলার ---

// সিস্টেম ফিল্টার (All, Notes...)
const filterBtns = document.querySelectorAll('.filter-btn');
filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        filterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        
        document.querySelectorAll('.folder-chip').forEach(b => b.classList.remove('active'));
        currentActiveFolder = null; 

        if(searchInput) searchInput.value = ""; // সার্চ ক্লিয়ার

        const filterType = btn.getAttribute('data-filter');
        loadUserNotes(auth.currentUser.uid, filterType);
    });
});

// ফাইল ইনপুট
if(triggerFile && fileInput) triggerFile.addEventListener('click', () => fileInput.click());
if(fileInput) {
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if(file) {
            androidSharedImage = null; 
            const reader = new FileReader();
            reader.onload = function(e) {
                previewImage.src = e.target.result;
                previewContainer.style.display = 'block';
            }
            reader.readAsDataURL(file);
            triggerFile.style.color = '#007bff'; 
        }
    });
}
if(removeImageBtn) removeImageBtn.addEventListener('click', clearFileInput);

// --- ইউটিলিটি ---
async function moveToTrash(id) {
    if(confirm("Move to trash?")) {
        try {
            await updateDoc(doc(db, "notes", id), { status: 'trash' });
            if(contextMenu) contextMenu.style.display = 'none';
        } catch (e) { console.error(e); }
    }
}

async function togglePin(id, newStatus) {
    try {
        await updateDoc(doc(db, "notes", id), { isPinned: newStatus });
        if(contextMenu) contextMenu.style.display = 'none';
    } catch (e) { console.error(e); }
}

function openEditModal(id, text) {
    currentEditId = id;
    if(editNoteInput) editNoteInput.value = text;
    if(editModal) editModal.style.display = 'flex';
    if(contextMenu) contextMenu.style.display = 'none';
}

if(updateNoteBtn) {
    updateNoteBtn.addEventListener('click', async () => {
        if(!currentEditId) return;
        const newText = editNoteInput.value;
        try {
            await updateDoc(doc(db, "notes", currentEditId), { text: newText, timestamp: serverTimestamp() });
            if(editModal) editModal.style.display = 'none';
        } catch (error) { alert("Update failed: " + error.message); }
    });
}

// হেল্পারস
function normalizeUrl(input) { if (!input) return ""; let url = input.trim(); if (url && !url.startsWith('http') && url.includes('.') && !url.includes(' ')) return 'https://' + url; return url; }
function processNoteContent(text) { if (!text) return ""; let html = marked.parse(text); html = html.replace(/#(\w+)/g, '<span class="note-tag">#$1</span>'); return html; }
function escapeHtml(text) { if (!text) return ""; return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function clearFileInput() { fileInput.value = ""; androidSharedImage = null; previewContainer.style.display = 'none'; statusText.style.display = 'none'; triggerFile.style.color = ""; }
function isValidURL(string) { try { return new URL(string).protocol.startsWith("http"); } catch (_) { return false; } }
async function getLinkPreviewData(url) { try { const res = await fetch(`${WORKER_URL}?url=${encodeURIComponent(url)}`); const r = await res.json(); return r.status==='success' ? r.data : {title:url}; } catch { return {title:url}; } }

// Auto-save (Android)
async function handleSharedContent(userId) {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedRaw = urlParams.get('note') || urlParams.get('text');
    if (sharedRaw && sharedRaw.trim() !== "") {
        try {
            let decodedContent = decodeURIComponent(sharedRaw).trim();
            decodedContent = normalizeUrl(decodedContent);
            if(noteInput) noteInput.value = "Saving...";
            let type = isValidURL(decodedContent) ? 'link' : 'text';

            const docRef = await addDoc(collection(db, "notes"), {
                uid: userId,
                text: decodedContent,
                type: type,
                source: "android_share",
                folder: "General",
                timestamp: serverTimestamp(),
                color: "#ffffff",
                isPinned: false,
                status: 'active',
                metaTitle: null,
                isLoadingMeta: type === 'link'
            });
            window.history.replaceState({}, document.title, window.location.pathname);
            if(noteInput) noteInput.value = "Saved!";
            if (type === 'link') {
                getLinkPreviewData(decodedContent).then(async (linkMeta) => {
                    await updateDoc(docRef, { metaTitle: linkMeta.title, metaDesc: linkMeta.description, metaImg: linkMeta.image, metaDomain: linkMeta.domain, isLoadingMeta: false });
                });
            }
            setTimeout(() => { if(noteInput && noteInput.value === "Saved!") noteInput.value = ""; }, 2000);
        } catch (error) { console.error("Auto-save failed:", error); }
    }
}

// লগআউট এবং ক্লোজিং
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault(); 
        signOut(auth).then(() => window.location.href = "index.html");
    });
}
document.addEventListener('click', (e) => {
    if(contextMenu) contextMenu.style.display = 'none';
    if(shareModal && e.target == shareModal) shareModal.style.display = 'none';
});
if(closeModalBtn) closeModalBtn.onclick = () => editModal.style.display = 'none';
window.onclick = (e) => { if(e.target == editModal) editModal.style.display = 'none'; };
window.openContextMenu = async (e, id) => {
    e.stopPropagation();
    const docSnap = await getDoc(doc(db, "notes", id));
    if(docSnap.exists()){
        const rect = e.target.getBoundingClientRect();
        let x = rect.left - 120;
        let y = rect.bottom;
        if (x < 0) x = 10;
        showContextMenu(x, y, id, docSnap.data());
    }
};