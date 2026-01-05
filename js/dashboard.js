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

// স্পিনার স্টাইল ইনজেকশন (যাতে CSS ফাইল এডিট করা না লাগে)
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

// ফাইল/ক্যামেরা আইকনে ক্লিক
if(triggerFile && fileInput) {
    triggerFile.addEventListener('click', () => fileInput.click());
}

// ফাইল সিলেক্ট এবং প্রিভিউ লজিক
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
            triggerFile.title = "Selected: " + file.name;
        }
    });
}

// প্রিভিউ রিমুভ বাটন
if(removeImageBtn) {
    removeImageBtn.addEventListener('click', () => {
        clearFileInput();
    });
}

// লিংক আইকনে ক্লিক
if(triggerLink && noteInput) {
    triggerLink.addEventListener('click', () => {
        noteInput.focus();
        noteInput.placeholder = "Paste your link here...";
    });
}

// --- ২. মেইন অথেনটিকেশন ---
onAuthStateChanged(auth, (user) => {
    if (!user) {
        if (unsubscribeNotes) unsubscribeNotes();
        window.location.href = "index.html"; 
    } else {
        console.log("User Logged In:", user.uid);
        loadUserNotes(user.uid);
        handleSharedContent(user.uid);
        
        // লগইন করার পর ইউজারনেম আপডেট
        const navUserName = document.getElementById('nav-user-name');
        const navUserImg = document.getElementById('nav-user-img');
        const navProfileDiv = document.getElementById('nav-mini-profile');

        if(navProfileDiv) navProfileDiv.style.display = 'flex';
        if(navUserName) navUserName.textContent = user.displayName || user.email.split('@')[0];
        if(navUserImg && user.photoURL) navUserImg.src = user.photoURL;
    }
});

