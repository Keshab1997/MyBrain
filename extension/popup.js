// extension/popup.js

const linkInput = document.getElementById('linkInput');
const titleInput = document.getElementById('titleInput');
const saveBtn = document.getElementById('saveBtn');

// ১. এক্সটেনশন ওপেন হলে বর্তমান ট্যাবের লিঙ্ক এবং টাইটেল নেওয়া
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    const activeTab = tabs[0];
    
    // ইনপুট বক্সে ভ্যালু সেট করা
    linkInput.value = activeTab.url;
    titleInput.value = activeTab.title;
});

// ২. সেভ বাটনে ক্লিক লজিক
saveBtn.addEventListener('click', () => {
    const linkToSave = linkInput.value;
    const titleToSave = titleInput.value;

    if (!linkToSave) {
        alert("Link is required!");
        return;
    }

    // আপনার লাইভ ড্যাশবোর্ড লিঙ্ক (স্ক্রিনশট অনুযায়ী)
    const myBrainUrl = "https://my-brain-three.vercel.app/dashboard.html";

    // ৩. টাইটেল এবং লিঙ্ক এনকোড করে পাঠানো
    // এতে ড্যাশবোর্ড বুঝবে যে টাইটেল আগে থেকেই আছে, তাই আর লোডিং দেখাবে না
    const targetUrl = `${myBrainUrl}?text=${encodeURIComponent(linkToSave)}&title=${encodeURIComponent(titleToSave)}`;

    // নতুন ট্যাবে ওপেন করা
    chrome.tabs.create({ url: targetUrl });
});