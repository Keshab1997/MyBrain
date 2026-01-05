// ১. কনফিগারেশন ইমপোর্ট
import { auth, db } from "./firebase-config.js"; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, deleteDoc, doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================
// 👇 Cloudinary সেটআপ
const CLOUDINARY_CLOUD_NAME = "dfi0mg8bb"; 
const CLOUDINARY_PRESET = "i2tvy1m9";    
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

// 👇 তোমার আনলিমিটেড Cloudflare Worker URL
const WORKER_URL = "https://royal-rain-33fa.keshabsarkar2018.workers.dev";
// ============================================

// স্পিনার স্টাইল
const style = document.createElement('style');
style.innerHTML = `
  @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  .loader-spin { animation: spin 1s linear infinite; border: 2px solid #ddd; border-top: 2px solid #007bff; border-radius: 50%; width: 16px; height: 16px; display: inline-block; }
`;
document.head.appendChild(style);

// DOM এলিমেন্টস
let unsubscribeNotes = null;

const logoutBtn = document.getElementById('menu-logout-btn'); 
const saveBtn = document.getElementById('saveBtn');
const noteInput = document.getElementById('noteInput');
const fileInput = document.getElementById('fileInput');
const statusText = document.getElementById('uploadStatus');
const searchInput = document.getElementById('searchInput');

// প্রিভিউ এলিমেন্টস
const previewContainer = document.getElementById('image-preview-container');
const previewImage = document.getElementById('image-preview');
const removeImageBtn = document.getElementById('remove-image-btn');

// আইকন ট্রিগার
const triggerFile = document.getElementById('triggerFile');
const triggerLink = document.getElementById('triggerLink');

// --- ১. UI ইভেন্ট লিসেনার ---

// সার্চ লজিক
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const searchText = e.target.value.toLowerCase();
        const cards = document.querySelectorAll('.note-card');

        cards.forEach(card => {
            const textContent = card.innerText.toLowerCase();
            if (textContent.includes(searchText)) {
                card.style.display = 'block'; 
            } else {
                card.style.display = 'none';
            }
        });
    });
}

// ফাইল ট্রিগার
if(triggerFile && fileInput) {
    triggerFile.addEventListener('click', () => fileInput.click());
}

// ফাইল প্রিভিউ
if(fileInput) {
    fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if(file) {
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

// রিমুভ ইমেজ
if(removeImageBtn) {
    removeImageBtn.addEventListener('click', () => {
        clearFileInput();
    });
}

// লিংক ট্রিগার
if(triggerLink && noteInput) {
    triggerLink.addEventListener('click', () => {
        noteInput.focus();
        noteInput.placeholder = "Paste your link here...";
    });
}

// --- ২. অথেনটিকেশন ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        if (unsubscribeNotes) unsubscribeNotes();
        window.location.href = "index.html"; 
    } else {
        loadUserNotes(user.uid);
        handleSharedContent(user.uid);
        
        const navUserName = document.getElementById('nav-user-name');
        const navUserImg = document.getElementById('nav-user-img');
        const navProfileDiv = document.getElementById('nav-mini-profile');

        if(navProfileDiv) navProfileDiv.style.display = 'flex';
        if(navUserName) navUserName.textContent = user.displayName || user.email.split('@')[0];
        if(navUserImg && user.photoURL) navUserImg.src = user.photoURL;
    }
});

// --- HELPER: URL Fixer (FIXED) ---
function normalizeUrl(input) {
    if (!input) return "";
    let url = input.trim();
    // যদি http/https না থাকে কিন্তু ডোমেইনের মতো দেখতে হয়
    if (url && !url.startsWith('http://') && !url.startsWith('https://') && url.includes('.') && !url.includes(' ')) {
        return 'https://' + url;
    }
    return url;
}

