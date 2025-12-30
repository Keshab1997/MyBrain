// js/auth.js
import { auth } from './firebase-config.js';

// আপডেট করা ভার্সন (12.7.0)
import { GoogleAuthProvider, signInWithRedirect, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const loginBtn = document.getElementById('google-login-btn');

// ১. গুগল লগইন ফাংশন
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        const provider = new GoogleAuthProvider();
        
        signInWithRedirect(auth, provider);
    });
}

// ২. ইউজার লগইন আছে কিনা চেক করা (Security Check)
onAuthStateChanged(auth, (user) => {
    if (user) {
        // ইউজার লগইন অবস্থায় আছে
        console.log("User is active:", user.email);
        
        // বর্তমান পেজ যদি login page (index.html) বা হোম রুট (/) হয়, তবে ড্যাশবোর্ডে রিডাইরেক্ট করো
        const path = window.location.pathname;
        if (path.endsWith('index.html') || path === '/' || path.endsWith('/')) {
            window.location.href = "dashboard.html";
        }
    } else {
        // ইউজার লগইন নেই
        console.log("No user logged in");
    }
});