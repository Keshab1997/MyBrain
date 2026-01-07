import { WORKER_URL } from "./constants.js";

// ১. URL ঠিকঠাক করা
export function normalizeUrl(u) { 
    if(!u) return ""; 
    let x = u.trim(); 
    return (x && !x.startsWith('http') && x.includes('.') && !x.includes(' ')) ? 'https://'+x : x; 
}

// ২. URL ভ্যালিড কিনা চেক করা
export function isValidURL(s) { 
    try { return new URL(s).protocol.startsWith("http"); } catch { return false; } 
}

// ৩. লিঙ্ক প্রিভিউ ডাটা আনা
export async function getLinkPreviewData(url) { 
    try{ 
        const r = await fetch(`${WORKER_URL}?url=${encodeURIComponent(url)}`); 
        const j = await r.json(); 
        return j.status==='success'?j.data:{title:url}; 
    }catch{return{title:url};} 
}

// ৪. Base64 কনভার্টার
export function base64DataToBlob(dataurl) {
    var arr = dataurl.split(','), mime = arr[0].match(/:(.*?);/)[1],
        bstr = atob(arr[1]), n = bstr.length, u8arr = new Uint8Array(n);
    while(n--){
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], {type:mime});
}

// ৫. Universal Media Embed (Fixed: YouTube, FB, Insta) 🛠️
export function getUniversalEmbedHTML(text) {
    if (!text) return null;
    let url = text.trim();

    // A. YouTube (FIXED: আপনার আগের কোডে লিংক মিসিং ছিল)
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const ytMatch = url.match(ytRegex);
    if (ytMatch) {
        return `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; margin-bottom:10px; background: #000;">
                <iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen></iframe></div>`;
    }

    // B. Facebook (Advanced Fix with Fallback Link) ✅
    if (url.includes('facebook.com') || url.includes('fb.watch')) {
        try {
            // ১. মোবাইল লিংক ফিক্স
            let cleanUrl = url.replace('m.facebook.com', 'www.facebook.com');
            const encodedUrl = encodeURIComponent(cleanUrl);

            // ভিডিও চেক
            if (url.includes('/videos/') || url.includes('/reel/') || url.includes('/watch') || url.includes('fb.watch')) {
                return `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; margin-bottom:10px; background: #000;">
                        <iframe src="https://www.facebook.com/plugins/video.php?href=${encodedUrl}&show_text=false&t=0" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" scrolling="no" frameborder="0" allowfullscreen="true"></iframe></div>`;
            }

            // সাধারণ পোস্ট (নিচে বাটন যোগ করা হয়েছে)
            return `<div style="overflow: hidden; border-radius: 8px; margin-bottom:10px; background: #fff; border:1px solid #e0e0e0;">
                    <iframe src="https://www.facebook.com/plugins/post.php?href=${encodedUrl}&show_text=true&width=500" width="100%" height="500" style="border:none;overflow:hidden" scrolling="yes" frameborder="0" allowfullscreen="true" allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>
                    <div style="padding: 8px; background: #f0f2f5; text-align: center; border-top: 1px solid #ddd;">
                        <a href="${cleanUrl}" target="_blank" style="font-size: 13px; color: #1877f2; text-decoration: none; font-weight:bold;">🔗 View Original Post on Facebook</a>
                    </div>
                    </div>`;
        } catch (e) {
            return null;
        }
    }

    // C. Instagram (Advanced Fix with Fallback Link) ✅
    const instaRegex = /(https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[\w-]+)/;
    const instaMatch = url.split('?')[0].match(instaRegex);
    if (instaMatch) {
        let cleanUrl = instaMatch[0];
        // 'embed' প্যারামিটার ব্যবহার করা হলো যা 'embed/captioned' এর চেয়ে বেশি স্টেবল
        let embedUrl = cleanUrl.endsWith('/') ? cleanUrl + 'embed' : cleanUrl + '/embed';
        
        return `<div style="overflow: hidden; border-radius: 8px; border: 1px solid #dbdbdb; margin-bottom:10px; background: #fff;">
                <iframe src="${embedUrl}" style="width: 100%; height: 450px; border: 0;" frameborder="0" scrolling="no" allowtransparency="true" allowfullscreen></iframe>
                <div style="padding: 8px; background: #fafafa; text-align: center; border-top: 1px solid #dbdbdb;">
                    <a href="${cleanUrl}" target="_blank" style="font-size: 13px; color: #E1306C; text-decoration: none; font-weight:bold;">📷 View on Instagram</a>
                </div>
                </div>`;
    }
    
    return null;
}