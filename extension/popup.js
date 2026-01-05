// ১. ইনপুট বক্স এবং বাটন সিলেক্ট করা
const linkInput = document.getElementById('linkInput');
const saveBtn = document.getElementById('saveBtn');

// ২. এক্সটেনশন ওপেন হলেই বর্তমান ট্যাবের লিংক ইনপুট বক্সে দেখিয়ে দেওয়া (সুবিধার জন্য)
chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
    let currentUrl = tabs[0].url;
    linkInput.value = currentUrl; // ইনপুট বক্সে লিংক সেট করে দিলাম
});

// ৩. সেভ বাটনে ক্লিক করলে যা হবে
saveBtn.addEventListener('click', () => {
    
    // ইনপুট বক্স থেকে ভ্যালু নেওয়া (অটোমেটিক বা আপনার পেস্ট করা লিংক)
    const linkToSave = linkInput.value;

    if (!linkToSave) {
        alert("Please enter a link!");
        return;
    }

    // ৪. আপনার লাইভ ওয়েবসাইটের ড্যাশবোর্ড লিংক
    const myBrainUrl = "https://my-brain-three.vercel.app/dashboard.html";

    // ৫. লিংকটি এনকোড করা
    const encodedLink = encodeURIComponent(linkToSave);

    // ৬. নতুন ট্যাবে ওপেন করা
    chrome.tabs.create({
        url: `${myBrainUrl}?text=${encodedLink}`
    });
});