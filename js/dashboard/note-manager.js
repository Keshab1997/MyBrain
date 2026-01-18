import { db, auth } from "../core/firebase-config.js";
import { collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as DBService from "../core/firebase-service.js";
import * as UI from "./ui-renderer.js";
import * as Utils from "../core/utils.js";
import { openContextMenu, openReadModal } from "./menu-manager.js";
import { askAI } from "./ai-service.js";
import { showToast, updateSyncStatus } from "../ui-shared.js";
import { localDB } from "../core/db-local.js";

// নোটিফিকেশন হেল্পার ফাংশন
async function sendNotification(title, body) {
    if (Notification.permission === "granted") {
        const registration = await navigator.serviceWorker.ready;
        registration.showNotification(title, {
            body: body,
            icon: 'https://cdn-icons-png.flaticon.com/512/2965/2965358.png',
            badge: 'https://cdn-icons-png.flaticon.com/512/2965/2965358.png',
            vibrate: [100, 50, 100]
        });
    }
}

let unsubscribeNotes = null;
let unsubscribePinned = null;
let mediaRecorder = null;
let audioChunks = [];
let selectedNoteIds = new Set();

// ==================================================
// ১. নোট লোড করার লজিক
// ==================================================
export async function loadNotes(uid, filterType = 'All', filterValue = null) {
    const contentGrid = document.getElementById('content-grid');
    
    if (!contentGrid) {
        console.error("Error: 'content-grid' ID not found in HTML");
        return;
    }

    // ১. প্রথমে লোকাল ডেটাবেস থেকে ডেটা লোড করুন (ইন্সট্যান্ট লোডিং)
    const cachedNotes = await localDB.getAllNotes();
    if (cachedNotes.length > 0 && (filterType === 'All' || filterType === 'all')) {
        cachedNotes.sort((a, b) => {
            const timeA = a.timestamp?.seconds || a.timestamp || 0;
            const timeB = b.timestamp?.seconds || b.timestamp || 0;
            return timeB - timeA;
        });
        renderNotesToUI(cachedNotes, contentGrid, filterType, uid);
    }

    // অফলাইন সিঙ্ক চেষ্টা করা
    attemptSync();
    const notesRef = collection(db, "notes");
    let q;

    const inputArea = document.querySelector('.input-area');
    const pinSection = document.getElementById('pinned-section');
    const selectionControls = document.getElementById('selection-controls');

    if(inputArea) inputArea.style.display = (filterType === 'trash') ? 'none' : 'block';
    if(pinSection) pinSection.style.display = 'none'; 

    // সিলেকশন বাটন শো করা
    if(selectionControls) selectionControls.style.display = 'flex';

    // কুয়েরি তৈরি
    if (filterType === 'trash') {
        DBService.cleanupOldTrashDB(uid);
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "trash"), orderBy("timestamp", "desc"));
    } else if (filterType === 'folder') {
        loadPinnedNotes(uid); 
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), where("folder", "==", filterValue), where("isPinned", "==", false), orderBy("timestamp", "desc"));
    } else if (filterType !== 'All' && filterType !== 'all') {
        loadPinnedNotes(uid);
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), where("type", "==", filterType), where("isPinned", "==", false), orderBy("timestamp", "desc"));
    } else {
        loadPinnedNotes(uid); 
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), where("isPinned", "==", false), orderBy("timestamp", "desc"));
    }

    if (unsubscribeNotes) unsubscribeNotes();
    if (unsubscribePinned) unsubscribePinned();

    unsubscribeNotes = onSnapshot(q, async (snapshot) => {
        let serverNotes = [];
        snapshot.forEach(doc => serverNotes.push({ id: doc.id, ...doc.data() }));

        // অফলাইন কিউ থেকে পেন্ডিং নোটগুলো নিন
        const syncQueue = await localDB.getSyncQueue();
        const pendingNotes = syncQueue
            .filter(item => item.type === 'ADD')
            .map(item => item.data);

        // সার্ভার এবং পেন্ডিং নোট একসাথে মিশিয়ে ফেলুন
        let allNotes = [...pendingNotes, ...serverNotes.filter(sn => !pendingNotes.some(pn => pn.id === sn.id))];

        // টাইমস্ট্যাম্প অনুযায়ী সর্ট করুন
        allNotes.sort((a, b) => {
            const timeA = a.timestamp?.seconds || a.timestamp || 0;
            const timeB = b.timestamp?.seconds || b.timestamp || 0;
            return timeB - timeA;
        });

        if (filterType === 'All' || filterType === 'all') {
            await localDB.saveNotes(serverNotes);
        }

        renderNotesToUI(allNotes, contentGrid, filterType, uid);
        
        const searchInput = document.getElementById('searchInput');
        if(searchInput && searchInput.value) searchInput.dispatchEvent(new Event('input'));
    });

    setupSelectionLogic(uid, filterType === 'trash');
}

