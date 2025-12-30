// js/footer.js
document.addEventListener("DOMContentLoaded", function() {
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
});