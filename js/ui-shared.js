// js/ui-shared.js
// এই ফাইলে Footer, Dark Mode, Menu এবং View Toggle এর সব লজিক একসাথে আছে।

document.addEventListener('DOMContentLoaded', () => {
    
    // ১. ফুটার (Footer) সেটআপ
    const footerContainer = document.getElementById("app-footer");
    if (footerContainer) {
        const year = new Date().getFullYear();
        footerContainer.innerHTML = `
            <footer class="main-footer" style="padding: 20px 0; text-align: center; background: transparent;">
                <div style="margin-bottom: 10px;">
                    <p style="margin: 0; font-size: 14px; color: #555;">
                        &copy; ${year} <strong>MyBrain</strong>. Your Digital Second Brain.
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

    if (menuBtn && navLinks) {
        menuBtn.addEventListener('click', (e) => {
            navLinks.classList.toggle('active');
            menuBtn.innerHTML = navLinks.classList.contains('active') ? '✕' : '☰';
            e.stopPropagation();
        });

        document.addEventListener('click', (e) => {
            if (!menuBtn.contains(e.target) && !navLinks.contains(e.target)) {
                navLinks.classList.remove('active');
                menuBtn.innerHTML = '☰';
            }
        });

        const links = navLinks.querySelectorAll('a');
        links.forEach(link => {
            link.addEventListener('click', () => {
                navLinks.classList.remove('active');
                menuBtn.innerHTML = '☰';
            });
        });
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