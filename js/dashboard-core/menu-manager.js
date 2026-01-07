import { db } from "../firebase-config.js";
import { getDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import * as DBService from "./firebase-service.js";
import * as Utils from "./utils.js";

let currentEditId = null;

// ==================================================
// ১. কনটেক্সট মেনু ওপেন (Fixed Positioning)
// ==================================================
export async function openContextMenu(e, id) {
    e.stopPropagation();
    e.preventDefault();
    
    currentEditId = id;
    const menu = document.getElementById('contextMenu');
    
    // পিন স্ট্যাটাস আপডেট
    const docSnap = await getDoc(doc(db, "notes", id));
    if(docSnap.exists()) {
        const data = docSnap.data();
        const pinBtn = document.getElementById('ctx-pin');
        if(pinBtn) pinBtn.innerHTML = data.isPinned ? "🚫 Unpin" : "📌 Pin";
    }

    // মেনু পজিশন ক্যালকুলেশন (স্মার্ট পজিশনিং)
    const menuWidth = 160;
    const menuHeight = 200; // আনুমানিক উচ্চতা
    const screenWidth = window.innerWidth;
    const screenHeight = window.innerHeight;

    let x = e.pageX;
    let y = e.pageY;

    // ডানদিকে জায়গা না থাকলে বামে সরাও
    if (x + menuWidth > screenWidth) {
        x = x - menuWidth;
    }

    // নিচে জায়গা না থাকলে উপরে তোলো (স্ক্রল পজিশন সহ)
    if (y + menuHeight > window.scrollY + screenHeight) {
        y = y - menuHeight;
    }

    menu.style.top = `${y}px`; 
    menu.style.left = `${x}px`; 
    menu.style.display = 'block';
}

// ... বাকি কোড (openReadModal, setupModals, shareLink, downloadNoteContent) আগের মতোই থাকবে ...
// (নিচে পুরো ফাইলের বাকি অংশ দেওয়া হলো না কারণ শুধু উপরের ফাংশনটিই পরিবর্তন করতে হবে)

// ==================================================
// ২. রিডিং মোডাল ওপেন
// ==================================================
export function openReadModal(data, id) {
    const modal = document.getElementById('readModal');
    const content = document.getElementById('readModalContent');
    const dateEl = document.getElementById('readModalDate');
    const folderEl = document.getElementById('readModalFolder');

    if(dateEl) dateEl.innerText = data.timestamp?.toDate().toLocaleString() || '';
    if(folderEl) folderEl.innerText = data.folder || 'General';

    const embed = Utils.getUniversalEmbedHTML(data.text);
    
    let html = embed || (data.text ? marked.parse(data.text) : '');
    if(data.type === 'image') html = `<img src="${data.fileUrl}" style="max-width:100%; border-radius:8px; margin-bottom:15px;">` + html;
    
    content.innerHTML = html;
    modal.style.display = 'flex';
}

// ==================================================
// ৩. মডাল এবং বাটন সেটআপ (সব অ্যাকশন এখানে থাকবে)
// ==================================================
export function setupModals() {
    
    // DOM এলিমেন্টস
    const editModal = document.getElementById('editModal');
    const readModal = document.getElementById('readModal');
    const shareModal = document.getElementById('shareModal');
    const contextMenu = document.getElementById('contextMenu');

    // --- A. কনটেক্সট মেনু অ্যাকশন (Delete, Copy, Pin, etc.) ---
    
    // ১. ট্র্যাশ (Delete)
    document.getElementById('ctx-trash')?.addEventListener('click', () => {
        if(currentEditId) {
            DBService.moveToTrashDB(currentEditId);
            contextMenu.style.display = 'none';
        }
    });

    // ২. কপি
    document.getElementById('ctx-copy')?.addEventListener('click', async () => {
        if(currentEditId) {
            const docSnap = await getDoc(doc(db, "notes", currentEditId));
            if(docSnap.exists()) {
                const text = docSnap.data().text || docSnap.data().fileUrl;
                navigator.clipboard.writeText(text);
                alert("Copied to clipboard!");
            }
            contextMenu.style.display = 'none';
        }
    });

    // ৩. পিন / আনপিন
    document.getElementById('ctx-pin')?.addEventListener('click', async () => {
        if(currentEditId) {
            const docSnap = await getDoc(doc(db, "notes", currentEditId));
            if(docSnap.exists()) {
                DBService.togglePinDB(currentEditId, docSnap.data().isPinned);
            }
            contextMenu.style.display = 'none';
        }
    });

    // ৪. এডিট
    document.getElementById('ctx-edit')?.addEventListener('click', async () => {
        if(currentEditId) {
            const docSnap = await getDoc(doc(db, "notes", currentEditId));
            if(docSnap.exists()) {
                document.getElementById('editNoteInput').value = docSnap.data().text || "";
                editModal.style.display = 'flex';
            }
            contextMenu.style.display = 'none';
        }
    });

    // ৫. শেয়ার (মেনু থেকে)
    document.getElementById('ctx-share')?.addEventListener('click', () => {
        shareModal.style.display = 'flex';
        contextMenu.style.display = 'none';
    });

    // ৬. ডাউনলোড
    document.getElementById('ctx-download')?.addEventListener('click', async () => {
        if(currentEditId) {
            const docSnap = await getDoc(doc(db, "notes", currentEditId));
            if(docSnap.exists()) {
                downloadNoteContent(docSnap.data());
            }
            contextMenu.style.display = 'none';
        }
    });


    // --- B. শেয়ার মোডাল বাটন অ্যাকশন ---
    document.getElementById('share-wa')?.addEventListener('click', () => shareLink('whatsapp'));
    document.getElementById('share-fb')?.addEventListener('click', () => shareLink('facebook'));
    document.getElementById('share-tg')?.addEventListener('click', () => shareLink('telegram'));
    document.getElementById('share-mail')?.addEventListener('click', () => shareLink('email'));
    document.getElementById('share-copy')?.addEventListener('click', () => shareLink('copy'));


    // --- C. এডিট সেভ বাটন ---
    document.getElementById('updateNoteBtn')?.addEventListener('click', async () => {
        if(currentEditId) {
            await DBService.updateNoteContentDB(currentEditId, document.getElementById('editNoteInput').value);
            editModal.style.display = 'none';
        }
    });


    // --- D. ক্লোজ বাটন এবং আউটসাইড ক্লিক ---
    document.getElementById('closeReadModalBtn')?.addEventListener('click', () => readModal.style.display = 'none');
    document.querySelector('#shareModal .close-modal')?.addEventListener('click', () => shareModal.style.display = 'none');
    document.querySelector('#editModal .close-modal')?.addEventListener('click', () => editModal.style.display = 'none');

    window.addEventListener('click', (e) => {
        if(contextMenu && !contextMenu.contains(e.target) && !e.target.classList.contains('delete-btn') && !e.target.classList.contains('context-trigger')) {
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

async function shareLink(platform) {
    if (!currentEditId) return;

    const docSnap = await getDoc(doc(db, "notes", currentEditId));
    if (!docSnap.exists()) return;
    const data = docSnap.data();

    // শেয়ার লিংক তৈরি
    const shareUrl = window.location.origin + '/dashboard.html?text=' + encodeURIComponent(data.text || data.fileUrl);
    const textToShare = data.text || "Check this note!";
    const fullText = textToShare + "\n\n" + shareUrl;

    // 📱 Android Native Share
    if (typeof Android !== "undefined" && Android.shareImage) {
        if (data.type === 'image' && data.fileUrl) {
            Android.shareImage(data.fileUrl, textToShare);
        } else {
            Android.shareImage("", fullText);
        }
        document.getElementById('shareModal').style.display = 'none';
        return; 
    }

    // 🌐 Web Share
    switch(platform) {
        case 'whatsapp': window.open(`https://wa.me/?text=${encodeURIComponent(fullText)}`, '_blank'); break;
        case 'facebook': window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`, '_blank'); break;
        case 'telegram': window.open(`https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(textToShare)}`, '_blank'); break;
        case 'email': window.open(`mailto:?subject=Shared Note&body=${encodeURIComponent(fullText)}`, '_blank'); break;
        case 'copy': navigator.clipboard.writeText(fullText).then(() => alert('Copied!')); break;
    }
    document.getElementById('shareModal').style.display = 'none';
}

function downloadNoteContent(data) {
    try {
        if (data.type === 'image' && data.fileUrl) {
            // Cloudinary থেকে ফোর্স ডাউনলোড করার জন্য URL মডিফাই করা
            let downloadUrl = data.fileUrl;
            if(downloadUrl.includes('cloudinary.com') && downloadUrl.includes('/upload/')) {
                downloadUrl = downloadUrl.replace('/upload/', '/upload/fl_attachment/');
            }
            
            // নতুন ট্যাবে ওপেন করে ডাউনলোড ফোর্স করা
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = 'mybrain_image.jpg';
            a.target = '_blank';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
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