// js/vault/vault.js (SECURE VERSION)

import { db, auth } from '../core/firebase-config.js';
import { collection, addDoc, onSnapshot, query, where, orderBy, deleteDoc, doc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// DOM Elements
const siteInput = document.getElementById('siteName');
const userInput = document.getElementById('username');
const passInput = document.getElementById('password');
const saveBtn = document.getElementById('saveSecretBtn');
const vaultGrid = document.getElementById('vault-grid');
const togglePassBtn = document.getElementById('togglePass');
const statusMsg = document.getElementById('vaultStatus');
const csvInput = document.getElementById('csvInput'); 
const exportBtn = document.getElementById('exportBtn'); 
const logoutBtn = document.getElementById('menu-logout-btn'); 
const searchInput = document.getElementById('vaultSearchInput');

let currentUser = null;
let allSecrets = [];
let masterKey = null; // এটি ডাটাবেসে সেভ হবে না

// ১. মাস্টার পাসওয়ার্ড প্রম্পট ফাংশন
function requestMasterPassword() {
    const input = prompt("🔐 Enter your Vault Master Password/PIN to unlock:", "");
    if (input && input.trim().length > 0) {
        masterKey = input.trim();
        return true;
    } else {
        alert("Master Password is required to access the Vault!");
        window.location.href = "dashboard.html"; // পাসওয়ার্ড না দিলে বের করে দিন
        return false;
    }
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        
        // ইউজার লগইন করার পর মাস্টার পাসওয়ার্ড চাইবে
        if (requestMasterPassword()) {
            loadSecrets(user.uid);
        }

        // প্রোফাইল সেটআপ
        const navUserName = document.getElementById('nav-user-name');
        const navUserImg = document.getElementById('nav-user-img');
        const navProfileDiv = document.getElementById('nav-mini-profile');

        if(navProfileDiv) navProfileDiv.style.display = 'flex';
        if(navUserName) navUserName.textContent = user.displayName || user.email.split('@')[0];
        if(navUserImg && user.photoURL) navUserImg.src = user.photoURL;

    } else {
        window.location.href = "index.html";
    }
});

// সার্চ লজিক
if (searchInput) {
    searchInput.addEventListener('input', (e) => {
        const searchText = e.target.value.toLowerCase();
        document.querySelectorAll('.secret-card').forEach(card => {
            const siteName = card.querySelector('.secret-header span')?.innerText.toLowerCase() || "";
            const userName = card.querySelector('.secret-username')?.innerText.toLowerCase() || "";
            card.style.display = (siteName.includes(searchText) || userName.includes(searchText)) ? 'block' : 'none';
        });
    });
}

// সেভ বাটন
if(saveBtn) {
    saveBtn.addEventListener('click', async () => {
        await saveSingleSecret(siteInput.value, userInput.value, passInput.value);
        siteInput.value = ""; userInput.value = ""; passInput.value = "";
    });
}

async function saveSingleSecret(site, username, password) {
    if (!site || !password) { alert("Site name and Password are required!"); return; }
    if (!masterKey) { alert("Vault is locked! Refresh page."); return; }

    try {
        if(statusMsg) { statusMsg.style.display = "block"; statusMsg.style.color = "blue"; statusMsg.textContent = "Encrypting & Saving..."; }
        
        // 🔥 SECURE ENCRYPTION: UID + MasterKey ব্যবহার করা হচ্ছে
        const encryptionKey = currentUser.uid + masterKey;
        const encryptedPassword = CryptoJS.AES.encrypt(password, encryptionKey).toString();

        await addDoc(collection(db, "vault"), { 
            userId: currentUser.uid, 
            site: site, 
            username: username || "", 
            password: encryptedPassword, 
            createdAt: serverTimestamp() 
        });

        if(statusMsg) { statusMsg.style.color = "green"; statusMsg.textContent = "Saved Securely!"; setTimeout(() => statusMsg.style.display = 'none', 1500); }
    } catch (error) { 
        console.error("Error saving:", error); 
        if(statusMsg) { statusMsg.style.color = "red"; statusMsg.textContent = "Error: " + error.message; } 
    }
}

// CSV Import
if(csvInput) {
    csvInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !confirm(`Import passwords from ${file.name}?`)) return;
        if (!masterKey) { alert("Vault is locked!"); return; }

        Papa.parse(file, {
            header: true, skipEmptyLines: true,
            complete: async function(results) {
                const rows = results.data;
                let count = 0;
                if(statusMsg) statusMsg.textContent = `Importing ${rows.length} items...`;
                for (let row of rows) {
                    const site = row.name || row.login_uri || row.Title || "Unknown Site";
                    const username = row.login_username || row.Username || "";
                    const password = row.login_password || row.Password;
                    if (password) { await saveSingleSecret(site, username, password); count++; }
                }
                alert(`Success! Imported ${count} passwords.`);
                if(statusMsg) statusMsg.style.display = 'none';
                csvInput.value = ""; 
            },
            error: function(err) { alert("CSV Error: " + err.message); }
        });
    });
}

