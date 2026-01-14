// js/vault/vault.js (SECURE VERSION)

import { db, auth } from '../core/firebase-config.js';
import { collection, addDoc, onSnapshot, query, where, orderBy, deleteDoc, doc, serverTimestamp, getDocs, writeBatch } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { showToast } from '../ui-shared.js';

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
const masterModal = document.getElementById('masterPassModal');
const masterInput = document.getElementById('masterPassInput');
const unlockBtn = document.getElementById('unlockVaultBtn');
const rememberCb = document.getElementById('rememberMaster');
const deleteAllBtn = document.getElementById('deleteAllSecretsBtn');
const toggleMasterVisible = document.getElementById('toggleMasterVisible');
const masterInputEl = document.getElementById('masterPassInput');
const resetVaultLink = document.getElementById('resetVaultLink');

let currentUser = null;
let allSecrets = [];
let masterKey = null;
let inactivityTimer;

// পেজ লোড হওয়ার সাথে সাথে সেভ করা পাসওয়ার্ড চেক করা
window.addEventListener('DOMContentLoaded', () => {
    const savedKey = localStorage.getItem('vault_master_key') || sessionStorage.getItem('vault_master_key');
    if (savedKey) {
        masterKey = savedKey;
        const modal = document.getElementById('masterPassModal');
        if (modal) {
            modal.style.setProperty('display', 'none', 'important');
        }
    }
});

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        sessionStorage.removeItem('vault_master_key');
        localStorage.removeItem('vault_master_key');
        masterKey = null;
        showToast("🔒 Vault locked due to inactivity.", "error");
        setTimeout(() => window.location.reload(), 1500);
    }, 5 * 60 * 1000);
}

function checkSavedMaster() {
    const savedKey = localStorage.getItem('vault_master_key') || sessionStorage.getItem('vault_master_key');
    if (savedKey) {
        masterKey = savedKey;
        if(masterModal) masterModal.style.display = 'none';
        return true;
    }
    return false;
}

function showMasterModal() {
    if(masterModal) masterModal.style.display = 'flex';
}

if (toggleMasterVisible && masterInputEl) {
    toggleMasterVisible.onclick = (e) => {
        e.preventDefault();
        
        if (masterInputEl.type === 'password') {
            masterInputEl.type = 'text';
            toggleMasterVisible.textContent = '🙈';
        } else {
            masterInputEl.type = 'password';
            toggleMasterVisible.textContent = '👁️';
        }
    };
}

if (unlockBtn) {
    unlockBtn.onclick = () => {
        const val = masterInputEl.value.trim();
        if (val.length < 4) {
            showToast("⚠️ Password too short (min 4 chars)!", "error");
            return;
        }
        
        masterKey = val;
        
        // Remember Me চেক করা থাকলে localStorage এ সেভ হবে
        if (rememberCb && rememberCb.checked) {
            localStorage.setItem('vault_master_key', val);
        } else {
            sessionStorage.setItem('vault_master_key', val);
        }
        
        // মোডাল বন্ধ করা (সবার আগে)
        if(masterModal) {
            masterModal.style.setProperty('display', 'none', 'important');
        }
        
        if(currentUser) {
            loadSecrets(currentUser.uid);
        }
        showToast("✅ Vault unlocked successfully!", "success");
    };
}

if (masterInput) {
    masterInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') unlockBtn.click();
    });
}

onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        
        // যদি masterKey আগে থেকে সেট করা থাকে, তবে সরাসরি ডাটা লোড করো
        if (masterKey) {
            loadSecrets(user.uid);
        } else if (!checkSavedMaster()) {
            showMasterModal();
        } else {
            loadSecrets(user.uid);
        }
        
        resetInactivityTimer();
        document.addEventListener('mousemove', resetInactivityTimer);
        document.addEventListener('keypress', resetInactivityTimer);
        document.addEventListener('click', resetInactivityTimer);

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

if(saveBtn) {
    saveBtn.addEventListener('click', async () => {
        await saveSingleSecret(siteInput.value, userInput.value, passInput.value);
        siteInput.value = ""; userInput.value = ""; passInput.value = "";
    });
}

async function saveSingleSecret(site, username, password) {
    if (!site || !password) { showToast("⚠️ Site name and Password are required!", "error"); return; }
    if (!masterKey) { showToast("🔒 Vault is locked! Refresh page.", "error"); return; }

    try {
        if(statusMsg) { statusMsg.style.display = "block"; statusMsg.style.color = "blue"; statusMsg.textContent = "Encrypting & Saving..."; }
        
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
        showToast("✅ Password saved securely!", "success");
    } catch (error) { 
        console.error("Error saving:", error); 
        if(statusMsg) { statusMsg.style.color = "red"; statusMsg.textContent = "Error: " + error.message; }
        showToast("❌ Error: " + error.message, "error");
    }
}

if(csvInput) {
    csvInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file || !confirm(`Import passwords from ${file.name}?`)) return;
        if (!masterKey) { showToast("🔒 Vault is locked!", "error"); return; }

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
                showToast(`✅ Imported ${count} passwords successfully!`, "success");
                if(statusMsg) statusMsg.style.display = 'none';
                csvInput.value = ""; 
            },
            error: function(err) { showToast("❌ CSV Error: " + err.message, "error"); }
        });
    });
}

