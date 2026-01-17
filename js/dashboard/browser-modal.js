// In-App Browser Modal Logic

// Browser Modal খোলার ফাংশন
export function openInAppBrowser(url) {
    const modal = document.getElementById('browserModal');
    const frame = document.getElementById('browserFrame');
    const urlText = document.getElementById('browserUrl');
    const externalBtn = document.getElementById('openExternalBtn');

    if (!modal || !frame) return;

    urlText.innerText = url;
    frame.src = url;
    modal.style.display = 'flex';

    // এক্সটার্নাল ব্রাউজারে খোলার জন্য
    externalBtn.onclick = () => window.open(url, '_blank');
}

// Browser Modal বন্ধ করার ফাংশন
export function closeBrowser() {
    const modal = document.getElementById('browserModal');
    const frame = document.getElementById('browserFrame');
    
    if (modal && frame) {
        modal.style.display = 'none';
        frame.src = ""; // মেমোরি বাঁচাতে ফ্রেম ক্লিয়ার করা
    }
}

// ইভেন্ট লিসেনার সেটআপ
document.addEventListener('DOMContentLoaded', () => {
    const closeBtn = document.getElementById('closeBrowserBtn');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeBrowser);
    }
});