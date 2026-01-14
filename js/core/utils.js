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

// ৩. লিঙ্ক প্রিভিউ ডাটা আনা (🔥 আপডেটেড: Cloudflare Worker দিয়ে)
export async function getLinkPreviewData(url) { 
    try { 
        // আপনার ওয়ার্কার লিঙ্কে রিকোয়েস্ট পাঠানো হচ্ছে
        const response = await fetch(`${WORKER_URL}?url=${encodeURIComponent(url)}`); 
        const json = await response.json(); 
        
        if (json.status === 'success') {
            return json.data; // এখানে title, image, description এবং tags থাকে
        } else {
            return { title: url, image: null, description: null, tags: [] };
        }
    } catch (error) {
        console.error("Worker Fetch Error:", error);
        return { title: url };
    } 
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

// ৫. ট্যাগ এক্সট্রাক্টর (নতুন) 🏷️
export function extractTags(text) {
    if (!text) return [];
    const regex = /#(\w+)/g;
    const matches = text.match(regex);
    return matches ? matches.map(tag => tag.substring(1)) : []; // # ছাড়া শুধু শব্দটা রিটার্ন করবে
}

// ৬. Universal Media Embed
export function getUniversalEmbedHTML(text) {
    if (!text) return null;
    let url = text.trim();

    // YouTube
    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const ytMatch = url.match(ytRegex);
    if (ytMatch) {
        return `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; margin-bottom:10px; background: #000;">
                <iframe src="https://www.youtube.com/embed/${ytMatch[1]}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" allowfullscreen></iframe></div>`;
    }

    // Instagram Logic (UPDATED 🚀)
    const instaRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(p|reel|tv)\/([a-zA-Z0-9_-]+)/;
    const instaMatch = url.match(instaRegex);
    
    if (instaMatch) {
        const postType = instaMatch[1]; // p, reel, or tv
        const postId = instaMatch[2];
        const cleanUrl = `https://www.instagram.com/${postType}/${postId}`;
        const embedUrl = `${cleanUrl}/embed/captioned/`;

        return `<div style="overflow: hidden; border-radius: 12px; border: 1px solid #dbdbdb; margin-bottom:10px; background: #fff;">
                <iframe src="${embedUrl}" style="width: 100%; height: 550px; border: 0;" frameborder="0" scrolling="no" allowtransparency="true" allowfullscreen></iframe>
                </div>`;
    }

    // Facebook
    if (url.includes('facebook.com') || url.includes('fb.watch')) {
        try {
            let cleanUrl = url.replace('m.facebook.com', 'www.facebook.com');
            const encodedUrl = encodeURIComponent(cleanUrl);
            if (url.includes('/videos/') || url.includes('/reel/') || url.includes('/watch') || url.includes('fb.watch')) {
                return `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; margin-bottom:10px; background: #000;">
                        <iframe src="https://www.facebook.com/plugins/video.php?href=${encodedUrl}&show_text=false&t=0" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" scrolling="no" frameborder="0" allowfullscreen="true"></iframe></div>`;
            }
            return `<div style="overflow: hidden; border-radius: 8px; margin-bottom:10px; background: #fff; border:1px solid #e0e0e0;">
                    <iframe src="https://www.facebook.com/plugins/post.php?href=${encodedUrl}&show_text=true&width=500" width="100%" height="500" style="border:none;overflow:hidden" scrolling="yes" frameborder="0" allowfullscreen="true"></iframe>
                    </div>`;
        } catch (e) { return null; }
    }
    
    return null;
}