// রেন্ডারিং লজিক (Chunk Rendering + Link Caching)
function renderNotesToUI(notes, container, filterType, uid) {
    const noteIds = JSON.stringify(notes.map(n => n.id));
    if (container.getAttribute('data-last-sync') === noteIds) return;

    container.innerHTML = "";
    selectedNoteIds.clear();
    updateSelectionUI();

    // ১. ট্র্যাশ ভিউ হেডার
    if (filterType === 'trash') {
        const count = notes.length;
        const trashHeader = document.createElement('div');
        trashHeader.style.cssText = "width:100%; display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding:10px; background:#fff0f0; border-radius:8px; border:1px solid #ffcdd2; grid-column: 1 / -1;";
        
        trashHeader.innerHTML = `
            <span style="color:#d32f2f; font-weight:bold;">🗑️ Trash (${count} items)</span>
            ${count > 0 ? `<button id="emptyTrashBtn" style="background:#d32f2f; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px;">Empty Trash</button>` : ''}
        `;
        container.appendChild(trashHeader);

        // Trash Button Logic
        setTimeout(() => {
            const emptyBtn = document.getElementById('emptyTrashBtn');
            if(emptyBtn) {
                emptyBtn.onclick = async () => {
                    if(confirm("Delete ALL items permanently? This cannot be undone.")) {
                        emptyBtn.innerText = "Deleting...";
                        emptyBtn.disabled = true;
                        try {
                            await DBService.emptyTrashDB(uid);
                            showToast("🗑️ Trash emptied successfully!");
                        } catch (error) {
                            console.error(error);
                            showToast("❌ Error emptying trash", "error");
                            emptyBtn.innerText = "Empty Trash";
                            emptyBtn.disabled = false;
                        }
                    }
                };
            }
        }, 100);
    }

    if (notes.length === 0) {
        const msg = filterType === 'trash' ? "Trash is empty 😌" : "No notes found.";
        const p = document.createElement('p');
        p.style.cssText = "text-align:center; color:#999; margin-top:20px; width:100%; grid-column: 1 / -1;";
        p.innerText = msg;
        container.appendChild(p);
    } else {
        // 🔥 Chunk Rendering (20 notes at a time)
        const CHUNK_SIZE = 20; 
        let currentIndex = 0;

        function renderChunk() {
            const chunk = notes.slice(currentIndex, currentIndex + CHUNK_SIZE);
            const fragment = document.createDocumentFragment();

            chunk.forEach(noteData => {
                if (filterType !== 'trash' && noteData.isPinned) return;
                
                // 🔥 Link Caching Logic
                // যদি লিঙ্ক হয় এবং টাইটেল না থাকে, তবে ফেচ করে ডাটাবেসে সেভ করো
                if (noteData.type === 'link' && !noteData.title && !noteData.image && navigator.onLine) {
                    Utils.getLinkPreviewData(noteData.text).then(async (meta) => {
                        if (meta.title) {
                            await DBService.updateNoteMetadataDB(noteData.id, meta);
                        }
                    });
                }

                try {
                    const mockDocSnap = { id: noteData.id, data: () => noteData };
                    
                    const card = UI.createNoteCardElement(mockDocSnap, filterType === 'trash', {
                        onRestore: DBService.restoreNoteDB,
                        onDeleteForever: (id) => confirm("Permanently delete?") && DBService.deleteNoteForeverDB(id),
                        onContextMenu: openContextMenu,
                        onRead: openReadModal,
                        onSelect: (id, isSelected) => {
                            if(isSelected) selectedNoteIds.add(id);
                            else selectedNoteIds.delete(id);
                            updateSelectionUI();
                        }
                    });
                    fragment.appendChild(card);
                } catch (error) {
                    console.warn('Error rendering note:', noteData.id, error);
                }
            });

            container.appendChild(fragment);
            currentIndex += CHUNK_SIZE;

            if (currentIndex < notes.length) {
                requestAnimationFrame(renderChunk);
            }
        }

        renderChunk();
    }

    container.setAttribute('data-last-sync', noteIds);
}

