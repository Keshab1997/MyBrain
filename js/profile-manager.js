// js/profile-manager.js

import { auth } from './core/firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const profileContainer = document.getElementById('profile-widget-area');
let clockInterval = null; // টাইমার ভেরিয়েবল

onAuthStateChanged(auth, (user) => {
    if (user && profileContainer) {
        renderProfile(user);
        startClock(); 
    } else if (profileContainer) {
        // লগআউট হলে টাইমার থামান
        if (clockInterval) clearInterval(clockInterval);
        profileContainer.innerHTML = ''; 
    }
});

function renderProfile(user) {
    const photoURL = user.photoURL || 'https://i.ibb.co/5cQ3qM8/user-avatar.png';
    const name = user.displayName || "User";
    const email = user.email;

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

function startClock() {
    if (clockInterval) clearInterval(clockInterval);

    function update() {
        const clockEl = document.getElementById('live-clock');
        const dateEl = document.getElementById('live-date');
        
        // এলিমেন্ট না পেলে কাজ বন্ধ (Error Fix)
        if (!clockEl || !dateEl) return;

        const now = new Date();
        
        let hours = now.getHours();
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12;
        hours = hours ? hours : 12;
        const minutes = now.getMinutes().toString().padStart(2, '0');
        const seconds = now.getSeconds().toString().padStart(2, '0');
        
        const timeString = `${hours}:${minutes}:${seconds} <span style="font-size:12px">${ampm}</span>`;
        
        const options = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric' };
        const dateString = now.toLocaleDateString('en-US', options);

        clockEl.innerHTML = timeString;
        dateEl.innerText = dateString;
    }

    update();
    clockInterval = setInterval(update, 1000);
}