if(exportBtn) {
    exportBtn.addEventListener('click', () => {
        if (allSecrets.length === 0) { showToast("⚠️ Vault is empty!", "error"); return; }
        if (!masterKey) { showToast("🔒 Vault is locked!", "error"); return; }
        if(!confirm("Warning: Exporting will download DECRYPTED passwords. Continue?")) return;

        const csvData = allSecrets.map(secret => {
            let realPass = "";
            try { 
                const encryptionKey = currentUser.uid + masterKey;
                realPass = CryptoJS.AES.decrypt(secret.password, encryptionKey).toString(CryptoJS.enc.Utf8); 
                if(!realPass) realPass = "Wrong Master Key";
            } catch(e) { realPass = "Error"; }
            return { Title: secret.site, Username: secret.username, Password: realPass, URL: secret.site };
        });

        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob); link.download = "mybrain_vault_backup.csv"; link.click();
        showToast("✅ Vault exported successfully!", "success");
    });
}

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

            card.innerHTML = `
                <div class="secret-header">
                    <h4>🌐 ${data.site}</h4>
                    <button class="delete-btn" onclick="deleteSecret('${docSnap.id}')">🗑️</button>
                </div>
                <div class="secret-body">
                    <div class="secret-row">
                        <div>
                            <div class="label">Username</div>
                            <div class="value">${data.username || '---'}</div>
                        </div>
                        <span class="copy-icon" onclick="copyUsername('${data.username}')">📋</span>
                    </div>
                    <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 10px 0;">
                    <div class="secret-row">
                        <div>
                            <div class="label">Password</div>
                            <div id="pass-text-${docSnap.id}" class="value">••••••••</div>
                        </div>
                        <div style="display:flex; gap:10px;">
                            <span class="copy-icon" onclick="revealPass('${docSnap.id}', '${data.password}')">👁️</span>
                            <span class="copy-icon" onclick="copyPass('${docSnap.id}', '${data.password}')">📋</span>
                        </div>
                    </div>
                </div>
            `;
            vaultGrid.appendChild(card);
        });
    });
}

window.copyUsername = (text) => { 
    navigator.clipboard.writeText(text); 
    showToast("✅ Username copied!", "success"); 
};

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
            showToast("❌ Wrong Master Password!", "error");
        }
    } catch (e) { showToast("❌ Decrypt Error", "error"); }
};

window.copyPass = (id, encryptedPass) => {
    if (!masterKey) { requestMasterPassword(); return; }
    try { 
        const encryptionKey = currentUser.uid + masterKey;
        const decrypted = CryptoJS.AES.decrypt(encryptedPass, encryptionKey).toString(CryptoJS.enc.Utf8);
        if(decrypted) {
            navigator.clipboard.writeText(decrypted); 
            showToast("✅ Password copied!", "success"); 
        } else {
            showToast("❌ Wrong Master Password!", "error");
        }
    } catch (e) { showToast("❌ Copy Failed", "error"); }
};

window.deleteSecret = async (id) => { 
    if(confirm("Are you sure?")) {
        await deleteDoc(doc(db, "vault", id));
        showToast("✅ Password deleted!", "success");
    }
};

if(togglePassBtn) togglePassBtn.addEventListener('click', () => passInput.type = passInput.type === "password" ? "text" : "password");

if(logoutBtn) {
    logoutBtn.addEventListener('click', (e) => { 
        e.preventDefault();
        localStorage.removeItem('vault_master_key');
        sessionStorage.removeItem('vault_master_key');
        signOut(auth).then(() => window.location.href = "index.html");
    });
}

if (deleteAllBtn) {
    deleteAllBtn.onclick = async () => {
        if (!confirm("⚠️ WARNING: This will permanently delete ALL your saved passwords. Are you sure?")) return;
        
        const secondConfirm = prompt("Type 'DELETE' to confirm:");
        if (secondConfirm !== 'DELETE') return;

        try {
            const q = query(collection(db, "vault"), where("userId", "==", currentUser.uid));
            const snapshot = await getDocs(q);
            
            const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, "vault", d.id)));
            await Promise.all(deletePromises);
            
            showToast("✅ All secrets deleted successfully.", "success");
        } catch (e) {
            showToast("❌ Error deleting: " + e.message, "error");
        }
    };
}

// Retry Master Password Button
const retryBtn = document.getElementById('retryMasterBtn');
if (retryBtn) {
    retryBtn.addEventListener('click', () => {
        sessionStorage.removeItem('vault_master_key');
        localStorage.removeItem('vault_master_key');
        masterKey = null;
        showToast("🔓 Session cleared. Please enter correct Master Password.", "info");
        setTimeout(() => location.reload(), 1000);
    });
}

// Reset Vault Link
if (resetVaultLink) {
    resetVaultLink.onclick = async (e) => {
        e.preventDefault();
        
        const firstConfirm = confirm("⚠️ WARNING: Resetting vault will permanently delete ALL your saved passwords. Are you sure?");
        
        if (firstConfirm) {
            const secondConfirm = prompt("Type 'RESET' to confirm and delete all data:");
            
            if (secondConfirm === 'RESET') {
                try {
                    const q = query(collection(db, "vault"), where("userId", "==", currentUser.uid));
                    const snapshot = await getDocs(q);
                    
                    const batch = writeBatch(db);
                    snapshot.forEach((docSnap) => {
                        batch.delete(docSnap.ref);
                    });
                    await batch.commit();

                    localStorage.removeItem('vault_master_key');
                    sessionStorage.removeItem('vault_master_key');

                    showToast("✅ Vault reset successful! Set a new master password.", "success");
                    setTimeout(() => location.reload(), 1500);
                } catch (error) {
                    showToast("❌ Reset failed: " + error.message, "error");
                }
            }
        }
    };
}
