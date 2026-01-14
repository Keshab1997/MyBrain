import { db, auth } from "../core/firebase-config.js";
import { collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as DBService from "../core/firebase-service.js";
import * as UI from "./ui-renderer.js";
import * as Utils from "../core/utils.js";
import { openContextMenu, openReadModal } from "./menu-manager.js";
import { askAI } from "./ai-service.js"; // 🔥 AI Service Import

let unsubscribeNotes = null;
let mediaRecorder = null;
let audioChunks = [];
let selectedNoteIds = new Set(); // 🔥 সিলেকশন স্টোর করার জন্য

// ==================================================
// ১. নোট লোড করার লজিক
// ==================================================
export function loadNotes(uid, filterType = 'All', filterValue = null) {
    const contentGrid = document.getElementById('content-grid');
    
    // Safety Check: গ্রিড না পেলে কাজ বন্ধ
    if (!contentGrid) {
        console.error("Error: 'content-grid' ID not found in HTML");
        return;
    }
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
        selectedNoteIds.clear(); // নতুন লোড হলে সিলেকশন ক্লিয়ার
        updateSelectionUI();

        // ট্র্যাশ হেডার
        if (filterType === 'trash') {
            const count = snapshot.size;
            const trashHeader = document.createElement('div');
            trashHeader.style.cssText = "width:100%; display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding:10px; background:#fff0f0; border-radius:8px; border:1px solid #ffcdd2; grid-column: 1 / -1;";
            
            trashHeader.innerHTML = `
                <span style="color:#d32f2f; font-weight:bold;">🗑️ Trash (${count} items)</span>
                ${count > 0 ? `<button id="emptyTrashBtn" style="background:#d32f2f; color:white; border:none; padding:6px 12px; border-radius:4px; cursor:pointer; font-size:13px;">Empty Trash</button>` : ''}
            `;
            
            const warning = document.createElement('p');
            warning.style.cssText = "width:100%; text-align:center; font-size:11px; color:#888; margin-bottom:15px; grid-column: 1 / -1;";
            warning.innerText = "Items in trash are automatically deleted after 7 days.";
            
            contentGrid.appendChild(trashHeader);
            contentGrid.appendChild(warning);

            setTimeout(() => {
                const emptyBtn = document.getElementById('emptyTrashBtn');
                if(emptyBtn) {
                    emptyBtn.onclick = async () => {
                        if(confirm("Delete ALL items permanently?")) await DBService.emptyTrashDB(uid);
                    };
                }
            }, 0);
        }

        if(snapshot.empty) {
            let msg = filterType === 'trash' ? "Trash is empty 😌" : "No notes found.";
            const p = document.createElement('p');
            p.style.cssText = "text-align:center; color:#999; margin-top:20px; width:100%; grid-column: 1 / -1;";
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
                onRead: openReadModal,
                onSelect: (id, isSelected) => { // 🔥 সিলেকশন হ্যান্ডলার
                    if(isSelected) selectedNoteIds.add(id);
                    else selectedNoteIds.delete(id);
                    updateSelectionUI();
                }
            });
            contentGrid.appendChild(card);
        });
        
        const searchInput = document.getElementById('searchInput');
        if(searchInput && searchInput.value) searchInput.dispatchEvent(new Event('input'));
    });

    setupSelectionLogic(uid, filterType === 'trash');
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

    // Safety Check: যদি বাটন না থাকে, তাহলে ফাংশন থেকে বের হয়ে যাও
    if (!toggleBtn || !selectAllBtn || !deleteSelectedBtn) {
        console.warn('Selection buttons not found in HTML');
        return;
    }

    // 1. Toggle Selection Mode
    toggleBtn.onclick = () => {
        document.body.classList.toggle('selection-mode');
        const isActive = document.body.classList.contains('selection-mode');
        toggleBtn.classList.toggle('active');
        toggleBtn.innerText = isActive ? "Cancel" : "Select";
        
        selectAllBtn.style.display = isActive ? 'inline-block' : 'none';
        deleteSelectedBtn.style.display = isActive ? 'inline-block' : 'none';
        
        if(!isActive) {
            selectedNoteIds.clear();
            document.querySelectorAll('.card-select-checkbox').forEach(cb => {
                cb.checked = false;
                cb.closest('.note-card').classList.remove('selected');
            });
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
        
        const msg = isTrash 
            ? `Permanently delete ${selectedNoteIds.size} items?` 
            : `Move ${selectedNoteIds.size} items to Trash?`;

        if(confirm(msg)) {
            const ids = Array.from(selectedNoteIds);
            await DBService.batchDeleteNotesDB(ids, isTrash);
            
            // Reset UI
            selectedNoteIds.clear();
            updateSelectionUI();
            document.body.classList.remove('selection-mode');
            toggleBtn.classList.remove('active');
            toggleBtn.innerText = "Select";
            selectAllBtn.style.display = 'none';
            deleteSelectedBtn.style.display = 'none';
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
export function setupNoteSaving(user) {
    const saveBtn = document.getElementById('saveBtn');
    const noteInput = document.getElementById('noteInput');
    const fileInput = document.getElementById('fileInput');
    const statusText = document.getElementById('uploadStatus');
    const imagePreview = document.getElementById('image-preview');
    const previewContainer = document.getElementById('image-preview-container');
    const triggerFileBtn = document.getElementById('triggerFile');
    const removeImageBtn = document.getElementById('remove-image-btn');

    // 🔥 AI বাটন এবং টুলবার (আপডেটেড)
    const toolbarHTML = `
        <div class="rich-toolbar" style="display:flex; gap:10px; margin-bottom:15px; padding-bottom:10px; border-bottom:1px solid #eee; align-items:center; flex-wrap:wrap;">
            
            <!-- সাধারণ টুলস -->
            <div style="display:flex; gap:5px;">
                <button id="btn-bold" title="Bold" style="background:none; border:none; cursor:pointer; font-weight:bold; padding:5px;">B</button>
                <button id="btn-italic" title="Italic" style="background:none; border:none; cursor:pointer; font-style:italic; padding:5px;">I</button>
                <button id="btn-list" title="List" style="background:none; border:none; cursor:pointer; padding:5px;">📋</button>
                <button id="btn-check" title="Checklist" style="background:none; border:none; cursor:pointer; padding:5px;">✅</button>
                <button id="btn-mic" title="Record Audio" style="background:none; border:none; cursor:pointer; font-size:16px; padding:5px;">🎤</button>
            </div>
            
            <div style="width:1px; height:20px; background:#ddd; margin:0 5px;"></div>
            
            <!-- AI ড্রপডাউন -->
            <div class="ai-dropdown">
                <button id="btn-ai" title="AI Magic">
                    <span>🪄</span> AI Tools
                </button>
                
                <div id="ai-menu">
                    <div class="ai-option" data-task="grammar">✨ Fix Grammar</div>
                    <div class="ai-option" data-task="summary">📝 Summarize</div>
                    <div class="ai-option" data-task="tags">🏷️ Generate Tags</div>
                </div>
            </div>
            
            <!-- স্ট্যাটাস মেসেজ -->
            <span id="recording-status" style="font-size:12px; color:red; display:none;">Recording...</span>
            <span id="ai-status" style="font-size:12px; color:#6366f1; display:none; font-weight:500; margin-left:5px;">Thinking...</span>
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

    // 🔥 AI Logic Implementation
    const aiBtn = document.getElementById('btn-ai');
    const aiMenu = document.getElementById('ai-menu');
    const aiStatus = document.getElementById('ai-status');

    if(aiBtn && aiMenu) {
        // Toggle Menu
        aiBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            aiMenu.style.display = aiMenu.style.display === 'block' ? 'none' : 'block';
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!aiBtn.contains(e.target) && !aiMenu.contains(e.target)) {
                aiMenu.style.display = 'none';
            }
        });

        // Handle AI Options
        document.querySelectorAll('.ai-option').forEach(opt => {
            opt.addEventListener('click', async (e) => {
                e.stopPropagation();
                aiMenu.style.display = 'none';
                
                const text = noteInput.value;
                if(!text.trim()) return alert("Please write something first!");

                const task = e.target.getAttribute('data-task');
                aiStatus.style.display = 'inline';
                aiBtn.disabled = true;
                aiBtn.style.opacity = '0.7';

                try {
                    const result = await askAI(task, text);
                    
                    if(task === 'tags') {
                        noteInput.value = text + "\n\n" + result;
                    } else {
                        // For grammar, replace text. For summary, append.
                        if(task === 'grammar') noteInput.value = result;
                        else noteInput.value = text + "\n\n**Summary:**\n" + result;
                    }
                } catch (err) {
                    alert("AI Error: " + err.message);
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
                    saveBtn.innerText = "Save Audio Note";
                };
                mediaRecorder.start();
                isRecording = true;
                micBtn.style.color = "red";
                recStatus.style.display = "inline";
            } catch (e) { alert("Microphone access denied!"); }
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

            if (audioBlob) {
                saveBtn.innerText = "Uploading Audio...";
                const data = await DBService.uploadToCloudinary(audioBlob);
                if(data.secure_url) { fileUrl = data.secure_url; type = 'audio'; } 
                else throw new Error("Audio upload failed");
            }
            else if (file || androidSharedImage) {
                saveBtn.innerText = "Uploading Image...";
                const data = await DBService.uploadToCloudinary(file || androidSharedImage);
                if(data.secure_url) { fileUrl = data.secure_url; type = 'image'; } 
                else throw new Error("Image upload failed");
            } 
            else if (Utils.isValidURL(text)) {
                type = 'link';
                // 🔥 আপডেট: ইনস্টাগ্রাম বা ফেসবুক হলে প্রিভিউ ফেচ করবেন না
                if (!text.includes('instagram.com') && !text.includes('facebook.com')) {
                    saveBtn.innerText = "🤖 AI Fetching...";
                    try {
                        linkMeta = await Utils.getLinkPreviewData(text);
                        
                        // অটোমেটিক ট্যাগ যুক্ত করা (যদি ওয়ার্কার ট্যাগ দেয়)
                        if (linkMeta.tags && Array.isArray(linkMeta.tags)) {
                            tags = [...new Set([...tags, ...linkMeta.tags])];
                        }
                    } catch (e) {
                        console.log("Preview failed, saving as simple link");
                    }
                } else {
                    // ইনস্টাগ্রামের জন্য সরাসরি টেক্সট হিসেবে সেভ হবে, যাতে এমবেড কাজ করে
                    console.log("Skipping preview fetch for social media embed");
                    if (text.includes('instagram')) {
                        linkMeta = { title: "Instagram Post" };
                    }
                }
            }

            saveBtn.innerText = "Saving...";
            await DBService.addNoteToDB(user.uid, {
                text, fileUrl, type, color: selectedColor, folder: targetFolder, 
                tags: tags, status: 'active', isPinned: false, ...linkMeta
            });

            noteInput.value = ""; clearFileInput();
            document.querySelector('.filter-btn[data-filter="all"]')?.click();

        } catch (e) { console.error("Save Error:", e); alert("Error: " + e.message); } 
        finally { 
            saveBtn.disabled = false; saveBtn.innerText = "Save to Brain"; 
            if(statusText) statusText.style.display = 'none';
        }
    });
}