function loadPinnedNotes(uid) {
    const q = query(collection(db, "notes"), where("uid", "==", uid), where("isPinned", "==", true), where("status", "==", "active"), orderBy("timestamp", "desc"));
    const pinSection = document.getElementById('pinned-section');
    const pinGrid = document.getElementById('pinned-grid');

    if(!pinSection || !pinGrid) return;

    unsubscribePinned = onSnapshot(q, (snapshot) => {
        if (snapshot.empty) {
            pinSection.style.display = 'none';
        } else {
            pinSection.style.display = 'block';
            pinGrid.innerHTML = "";
            snapshot.forEach((docSnap) => {
                const card = UI.createNoteCardElement(docSnap, false, {
                    onContextMenu: openContextMenu,
                    onRead: openReadModal,
                    onSelect: (id, isSelected) => {
                        if(isSelected) selectedNoteIds.add(id);
                        else selectedNoteIds.delete(id);
                        updateSelectionUI();
                    }
                });
                pinGrid.appendChild(card);
            });
        }
    });
}

// সিলেকশন লজিক
function setupSelectionLogic(uid, isTrash) {
    const toggleBtn = document.getElementById('toggleSelectModeBtn');
    const selectAllBtn = document.getElementById('selectAllBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');

    if (!toggleBtn || !selectAllBtn || !deleteSelectedBtn) return;

    toggleBtn.onclick = () => {
        const isActive = document.body.classList.toggle('selection-mode');
        toggleBtn.textContent = isActive ? "Cancel" : "Select";
        toggleBtn.style.background = isActive ? "#ef4444" : "";
        
        selectAllBtn.style.display = isActive ? 'inline-block' : 'none';
        deleteSelectedBtn.style.display = isActive ? 'inline-block' : 'none';
        
        if(!isActive) {
            selectedNoteIds.clear();
            document.querySelectorAll('.note-card').forEach(c => c.classList.remove('selected'));
            document.querySelectorAll('.card-select-checkbox').forEach(cb => cb.checked = false);
            updateSelectionUI();
        }
    };

    selectAllBtn.onclick = () => {
        const allCheckboxes = document.querySelectorAll('.card-select-checkbox');
        const allSelected = Array.from(allCheckboxes).every(cb => cb.checked);
        
        allCheckboxes.forEach(cb => {
            cb.checked = !allSelected;
            const id = cb.getAttribute('data-id');
            const card = cb.closest('.note-card');
            
            if(!allSelected) {
                selectedNoteIds.add(id);
                card.classList.add('selected');
            } else {
                selectedNoteIds.delete(id);
                card.classList.remove('selected');
            }
        });
        updateSelectionUI();
    };

    deleteSelectedBtn.onclick = async () => {
        if(selectedNoteIds.size === 0) return;
        
        const confirmMsg = isTrash ? "স্থায়ীভাবে মুছে ফেলবেন?" : "ট্র্যাশে মুভ করবেন?";
        if(!confirm(`${selectedNoteIds.size}টি নোট ${confirmMsg}`)) return;

        try {
            const ids = Array.from(selectedNoteIds);
            deleteSelectedBtn.disabled = true;
            deleteSelectedBtn.innerText = "Deleting...";
            
            await DBService.batchDeleteNotesDB(ids, isTrash);
            
            selectedNoteIds.clear();
            updateSelectionUI();
            toggleBtn.click();
        } catch (err) {
            alert("ডিলিট করতে সমস্যা হয়েছে!");
        } finally {
            deleteSelectedBtn.disabled = false;
        }
    };
}

function updateSelectionUI() {
    const btn = document.getElementById('deleteSelectedBtn');
    if(btn) btn.innerText = `Delete (${selectedNoteIds.size})`;
}

// শেয়ার করা লিংক হ্যান্ডেল
export async function handleIncomingShare(user, text, title) {
    const noteInput = document.getElementById('noteInput');
    if (noteInput) {
        noteInput.value = decodeURIComponent(text);
    }

    const normalizedText = Utils.normalizeUrl(decodeURIComponent(text));
    const isUrl = Utils.isValidURL(normalizedText);
    const decodedTitle = title ? decodeURIComponent(title) : null;

    const newNote = {
        id: "temp_" + Date.now(),
        text: normalizedText,
        type: isUrl ? 'link' : 'text',
        title: decodedTitle || normalizedText, 
        description: decodedTitle ? "Saved via Extension" : "",
        image: null,
        status: 'active',
        timestamp: { seconds: Math.floor(Date.now()/1000) },
        uid: user.uid,
        folder: "General",
        tags: [],
        isPinned: false
    };

    await localDB.addToSyncQueue({ type: 'ADD', data: newNote });
    loadNotes(user.uid, 'All');
    showToast("✅ Link saved from extension!");

    if (isUrl && !decodedTitle) {
        Utils.getLinkPreviewData(normalizedText).then(async (meta) => {
            if (!meta.title.includes("Attention Required") && !meta.title.includes("Cloudflare")) {
                await DBService.updateNoteContentDB(newNote.id, normalizedText);
            }
        });
    }
    
    attemptSync();
}

