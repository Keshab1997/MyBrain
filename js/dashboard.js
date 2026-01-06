// ১. কনফিগারেশন ইমপোর্ট
import { auth, db } from "./firebase-config.js"; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, deleteDoc, doc, updateDoc, getDoc, writeBatch, getDocs } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================
// 👇 Cloudinary সেটআপ
const CLOUDINARY_CLOUD_NAME = "dfi0mg8bb"; 
const CLOUDINARY_PRESET = "i2tvy1m9";    
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
const WORKER_URL = "https://royal-rain-33fa.keshabsarkar2018.workers.dev";
// ============================================

// --- গ্লোবাল ভেরিয়েবল ---
let unsubscribeNotes = null;
let unsubscribeFolders = null; 
let unsubscribeTrashCount = null;
let androidSharedImage = null; 
let currentEditId = null; 
let currentViewType = 'all';

// --- DOM এলিমেন্টস ---
const logoutBtn = document.getElementById('menu-logout-btn'); 
const saveBtn = document.getElementById('saveBtn');
const noteInput = document.getElementById('noteInput');
const fileInput = document.getElementById('fileInput');
const statusText = document.getElementById('uploadStatus');
const searchInput = document.getElementById('searchInput');

// ফোল্ডার এবং ভিউ এলিমেন্টস
const createFolderBtn = document.getElementById('createFolderBtn');
const customFolderList = document.getElementById('custom-folder-list');
const folderSelect = document.getElementById('folderSelect');
const contentGrid = document.getElementById('content-grid');
const gridViewBtn = document.getElementById('gridViewBtn');
const listViewBtn = document.getElementById('listViewBtn');
const trashFilterBtn = document.querySelector('.filter-btn[data-filter="trash"]'); 

// প্রিভিউ, এডিট এবং রিডিং মোডাল
const previewContainer = document.getElementById('image-preview-container');
const previewImage = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image-btn');
const triggerFile = document.getElementById('triggerFile');

// এডিট মোডাল
const editModal = document.getElementById('editModal');
const editNoteInput = document.getElementById('editNoteInput');
const updateNoteBtn = document.getElementById('updateNoteBtn');
const contextMenu = document.getElementById('contextMenu');

// রিডিং মোডাল এলিমেন্টস
const readModal = document.getElementById('readModal');
const readModalContent = document.getElementById('readModalContent'); 
const readModalDate = document.getElementById('readModalDate');
const readModalFolder = document.getElementById('readModalFolder');
const closeReadModalBtn = document.getElementById('closeReadModalBtn');
const closeModalBtn = document.querySelector('.close-modal');

// শেয়ার মোডাল এলিমেন্টস
const shareModal = document.getElementById('shareModal');
const closeShareModalBtn = document.querySelector('#shareModal .close-modal');