// --- ৩. অটো সেভ (Android Share - Optimized) ---
async function handleSharedContent(userId) {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedRaw = urlParams.get('note') || urlParams.get('text');

    if (sharedRaw && sharedRaw.trim() !== "") {
        try {
            let decodedContent = decodeURIComponent(sharedRaw).trim();
            
            // 👇 FIX: লিঙ্ক হলে অটোমেটিক https বসাবে
            decodedContent = normalizeUrl(decodedContent);

            if(noteInput) noteInput.value = "Saving...";

            let type = isValidURL(decodedContent) ? 'link' : 'text';

            const docRef = await addDoc(collection(db, "notes"), {
                uid: userId,
                text: decodedContent,
                type: type,
                source: "android_share",
                timestamp: serverTimestamp(),
                metaTitle: null,
                isLoadingMeta: type === 'link'
            });

            window.history.replaceState({}, document.title, window.location.pathname);
            if(noteInput) noteInput.value = "Saved!";

            if (type === 'link') {
                getLinkPreviewData(decodedContent)
                    .then(async (linkMeta) => {
                        await updateDoc(docRef, {
                            metaTitle: linkMeta.title || null,
                            metaDesc: linkMeta.description || null,
                            metaImg: linkMeta.image || null,
                            metaDomain: linkMeta.domain || null,
                            isLoadingMeta: false
                        });
                    })
                    .catch(async (err) => {
                        console.error("Meta fetch failed:", err);
                        await updateDoc(docRef, { isLoadingMeta: false });
                    });
            }

            setTimeout(() => { if(noteInput && noteInput.value === "Saved!") noteInput.value = ""; }, 2000);

        } catch (error) {
            console.error("Auto-save failed:", error);
            if(noteInput) noteInput.value = "Error!";
        }
    }
}

// --- 🔥 নতুন আনলিমিটেড API ফাংশন (Cloudflare Worker) ---
async function getLinkPreviewData(url) {
    const cleanUrl = url.trim();
    let metaData = {
        title: null,
        description: null,
        image: null,
        domain: null
    };

    try {
        const urlObj = new URL(cleanUrl);
        metaData.domain = urlObj.hostname;

        const response = await fetch(`${WORKER_URL}?url=${encodeURIComponent(cleanUrl)}`);
        const result = await response.json();

        if (result.status === 'success') {
            const data = result.data;
            metaData.title = data.title || cleanUrl;
            metaData.description = data.description || "";
            metaData.image = data.image || null;
        } else {
            throw new Error("Worker failed");
        }
    } catch (error) {
        console.warn("Fetch error:", error);
        if (cleanUrl.includes('facebook.com')) {
            metaData.title = 'Facebook Post';
        } else if (cleanUrl.includes('instagram.com')) {
            metaData.title = 'Instagram Post';
        } else if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be')) {
            metaData.title = 'YouTube Video';
        } else {
            metaData.title = cleanUrl;
        }
    }
    return metaData;
}


// --- ৪. ম্যানুয়াল সেভ (FIXED) ---
if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        const rawText = noteInput.value;
        const file = fileInput.files[0];
        const user = auth.currentUser;

        if (!rawText && !file) return alert("Please write something or select a file!");

        // 👇 FIX: এখানেও অটোমেটিক https বসাবে
        const text = normalizeUrl(rawText);

        saveBtn.disabled = true;
        
        try {
            let fileUrl = null;
            let type = 'text';
            let linkMeta = {};

            // ১. ছবি আপলোড লজিক
            if (file) {
                saveBtn.innerText = "Uploading Image...";
                if (statusText) statusText.style.display = 'block';

                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', CLOUDINARY_PRESET); 

                const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
                if (!response.ok) throw new Error('Image upload failed');
                
                const cloudData = await response.json();
                fileUrl = cloudData.secure_url; 
                type = 'image';
            } 
            // ২. লিংক লজিক
            else if (isValidURL(text)) {
                type = 'link';
                saveBtn.innerText = "Fetching Preview..."; 
                if (statusText) statusText.style.display = 'block';
                
                linkMeta = await getLinkPreviewData(text);
            }

            // ৩. ডাটাবেসে সেভ
            saveBtn.innerText = "Saving...";
            await addDoc(collection(db, "notes"), {
                uid: user.uid,
                text: text, // Normalized text (with https)
                fileUrl: fileUrl, 
                type: type,
                metaTitle: linkMeta.title || null,
                metaDesc: linkMeta.description || null,
                metaImg: linkMeta.image || null,
                metaDomain: linkMeta.domain || null,
                isLoadingMeta: false, 
                timestamp: serverTimestamp()
            });

            noteInput.value = "";
            clearFileInput(); 

        } catch (error) {
            console.error("Error saving:", error);
            alert("Error: " + error.message);
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerText = "Save to Brain";
            if (statusText) statusText.style.display = 'none';
        }
    });
}