// ==================================================
// ২. নোট সেভ, টুলবার এবং অডিও
// ==================================================
export async function setupNoteSaving(user) {
    const saveBtn = document.getElementById('saveBtn');
    const noteInput = document.getElementById('noteInput');
    const fileInput = document.getElementById('fileInput');
    const imagePreview = document.getElementById('image-preview');
    const previewContainer = document.getElementById('image-preview-container');
    const triggerFileBtn = document.getElementById('triggerFile');
    const removeImageBtn = document.getElementById('remove-image-btn');
    
    const audioPreviewContainer = document.getElementById('audio-preview-container');
    const audioPreview = document.getElementById('audio-preview');
    const removeAudioBtn = document.getElementById('remove-audio-btn');

    async function handleSharedContent() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('shared')) {
            try {
                const cache = await caches.open('shared-data');
                const response = await cache.match('shared-image');
                if (response) {
                    const blob = await response.blob();
                    const file = new File([blob], "shared_image.jpg", { type: blob.type });
                    
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        imagePreview.src = e.target.result;
                        previewContainer.style.display = 'block';
                        window.sharedFile = file; 
                    };
                    reader.readAsDataURL(file);
                    
                    saveBtn.innerText = "Save Shared Image";
                    await cache.delete('shared-image');
                    window.history.replaceState({}, document.title, "dashboard.html");
                }
            } catch (e) {
                console.error("Error receiving shared image:", e);
            }
        }
    }

    handleSharedContent();

    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    await processPendingShares(user);

    // টুলবার সেটআপ
    if(!document.querySelector('.input-bottom-bar')) {
        const toolbarHTML = `
            <div class="input-bottom-bar">
                <div class="action-tools">
                    <span class="tool-icon" id="triggerFile" title="Add Image">📷</span>
                    <span class="tool-icon" id="btn-mic" title="Record Audio">🎤</span>
                    
                    <div class="ai-dropdown-wrapper">
                        <button id="btn-ai" class="ai-compact-btn">🪄 AI Tools</button>
                        <div id="ai-menu" class="ai-menu-popup" style="display:none;">
                            <div class="ai-option" data-task="write">✍️ Write/Draft</div>
                            <div class="ai-option" data-task="grammar">✨ Fix Grammar</div>
                            <div class="ai-option" data-task="summary">📝 Summarize</div>
                            <div class="ai-option" data-task="tags">🏷️ Generate Tags</div>
                        </div>
                    </div>
                    <span id="recording-status" class="status-dot">● Rec</span>
                    <span id="ai-status" class="status-text" style="display:none;">Thinking...</span>
                </div>

                <div class="save-section">
                    <select id="folderSelect" class="folder-minimal">
                        <option value="General">📁 General</option>
                    </select>
                    <button id="saveBtn" class="btn-save-brain">Save to Brain</button>
                </div>
            </div>
        `;

        const inputArea = document.querySelector('.input-area');
        if(inputArea) {
            inputArea.insertAdjacentHTML('beforeend', toolbarHTML);
        }
    }

    // AI Logic
    const aiBtn = document.getElementById('btn-ai');
    const aiMenu = document.getElementById('ai-menu');
    const aiStatus = document.getElementById('ai-status');

    if(aiBtn && aiMenu) {
        aiBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const isHidden = aiMenu.style.display === 'none' || aiMenu.style.display === '';
            aiMenu.style.display = isHidden ? 'block' : 'none';
        };
        aiMenu.onclick = (e) => e.stopPropagation();
        document.addEventListener('click', () => { aiMenu.style.display = 'none'; });

        document.querySelectorAll('.ai-option').forEach(opt => {
            opt.addEventListener('click', async (e) => {
                e.stopPropagation();
                aiMenu.style.display = 'none';
                
                const text = noteInput.value;
                if(!text.trim()) return showToast("⚠️ Please write something first!", "error");

                const task = e.target.getAttribute('data-task');
                aiStatus.style.display = 'inline';
                aiBtn.disabled = true;
                aiBtn.style.opacity = '0.7';

                try {
                    const result = await askAI(task, text);
                    if(task === 'tags') noteInput.value = text + "\n\n" + result;
                    else if(task === 'write') noteInput.value = result;
                    else if(task === 'grammar') noteInput.value = result;
                    else noteInput.value = text + "\n\n**Summary:**\n" + result;
                } catch (err) {
                    showToast("❌ AI Error: " + err.message, "error");
                } finally {
                    aiStatus.style.display = 'none';
                    aiBtn.disabled = false;
                    aiBtn.style.opacity = '1';
                }
            });
        });
    }

    // Mic Logic
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
                    const audioUrl = URL.createObjectURL(audioBlob);
                    if(audioPreview && audioPreviewContainer) {
                        audioPreview.src = audioUrl;
                        audioPreviewContainer.style.display = 'block';
                    }
                    saveBtn.innerText = "Save Audio Note";
                };
                mediaRecorder.start();
                isRecording = true;
                micBtn.style.color = "red";
                recStatus.style.display = "inline";
            } catch (e) { alert("মাইক্রোফোন এক্সেস দিন!"); }
        } else {
            mediaRecorder.stop();
            isRecording = false;
            micBtn.style.color = "";
            recStatus.style.display = "none";
        }
    });

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
            const files = Array.from(e.target.files);
            previewContainer.innerHTML = "";
            if (files.length > 0) {
                previewContainer.style.display = 'flex';
                files.forEach((file, index) => {
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const div = document.createElement('div');
                        div.className = 'preview-wrapper';
                        div.innerHTML = `
                            <img src="${ev.target.result}">
                            <button class="remove-img-small" data-index="${index}">×</button>
                        `;
                        previewContainer.appendChild(div);
                    };
                    reader.readAsDataURL(file);
                });
                saveBtn.innerText = `Save ${files.length} Images`;
            }
        };
    }
    if(removeImageBtn) removeImageBtn.onclick = clearFileInput;

    function clearFileInput() {
        fileInput.value = ""; androidSharedImage = null; audioBlob = null;
        previewContainer.style.display = 'none';
        if(audioPreviewContainer && audioPreview) {
            audioPreviewContainer.style.display = 'none';
            audioPreview.src = '';
        }
        saveBtn.innerText = "Save to Brain";
    }
    
    if(removeAudioBtn) removeAudioBtn.onclick = clearFileInput;

    // 🔥 SAVE BUTTON LOGIC (Double Save Fix)
    if (saveBtn) {
        saveBtn.onclick = null; // Clear old listeners

        saveBtn.onclick = async () => {
            if (saveBtn.disabled) return;
            saveBtn.disabled = true;
            const originalText = saveBtn.innerText;
            saveBtn.innerText = "Saving...";

            try {
                const rawText = noteInput.value.trim();
                const files = Array.from(fileInput ? fileInput.files : []);
                const targetFolder = document.getElementById('folderSelect')?.value || "General";
                const tempId = "temp_" + Date.now();

                if (!rawText && files.length === 0 && !androidSharedImage && !audioBlob) {
                    showToast("⚠️ Empty note!", "error");
                    throw new Error("Empty note");
                }

                const normalizedText = Utils.normalizeUrl(rawText);
                const isUrl = Utils.isValidURL(normalizedText);

                let linkMeta = {};
                if (isUrl && navigator.onLine) {
                    try {
                        updateSyncStatus("Fetching link info...", true);
                        linkMeta = await Utils.getLinkPreviewData(normalizedText);
                        updateSyncStatus(null);
                    } catch (e) { 
                        console.log("Quick fetch failed", e);
                        updateSyncStatus(null);
                    }
                }

                const newNote = {
                    id: tempId,
                    text: normalizedText,
                    type: isUrl ? 'link' : 'text',
                    ...linkMeta,
                    status: 'active',
                    timestamp: { seconds: Math.floor(Date.now()/1000) },
                    uid: user.uid,
                    folder: targetFolder,
                    tags: [],
                    isPinned: false
                };

                // ফাইল আপলোড লজিক (যদি থাকে)
                if (files.length > 0 || androidSharedImage || audioBlob) {
                    // এখানে ফাইল আপলোডের কোড বসবে (যদি প্রয়োজন হয়)
                    // আপাতত টেক্সট নোট হিসেবে সেভ হচ্ছে
                }

                await localDB.addToSyncQueue({ type: 'ADD', data: newNote });
                loadNotes(user.uid, 'All');
                
                noteInput.value = "";
                clearFileInput();
                showToast("✅ Note saved!");
                attemptSync();

            } catch (error) {
                console.error(error);
            } finally {
                saveBtn.disabled = false;
                saveBtn.innerText = originalText;
            }
        };
    }
}