// --- ১. অথেনটিকেশন ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html"; 
    } else {
        loadUserFolders(user.uid);
        trackTrashCount(user.uid); 
        
        const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
        if(allBtn) allBtn.classList.add('active');
        
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

// ==================================================
// 📥 শেয়ার হ্যান্ডলার (Mobile Share Target)
// ==================================================
function handleSharedContent(uid) {
    const p = new URLSearchParams(window.location.search);
    const title = p.get('title');
    const text = p.get('text');
    
    let sharedContent = "";

    if (title && title !== "null") sharedContent += `**${title}**\n\n`;
    if (text && text !== "null") sharedContent += text;

    if(sharedContent.trim()) {
        console.log("Shared Content:", sharedContent);
        if(noteInput) {
            noteInput.value = sharedContent.trim();
            noteInput.style.height = 'auto';
            noteInput.style.height = (noteInput.scrollHeight + 10) + 'px';
            noteInput.focus();
        }
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// ==================================================
// 🗑️ ২. ট্র্যাশ ম্যানেজমেন্ট
// ==================================================
function trackTrashCount(uid) {
    const q = query(collection(db, "notes"), where("uid", "==", uid), where("status", "==", "trash"));
    if(unsubscribeTrashCount) unsubscribeTrashCount();
    unsubscribeTrashCount = onSnapshot(q, (snapshot) => {
        const count = snapshot.size;
        if(trashFilterBtn) trashFilterBtn.innerHTML = `🗑️ Trash ${count > 0 ? `(${count})` : ''}`;
    });
}

window.restoreNote = async (id) => {
    try { await updateDoc(doc(db, "notes", id), { status: 'active', timestamp: serverTimestamp() }); } 
    catch (error) { alert("Error: " + error.message); }
};

window.deleteForever = async (id) => {
    if(confirm("Are you sure? This cannot be undone.")) {
        try { await deleteDoc(doc(db, "notes", id)); } 
        catch (error) { alert("Error: " + error.message); }
    }
};

// ==================================================
// 📁 ৩. ফোল্ডার ম্যানেজমেন্ট
// ==================================================
function loadUserFolders(uid) {
    const q = query(collection(db, "folders"), where("uid", "==", uid), orderBy("createdAt", "asc"));
    if(unsubscribeFolders) unsubscribeFolders();

    unsubscribeFolders = onSnapshot(q, (snapshot) => {
        if(customFolderList) customFolderList.innerHTML = "";
        if(folderSelect) folderSelect.innerHTML = `<option value="General">General</option>`;

        if(customFolderList) {
            const genBtn = document.createElement('div');
            genBtn.className = 'folder-chip';
            genBtn.innerText = "📁 General";
            genBtn.onclick = () => filterByFolder('General', genBtn);
            customFolderList.appendChild(genBtn);
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const fName = data.name;
            const fId = docSnap.id;

            if(customFolderList) {
                const btn = document.createElement('div');
                btn.className = 'folder-chip';
                const nameSpan = document.createElement('span');
                nameSpan.innerText = `📁 ${fName}`;
                btn.appendChild(nameSpan);
                const delIcon = document.createElement('span');
                delIcon.className = 'folder-delete-btn';
                delIcon.innerHTML = '×';
                delIcon.onclick = (e) => { e.stopPropagation(); deleteCustomFolder(fId, fName); };
                btn.appendChild(delIcon);
                btn.onclick = () => filterByFolder(fName, btn);
                customFolderList.appendChild(btn);
            }
            if(folderSelect) {
                const option = document.createElement('option');
                option.value = fName;
                option.innerText = fName;
                folderSelect.appendChild(option);
            }
        });
    });
}

function filterByFolder(folderName, clickedBtn) {
    const uid = auth.currentUser.uid;
    document.querySelectorAll('.folder-chip').forEach(b => b.classList.remove('active'));
    if(clickedBtn) clickedBtn.classList.add('active');
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if(searchInput) searchInput.value = "";
    loadUserNotes(uid, 'folder', folderName);
}

if(createFolderBtn) {
    createFolderBtn.addEventListener('click', async () => {
        const folderName = prompt("Enter new folder name:");
        if(folderName && folderName.trim() !== "") {
            try {
                await addDoc(collection(db, "folders"), { uid: auth.currentUser.uid, name: folderName.trim(), createdAt: serverTimestamp() });
            } catch (e) { alert("Error creating folder"); }
        }
    });
}

async function deleteCustomFolder(folderId, folderName) {
    if(!confirm(`Delete "${folderName}"? Notes will move to 'General'.`)) return;
    try {
        const batch = writeBatch(db);
        const q = query(collection(db, "notes"), where("uid", "==", auth.currentUser.uid), where("folder", "==", folderName));
        const snaps = await getDocs(q);
        snaps.forEach((doc) => batch.update(doc.ref, { folder: "General" }));
        batch.delete(doc(db, "folders", folderId));
        await batch.commit();
        const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
        if(allBtn) allBtn.click();
    } catch (e) { alert("Delete failed"); }
}

// ==================================================
// 📝 ৪. নোট লোড এবং ভিউ লজিক
// ==================================================
function loadUserNotes(uid, filterType = 'All', filterValue = null) {
    currentViewType = filterType;
    const notesRef = collection(db, "notes");
    let q;

    const pinSection = document.getElementById('pinned-section');
    if(pinSection) pinSection.style.display = 'none';

    const inputArea = document.querySelector('.input-area');
    if(inputArea) inputArea.style.display = (filterType === 'trash') ? 'none' : 'block';

    if (filterType === 'trash') {
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "trash"), orderBy("timestamp", "desc"));
    } else if (filterType === 'folder') {
        loadPinnedNotes(uid); 
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), where("folder", "==", filterValue), orderBy("timestamp", "desc"));
    } else if (filterType !== 'All' && filterType !== 'all') {
        loadPinnedNotes(uid);
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), where("type", "==", filterType), orderBy("timestamp", "desc"));
    } else {
        loadPinnedNotes(uid);
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), orderBy("timestamp", "desc"));
    }
    
    if (unsubscribeNotes) unsubscribeNotes();

    unsubscribeNotes = onSnapshot(q, (snapshot) => {
        if(!contentGrid) return;
        contentGrid.innerHTML = ""; 
        
        if(snapshot.empty) {
            let msg = filterType === 'trash' ? "Trash is empty 🗑️" : "No notes found here.";
            contentGrid.innerHTML = `<p style="text-align:center; color:#999; width:100%; margin-top:20px;">${msg}</p>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (filterType !== 'trash' && data.isPinned) return; 
            const card = createNoteCard(docSnap, filterType === 'trash'); 
            contentGrid.appendChild(card);
        });

        if(searchInput && searchInput.value) searchInput.dispatchEvent(new Event('input'));
        
        if (typeof Sortable !== 'undefined' && filterType !== 'trash') {
             if (contentGrid.sortableInstance) contentGrid.sortableInstance.destroy();
             contentGrid.sortableInstance = new Sortable(contentGrid, { animation: 150, ghostClass: 'sortable-ghost', handle: '.drag-handle', delay: 100 });
        }
    });
}

document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        document.querySelectorAll('.folder-chip').forEach(b => b.classList.remove('active'));
        const type = btn.getAttribute('data-filter');
        loadUserNotes(auth.currentUser.uid, type);
    });
});

function loadPinnedNotes(uid) {
    const q = query(collection(db, "notes"), where("uid", "==", uid), where("isPinned", "==", true), where("status", "==", "active"));
    const pinSection = document.getElementById('pinned-section');
    const pinGrid = document.getElementById('pinned-grid');
    if(!pinSection || !pinGrid) return;

    onSnapshot(q, (snapshot) => {
        if (snapshot.empty) pinSection.style.display = 'none';
        else {
            pinSection.style.display = 'block';
            pinGrid.innerHTML = "";
            snapshot.forEach((docSnap) => { pinGrid.appendChild(createNoteCard(docSnap, false)); });
        }
    });
}

// ==================================================
// 🎨 ৫. কার্ড জেনারেটর
// ==================================================
function createNoteCard(docSnap, isTrashView) {
    const data = docSnap.data();
    const id = docSnap.id;
    const card = document.createElement('div');
    card.className = 'note-card'; 
    card.setAttribute('data-id', id);
    if(data.color) card.style.backgroundColor = data.color;

    if(!isTrashView) {
        const dragIcon = document.createElement('div');
        dragIcon.className = 'drag-handle';
        dragIcon.innerHTML = '⋮⋮'; 
        card.appendChild(dragIcon);
        if(data.isPinned) card.innerHTML += `<div class="pin-indicator">📌</div>`;
    }

    if(data.folder && !isTrashView) {
        const folderBadge = document.createElement('span');
        folderBadge.style.cssText = "position:absolute; top:8px; right:30px; background:rgba(0,0,0,0.1); font-size:10px; padding:2px 6px; border-radius:10px; color:#555;";
        folderBadge.innerText = data.folder;
        card.appendChild(folderBadge);
    }

    let contentHTML = '';

    if (data.type === 'image') {
        contentHTML += `<img src="${data.fileUrl}" loading="lazy" style="width:100%; border-radius: 8px; display:block; margin-bottom:5px;">`;
        if(data.text) contentHTML += generateTextHTML(data.text);
    }
    else if (data.type === 'link' && data.metaTitle) {
        contentHTML += `
        <a href="${data.text}" target="_blank" style="text-decoration:none; color:inherit; display:block; border:1px solid rgba(0,0,0,0.1); border-radius:10px; overflow:hidden; background: rgba(255,255,255,0.5);">
            ${data.metaImg ? `<div style="height:140px; background-image: url('${data.metaImg}'); background-size: cover; background-position: center;"></div>` : ''}
            <div style="padding:10px;">
                <h4 style="margin:0 0 5px 0; font-size:14px;">${data.metaTitle}</h4>
                <div style="font-size:11px; opacity:0.7;">🔗 ${data.metaDomain || 'Link'}</div>
            </div>
        </a>`;
    } 
    else {
        contentHTML += generateTextHTML(data.text || '');
    }

    contentHTML += `<div class="card-footer">
        <small class="card-date">${data.timestamp?.toDate().toLocaleDateString() || ''}</small>`;

    if (isTrashView) {
        contentHTML += `
            <div style="display:flex; gap:10px;">
                <button title="Restore" onclick="restoreNote('${id}')" style="background:none; border:none; cursor:pointer; font-size:16px;">♻️</button>
                <button title="Delete Forever" onclick="deleteForever('${id}')" style="background:none; border:none; cursor:pointer; font-size:16px; color:red;">❌</button>
            </div>
        `;
    } else {
        contentHTML += `<button class="delete-btn" onclick="openContextMenu(event, '${id}')">⋮</button>`;
    }
    
    contentHTML += `</div>`;
    card.innerHTML += contentHTML; 

    const readMoreBtn = card.querySelector('.read-more-btn');
    if (readMoreBtn) {
        readMoreBtn.addEventListener('click', (e) => { e.stopPropagation(); openReadModal(data, id); });
    }

    if (!isTrashView) {
        card.addEventListener('contextmenu', (e) => { e.preventDefault(); window.openContextMenu(e, id); });
    }
    return card;
}

function generateTextHTML(text) {
    if (!text) return "";
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = marked.parse(text);
    const plainText = tempDiv.textContent || tempDiv.innerText || "";
    if (plainText.length > 250) {
        const shortText = plainText.substring(0, 250) + "...";
        return `<div class="note-text">${shortText}</div><button class="read-more-btn" style="color:#007bff; border:none; background:none; padding:0; cursor:pointer; font-size:13px; margin-top:5px;">Read More...</button>`;
    } else {
        return `<div class="note-text">${marked.parse(text)}</div>`;
    }
}

// ==================================================
// 💾 ৬. নোট সেভ লজিক (Preview Guaranteed)
// ==================================================
if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        const rawText = noteInput.value;
        const file = fileInput.files[0];
        const user = auth.currentUser;
        const selectedColor = document.querySelector('input[name="noteColor"]:checked')?.value || "#ffffff";
        const targetFolder = folderSelect ? folderSelect.value : "General";

        if (!rawText && !file && !androidSharedImage) return alert("Empty note!");

        const text = normalizeUrl(rawText);
        saveBtn.disabled = true;
        saveBtn.innerText = "Saving...";
        if(statusText) statusText.style.display = 'block';
        
        try {
            let fileUrl = null;
            let type = 'text';
            let linkMeta = {};

            // ১. যদি ছবি থাকে (গ্যালারি বা অ্যাপ শেয়ার)
            if (file || androidSharedImage) {
                saveBtn.innerText = "Uploading Image...";
                const formData = new FormData();
                formData.append('file', file || androidSharedImage);
                formData.append('upload_preset', CLOUDINARY_PRESET); 
                const res = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
                const data = await res.json();
                fileUrl = data.secure_url; 
                type = 'image';
            } 
            // ২. যদি টেক্সট হয় এবং সেটা URL হয়
            else if (isValidURL(text)) {
                type = 'link';
                // 👇 এখানে টাইমআউট বাদ দেওয়া হয়েছে, প্রিভিউ না আসা পর্যন্ত অপেক্ষা করবে
                saveBtn.innerText = "Fetching Preview...";
                linkMeta = await getLinkPreviewData(text);
            }

            // ৩. ফায়ারবেসে সেভ
            saveBtn.innerText = "Saving to Brain...";
            await addDoc(collection(db, "notes"), {
                uid: user.uid, text: text, fileUrl: fileUrl, type: type,
                color: selectedColor, folder: targetFolder, isPinned: false, status: 'active',
                metaTitle: linkMeta.title || null, metaDesc: linkMeta.description || null,
                metaImg: linkMeta.image || null, metaDomain: linkMeta.domain || null,
                timestamp: serverTimestamp()
            });

            noteInput.value = "";
            clearFileInput(); 
            const allBtn = document.querySelector('.filter-btn[data-filter="all"]');
            if(allBtn) allBtn.click();

        } catch (error) { alert("Error: " + error.message); } 
        finally {
            saveBtn.disabled = false;
            saveBtn.innerText = "Save to Brain";
            if(statusText) statusText.style.display = 'none';
        }
    });
}

// ==================================================
// 📤 ৮. শেয়ার মোডাল
// ==================================================
window.openContextMenu = async (e, id) => {
    e.stopPropagation();
    currentEditId = id;
    const docSnap = await getDoc(doc(db, "notes", id));
    if(docSnap.exists()){
        const data = docSnap.data();
        if(!contextMenu) return;

        let x = e.pageX; let y = e.pageY;
        if(e.type === 'click') {
           const rect = e.target.getBoundingClientRect();
           x = rect.left - 100; y = rect.bottom + window.scrollY;
        }

        contextMenu.style.top = `${y}px`; contextMenu.style.left = `${x}px`;
        contextMenu.style.display = 'block';
        
        document.getElementById('ctx-trash').onclick = () => { updateDoc(doc(db, "notes", id), { status: 'trash' }); contextMenu.style.display = 'none'; };
        document.getElementById('ctx-edit').onclick = () => { editNoteInput.value = data.text; editModal.style.display = 'flex'; contextMenu.style.display = 'none'; };
        document.getElementById('ctx-copy').onclick = () => { navigator.clipboard.writeText(data.text); contextMenu.style.display = 'none'; };
        const pinBtn = document.getElementById('ctx-pin');
        pinBtn.innerHTML = data.isPinned ? "🚫 Unpin" : "📌 Pin";
        pinBtn.onclick = () => { updateDoc(doc(db, "notes", id), { isPinned: !data.isPinned }); contextMenu.style.display = 'none'; };
        document.getElementById('ctx-share').onclick = () => { openShareModal(id); contextMenu.style.display = 'none'; };
    }
};

function openShareModal(id) {
    if(!shareModal) return;
    currentEditId = id; 
    shareModal.style.display = 'flex';
}

document.getElementById('share-wa')?.addEventListener('click', () => shareNote('whatsapp'));
document.getElementById('share-fb')?.addEventListener('click', () => shareNote('facebook'));
document.getElementById('share-tg')?.addEventListener('click', () => shareNote('telegram'));
document.getElementById('share-mail')?.addEventListener('click', () => shareNote('email'));
document.getElementById('share-copy')?.addEventListener('click', () => shareNote('copy'));

// 👇 শেয়ার ফাংশন (Image File Share Support)
async function shareNote(platform) {
    const noteId = currentEditId;
    if (!noteId) return;

    const docSnap = await getDoc(doc(db, "notes", noteId));
    if (!docSnap.exists()) return;
    const data = docSnap.data();

    const shareUrl = window.location.origin + '/dashboard.html?note=' + encodeURIComponent(noteId);
    const textToShare = data.text || "MyBrain Note";
    const fullText = textToShare + "\n\n" + shareUrl;

    // ১. যদি অ্যাপের ভেতর থেকে ছবি শেয়ার করা হয়
    if (typeof Android !== "undefined" && Android.shareImage && data.type === 'image' && data.fileUrl) {
        Android.shareImage(data.fileUrl, textToShare);
        shareModal.style.display = 'none';
        return; 
    }

    // ২. নরমাল শেয়ার
    switch(platform) {
        case 'whatsapp': window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, '_blank'); break;
        case 'facebook': window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank'); break;
        case 'telegram': window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(textToShare)}`, '_blank'); break;
        case 'email': window.open(`mailto:?subject=${encodeURIComponent('Shared Note')}&body=${encodeURIComponent(fullText)}`, '_blank'); break;
        case 'copy': navigator.clipboard.writeText(shareUrl).then(() => alert('Link copied!')); break;
    }
    shareModal.style.display = 'none';
}

