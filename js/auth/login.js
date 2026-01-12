// js/auth/login.js
import { auth, provider, signInWithPopup, signInWithRedirect, onAuthStateChanged } from "../core/firebase-config.js";

const loginBtn = document.getElementById('google-login-btn');

// ১. লগইন বাটনের কাজ
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        // মোবাইল ডিভাইস কিনা চেক করা (Android, iPhone, etc.)
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

        if (isMobile) {
            // === মোবাইল (ব্রাউজার অথবা APK) এর জন্য Redirect ===
            // মোবাইলে পপআপ ঝামেলা করে, তাই রিডাইরেক্ট সবচেয়ে নিরাপদ
            console.log("Device: Mobile (Using Redirect)");
            signInWithRedirect(auth, provider);
        } else {
            // === কম্পিউটার/ডেস্কটপ এর জন্য Popup ===
            console.log("Device: Desktop (Using Popup)");
            signInWithPopup(auth, provider)
                .then((result) => {
                    console.log("Login Success:", result.user);
                    window.location.replace("dashboard.html");
                })
                .catch((error) => {
                    console.error("Popup Login Error:", error);
                    alert("Login Failed: " + error.message);
                });
        }
    });
}

// ২. ইউজার লগইন চেক (মোবাইলে রিডাইরেক্ট হয়ে ফিরে আসার পর এটা কাজ করবে)
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User detected:", user.email);
        // লগইন সফল হলে ড্যাশবোর্ডে পাঠিয়ে দিন
        window.location.replace("dashboard.html");
    }
});