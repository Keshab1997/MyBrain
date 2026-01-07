import { WORKER_URL } from "./constants.js";

// ১. URL ঠিকঠাক করা (http না থাকলে যোগ করা)
export function normalizeUrl(u) { 
    if(!u) return ""; 
    let x = u.trim(); 
    return (x && !x.startsWith('http') && x.includes('.') && !x.includes(' ')) ? 'https://'+x : x; 
}

// ২. URL ভ্যালিড কিনা চেক করা
export function isValidURL(s) { 
    try { return new URL(s).protocol.startsWith("http"); } catch { return false; } 
}

// ৩. লিঙ্ক প্রিভিউ ডাটা আনা (Worker ব্যবহার করে)
export async function getLinkPreviewData(url) { 
    try{ 
        const r = await fetch(`${WORKER_URL}?url=${encodeURIComponent(url)}`); 
        const j = await r.json(); 
        return j.status==='success'?j.data:{title:url}; 
    }catch{return{title:url};} 
}

// ৪. Base64 থেকে Blob কনভার্ট (Android এবং Web Image এর জন্য)
export function base64DataToBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}

// ৫. Universal Media Embed (YouTube, FB, Insta)
export function getUniversalEmbedHTML(text) {
    if (!text) return null;
    let url = text.trim();

    // A. YouTube
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const ytMatch = url.match(ytRegex);
    if (ytMatch) {
        return `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; margin-bottom:10px; background: #000;">
                <iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen></iframe></div>`;
    }

    // B. Facebook
    if (url.includes('facebook.com') && (url.includes('/videos/') || url.includes('/reel/') || url.includes('/watch'))) {
        const encodedUrl = encodeURIComponent(url);
        return `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; margin-bottom:10px; background: #000;">
                <iframe src="https://www.facebook.com/plugins/video.php?href=${encodedUrl}&show_text=false&t=0" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" scrolling="no" frameborder="0" allowfullscreen="true"></iframe></div>`;
    }

    // C. Instagram
    const instaRegex = /(https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[\w-]+)/;
    const instaMatch = url.split('?')[0].match(instaRegex);
    if (instaMatch) {
        let cleanUrl = instaMatch[0];
        let embedUrl = cleanUrl.endsWith('/') ? cleanUrl + 'embed/captioned' : cleanUrl + '/embed/captioned';
        return `<div style="position: relative; padding-bottom: 125%; height: 0; overflow: hidden; border-radius: 8px; border: 1px solid #eee; margin-bottom:10px; background: #000;">
                <iframe src="${embedUrl}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" frameborder="0" scrolling="no" allowtransparency="true" allowfullscreen></iframe></div>`;
    }
    
    return null;
}