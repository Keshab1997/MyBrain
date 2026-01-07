import { db } from "../firebase-config.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as DBService from "./firebase-service.js";
import * as Utils from "./utils.js";

let currentEditId = null;

// ==================================================
// ১. কনটেক্সট মেনু ওপেন (Right Click / 3-Dot)
// ==================================================
export async function openContextMenu(e, id) {
    e.stopPropagation();
    currentEditId = id;
    const menu = document.getElementById('contextMenu');
    
    // ডাটাবেস থেকে নোটের তথ্য আনা
    const docSnap = await getDoc(doc(db, "notes", id));
    if(!docSnap.exists()) return;
    const data = docSnap.data();

    // পজিশন সেট (ডেস্কটপ ও মোবাইল হ্যান্ডলিং)
    let x = e.pageX, y = e.pageY;
    if(e.type === 'click') { 
        const rect = e.target.getBoundingClientRect();
        x = rect.left - 100; // মোবাইলে একটু বামে সরবে
        y = rect.bottom + window.scrollY; 
    }
    
    menu.style.top = `${y}px`; menu.style.left = `${x}px`; menu.style.display = 'block';

    // --- মেনু অ্যাকশনস ---

    // ১. ট্র্যাশ
    document.getElementById('ctx-trash').onclick = () => { 
        DBService.moveToTrashDB(id); 
        menu.style.display='none'; 
    };

    // ২. কপি টেক্সট
    document.getElementById('ctx-copy').onclick = () => { 
        navigator.clipboard.writeText(data.text || data.fileUrl); 
        menu.style.display='none'; 
        alert("Copied!"); 
    };
    
    // ৩. পিন / আনপিন
    const pinBtn = document.getElementById('ctx-pin');
    pinBtn.innerHTML = data.isPinned ? "🚫 Unpin" : "📌 Pin";
    pinBtn.onclick = () => { 
        DBService.togglePinDB(id, data.isPinned); 
        menu.style.display='none'; 
    };

    // ৪. এডিট
    document.getElementById('ctx-edit').onclick = () => {
        document.getElementById('editNoteInput').value = data.text || "";
        document.getElementById('editModal').style.display = 'flex';
        menu.style.display='none';
    };

    // ৫. শেয়ার (নতুন যোগ করা হয়েছে)
    document.getElementById('ctx-share').onclick = () => {
        document.getElementById('shareModal').style.display = 'flex';
        menu.style.display = 'none';
    };

    // ৬. ডাউনলোড (নতুন যোগ করা হয়েছে)
    document.getElementById('ctx-download').onclick = () => {
        downloadNoteContent(data);
        menu.style.display = 'none';
    };
}

// ==================================================
// ২. রিডিং মোডাল ওপেন
// ==================================================
export function openReadModal(data, id) {
    const modal = document.getElementById('readModal');
    const content = document.getElementById('readModalContent');
    const dateEl = document.getElementById('readModalDate');
    const folderEl = document.getElementById('readModalFolder');

    // তারিখ এবং ফোল্ডার সেট করা
    if(dateEl) dateEl.innerText = data.timestamp?.toDate().toLocaleString() || '';
    if(folderEl) folderEl.innerText = data.folder || 'General';

    const embed = Utils.getUniversalEmbedHTML(data.text);
    
    let html = embed || (data.text ? marked.parse(data.text) : '');
    if(data.type === 'image') html = `<img src="${data.fileUrl}" style="max-width:100%; border-radius:8px; margin-bottom:15px;">` + html;
    
    content.innerHTML = html;
    modal.style.display = 'flex';
}

