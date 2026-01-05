// ১. কনফিগারেশন ইমপোর্ট
import { auth, db } from "./firebase-config.js"; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { collection, addDoc, onSnapshot, query, where, orderBy, serverTimestamp, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ============================================
// 👇 Cloudinary সেটআপ
const CLOUDINARY_CLOUD_NAME = "dfi0mg8bb"; 
const CLOUDINARY_PRESET = "i2tvy1m9";    
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
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

// --- ৩. অটো সেভ (Android Share) ---
async function handleSharedContent(userId) {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedRaw = urlParams.get('note') || urlParams.get('text');

    if (sharedRaw && sharedRaw.trim() !== "") {
        try {
            const decodedContent = decodeURIComponent(sharedRaw).trim(); // Trim added
            if(noteInput) noteInput.value = "Saving shared link...";

            let type = isValidURL(decodedContent) ? 'link' : 'text';

            await addDoc(collection(db, "notes"), {
                uid: userId,
                text: decodedContent,
                type: type,
                source: "android_share",
                timestamp: serverTimestamp()
            });

            window.history.replaceState({}, document.title, window.location.pathname);
            if(noteInput) noteInput.value = ""; 

        } catch (error) {
            console.error("Auto-save failed:", error);
        }
    }
}

// --- ৪. ম্যানুয়াল সেভ (Fix: Trim text to detect link correctly) ---
if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        const rawText = noteInput.value;
        const text = rawText ? rawText.trim() : ""; // স্পেস রিমুভ করা হচ্ছে
        const file = fileInput.files[0];
        const user = auth.currentUser;

        if (!text && !file) return alert("Please write something or select a file!");

        saveBtn.disabled = true;
        saveBtn.innerText = "Uploading...";
        if (statusText) statusText.style.display = 'block';

        try {
            let fileUrl = null;
            
            // ছবি আপলোড
            if (file) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', CLOUDINARY_PRESET); 

                const response = await fetch(CLOUDINARY_URL, { method: 'POST', body: formData });
                if (!response.ok) throw new Error('Image upload failed');
                
                const cloudData = await response.json();
                fileUrl = cloudData.secure_url; 
            }

            // টাইপ নির্ধারণ (লিংক নাকি টেক্সট)
            let type = 'text';
            if (fileUrl) {
                type = 'image';
            } else if (isValidURL(text)) {
                type = 'link'; // এখানে এখন সঠিকভাবে লিংক ডিটেক্ট হবে
            }

            // ডাটাবেসে সেভ
            await addDoc(collection(db, "notes"), {
                uid: user.uid,
                text: text, // ক্লিন টেক্সট সেভ হবে
                fileUrl: fileUrl, 
                type: type,
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

// --- ৬. ইউআরএল ভ্যালিডেশন (Improved) ---
function isValidURL(string) {
    if(!string) return false;
    // স্ট্রিং এর স্পেস কেটে চেক করা হবে
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
            
            // টাইপ চেক
            let cardType = data.type || 'text'; // ডিফল্ট টেক্সট

            // যদি টাইপ টেক্সট হয়, কিন্তু দেখতে লিংকের মতো মনে হয় (পুরানো ডাটার জন্য)
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
            // B. লিংক (প্রিভিউ সহ)
            else if (cardType === 'link') {
                const previewId = `preview-${id}`;
                contentHTML += `
                    <div id="${previewId}" class="link-preview-box">
                        <div style="padding: 15px; border: 1px solid #f0f0f0; border-radius: 8px; background: #fafafa;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="loader-spin"></div>
                                <span style="font-size: 13px; color: #777;">Loading...</span>
                            </div>
                            <a href="${data.text}" target="_blank" class="raw-link note-text" style="margin-top:8px; display:block; font-size:12px; color:#007bff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.8;">${escapeHtml(data.text)}</a>
                        </div>
                    </div>
                `;
                // প্রিভিউ কল
                setTimeout(() => fetchLinkPreview(data.text, previewId), 50);
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

// --- ৮. লিংক প্রিভিউ (Force Render Logic) ---
async function fetchLinkPreview(url, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    // URL ক্লিন করা (স্পেস থাকলে সমস্যা করে)
    const cleanUrl = url.trim();

    try {
        const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(cleanUrl)}`);
        const result = await response.json();

        if (result.status === 'success' && (result.data.title || result.data.image)) {
            const data = result.data;
            const title = data.title || cleanUrl;
            const description = data.description || '';
            const image = data.image ? data.image.url : null;
            const logo = data.logo ? data.logo.url : null;
            const publisher = data.publisher || new URL(cleanUrl).hostname;

            let htmlContent = `
                <a href="${cleanUrl}" target="_blank" style="text-decoration:none; color:inherit; display:block; border:1px solid #e0e0e0; border-radius:10px; overflow:hidden; background: #fff; transition: transform 0.2s;">
            `;

            if (image) {
                htmlContent += `<div style="height:150px; background-image: url('${image}'); background-size: cover; background-position: center;"></div>`;
            }

            htmlContent += `
                    <div style="padding:12px;">
                        <h4 style="margin:0 0 5px 0; font-size:14px; color:#2c3e50; line-height:1.4;">${escapeHtml(title)}</h4>
                        ${description ? `<div style="font-size:12px; color:#666; margin-bottom:8px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHtml(description)}</div>` : ''}
                        <div style="display:flex; align-items:center; gap:6px; font-size:11px; color:#999;">
                            ${logo ? `<img src="${logo}" style="width:16px; height:16px; border-radius:50%;">` : '🔗'}
                            <span>${escapeHtml(publisher)}</span>
                        </div>
                    </div>
                </a>
            `;
            el.innerHTML = htmlContent;
        } else {
            throw new Error("API data empty");
        }
    } catch (error) {
        // Fallback Logic (Force Render)
        renderForcedPreview(cleanUrl, el);
    }
}

// জোর করে প্রিভিউ রেন্ডার (Fallback)
function renderForcedPreview(url, element) {
    let brandColor = '#f0f2f5';
    let textColor = '#333';
    let iconHtml = '<span style="font-size:20px;">🔗</span>';
    let titleText = 'Visit Link';
    
    // হোস্টনেম বের করা (Error হ্যান্ডলিং সহ)
    let subText = "External Link";
    try {
        subText = new URL(url).hostname;
    } catch(e) {
        subText = url;
    }

    if (url.includes('facebook.com')) {
        brandColor = '#1877F2'; textColor = '#fff'; iconHtml = '<span style="font-size:24px; font-weight:bold;">f</span>'; 
        titleText = 'Facebook Post'; subText = 'Click to view on Facebook';
    } 
    else if (url.includes('instagram.com')) {
        brandColor = 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)'; 
        textColor = '#fff'; iconHtml = '<span style="font-size:24px;">📷</span>'; 
        titleText = 'Instagram Post'; subText = 'Click to view on Instagram';
    }
    else if (url.includes('youtube.com') || url.includes('youtu.be')) {
        brandColor = '#FF0000'; textColor = '#fff'; iconHtml = '<span style="font-size:24px;">▶️</span>'; 
        titleText = 'YouTube Video'; subText = 'Click to watch';
    }

    element.innerHTML = `
        <a href="${url}" target="_blank" style="text-decoration:none; display:flex; align-items:center; gap:15px; padding:15px; border-radius:12px; background: ${brandColor}; color: ${textColor}; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
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