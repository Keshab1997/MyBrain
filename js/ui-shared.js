// js/ui-shared.js
// এই ফাইলে Footer, Dark Mode, Menu এবং View Toggle এর সব লজিক একসাথে আছে।

// 🔥 Toast Notification System
export function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.style.cssText = `
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        padding: 12px 25px; border-radius: 50px; color: white; z-index: 10000;
        font-weight: 500; box-shadow: 0 4px 15px rgba(0,0,0,0.2); font-size: 14px;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3b82f6'};
        animation: slideUp 0.3s ease-out;
    `;
    toast.innerText = message;
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'slideDown 0.3s ease-in';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

export function updateSyncStatus(message, isProcessing = false) {
    let statusEl = document.getElementById('global-sync-status');
    if (!statusEl) {
        statusEl = document.createElement('div');
        statusEl.id = 'global-sync-status';
        statusEl.style.cssText = `
            position: fixed; bottom: 80px; right: 20px; background: var(--bg-card);
            padding: 8px 15px; border-radius: 50px; font-size: 12px; font-weight: 600;
            box-shadow: 0 4px 15px rgba(0,0,0,0.1); display: flex; align-items: center;
            gap: 8px; z-index: 9999; border: 1px solid var(--border-color);
        `;
        document.body.appendChild(statusEl);
    }
    
    statusEl.style.display = message ? 'flex' : 'none';
    statusEl.innerHTML = `
        ${isProcessing ? '<div class="sync-spinner"></div>' : '✅'}
        <span>${message}</span>
    `;
}

document.addEventListener('DOMContentLoaded', () => {
    
    // ১. ফুটার (Footer) সেটআপ
    const footerContainer = document.getElementById("app-footer");
    if (footerContainer) {
        const year = new Date().getFullYear();
        footerContainer.innerHTML = `
            <footer class="main-footer" style="padding: 20px 0; text-align: center; background: transparent;">
                <div style="margin-bottom: 10px;">
                    <p style="margin: 0; font-size: 14px; color: #555;">
                        &copy; ${year} <strong>MindVault</strong>. Your Digital Second Brain.
                    </p>
                    <p style="margin: 5px 0 0; font-size: 13px; color: #777;">
                        Crafted with <span style="color: #e25555; font-size:16px;">&hearts;</span> by 
                        <span style="color: #2563eb; font-weight: 700; letter-spacing: 0.5px;">Keshab Sarkar</span>
                    </p>
                </div>
                <ul class="footer-links" style="list-style: none; padding: 0; display: flex; justify-content: center; gap: 15px; margin-top: 10px;">
                    <li><a href="dashboard.html" style="text-decoration: none; color: #666; font-size: 13px;">Home</a></li>
                    <li><span style="color: #ccc;">|</span></li>
                    <li><a href="vault.html" style="text-decoration: none; color: #666; font-size: 13px;">Vault</a></li>
                </ul>
            </footer>
        `;
    }

    // ২. ডার্ক মোড (Dark Mode)
    const themeToggleBtn = document.getElementById('theme-toggle');
    const body = document.body;
    const currentTheme = localStorage.getItem('theme');
    
    if (currentTheme === 'dark') {
        body.classList.add('dark-mode');
        if(themeToggleBtn) themeToggleBtn.textContent = '☀️';
    }

    if(themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            body.classList.toggle('dark-mode');
            let theme = 'light';
            if (body.classList.contains('dark-mode')) {
                theme = 'dark';
                themeToggleBtn.textContent = '☀️';
            } else {
                themeToggleBtn.textContent = '🌙';
            }
            localStorage.setItem('theme', theme);
        });
    }

    // ৩. মোবাইল মেনু (Mobile Menu)
    const menuBtn = document.getElementById('mobile-menu-btn');
    const navLinks = document.getElementById('navLinks');
    const desktopLogout = document.getElementById('desktop-logout-btn');
    const mobileLogout = document.getElementById('menu-logout-btn');

    if (menuBtn && navLinks) {
        menuBtn.addEventListener('click', (e) => {
            navLinks.classList.toggle('active');
            e.stopPropagation();
        });

        document.addEventListener('click', (e) => {
            if (!menuBtn.contains(e.target) && !navLinks.contains(e.target)) {
                navLinks.classList.remove('active');
            }
        });

        const links = navLinks.querySelectorAll('a');
        links.forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
            });
        });
    }

    // Logout handlers
    if (desktopLogout) {
        desktopLogout.addEventListener('click', handleLogout);
    }
    if (mobileLogout) {
        mobileLogout.addEventListener('click', handleLogout);
    }

    function handleLogout(e) {
        e.preventDefault();
        if (typeof auth !== 'undefined' && typeof signOut !== 'undefined') {
            signOut(auth).then(() => window.location.href = 'index.html');
        }
    }

    // ৪. ভিউ টগল (Grid/List View)
    const gridBtn = document.getElementById('gridViewBtn');
    const listBtn = document.getElementById('listViewBtn');
    const contentGrid = document.getElementById('content-grid') || document.getElementById('vault-grid');
    
    if (gridBtn && listBtn && contentGrid) {
        gridBtn.addEventListener('click', () => {
            contentGrid.classList.remove('list-view');
            gridBtn.classList.add('active');
            listBtn.classList.remove('active');
        });

        listBtn.addEventListener('click', () => {
            contentGrid.classList.add('list-view');
            listBtn.classList.add('active');
            gridBtn.classList.remove('active');
        });
    }

    // ৫. Read Modal Close Button
    const closeReadModalBtn = document.getElementById('closeReadModalBtn');
    const readModal = document.getElementById('readModal');
    
    if (closeReadModalBtn && readModal) {
        closeReadModalBtn.addEventListener('click', () => {
            readModal.style.display = 'none';
        });
        
        // Click outside to close
        readModal.addEventListener('click', (e) => {
            if (e.target === readModal) {
                readModal.style.display = 'none';
            }
        });
    }

    // ৬. Context Menu Close
    const contextMenu = document.getElementById('contextMenu');
    if (contextMenu) {
        document.addEventListener('click', (e) => {
            if (!contextMenu.contains(e.target)) {
                contextMenu.style.display = 'none';
            }
        });
    }
});