// ==================================================
// ৩. মডাল এবং বাটন সেটআপ
// ==================================================
export function setupModals() {
    
    // DOM এলিমেন্টস
    const editModal = document.getElementById('editModal');
    const readModal = document.getElementById('readModal');
    const shareModal = document.getElementById('shareModal');
    const contextMenu = document.getElementById('contextMenu');

    // --- A. ক্লোজ বাটন লজিক ---
    document.getElementById('closeReadModalBtn')?.addEventListener('click', () => readModal.style.display = 'none');
    document.querySelector('#shareModal .close-modal')?.addEventListener('click', () => shareModal.style.display = 'none');
    document.querySelector('#editModal .close-modal')?.addEventListener('click', () => editModal.style.display = 'none');

    // --- B. আপডেট বাটন (Edit Save) ---
    document.getElementById('updateNoteBtn').onclick = async () => {
        if(currentEditId) {
            await DBService.updateNoteContentDB(currentEditId, document.getElementById('editNoteInput').value);
            editModal.style.display = 'none';
        }
    };

    // --- C. শেয়ার বাটন লজিক ---
    document.getElementById('share-wa')?.addEventListener('click', () => shareLink('whatsapp'));
    document.getElementById('share-fb')?.addEventListener('click', () => shareLink('facebook'));
    document.getElementById('share-tg')?.addEventListener('click', () => shareLink('telegram'));
    document.getElementById('share-mail')?.addEventListener('click', () => shareLink('email'));
    document.getElementById('share-copy')?.addEventListener('click', () => shareLink('copy'));

    // --- D. উইন্ডো ক্লিক লিসেনার (Outside Click Close) ---
    window.addEventListener('click', (e) => {
        if(contextMenu && !contextMenu.contains(e.target) && !e.target.classList.contains('delete-btn')) {
            contextMenu.style.display = 'none';
        }
        if (e.target === readModal) readModal.style.display = 'none';
        if (e.target === editModal) editModal.style.display = 'none';
        if (e.target === shareModal) shareModal.style.display = 'none';
    });
}

// ==================================================
// ৪. শেয়ার এবং ডাউনলোড ফাংশন
// ==================================================

// শেয়ার ফাংশন (Android & Web)
async function shareLink(platform) {
    if (!currentEditId) return;

    const docSnap = await getDoc(doc(db, "notes", currentEditId));
    if (!docSnap.exists()) return;
    const data = docSnap.data();

    const shareUrl = window.location.origin + '?note=' + currentEditId;
    const textToShare = data.text || "Check this note!";
    const fullText = textToShare + "\n\n" + shareUrl;

    // 📱 Android Native Share Logic
    if (typeof Android !== "undefined" && Android.shareImage) {
        if (data.type === 'image' && data.fileUrl) {
            Android.shareImage(data.fileUrl, textToShare);
        } else {
            // টেক্সট শেয়ার করার জন্য ইমেজ মেথডই ব্যবহার করা হচ্ছে (অ্যাপ লজিক অনুযায়ী)
            Android.shareImage("", fullText);
        }
        document.getElementById('shareModal').style.display = 'none';
        return; 
    }

    // 🌐 Web Share Logic
    switch(platform) {
        case 'whatsapp': window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, '_blank'); break;
        case 'facebook': window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank'); break;
        case 'telegram': window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(textToShare)}`, '_blank'); break;
        case 'email': window.open(`mailto:?subject=Shared Note&body=${encodeURIComponent(fullText)}`, '_blank'); break;
        case 'copy': navigator.clipboard.writeText(fullText).then(() => alert('Copied!')); break;
    }
    document.getElementById('shareModal').style.display = 'none';
}

// ডাউনলোড ফাংশন
function downloadNoteContent(data) {
    try {
        if (data.type === 'image' && data.fileUrl) {
            // Cloudinary থেকে ফোর্স ডাউনলোড করার জন্য URL মডিফাই করা
            let downloadUrl = data.fileUrl;
            if(downloadUrl.includes('cloudinary.com') && downloadUrl.includes('/upload/')) {
                downloadUrl = downloadUrl.replace('/upload/', '/upload/fl_attachment/');
            }
            window.location.href = downloadUrl;
        } 
        else {
            // টেক্সট ফাইল ডাউনলোড
            const textContent = data.text || "Empty Note";
            const blob = new Blob([textContent], { type: 'text/plain' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.style.display = 'none';
            a.href = url;
            a.download = `mybrain_note_${Date.now()}.txt`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        }
    } catch (error) {
        console.error("Download failed:", error);
        alert("Download failed! See console.");
    }
}