// ==================================================
// 📖 ৯. রিডিং মোডাল
// ==================================================
function openReadModal(data, id) {
    if(!readModal || !readModalContent) return;
    if(readModalDate) readModalDate.innerText = data.timestamp?.toDate().toLocaleString() || '';
    if(readModalFolder) {
        readModalFolder.style.display = data.folder ? 'inline-block' : 'none';
        readModalFolder.innerText = data.folder || '';
    }

    let html = '';
    if (data.type === 'image' && data.fileUrl) html += `<img src="${data.fileUrl}" alt="Note Image">`;
    if (data.type === 'link') {
        html += `<div style="background:#f0f2f5; padding:15px; border-radius:8px; margin-bottom:20px; border-left: 4px solid #007bff;">
            <a href="${data.text}" target="_blank" style="font-size:18px; font-weight:bold;">${data.metaTitle || data.text}</a>
            <p style="margin:5px 0 0 0; color:#666;">${data.metaDesc || ''}</p>
        </div>`;
    }
    if (data.text) html += marked.parse(data.text);

    readModalContent.innerHTML = html;
    readModal.style.display = 'flex';
}

// ==================================================
// 🛠️ ১০. ইউটিলিটি ফাংশন
// ==================================================
if(updateNoteBtn) updateNoteBtn.onclick = async () => {
    if(currentEditId) await updateDoc(doc(db, "notes", currentEditId), { text: editNoteInput.value });
    editModal.style.display = 'none';
};

