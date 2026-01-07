// js/dashboard-core/event-manager.js
import { loadNotes } from "./note-manager.js";

export function setupEventListeners(user) {
    // ১. ফিল্টার বাটন
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.folder-chip').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            loadNotes(user.uid, btn.getAttribute('data-filter'));
        });
    });

    // ২. সার্চ বার
    const searchInput = document.getElementById('searchInput');
    if(searchInput) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            document.querySelectorAll('.note-card').forEach(card => {
                card.style.display = card.innerText.toLowerCase().includes(val) ? 'inline-block' : 'none';
            });
        });
    }

    // ৩. ভিউ টগল
    const gBtn = document.getElementById('gridViewBtn');
    const lBtn = document.getElementById('listViewBtn');
    const grid = document.getElementById('content-grid');
    
    if(gBtn && lBtn) {
        gBtn.onclick = () => { grid.classList.remove('list-view'); gBtn.classList.add('active'); lBtn.classList.remove('active'); };
        lBtn.onclick = () => { grid.classList.add('list-view'); lBtn.classList.add('active'); gBtn.classList.remove('active'); };
    }
}