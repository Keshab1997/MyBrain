// js/vault.js

// ১. কনফিগারেশন ইমপোর্ট
import { app, db, auth } from './firebase-config.js';

// ২. ফায়ারবেস ফাংশন ইমপোর্ট
import { 
    collection, addDoc, onSnapshot, query, where, orderBy, deleteDoc, doc 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

import { 
    onAuthStateChanged, signOut 
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";


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

let currentUser = null;
let allSecrets = [];

// ৩. অথেনটিকেশন চেক
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        console.log("Vault User:", user.email);
        loadSecrets(user.uid);
    } else {
        window.location.href = "index.html";
    }
});

// ৪. পাসওয়ার্ড সেভ লজিক
saveBtn.addEventListener('click', async () => {
    await saveSingleSecret(siteInput.value, userInput.value, passInput.value);
    
    // ফর্ম ক্লিয়ার
    siteInput.value = ""; 
    userInput.value = ""; 
    passInput.value = "";
});

// সিঙ্গেল পাসওয়ার্ড সেভ করার ফাংশন
async function saveSingleSecret(site, username, password) {
    if (!site || !password) {
        alert("Site name and Password are required!");
        return;
    }

    try {
        statusMsg.style.display = "block";
        statusMsg.style.color = "blue";
        statusMsg.textContent = "Encrypting & Saving...";
        
        // এনক্রিপশন (তালা মারা)
        const encryptedPassword = CryptoJS.AES.encrypt(password, currentUser.uid).toString();

        // ফায়ারবেসে পাঠানো
        await addDoc(collection(db, "vault"), {
            userId: currentUser.uid,
            site: site,
            username: username || "",
            password: encryptedPassword,
            createdAt: new Date()
        });

        statusMsg.style.color = "green";
        statusMsg.textContent = "Saved Securely!";
        setTimeout(() => statusMsg.style.display = 'none', 1500);

    } catch (error) {
        console.error("Error saving:", error);
        statusMsg.style.color = "red";
        statusMsg.textContent = "Error: " + error.message;
    }
}

// ৫. Bitwarden CSV Import Logic
if(csvInput) {
    csvInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if(!confirm(`Import passwords from ${file.name}?`)) return;

        statusMsg.style.display = 'block';
        statusMsg.textContent = "Reading CSV...";

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async function(results) {
                const rows = results.data;
                let count = 0;
                
                statusMsg.textContent = `Importing ${rows.length} items...`;

                for (let row of rows) {
                    const site = row.name || row.login_uri || "Unknown Site";
                    const username = row.login_username || "";
                    const password = row.login_password;

                    if (password) {
                        await saveSingleSecret(site, username, password);
                        count++;
                    }
                }
                alert(`Success! Imported ${count} passwords.`);
                statusMsg.style.display = 'none';
                csvInput.value = ""; 
            },
            error: function(err) {
                alert("CSV Error: " + err.message);
            }
        });
    });
}

// ৬. Export All Function
if(exportBtn) {
    exportBtn.addEventListener('click', () => {
        if (allSecrets.length === 0) {
            alert("Vault is empty!");
            return;
        }

        if(!confirm("Warning: Exporting will download DECRYPTED passwords. Continue?")) return;

        const csvData = allSecrets.map(secret => {
            let realPass = "";
            try {
                const bytes = CryptoJS.AES.decrypt(secret.password, currentUser.uid);
                realPass = bytes.toString(CryptoJS.enc.Utf8);
            } catch(e) { realPass = "Error"; }

            return {
                Title: secret.site,
                Username: secret.username,
                Password: realPass,
                URL: secret.site
            };
        });

        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.download = "mybrain_vault_backup.csv";
        link.click();
    });
}

// ৭. ডাটা লোড করা এবং দেখানো (আপডেট করা হয়েছে)
function loadSecrets(userId) {
    const q = query(
        collection(db, "vault"), 
        where("userId", "==", userId), 
        orderBy("createdAt", "desc")
    );

    onSnapshot(q, (snapshot) => {
        vaultGrid.innerHTML = "";
        allSecrets = [];

        if (snapshot.empty) {
            vaultGrid.innerHTML = '<p style="text-align:center; color:#888; width:100%;">No passwords saved yet.</p>';
            return;
        }

        snapshot.forEach((docSnap) => {
            const data = docSnap.data();
            allSecrets.push(data);
            
            const card = document.createElement('div');
            card.className = 'secret-card';
            
            // ইউজারনেম আছে কিনা চেক করা (যাতে বাটন দেখানো যায়)
            const hasUser = data.username && data.username.trim() !== "";

            card.innerHTML = `
                <div class="secret-header">
                    <span style="font-weight:bold; color:#333;">${data.site}</span>
                    <button class="delete-btn" onclick="deleteSecret('${docSnap.id}')" title="Delete">🗑️</button>
                </div>
                
                <!-- ইউজারনেম এবং কপি বাটন -->
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
                </div>
            `;
            vaultGrid.appendChild(card);
        });
    }, (error) => {
        console.error("Snapshot Error:", error);
    });
}

// ৮. গ্লোবাল ফাংশন সমূহ (HTML থেকে এক্সেস করার জন্য Window তে অ্যাসাইন করা)

// ইউজারনেম কপি করার ফাংশন (নতুন)
window.copyUsername = (text) => {
    navigator.clipboard.writeText(text).then(() => {
        // কপি হলে ইউজার কনফিডেন্সের জন্য ছোট অ্যালার্ট
        alert("Username copied: " + text);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
};

window.revealPass = (id, encryptedPass) => {
    const passField = document.getElementById(`pass-text-${id}`);
    if (passField.textContent !== "••••••••") {
        passField.textContent = "••••••••";
        return;
    }
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedPass, currentUser.uid);
        const original = bytes.toString(CryptoJS.enc.Utf8);
        passField.textContent = original || "Error";
    } catch (e) { alert("Decrypt Error"); }
};

window.copyPass = (id, encryptedPass) => {
    try {
        const bytes = CryptoJS.AES.decrypt(encryptedPass, currentUser.uid);
        const original = bytes.toString(CryptoJS.enc.Utf8);
        navigator.clipboard.writeText(original);
        alert("Password Copied!");
    } catch (e) { alert("Copy Failed"); }
};

window.deleteSecret = async (id) => {
    if(confirm("Are you sure you want to delete this?")) {
        await deleteDoc(doc(db, "vault", id));
    }
};

// পাসওয়ার্ড ইনপুট টগল
togglePassBtn.addEventListener('click', () => {
    passInput.type = passInput.type === "password" ? "text" : "password";
});

// লগআউট
document.getElementById('logout-btn').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "index.html");
});