if(triggerFile) triggerFile.onclick = () => fileInput.click();

if(fileInput) fileInput.onchange = (e) => {
    if(e.target.files[0]) {
        const r = new FileReader();
        r.onload = (ev) => { previewImage.src = ev.target.result; previewContainer.style.display = 'block'; };
        r.readAsDataURL(e.target.files[0]);
    }
};
if(removeImageBtn) removeImageBtn.onclick = clearFileInput;

function clearFileInput() { fileInput.value = ""; androidSharedImage = null; previewContainer.style.display = 'none'; }
function normalizeUrl(u) { if(!u)return""; let x=u.trim(); return (x && !x.startsWith('http') && x.includes('.') && !x.includes(' ')) ? 'https://'+x : x; }
function isValidURL(s) { try { return new URL(s).protocol.startsWith("http"); } catch { return false; } }

async function getLinkPreviewData(url) { 
    try{ 
        const r = await fetch(`${WORKER_URL}?url=${encodeURIComponent(url)}`); 
        const j = await r.json(); 
        return j.status==='success'?j.data:{title:url}; 
    }catch{return{title:url};} 
}

if (logoutBtn) logoutBtn.onclick = () => signOut(auth).then(() => window.location.href = "index.html");

if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const searchText = e.target.value.toLowerCase();
        document.querySelectorAll('.note-card').forEach(card => {
            if (card.innerText.toLowerCase().includes(searchText)) card.style.display = 'inline-block';
            else card.style.display = 'none';
        });
    });
}