function clearFileInput() {
    fileInput.value = ""; 
    if(previewContainer) previewContainer.style.display = 'none'; 
    if(previewImage) previewImage.src = ""; 
    if(triggerFile) triggerFile.style.color = ""; 
}

// --- ৫. লগআউট ---
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault(); 
        signOut(auth).then(() => window.location.href = "index.html");
    });
}

// --- ৬. ইউআরএল ভ্যালিডেশন ---
function isValidURL(string) {
    if(!string) return false;
    const trimmedString = string.trim();
    try {
        const url = new URL(trimmedString);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) { return false; }
}

// --- ৭. ডাটা লোড ---
function loadUserNotes(uid) {
    const q = query(collection(db, "notes"), where("uid", "==", uid), orderBy("timestamp", "desc"));
    const grid = document.getElementById('content-grid'); 

    if (unsubscribeNotes) unsubscribeNotes();

    unsubscribeNotes = onSnapshot(q, (snapshot) => {
        if(!grid) return;
        grid.innerHTML = ""; 
        
        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            const id = docSnap.id;
            
            const card = document.createElement('div');
            card.className = 'note-card'; 
            
            let cardType = data.type || 'text';

            if (cardType === 'text' && isValidURL(data.text)) {
                cardType = 'link';
            }
            
            card.setAttribute('data-type', cardType);
            let contentHTML = '';

            // A. ইমেজ
            if (cardType === 'image') {
                contentHTML += `<img src="${data.fileUrl}" loading="lazy" alt="Image" style="width:100%; border-radius: 8px; display:block;">`;
                if(data.text) contentHTML += `<p class="note-text" style="margin-top:10px;">${escapeHtml(data.text)}</p>`;
            }
            // B. লিংক
            else if (cardType === 'link') {
                // ১. যদি মেটাডাটা থাকে
                if (data.metaTitle) {
                    contentHTML += `
                    <a href="${data.text}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; color:inherit; display:block; border:1px solid #e0e0e0; border-radius:10px; overflow:hidden; background: #fff; transition: transform 0.2s;">
                        ${data.metaImg ? `<div style="height:150px; background-image: url('${data.metaImg}'); background-size: cover; background-position: center;"></div>` : ''}
                        <div style="padding:12px;">
                            <h4 style="margin:0 0 5px 0; font-size:14px; color:#2c3e50; line-height:1.4;">${escapeHtml(data.metaTitle)}</h4>
                            ${data.metaDesc ? `<div style="font-size:12px; color:#666; margin-bottom:8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(data.metaDesc)}</div>` : ''}
                            <div style="display:flex; align-items:center; gap:6px; font-size:11px; color:#999;">
                                <span>🔗 ${escapeHtml(data.metaDomain || 'Link')}</span>
                            </div>
                        </div>
                    </a>
                    <div style="margin-top:5px; font-size:11px; color:#aaa; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(data.text)}</div>
                    `;
                } 
                // ২. লোডিং স্টেট
                else if (data.isLoadingMeta) {
                    contentHTML += `
                        <div style="padding: 15px; background: #f9f9f9; border-radius: 10px; border: 1px dashed #ccc; display:flex; align-items:center; gap:10px;">
                            <div class="loader-spin"></div>
                            <div style="font-size:12px; color:#666;">Fetching link details...</div>
                        </div>
                        <div style="margin-top:5px; font-size:11px; color:#aaa;">${escapeHtml(data.text)}</div>
                    `;
                }
                // ৩. ফলব্যাক
                else {
                    const previewId = `preview-${id}`;
                    contentHTML += `<div id="${previewId}"></div>`;
                    setTimeout(() => renderForcedPreview(data.text, document.getElementById(previewId)), 0);
                }
            } 
            // C. টেক্সট
            else {
                if(data.text) contentHTML += `<p class="note-text">${escapeHtml(data.text)}</p>`;
            }

            const dateString = data.timestamp ? data.timestamp.toDate().toLocaleDateString() : '';
            contentHTML += `
                <div class="card-footer" style="display: flex; justify-content: space-between; align-items: center; margin-top: 15px; padding-top: 10px; border-top: 1px solid var(--border-color, #eee);">
                    <small style="color: var(--text-muted, #888); font-size: 11px;">${dateString}</small>
                    <button class="delete-btn" onclick="deleteNote('${id}')" style="background:none; border:none; cursor:pointer; font-size:16px; color: #ff4d4d;">🗑</button>
                </div>
            `;

            card.innerHTML = contentHTML;
            grid.appendChild(card);
        });
    });
}

// --- ৮. ফলব্যাক রেন্ডারার ---
function renderForcedPreview(url, element) {
    if(!element) return;
    
    let brandColor = '#f0f2f5';
    let textColor = '#333';
    let iconHtml = '<span style="font-size:20px;">🔗</span>';
    let titleText = 'Visit Link';
    let subText = "External Link";
    
    try {
        subText = new URL(url).hostname;
    } catch(e) {
        subText = url;
    }

    if (url.includes('facebook.com')) {
        brandColor = '#1877F2'; textColor = '#fff'; iconHtml = '<span style="font-size:24px; font-weight:bold;">f</span>'; 
        titleText = 'Facebook Post'; subText = 'View on Facebook';
    } 
    else if (url.includes('instagram.com')) {
        brandColor = 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'; 
        textColor = '#fff'; iconHtml = '<span style="font-size:24px;">📷</span>'; 
        titleText = 'Instagram Post'; subText = 'View on Instagram';
    }
    else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        brandColor = '#FF0000'; textColor = '#fff'; iconHtml = '<span style="font-size:24px;">▶️</span>'; 
        titleText = 'YouTube Video'; subText = 'Click to watch';
    }

    element.innerHTML = `
        <a href="${url}" target="_blank" rel="noopener noreferrer" style="text-decoration:none; display:flex; align-items:center; gap:15px; padding:15px; border-radius:12px; background: ${brandColor}; color: ${textColor}; box-shadow: 0 4px 6px rgba(0,0,0,0.1); transition: transform 0.2s;">
            <div style="width:45px; height:45px; background:rgba(255,255,255,0.25); border-radius:50%; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                ${iconHtml}
            </div>
            <div style="flex:1; overflow:hidden;">
                <h4 style="margin:0; font-size:16px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${titleText}</h4>
                <div style="font-size:12px; opacity:0.9; margin-top:2px;">${subText}</div>
            </div>
            <div style="font-size:20px; opacity:0.8;">↗</div>
        </a>
        <div style="margin-top:5px; padding-left:5px; font-size:11px; color:#aaa; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${url}</div>
    `;
}

function escapeHtml(text) {
    if (!text) return "";
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

window.deleteNote = async (id) => {
    if(confirm("Are you sure?")) {
        try { await deleteDoc(doc(db, "notes", id)); } catch (e) { alert("Delete failed!"); }
    }
};