// Background Share Processing
async function processPendingShares(user) {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('process_share')) return;

    try {
        const cache = await caches.open('shared-queue');
        const dataRes = await cache.match('pending-share');
        if (!dataRes) return;

        const sharedData = await dataRes.json();
        showToast("🚀 Background upload started...", "info");

        let rawText = `${sharedData.title || ''}\n${sharedData.text || ''}\n${sharedData.url || ''}`.trim();
        
        let files = [];
        for (let i = 0; i < 10; i++) {
            const fileRes = await cache.match(`pending-file-${i}`);
            if (fileRes) files.push(await fileRes.blob());
            else break;
        }

        uploadInBackground(user, rawText, files);
        await caches.delete('shared-queue');
        window.history.replaceState({}, document.title, "dashboard.html");

    } catch (e) {
        console.error("Share processing failed", e);
    }
}

async function uploadInBackground(user, text, files) {
    updateSyncStatus("Uploading in background...", true);
    
    try {
        if (files.length === 0) {
            const normalized = Utils.normalizeUrl(text);
            const isUrl = Utils.isValidURL(normalized);
            
            const docRef = await DBService.addNoteToDB(user.uid, {
                text: normalized,
                type: isUrl ? 'link' : 'text',
                status: 'active',
                isPinned: false
            });

            if (isUrl) {
                updateSyncStatus("Fetching link info...", true);
                Utils.getLinkPreviewData(normalized).then(async (meta) => {
                    await DBService.updateNoteContentDB(docRef.id, normalized);
                    const tags = Utils.generateAutoTags(text, meta);
                    await DBService.updateNoteTagsDB(docRef.id, tags);
                    updateSyncStatus("Sync complete!");
                    setTimeout(() => updateSyncStatus(null), 3000);
                }).catch(() => {
                    updateSyncStatus("Saved!");
                    setTimeout(() => updateSyncStatus(null), 3000);
                });
            } else {
                updateSyncStatus("Saved!");
                setTimeout(() => updateSyncStatus(null), 3000);
            }
        } else {
            for (let i = 0; i < files.length; i++) {
                updateSyncStatus(`Uploading file ${i+1}/${files.length}...`, true);
                const data = await DBService.uploadToCloudinary(files[i]);
                await DBService.addNoteToDB(user.uid, {
                    text: i === 0 ? text : "",
                    fileUrl: data.secure_url,
                    type: 'image',
                    status: 'active',
                    isPinned: false
                });
            }
            updateSyncStatus("All files saved!");
            setTimeout(() => updateSyncStatus(null), 3000);
        }
        
        document.querySelector('.filter-btn[data-filter="all"]')?.click();
    } catch (err) {
        updateSyncStatus("Upload failed!", false);
        setTimeout(() => updateSyncStatus(null), 5000);
        console.error("Background upload error:", err);
    }
}

// Sync Manager
export async function attemptSync() {
    if (!navigator.onLine) return;

    const queue = await localDB.getSyncQueue();
    if (queue.length === 0) return;

    updateSyncStatus("Syncing offline changes...", true);

    for (const item of queue) {
        try {
            if (item.type === 'ADD') {
                let noteData = item.data;
                if (noteData.type === 'link' && !noteData.description) {
                    updateSyncStatus("Enriching link data...", true);
                    try {
                        const meta = await Utils.getLinkPreviewData(noteData.text);
                        noteData = { ...noteData, ...meta };
                    } catch (e) {
                        console.log("Link metadata fetch failed:", e);
                    }
                }

                const { id, ...firebaseData } = noteData;
                await DBService.addNoteToDB(firebaseData.uid, firebaseData);
            } else if (item.type === 'DELETE') {
                await DBService.moveToTrashDB(item.noteId);
            }
            
            await localDB.removeFromSyncQueue(item.tempId);
        } catch (err) {
            console.error("Sync failed for item:", item, err);
        }
    }
    
    updateSyncStatus("All changes synced!");
    setTimeout(() => updateSyncStatus(null), 3000);
}

window.addEventListener('online', attemptSync);