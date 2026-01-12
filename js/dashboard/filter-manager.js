document.addEventListener('DOMContentLoaded', () => {
    const filterBtns = document.querySelectorAll('.filter-btn');
    
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            // ১. একটিভ ক্লাস চেঞ্জ করা
            document.querySelector('.filter-btn.active').classList.remove('active');
            btn.classList.add('active');

            const filterType = btn.getAttribute('data-filter');
            filterNotes(filterType);
        });
    });

    function filterNotes(type) {
        const cards = document.querySelectorAll('.note-card'); // তোমার ডাইনামিক কার্ডের ক্লাস .note-card হতে হবে
        
        cards.forEach(card => {
            // কার্ডের মধ্যে ডাটা টাইপ চেক করা (data-type এট্রিবিউট থাকতে হবে কার্ডে)
            const cardType = card.getAttribute('data-type'); 
            
            if (type === 'all' || cardType === type) {
                card.style.display = 'block';
            } else {
                card.style.display = 'none';
            }
        });
    }
});