// --- ৩. অটো সেভ লজিক (Android Share) ---
async function handleSharedContent(userId) {
    const urlParams = new URLSearchParams(window.location.search);
    const sharedRaw = urlParams.get('note') || urlParams.get('text');

    if (sharedRaw && sharedRaw.trim() !== "") {
        try {
            const decodedContent = decodeURIComponent(sharedRaw);
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

// --- ৪. ম্যানুয়াল সেভ লজিক ---
if (saveBtn) {
    saveBtn.addEventListener('click', async () => {
        const text = noteInput.value;
        const file = fileInput.files[0];
        const user = auth.currentUser;

        if (!text && !file) return alert("Please write something or select a file!");

        saveBtn.disabled = true;
        saveBtn.innerText = "Uploading...";
        if (statusText) statusText.style.display = 'block';

        try {
            let fileUrl = null;
            let fileType = 'text';

            // ১. ছবি থাকলে Cloudinary তে আপলোড
            if (file) {
                const formData = new FormData();
                formData.append('file', file);
                formData.append('upload_preset', CLOUDINARY_PRESET); 

                const response = await fetch(CLOUDINARY_URL, {
                    method: 'POST',
                    body: formData
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(`Upload failed: ${errorData.error.message}`);
                }

                const cloudData = await response.json();
                fileUrl = cloudData.secure_url; 
                fileType = 'image';
            }

            // ২. টাইপ ঠিক করা
            let type = 'text';
            if (fileUrl) type = 'image';
            else if (isValidURL(text)) type = 'link';

            // ৩. ডাটাবেসে সেভ
            await addDoc(collection(db, "notes"), {
                uid: user.uid,
                text: text,
                fileUrl: fileUrl, 
                type: type,
                timestamp: serverTimestamp()
            });

            // সব ইনপুট ক্লিয়ার
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
    if(triggerFile) {
        triggerFile.style.color = ""; 
        triggerFile.title = "Add Image";
    }
}

// --- ৫. লগআউট ---
if (logoutBtn) {
    logoutBtn.addEventListener('click', (e) => {
        e.preventDefault(); 
        signOut(auth).then(() => {
            console.log("User signed out");
            window.location.href = "index.html";
        }).catch((error) => {
            console.error("Sign Out Error", error);
        });
    });
}

// --- ৬. ইউআরএল ভ্যালিডেশন ---
function isValidURL(string) {
    try {
        const url = new URL(string);
        return url.protocol === "http:" || url.protocol === "https:";
    } catch (_) { return false; }
}

// --- ৭. ডাটা লোড এবং রেন্ডারিং ---
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
            
            let cardType = 'note';
            if (data.type === 'image') cardType = 'image';
            else if (data.type === 'link') cardType = 'link';
            card.setAttribute('data-type', cardType);

            let contentHTML = '';

            // A. ইমেজ কার্ড
            if (data.type === 'image') {
                contentHTML += `<img src="${data.fileUrl}" loading="lazy" alt="Image" style="width:100%; border-radius: 8px; display:block;">`;
                if(data.text) contentHTML += `<p class="note-text" style="margin-top:10px;">${escapeHtml(data.text)}</p>`;
            }
            // B. লিংক কার্ড (লোডিং স্টেট সহ)
            else if (data.type === 'link') {
                const previewId = `preview-${id}`;
                contentHTML += `
                    <div id="${previewId}" class="link-preview-box">
                        <div style="padding: 15px; border: 1px solid #f0f0f0; border-radius: 8px; background: #fafafa;">
                            <div style="display: flex; align-items: center; gap: 10px;">
                                <div class="loader-spin"></div>
                                <span style="font-size: 13px; color: #777;">Loading preview...</span>
                            </div>
                            <a href="${data.text}" target="_blank" class="raw-link note-text" style="margin-top:8px; display:block; font-size:12px; color:#007bff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: 0.8;">${escapeHtml(data.text)}</a>
                        </div>
                    </div>
                `;
                // প্রিভিউ লোড শুরু
                fetchLinkPreview(data.text, previewId);
            } 
            // C. টেক্সট কার্ড
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

// --- ৮. লিংক প্রিভিউ (UPDATED & FIXED) ---
async function fetchLinkPreview(url, elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;

    try {
        // ১. সোশ্যাল মিডিয়া ডিটেকশন
        const isFacebook = url.includes('facebook.com');
        const isInstagram = url.includes('instagram.com');
        const isTiktok = url.includes('tiktok.com');
        const isSocial = isFacebook || isInstagram || isTiktok;

        // ২. API URL তৈরি (meta=true দেওয়া জরুরি)
        let apiUrl = `https://api.microlink.io/?url=${encodeURIComponent(url)}`;
        
        if (isSocial) {
            // Social Media হলে screenshot এবং meta দুটোই চাই
            apiUrl += "&screenshot=true&meta=true&prefer-color-scheme=light"; 
        }

        const response = await fetch(apiUrl);
        const result = await response.json();
        const data = result.data;

        if (result.status === 'success') {
            // ৩. সফল হলে প্রিভিউ কার্ড তৈরি
            let imageUrl = '';
            let imageStyle = 'background-size: cover; background-position: center;';

            if (isSocial && data.screenshot) {
                imageUrl = data.screenshot.url;
                imageStyle = 'background-size: cover; background-position: center top;'; // Top position for social
            } else if (data.image) {
                imageUrl = data.image.url;
            }

            const title = data.title || url;
            const description = data.description 
                ? `<p style="font-size: 12px; color: #666; margin: 5px 0; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${data.description}</p>` 
                : '';
            
            const publisher = data.publisher || new URL(url).hostname;

            el.innerHTML = `
                <a href="${url}" target="_blank" class="preview-card-link" style="text-decoration:none; color:inherit; display:block; border:1px solid #e0e0e0; border-radius:10px; overflow:hidden; background: #fff; box-shadow: 0 2px 5px rgba(0,0,0,0.05); transition: all 0.2s;">
                    ${imageUrl ? `<div class="preview-img" style="height:150px; background-image: url('${imageUrl}'); ${imageStyle}"></div>` : ''}
                    <div class="preview-info" style="padding:12px;">
                        <h4 class="preview-title" style="margin:0 0 5px 0; font-size:14px; font-weight:700; line-height:1.4; color: #333;">${title}</h4>
                        ${description}
                        <div style="font-size: 11px; color: #888; margin-top: 8px; font-weight:500; display:flex; align-items:center; gap:6px;">
                            ${data.logo ? `<img src="${data.logo.url}" style="width:14px; height:14px; border-radius:3px;">` : '🔗'}
                            ${publisher}
                        </div>
                    </div>
                </a>
            `;
        } else {
            throw new Error("Preview data missing");
        }

    } catch (error) {
        console.log("Rendering Fallback Card for:", url);
        
        // ৪. ফলব্যাক ডিজাইন (সুন্দর কালারফুল কার্ড)
        let icon = '🔗';
        let titleText = 'Visit Link';
        let brandColor = '#f0f0f0'; // Default gray
        let textColor = '#333';
        let brandName = 'Website';

        // ব্র্যান্ড অনুযায়ী কালার সেট করা
        if (url.includes('facebook.com')) {
            icon = '<span style="font-size:24px; font-weight:bold;">f</span>'; 
            brandColor = '#1877F2';
            textColor = '#fff';
            titleText = 'View on Facebook';
            brandName = 'Facebook';
        } else if (url.includes('instagram.com')) {
            icon = '<span style="font-size:24px;">📷</span>';
            brandColor = 'linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%)';
            textColor = '#fff';
            titleText = 'View on Instagram';
            brandName = 'Instagram';
        } else if (url.includes('youtube.com') || url.includes('youtu.be')) {
            icon = '<span style="font-size:24px;">▶️</span>';
            brandColor = '#FF0000';
            textColor = '#fff';
            titleText = 'Watch on YouTube';
            brandName = 'YouTube';
        }

        // Fallback UI রেন্ডার
        el.innerHTML = `
            <a href="${url}" target="_blank" style="text-decoration:none; display:flex; align-items:center; gap:12px; padding:12px; border-radius:10px; background: ${brandColor.includes('gradient') ? brandColor : brandColor}; color: ${textColor}; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="background: rgba(255,255,255,0.2); width:40px; height:40px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
                    ${icon}
                </div>
                <div style="flex:1; overflow:hidden;">
                    <h4 style="margin:0; font-size:14px; font-weight:600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${titleText}</h4>
                    <small style="opacity: 0.9; font-size: 11px;">${brandName} • Click to open</small>
                </div>
                <div style="font-size:18px; opacity:0.8;">↗</div>
            </a>
            <div style="margin-top:4px; font-size:10px; color:#999; padding-left:5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${url}</div>
        `;
    }
}

function escapeHtml(text) {
    if (!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// --- ১০. ডিলিট ফাংশন ---
window.deleteNote = async (id) => {
    if(confirm("Are you sure you want to delete this?")) {
        try {
            await deleteDoc(doc(db, "notes", id));
        } catch (error) {
            console.error("Delete failed:", error);
            alert("Delete failed!");
        }
    }
};