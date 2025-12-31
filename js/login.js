// js/login.js
import { auth, provider, signInWithPopup, signInWithRedirect, onAuthStateChanged } from "./firebase-config.js";

const loginBtn = document.getElementById('google-login-btn');

// ১. লগইন বাটনের কাজ
if (loginBtn) {
    loginBtn.addEventListener('click', () => {
        // ১. ইউজার এজেন্ট চেক করা (APK ডিটেক্ট করার জন্য)
        const userAgent = navigator.userAgent.toLowerCase();
        
        // যদি 'wv' থাকে, তার মানে এটা অ্যান্ড্রয়েড ওয়েবভিউ বা APK
        const isApk = userAgent.includes('wv') && userAgent.includes('android');

        if (isApk) {
            // === শুধুমাত্র APK এর জন্য Redirect ===
            console.log("Environment: APK (Using Redirect)");
            signInWithRedirect(auth, provider);
        } else {
            // === ওয়েবসাইট (লোকাল বা লাইভ) এর জন্য Popup ===
            console.log("Environment: Web/Localhost (Using Popup)");
            signInWithPopup(auth, provider)
                .then((result) => {
                    // সফল হলে ড্যাশবোর্ডে যাও
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

// ২. ইউজার লগইন চেক (রিডাইরেক্ট বা রিফ্রেশ হওয়ার পর এটা কাজ করবে)
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("User detected:", user.email);
        // ইউজার লগইন থাকলে ড্যাশবোর্ডে পাঠিয়ে দিন
        window.location.replace("dashboard.html");
    }
});