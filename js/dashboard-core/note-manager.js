import { db, auth } from "../firebase-config.js";
import { collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as DBService from "./firebase-service.js";
import * as UI from "./ui-renderer.js";
import * as Utils from "./utils.js";
import { openContextMenu, openReadModal } from "./menu-manager.js";

let unsubscribeNotes = null;
let mediaRecorder = null;
let audioChunks = [];

// ==================================================
// ১. নোট লোড করার লজিক (আপডেট করা হয়েছে)
// ==================================================
export function loadNotes(uid, filterType = 'All', filterValue = null) {
    const contentGrid = document.getElementById('content-grid');
    const notesRef = collection(db, "notes");
    let q;

    const inputArea = document.querySelector('.input-area');
    const pinSection = document.getElementById('pinned-section');

    // ট্র্যাশ ভিউতে ইনপুট এরিয়া লুকানো থাকবে
    if(inputArea) inputArea.style.display = (filterType === 'trash') ? 'none' : 'block';
    if(pinSection) pinSection.style.display = 'none'; 

    // কুয়েরি তৈরি
    if (filterType === 'trash') {
        // ট্র্যাশে ঢোকার সাথে সাথে পুরনো নোট ক্লিনআপ চেক করবে
        DBService.cleanupOldTrashDB(uid);
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
        contentGrid.innerHTML = "";

        // 🔥 ট্র্যাশ হেডার (কাউন্ট এবং এম্পটি বাটন)
        if (filterType === 'trash') {
            const count = snapshot.size;
            const trashHeader = document.createElement('div');
            trashHeader.style.cssText = "width:100%; display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding:10px; background:#fff0f0; border-radius:8px; border:1px solid #ffcdd2;";
            
            trashHeader.innerHTML = `
                <span style="color:#d32f2f; font-weight:bold;">🗑️ Trash (${count} items)</span>
                ${count > 0 ? `<button id="emptyTrashBtn" style="background:#d32f2f; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px;">Empty Trash</button>` : ''}
            `;
            
            // অটো ডিলিট ওয়ার্নিং মেসেজ
            const warning = document.createElement('p');
            warning.style.cssText = "width:100%; text-align:center; font-size:11px; color:#888; margin-bottom:15px;";
            warning.innerText = "Items in trash are automatically deleted after 7 days.";
            
            contentGrid.appendChild(trashHeader);
            contentGrid.appendChild(warning);

            // Empty Trash Button Event
            setTimeout(() => {
                const emptyBtn = document.getElementById('emptyTrashBtn');
                if(emptyBtn) {
                    emptyBtn.onclick = async () => {
                        if(confirm("Are you sure you want to delete ALL items in trash permanently? This cannot be undone.")) {
                            await DBService.emptyTrashDB(uid);
                        }
                    };
                }
            }, 0);
        }

        if(snapshot.empty) {
            let msg = filterType === 'trash' ? "Trash is empty 😌" : "No notes found.";
            const p = document.createElement('p');
            p.style.cssText = "text-align:center; color:#999; margin-top:20px; width:100%;";
            p.innerText = msg;
            contentGrid.appendChild(p);
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            if (filterType !== 'trash' && data.isPinned) return;

            const card = UI.createNoteCardElement(docSnap, filterType === 'trash', {
                onRestore: DBService.restoreNoteDB,
                onDeleteForever: (id) => confirm("Permanently delete?") && DBService.deleteNoteForeverDB(id),
                onContextMenu: openContextMenu,
                onRead: openReadModal
            });
            contentGrid.appendChild(card);
        });
        
        const searchInput = document.getElementById('searchInput');
        if(searchInput && searchInput.value) searchInput.dispatchEvent(new Event('input'));
    });
}

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
                const card = UI.createNoteCardElement(docSnap, false, {
                    onContextMenu: openContextMenu,
                    onRead: openReadModal
                });
                pinGrid.appendChild(card);
            });
        }
    });
}