// Export Logic
if(exportBtn) {
    exportBtn.addEventListener('click', () => {
        if (allSecrets.length === 0) { alert("Vault is empty!"); return; }
        if (!masterKey) { alert("Vault is locked!"); return; }
        if(!confirm("Warning: Exporting will download DECRYPTED passwords. Continue?")) return;

        const csvData = allSecrets.map(secret => {
            let realPass = "";
            try { 
                const encryptionKey = currentUser.uid + masterKey;
                realPass = CryptoJS.AES.decrypt(secret.password, encryptionKey).toString(CryptoJS.enc.Utf8); 
                if(!realPass) realPass = "Wrong Master Key"; // যদি ভুল পাসওয়ার্ড দিয়ে পেজ লোড হয়
            } catch(e) { realPass = "Error"; }
            return { Title: secret.site, Username: secret.username, Password: realPass, URL: secret.site };
        });

        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob); link.download = "mybrain_vault_backup.csv"; link.click();
    });
}

// Load Secrets
function loadSecrets(userId) {
    const q = query(collection(db, "vault"), where("userId", "==", userId), orderBy("createdAt", "desc"));
    onSnapshot(q, (snapshot) => {
        if(!vaultGrid) return;
        vaultGrid.innerHTML = ""; allSecrets = [];
        if (snapshot.empty) { vaultGrid.innerHTML = '<p style="text-align:center; color:#888; width:100%;">No passwords saved yet.</p>'; return; }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allSecrets.push(data);
            const card = document.createElement('div');
            card.className = 'secret-card'; 
            const hasUser = data.username && data.username.trim() !== "";

            card.innerHTML = `
                <div class="secret-header">
                    <span style="font-weight:bold; color:#333;">${data.site}</span>
                    <button class="delete-btn" onclick="deleteSecret('${docSnap.id}')" title="Delete">🗑️</button>
                </div>
                <div class="secret-user-row">
                    <span class="secret-username" title="${data.username}">${hasUser ? data.username : 'No User'}</span>
                    ${hasUser ? `<button class="copy-user-btn" onclick="copyUsername('${data.username}')" title="Copy Username">📋</button>` : ''}
                </div>
                <div class="secret-pass-area">
                    <span id="pass-text-${docSnap.id}" class="pass-dots">••••••••</span>
                    <div class="card-actions">
                        <button onclick="revealPass('${docSnap.id}', '${data.password}')" title="Show">👁️</button>
                        <button onclick="copyPass('${docSnap.id}', '${data.password}')" title="Copy Password">📋</button>
                    </div>
                </div>`;
            vaultGrid.appendChild(card);
        });
    });
}

// Global Functions
window.copyUsername = (text) => navigator.clipboard.writeText(text);

window.revealPass = (id, encryptedPass) => {
    const passField = document.getElementById(`pass-text-${id}`);
    if (passField.textContent !== "••••••••") { passField.textContent = "••••••••"; return; }
    if (!masterKey) { requestMasterPassword(); return; }

    try { 
        const encryptionKey = currentUser.uid + masterKey;
        const decrypted = CryptoJS.AES.decrypt(encryptedPass, encryptionKey).toString(CryptoJS.enc.Utf8);
        
        if(decrypted) {
            passField.textContent = decrypted;
        } else {
            alert("Wrong Master Password! Please refresh and try again.");
        }
    } catch (e) { alert("Decrypt Error"); }
};

window.copyPass = (id, encryptedPass) => {
    if (!masterKey) { requestMasterPassword(); return; }
    try { 
        const encryptionKey = currentUser.uid + masterKey;
        const decrypted = CryptoJS.AES.decrypt(encryptedPass, encryptionKey).toString(CryptoJS.enc.Utf8);
        if(decrypted) {
            navigator.clipboard.writeText(decrypted); 
            alert("Password Copied!"); 
        } else {
            alert("Wrong Master Password!");
        }
    } catch (e) { alert("Copy Failed"); }
};

window.deleteSecret = async (id) => { if(confirm("Are you sure?")) await deleteDoc(doc(db, "vault", id)); };

if(togglePassBtn) togglePassBtn.addEventListener('click', () => passInput.type = passInput.type === "password" ? "text" : "password");
if(logoutBtn) logoutBtn.addEventListener('click', (e) => { e.preventDefault(); signOut(auth).then(() => window.location.href = "index.html"); });