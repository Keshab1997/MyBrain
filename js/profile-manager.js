// js/profile-manager.js

import { auth } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

const profileContainer = document.getElementById('profile-widget-area');

// ১. অথেনটিকেশন চেক এবং প্রোফাইল লোড
onAuthStateChanged(auth, (user) => {
    if (user && profileContainer) {
        renderProfile(user);
        startClock(); // ঘড়ি চালু করা
    } else if (profileContainer) {
        // ইউজার না থাকলে বা লগআউট অবস্থায়
        profileContainer.innerHTML = ''; 
    }
});

// ২. প্রোফাইল রেন্ডার ফাংশন
function renderProfile(user) {
    // ডিফল্ট ছবি যদি ইউজারের ছবি না থাকে
    const photoURL = user.photoURL || 'https://i.ibb.co/5cQ3qM8/user-avatar.png'; // অথবা আপনার assets/user.png
    const name = user.displayName || "User";
    const email = user.email;

    // গ্রিটিং লজিক (শুভ সকাল/বিকাল)
    const hour = new Date().getHours();
    let greeting = "Welcome back,";
    let icon = "👋";

    if (hour >= 5 && hour < 12) {
        greeting = "Good Morning,";
        icon = "☀️";
    } else if (hour >= 12 && hour < 17) {
        greeting = "Good Afternoon,";
        icon = "🌤️";
    } else if (hour >= 17 && hour < 21) {
        greeting = "Good Evening,";
        icon = "🌇";
    } else {
        greeting = "Good Night,";
        icon = "🌙";
    }

    // HTML ইনজেক্ট করা
    profileContainer.innerHTML = `
        <div class="profile-widget">
            <div class="profile-img-box">
                <img src="${photoURL}" alt="Profile" class="profile-avatar">
            </div>
            
            <div class="profile-info">
                <div class="greeting-text">${icon} ${greeting}</div>
                <h2 class="user-name">${name}</h2>
                <div class="user-email">${email}</div>
            </div>

            <div class="time-widget">
                <div class="current-time" id="live-clock">--:--:--</div>
                <div class="current-date" id="live-date">...</div>
            </div>
        </div>
    `;
}

// ৩. লাইভ ঘড়ি ফাংশন
function startClock() {
    function update() {
        const now = new Date();
        
        // সময় ফরম্যাট (12 ঘন্টা)
        let hours = now.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12; // 0 হলে 12 হবে
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        
        const timeString = `${hours}:${minutes}:${seconds} <span style="font-size:12px">${ampm}</span>`;
        
        // তারিখ ফরম্যাট (যেমন: Monday, 30 Dec 2025)
        const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
        const dateString = now.toLocaleDateString('en-US', options);

        // DOM আপডেট (যদি এলিমেন্ট থাকে)
        const clockEl = document.getElementById('live-clock');
        const dateEl = document.getElementById('live-date');
        
        if(clockEl) clockEl.innerHTML = timeString;
        if(dateEl) dateEl.innerText = dateString;
    }

    update(); // প্রথমে একবার কল করা
    setInterval(update, 1000); // প্রতি ১ সেকেন্ড পর পর আপডেট
}