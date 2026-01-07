import { db, auth } from "../firebase-config.js";
import { collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as DBService from "./firebase-service.js";
import * as UI from "./ui-renderer.js";
import * as Utils from "./utils.js";
import { openContextMenu, openReadModal } from "./menu-manager.js"; 

let unsubscribeNotes = null;

// ==================================================
// ১. নোট লোড করার লজিক
// ==================================================
export function loadNotes(uid, filterType = 'All', filterValue = null) {
    const contentGrid = document.getElementById('content-grid');
    const notesRef = collection(db, "notes");
    let q;

    // UI এলিমেন্ট হ্যান্ডলিং
    const inputArea = document.querySelector('.input-area');
    const pinSection = document.getElementById('pinned-section');
    
    // ট্র্যাশ ভিউতে ইনপুট এরিয়া লুকানো
    if(inputArea) inputArea.style.display = (filterType === 'trash') ? 'none' : 'block';
    if(pinSection) pinSection.style.display = 'none'; // লোডিং এর শুরুতে পিন সেকশন হাইড

    // কুয়েরি তৈরি
    if (filterType === 'trash') {
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "trash"), orderBy("timestamp", "desc"));
    } else if (filterType === 'folder') {
        loadPinnedNotes(uid); // ফোল্ডারেও পিন নোট দেখাবে
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), where("folder", "==", filterValue), orderBy("timestamp", "desc"));
    } else if (filterType !== 'All' && filterType !== 'all') {
        loadPinnedNotes(uid);
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), where("type", "==", filterType), orderBy("timestamp", "desc"));
    } else {
        loadPinnedNotes(uid); // 'All' ভিউতে পিন নোট দেখাবে
        q = query(notesRef, where("uid", "==", uid), where("status", "==", "active"), orderBy("timestamp", "desc"));
    }

    // পুরনো লিসেনার বন্ধ করা
    if (unsubscribeNotes) unsubscribeNotes();

    unsubscribeNotes = onSnapshot(q, (snapshot) => {
        contentGrid.innerHTML = "";
        
        if(snapshot.empty) {
            let msg = filterType === 'trash' ? "Trash is empty 🗑️" : "No notes found.";
            contentGrid.innerHTML = `<p style="text-align:center; color:#999; margin-top:20px; width:100%;">${msg}</p>`;
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            // পিন করা নোট মেইন লিস্টে ডুপ্লিকেট দেখাবো না (যদি না ট্র্যাশ ভিউ হয়)
            if (filterType !== 'trash' && data.isPinned) return;

            const card = UI.createNoteCardElement(docSnap, filterType === 'trash', {
                onRestore: DBService.restoreNoteDB,
                onDeleteForever: (id) => confirm("Permanently delete?") && DBService.deleteNoteForeverDB(id),
                onContextMenu: openContextMenu,
                onRead: openReadModal
            });
            contentGrid.appendChild(card);
        });
        
        // সার্চ রেজাল্ট রিফ্রেশ করা
        const searchInput = document.getElementById('searchInput');
        if(searchInput && searchInput.value) searchInput.dispatchEvent(new Event('input'));
    });
}

// ==================================================
// ২. পিন করা নোট লোড
// ==================================================
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
// ৩. নোট সেভ এবং ইমেজ হ্যান্ডলিং
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

    let androidSharedImage = null;

    // 📱 A. Android Interface (অ্যাপ থেকে ইমেজ রিসিভ)
    window.receiveImageFromApp = (base64) => {
        try {
            androidSharedImage = Utils.base64DataToBlob(base64);
            if(imagePreview && previewContainer) {
                imagePreview.src = base64;
                previewContainer.style.display = 'block';
            }
            if(saveBtn) saveBtn.innerText = "Save Image from App";
        } catch (e) {
            console.error("Android Image Error:", e);
        }
    };

    // 🖼️ B. Web Image Handling
    
    // ১. ক্যামেরা আইকনে ক্লিক করলে ফাইল ইনপুট ওপেন হবে
    if(triggerFileBtn) {
        triggerFileBtn.onclick = () => fileInput.click();
    }

    // ২. ফাইল সিলেক্ট করলে প্রিভিউ দেখাবে
    if(fileInput) {
        fileInput.onchange = (e) => {
            if(e.target.files[0]) {
                const r = new FileReader();
                r.onload = (ev) => { 
                    imagePreview.src = ev.target.result; 
                    previewContainer.style.display = 'block'; 
                };
                r.readAsDataURL(e.target.files[0]);
            }
        };
    }

    // ৩. ক্রস বাটনে ক্লিক করলে ইমেজ রিমুভ হবে
    if(removeImageBtn) {
        removeImageBtn.onclick = clearFileInput;
    }

    function clearFileInput() {
        fileInput.value = ""; 
        androidSharedImage = null; 
        previewContainer.style.display = 'none';
        saveBtn.innerText = "Save to Brain";
    }

    // 💾 C. Save Button Logic
    saveBtn.addEventListener('click', async () => {
        const rawText = noteInput.value;
        const file = fileInput.files[0];
        const targetFolder = document.getElementById('folderSelect')?.value || "General";
        const selectedColor = document.querySelector('input[name="noteColor"]:checked')?.value || "#ffffff";

        if (!rawText && !file && !androidSharedImage) return alert("Empty note!");

        // UI আপডেট (লোডিং স্টেট)
        saveBtn.disabled = true; 
        saveBtn.innerText = "Processing...";
        if(statusText) statusText.style.display = 'block';
        
        try {
            const text = Utils.normalizeUrl(rawText);
            let fileUrl = null, type = 'text', linkMeta = {};

            // ১. ছবি আপলোড (ফাইল অথবা অ্যান্ড্রয়েড)
            if (file || androidSharedImage) {
                saveBtn.innerText = "Uploading Image...";
                const data = await DBService.uploadToCloudinary(file || androidSharedImage);
                fileUrl = data.secure_url;
                type = 'image';
            } 
            // ২. লিঙ্ক প্রিভিউ (যদি টেক্সট লিঙ্ক হয়)
            else if (Utils.isValidURL(text)) {
                type = 'link';
                // Instagram/Facebook এপিআই কল স্কিপ করা
                if (!text.includes('instagram.com') && !text.includes('facebook.com')) {
                    saveBtn.innerText = "Fetching Preview...";
                    linkMeta = await Utils.getLinkPreviewData(text);
                }
            }

            // ৩. ডাটাবেসে সেভ
            saveBtn.innerText = "Saving...";
            await DBService.addNoteToDB(user.uid, {
                text, fileUrl, type, color: selectedColor, folder: targetFolder, 
                status: 'active', isPinned: false, ...linkMeta
            });

            // ৪. রিসেট
            noteInput.value = ""; 
            clearFileInput();
            
            // 'All' ট্যাবে ফিরে যাওয়া
            document.querySelector('.filter-btn[data-filter="all"]')?.click();

        } catch (e) { 
            console.error(e);
            alert("Error: " + e.message); 
        } finally { 
            saveBtn.disabled = false; 
            saveBtn.innerText = "Save to Brain"; 
            if(statusText) statusText.style.display = 'none';
        }
    });
}