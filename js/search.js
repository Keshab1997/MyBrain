// js/search.js - Highlight Version

document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    const contentGrid = document.getElementById('content-grid');

    searchInput.addEventListener('input', (e) => {
        const searchText = e.target.value.trim().toLowerCase();
        const cards = contentGrid.querySelectorAll('.brain-card, .card');

        cards.forEach(card => {
            // ১. সার্চ করার আগে আগের সব হাইলাইট মুছে ফেলা (Reset)
            removeHighlights(card);

            // ২. যদি সার্চ বক্স খালি থাকে, সব কার্ড দেখাও
            if (searchText === "") {
                card.style.display = "";
                return;
            }

            // ৩. কার্ডের টেক্সট খোঁজা
            const cardContent = card.textContent.toLowerCase();

            if (cardContent.includes(searchText)) {
                card.style.display = ""; // কার্ড দেখাও
                
                // ৪. টেক্সট হাইলাইট করা (Highlight)
                // আমরা নির্দিষ্ট কিছু ক্লাসের মধ্যে খুঁজব যাতে বাটন বা ইমেজ নষ্ট না হয়
                const textElements = card.querySelectorAll('.note-text, .preview-title, .preview-desc, .preview-site');
                
                textElements.forEach(element => {
                    highlightText(element, searchText);
                });

            } else {
                card.style.display = "none"; // কার্ড লুকাও
            }
        });

        // ৫. যদি কোনো রেজাল্ট না থাকে
        checkEmptyResult(cards);
    });
});

// হাইলাইট করার ফাংশন
function highlightText(element, text) {
    const innerHTML = element.innerHTML;
    const lowerHTML = innerHTML.toLowerCase();
    
    // যদি টেক্সট খুঁজে পাওয়া যায়
    if (lowerHTML.includes(text)) {
        // Regex ব্যবহার করে শব্দটা খুঁজে mark ট্যাগ বসানো হচ্ছে
        // 'gi' মানে Global (সবগুলো) এবং Case-insensitive (ছোট-বড় হাতের তফাৎ নেই)
        const regex = new RegExp(`(${text})`, 'gi');
        element.innerHTML = innerHTML.replace(regex, '<mark class="highlight">$1</mark>');
    }
}

// আগের হাইলাইট রিমুভ করার ফাংশন
function removeHighlights(card) {
    const highlights = card.querySelectorAll('mark.highlight');
    highlights.forEach(mark => {
        // mark ট্যাগের ভেতরের টেক্সট বের করে mark ট্যাগ ফেলে দেওয়া হচ্ছে
        const parent = mark.parentNode;
        parent.replaceChild(document.createTextNode(mark.textContent), mark);
        // পাশাপাশি থাকা টেক্সট নোডগুলো জোড়া লাগানো (যাতে ভেঙে না যায়)
        parent.normalize(); 
    });
}

// খালি রেজাল্ট চেক করার ফাংশন
function checkEmptyResult(cards) {
    let hasVisibleCard = false;
    cards.forEach(card => {
        if (card.style.display !== "none") hasVisibleCard = true;
    });

    const existingMsg = document.getElementById('no-result-msg');
    if (existingMsg) existingMsg.remove();

    if (!hasVisibleCard) {
        const grid = document.getElementById('content-grid');
        const msg = document.createElement('p');
        msg.id = 'no-result-msg';
        msg.innerHTML = "No matches found. Try a different keyword. 🧐";
        msg.style.textAlign = "center";
        msg.style.color = "#888";
        msg.style.gridColumn = "1 / -1"; // পুরো লাইন জুড়ে দেখাবে
        msg.style.marginTop = "20px";
        grid.appendChild(msg);
    }
}