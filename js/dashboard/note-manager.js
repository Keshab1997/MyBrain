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
} // ইমপোর্ট করুন

let unsubscribeNotes = null;
let unsubscribePinned = null; // নতুন ভেরিয়েবল যোগ করুন
let mediaRecorder = null;
let audioChunks = [];
let selectedNoteIds = new Set(); // 🔥 সিলেকশন স্টোর করার জন্য

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
    if (cachedNotes.length > 0 && filterType === 'All') {
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

    // কুয়েরি তৈরি - পিন করা নোটগুলো মেইন গ্রিড থেকে বাদ দিতে হবে
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
        // 'All' ভিউতে শুধু পিন না করা নোটগুলো দেখাবে
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), where("isPinned", "==", false), orderBy("timestamp", "desc"));
    }

    if (unsubscribeNotes) unsubscribeNotes();
    if (unsubscribePinned) unsubscribePinned(); // আগের পিন লিসেনার বন্ধ করুন

    unsubscribeNotes = onSnapshot(q, async (snapshot) => {
        let serverNotes = [];
        snapshot.forEach(doc => serverNotes.push({ id: doc.id, ...doc.data() }));

        // 🔥 অফলাইন কিউ থেকে পেন্ডিং নোটগুলো নিন
        const syncQueue = await localDB.getSyncQueue();
        const pendingNotes = syncQueue
            .filter(item => item.type === 'ADD')
            .map(item => item.data);

        // সার্ভার এবং পেন্ডিং নোট একসাথে মিশিয়ে ফেলুন
        let allNotes = [...pendingNotes, ...serverNotes.filter(sn => !pendingNotes.some(pn => pn.id === sn.id))];

        // 🔥 টাইমস্ট্যাম্প অনুযায়ী সর্ট করুন (Newest First)
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

// রেন্ডারিং লজিক আলাদা ফাংশনে নিয়ে আসা (কোড ক্লিন রাখার জন্য)
function renderNotesToUI(notes, container, filterType, uid) {
    // ১. গ্রিড ক্লিয়ার করুন যাতে নতুন করে ওপর থেকে সাজানো যায়
    container.innerHTML = "";
    selectedNoteIds.clear();
    updateSelectionUI();

    // ২. ট্র্যাশ ভিউয়ের জন্য হেডার (যদি থাকে)
    if (filterType === 'trash') {
        const count = notes.length;
        const trashHeader = document.createElement('div');
        trashHeader.style.cssText = "width:100%; display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding:10px; background:#fff0f0; border-radius:8px; border:1px solid #ffcdd2; grid-column: 1 / -1;";
        
        trashHeader.innerHTML = `
            <span style="color:#d32f2f; font-weight:bold;">🗑️ Trash (${count} items)</span>
            ${count > 0 ? `<button id="emptyTrashBtn" style="background:#d32f2f; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px;">Empty Trash</button>` : ''}
        `;
        container.appendChild(trashHeader);

        setTimeout(() => {
            const emptyBtn = document.getElementById('emptyTrashBtn');
            if(emptyBtn) {
                emptyBtn.onclick = async () => {
                    if(confirm("Delete ALL items permanently?")) await DBService.emptyTrashDB(uid);
                };
            }
        }, 0);
    }

    if (notes.length === 0) {
        const msg = filterType === 'trash' ? "Trash is empty 😌" : "No notes found.";
        const p = document.createElement('p');
        p.style.cssText = "text-align:center; color:#999; margin-top:20px; width:100%; grid-column: 1 / -1;";
        p.innerText = msg;
        container.appendChild(p);
        return;
    }

    // ৩. নোটগুলো লুপ চালিয়ে অ্যাপেন্ড করুন
    notes.forEach((noteData) => {
        if (filterType !== 'trash' && noteData.isPinned) return;
        
        const mockDocSnap = {
            id: noteData.id,
            data: () => noteData
        };

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
        
        container.appendChild(card);
    });
}

function loadPinnedNotes(uid) {
    const q = query(collection(db, "notes"), where("uid", "==", uid), where("isPinned", "==", true), where("status", "==", "active"), orderBy("timestamp", "desc"));
    const pinSection = document.getElementById('pinned-section');
    const pinGrid = document.getElementById('pinned-grid');

    if(!pinSection || !pinGrid) return;

    // লিসেনারটি ভেরিয়েবলে সেভ করুন যাতে পরে আনসাবস্ক্রাইব করা যায়
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

// 🔥 সিলেকশন লজিক সেটআপ
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

    // 2. Select All
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

    // 3. Delete Selected
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

// ==================================================
// ২. নোট সেভ, টুলবার এবং অডিও (আগের মতোই)
// ==================================================
export async function setupNoteSaving(user) {
    const saveBtn = document.getElementById('saveBtn');
    const noteInput = document.getElementById('noteInput');
    const fileInput = document.getElementById('fileInput');
    const statusText = document.getElementById('uploadStatus');
    const imagePreview = document.getElementById('image-preview');
    const previewContainer = document.getElementById('image-preview-container');
    const triggerFileBtn = document.getElementById('triggerFile');
    const removeImageBtn = document.getElementById('remove-image-btn');
    
    // 🔥 অডিও প্রিভিউ এলিমেন্ট
    const audioPreviewContainer = document.getElementById('audio-preview-container');
    const audioPreview = document.getElementById('audio-preview');
    const removeAudioBtn = document.getElementById('remove-audio-btn');

    // 🔥 শেয়ার করা ছবি হ্যান্ডেল করার জন্য আলাদা ফাংশন
    async function handleSharedContent() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('shared')) {
            try {
                const cache = await caches.open('shared-data');
                const response = await cache.match('shared-image');
                if (response) {
                    const blob = await response.blob();
                    const file = new File([blob], "shared_image.jpg", { type: blob.type });
                    
                    // প্রিভিউ দেখানো
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        imagePreview.src = e.target.result;
                        previewContainer.style.display = 'block';
                        // ফাইলটি একটি ভেরিয়েবলে সেভ করে রাখা যাতে সেভ বাটনে ক্লিক করলে পাওয়া যায়
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

    handleSharedContent(); // ফাংশনটি কল করুন

    // নোটিফিকেশন পারমিশন রিকোয়েস্ট
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    // 🔥 Background Share Processing
    await processPendingShares(user);

    // 🔥 AI বাটন এবং টুলবার (আপডেটেড)
    // যদি আগে থেকে বার না থাকে তবেই অ্যাড করবে
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

    // 🔥 AI Logic Implementation
    const aiBtn = document.getElementById('btn-ai');
    const aiMenu = document.getElementById('ai-menu');
    const aiStatus = document.getElementById('ai-status');

    if(aiBtn && aiMenu) {
        // পুরনো ইভেন্ট রিমুভ করে নতুন করে সেট করা
        aiBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            console.log("AI Button Clicked!");
            
            const isHidden = aiMenu.style.display === 'none' || aiMenu.style.display === '';
            aiMenu.style.display = isHidden ? 'block' : 'none';
        };

        // মেনুর ভেতরে ক্লিক করলে যাতে বন্ধ না হয়
        aiMenu.onclick = (e) => e.stopPropagation();

        // বাইরে ক্লিক করলে বন্ধ হবে
        document.addEventListener('click', () => {
            aiMenu.style.display = 'none';
        });

        // Handle AI Options
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
                    
                    if(task === 'tags') {
                        noteInput.value = text + "\n\n" + result;
                    } else if(task === 'write') {
                        noteInput.value = result;
                    } else {
                        // For grammar, replace text. For summary, append.
                        if(task === 'grammar') noteInput.value = result;
                        else noteInput.value = text + "\n\n**Summary:**\n" + result;
                    }
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
                    
                    // 🔥 অডিও প্রিভিউ সেট করা
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
            previewContainer.innerHTML = ""; // আগের প্রিভিউ ক্লিয়ার করো
            
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
        
        // 🔥 অডিও প্রিভিউ ক্লিয়ার করা
        if(audioPreviewContainer && audioPreview) {
            audioPreviewContainer.style.display = 'none';
            audioPreview.src = '';
        }
        
        saveBtn.innerText = "Save to Brain";
    }
    
    // 🔥 অডিও রিমুভ বাটন
    if(removeAudioBtn) removeAudioBtn.onclick = clearFileInput;

    saveBtn.addEventListener('click', async () => {
        const rawText = noteInput.value.trim();
        const files = Array.from(fileInput.files);
        const targetFolder = document.getElementById('folderSelect')?.value || "General";
        const tempId = "temp_" + Date.now();

        if (!rawText && files.length === 0 && !androidSharedImage && !audioBlob) return showToast("⚠️ Empty note!", "error");

        const normalizedText = Utils.normalizeUrl(rawText);
        const isUrl = Utils.isValidURL(normalizedText);

        const newNote = {
            id: tempId,
            text: normalizedText,
            type: isUrl ? 'link' : 'text',
            status: 'active',
            timestamp: { seconds: Math.floor(Date.now()/1000) },
            uid: user.uid,
            folder: targetFolder,
            tags: [],
            isPinned: false
        };

        await localDB.addToSyncQueue({ type: 'ADD', data: newNote });
        
        // UI রিফ্রেশ করতে লোডনোটস কল করা
        loadNotes(user.uid, 'All');
        
        noteInput.value = "";
        clearFileInput();
        showToast("✅ Note saved locally!");

        attemptSync();
    });
}

// 🔥 Background Share Processing Functions
async function processPendingShares(user) {
    const urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has('process_share')) return;

    try {
        const cache = await caches.open('shared-queue');
        const dataRes = await cache.match('pending-share');
        if (!dataRes) return;

        const sharedData = await dataRes.json();
        showToast("🚀 Background upload started...", "info");

        // ১. টেক্সট/লিঙ্ক প্রসেস করা
        let rawText = `${sharedData.title || ''}\n${sharedData.text || ''}\n${sharedData.url || ''}`.trim();
        
        // ২. ফাইলগুলো চেক করা
        let files = [];
        for (let i = 0; i < 10; i++) {
            const fileRes = await cache.match(`pending-file-${i}`);
            if (fileRes) files.push(await fileRes.blob());
            else break;
        }

        // ৩. ব্যাকগ্রাউন্ডে আপলোড শুরু
        uploadInBackground(user, rawText, files);

        // ৪. কিউ ক্লিয়ার করা এবং URL ক্লিন করা
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
            
            // ১. সাথে সাথে নোট সেভ করুন (AI ছাড়া)
            const docRef = await DBService.addNoteToDB(user.uid, {
                text: normalized,
                type: isUrl ? 'link' : 'text',
                status: 'active',
                isPinned: false
            });

            // ২. যদি লিঙ্ক হয়, তবে ব্যাকগ্রাউন্ডে মেটাডাটা এবং AI ট্যাগ আপডেট করুন
            if (isUrl) {
                updateSyncStatus("Fetching link info...", true);
                Utils.getLinkPreviewData(normalized).then(async (meta) => {
                    // মেটাডাটা পাওয়ার পর আপডেট
                    await DBService.updateNoteContentDB(docRef.id, normalized);
                    
                    // ৩. AI ট্যাগ জেনারেশন (সবশেষে)
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
            // ফাইল আপলোড লজিক (আগের মতোই কিন্তু visual feedback সহ)
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
        
        // নোট রিফ্রেশ
        document.querySelector('.filter-btn[data-filter="all"]')?.click();
    } catch (err) {
        updateSyncStatus("Upload failed!", false);
        setTimeout(() => updateSyncStatus(null), 5000);
        console.error("Background upload error:", err);
    }
}

// 🔥 Sync Manager - অফলাইন কাজগুলো Firebase-এ সিঙ্ক করা
export async function attemptSync() {
    if (!navigator.onLine) return;

    const queue = await localDB.getSyncQueue();
    if (queue.length === 0) return;

    updateSyncStatus("Syncing offline changes...", true);

    for (const item of queue) {
        try {
            if (item.type === 'ADD') {
                const { id, ...firebaseData } = item.data;
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

// ইন্টারনেট ফিরে এলে অটো সিঙ্ক
window.addEventListener('online', attemptSync);