if(gridViewBtn && listViewBtn) {
    gridViewBtn.addEventListener('click', () => { contentGrid.classList.remove('list-view'); gridViewBtn.classList.add('active'); listViewBtn.classList.remove('active'); });
    listViewBtn.addEventListener('click', () => { contentGrid.classList.add('list-view'); listViewBtn.classList.add('active'); gridViewBtn.classList.remove('active'); });
}

[readModal, shareModal, editModal].forEach(modal => {
    if(modal) modal.addEventListener('click', (e) => { if(e.target === modal) modal.style.display = 'none'; });
});
if(closeReadModalBtn) closeReadModalBtn.onclick = () => readModal.style.display = 'none';
if(closeShareModalBtn) closeShareModalBtn.onclick = () => shareModal.style.display = 'none';
if(closeModalBtn) closeModalBtn.onclick = () => editModal.style.display = 'none';

window.addEventListener('click', (e) => {
    if(contextMenu && !contextMenu.contains(e.target) && !e.target.classList.contains('delete-btn')) {
        contextMenu.style.display = 'none';
    }
});

// ==================================================
// 📱 ১১. Android App Integration
// ==================================================
window.receiveImageFromApp = (base64Data) => {
    androidSharedImage = base64DataToBlob(base64Data);
    const previewImage = document.getElementById('image-preview');
    const previewContainer = document.getElementById('image-preview-container');
    if(previewImage && previewContainer) {
        previewImage.src = base64Data;
        previewContainer.style.display = 'block';
    }
    const saveBtn = document.getElementById('saveBtn');
    if(saveBtn) saveBtn.innerText = "Save Image";
};

function base64DataToBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}