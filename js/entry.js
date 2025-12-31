import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// পেজ লোড হলে চেক করো
onAuthStateChanged(auth, (user) => {
    
    // URL থেকে প্যারামিটার চেক করা
    const urlParams = new URLSearchParams(window.location.search);
    
    // ১. Android App পাঠায় 'note', আর ব্রাউজার লিংক হতে পারে 'text'
    const sharedNote = urlParams.get('note');
    const sharedText = urlParams.get('text');
    
    // ২. রিডাইরেক্ট লিংক তৈরি করা
    let targetUrl = "dashboard.html";

    // যদি Android App এর note থাকে
    if (sharedNote) {
        // dashboard.js যাতে ঠিকমতো পায়, তাই আবার encode করে পাঠানো হচ্ছে
        targetUrl += `?note=${encodeURIComponent(sharedNote)}`;
    } 
    // অথবা যদি সাধারণ text থাকে
    else if (sharedText) {
        targetUrl += `?text=${encodeURIComponent(sharedText)}`;
    }

    if (user) {
        // ইউজার লগইন আছে -> ড্যাশবোর্ডে পাঠাও (ডাটা সহ)
        console.log("User found, redirecting to dashboard...");
        window.location.href = targetUrl;
    } else {
        // ইউজার লগইন নেই -> লগইন পেজে পাঠাও
        console.log("No user, redirecting to login...");
        window.location.href = "login.html";
    }
});