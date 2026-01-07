// js/dashboard-core/main.js
import { auth } from "../firebase-config.js"; 
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// মডিউল ইমপোর্ট
import { loadNotes, setupNoteSaving } from "./note-manager.js";
import { setupFolders } from "./folder-manager.js";
import { setupModals } from "./menu-manager.js";
import { setupEventListeners } from "./event-manager.js";

// অথেনটিকেশন চেকার
onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.href = "index.html"; 
    } else {
        initDashboard(user);
    }
});

// ✅ এই ফাংশনটি আপডেট করুন (প্রোফাইল লজিক এখানে যোগ করা হয়েছে)
function initDashboard(user) {
    
    // ১. প্রোফাইল সেটআপ (নাম ও ছবি দেখানো)
    const profileDiv = document.getElementById('nav-mini-profile');
    const nameEl = document.getElementById('nav-user-name');
    const imgEl = document.getElementById('nav-user-img');

    if (profileDiv) {
        // ডিফল্টভাবে এটি hidden থাকে, তাই ফ্লেক্স করে দৃশ্যমান করতে হবে
        profileDiv.style.display = 'flex'; 
        
        // নাম সেট করা (যদি নাম না থাকে, ইমেইলের প্রথম অংশ দেখাবে)
        nameEl.innerText = user.displayName || user.email.split('@')[0];

        // ছবি সেট করা (যদি ছবি না থাকে, একটি ডিফল্ট আইকন দেখাবে)
        const defaultImg = "https://cdn-icons-png.flaticon.com/512/149/149071.png";
        imgEl.src = user.photoURL ? user.photoURL : defaultImg;

        // প্রোফাইলে ক্লিক করলে প্রোফাইল পেজে নিয়ে যাওয়া (অপশনাল)
        profileDiv.style.cursor = 'pointer';
        profileDiv.onclick = () => {
            // যদি আপনার profile.html বা settings.html থাকে
            // window.location.href = "profile.html"; 
            alert("Profile settings coming soon!"); // আপাতত অ্যালার্ট
        };
    }

    // ২. অ্যাপের বাকি মডিউলগুলো চালু করা
    loadNotes(user.uid, 'All');       
    setupNoteSaving(user);            
    setupFolders(user.uid);           
    setupEventListeners(user);        
    setupModals();                    

    // শেয়ার্ড কনটেন্ট হ্যান্ডলার
    const p = new URLSearchParams(window.location.search);
    if(p.get('text')) document.getElementById('noteInput').value = p.get('text');
}

// লগআউট
document.getElementById('menu-logout-btn').onclick = () => signOut(auth).then(() => window.location.href="index.html");