// ==================================================
// ২. নোট সেভ, টুলবার এবং অডিও
// ==================================================
export function setupNoteSaving(user) {
    const saveBtn = document.getElementById('saveBtn');
    const noteInput = document.getElementById('noteInput');
    const fileInput = document.getElementById('fileInput');
    const statusText = document.getElementById('uploadStatus');
    const imagePreview = document.getElementById('image-preview');
    const previewContainer = document.getElementById('image-preview-container');
    const triggerFileBtn = document.getElementById('triggerFile');
    const removeImageBtn = document.getElementById('remove-image-btn');

    // --- A. Rich Text Toolbar Setup ---
    const toolbarHTML = `
        <div class="rich-toolbar" style="display:flex; gap:10px; margin-bottom:10px; padding-bottom:5px; border-bottom:1px solid #eee;">
            <button id="btn-bold" title="Bold" style="background:none; border:none; cursor:pointer; font-weight:bold;">B</button>
            <button id="btn-italic" title="Italic" style="background:none; border:none; cursor:pointer; font-style:italic;">I</button>
            <button id="btn-list" title="List" style="background:none; border:none; cursor:pointer;">📋</button>
            <button id="btn-check" title="Checklist" style="background:none; border:none; cursor:pointer;">✅</button>
            <button id="btn-mic" title="Record Audio" style="background:none; border:none; cursor:pointer; font-size:16px;">🎤</button>
            <span id="recording-status" style="font-size:12px; color:red; display:none;">Recording...</span>
        </div>
    `;

    const inputArea = document.querySelector('.input-area');
    if(inputArea && !document.querySelector('.rich-toolbar')) {
        inputArea.insertBefore(new DOMParser().parseFromString(toolbarHTML, 'text/html').body.firstChild, noteInput);
    }

    const insertText = (before, after) => {
        const start = noteInput.selectionStart;
        const end = noteInput.selectionEnd;
        const text = noteInput.value;
        const selected = text.substring(start, end);
        noteInput.value = text.substring(0, start) + before + selected + after + text.substring(end);
        noteInput.focus();
    };

    document.getElementById('btn-bold')?.addEventListener('click', () => insertText('**', '**'));
    document.getElementById('btn-italic')?.addEventListener('click', () => insertText('_', '_'));
    document.getElementById('btn-list')?.addEventListener('click', () => insertText('\n- ', ''));
    document.getElementById('btn-check')?.addEventListener('click', () => insertText('\n- [ ] ', ''));

    // --- B. Voice Recorder Logic ---
    const micBtn = document.getElementById('btn-mic');
    const recStatus = document.getElementById('recording-status');
    let isRecording = false;
    let audioBlob = null;

    micBtn?.addEventListener('click', async () => {
        if (!isRecording) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                mediaRecorder = new MediaRecorder(stream);
                audioChunks = [];
                
                mediaRecorder.ondataavailable = event => audioChunks.push(event.data);
                mediaRecorder.onstop = () => {
                    audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
                    saveBtn.innerText = "Save Audio Note";
                };

                mediaRecorder.start();
                isRecording = true;
                micBtn.style.color = "red";
                recStatus.style.display = "inline";
            } catch (e) {
                alert("Microphone access denied!");
            }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            micBtn.style.color = "";
            recStatus.style.display = "none";
        }
    });

    // --- C. Image Handling ---
    let androidSharedImage = null;
    window.receiveImageFromApp = (base64) => {
        try {
            androidSharedImage = Utils.base64DataToBlob(base64);
            if(imagePreview && previewContainer) {
                imagePreview.src = base64;
                previewContainer.style.display = 'block';
            }
            if(saveBtn) saveBtn.innerText = "Save Image from App";
        } catch (e) { console.error(e); }
    };

    if(triggerFileBtn) triggerFileBtn.onclick = () => fileInput.click();
    if(fileInput) {
        fileInput.onchange = (e) => {
            if(e.target.files[0]) {
                const r = new FileReader();
                r.onload = (ev) => { imagePreview.src = ev.target.result; previewContainer.style.display = 'block'; };
                r.readAsDataURL(e.target.files[0]);
            }
        };
    }
    if(removeImageBtn) removeImageBtn.onclick = clearFileInput;

    function clearFileInput() {
        fileInput.value = ""; androidSharedImage = null; audioBlob = null;
        previewContainer.style.display = 'none';
        saveBtn.innerText = "Save to Brain";
    }

    // --- D. Save Logic (FIXED & ROBUST) 🛠️ ---
    saveBtn.addEventListener('click', async () => {
        const rawText = noteInput.value;
        const file = fileInput.files[0];
        const targetFolder = document.getElementById('folderSelect')?.value || "General";
        const selectedColor = document.querySelector('input[name="noteColor"]:checked')?.value || "#ffffff";

        if (!rawText && !file && !androidSharedImage && !audioBlob) return alert("Empty note!");

        saveBtn.disabled = true; saveBtn.innerText = "Processing...";
        if(statusText) statusText.style.display = 'block';
        
        try {
            const text = Utils.normalizeUrl(rawText);
            const tags = Utils.extractTags(text);
            
            let fileUrl = null;
            let type = 'text';
            let linkMeta = {};

            // ১. অডিও আপলোড
            if (audioBlob) {
                saveBtn.innerText = "Uploading Audio...";
                const data = await DBService.uploadToCloudinary(audioBlob);
                if(data.secure_url) {
                    fileUrl = data.secure_url;
                    type = 'audio';
                } else {
                    throw new Error("Audio upload failed (No URL returned)");
                }
            }
            // ২. ছবি আপলোড
            else if (file || androidSharedImage) {
                saveBtn.innerText = "Uploading Image...";
                const data = await DBService.uploadToCloudinary(file || androidSharedImage);
                if(data.secure_url) {
                    fileUrl = data.secure_url;
                    type = 'image';
                } else {
                    throw new Error("Image upload failed (No URL returned)");
                }
            } 
            // ৩. লিঙ্ক প্রিভিউ
            else if (Utils.isValidURL(text)) {
                type = 'link';
                if (!text.includes('instagram.com') && !text.includes('facebook.com')) {
                    saveBtn.innerText = "Fetching Preview...";
                    linkMeta = await Utils.getLinkPreviewData(text);
                }
            }

            // ৪. ডাটাবেসে সেভ
            saveBtn.innerText = "Saving...";
            await DBService.addNoteToDB(user.uid, {
                text, fileUrl, type, color: selectedColor, folder: targetFolder, 
                tags: tags, 
                status: 'active', isPinned: false, ...linkMeta
            });

            noteInput.value = ""; clearFileInput();
            document.querySelector('.filter-btn[data-filter="all"]')?.click();

        } catch (e) { 
            console.error("Save Error:", e); 
            alert("Error: " + e.message); 
        } finally { 
            saveBtn.disabled = false; saveBtn.innerText = "Save to Brain"; 
            if(statusText) statusText.style.display = 'none';
        }
    });
}