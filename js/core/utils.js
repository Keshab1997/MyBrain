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
            // 🔥 ফিক্স: যদি টাইটেল Cloudflare এর হয়, তবে তা বাদ দেওয়া
            if (json.data.title && (json.data.title.includes("Attention Required") || json.data.title.includes("Cloudflare"))) {
                return { 
                    title: new URL(url).hostname, // শুধু ডোমেইন নাম দেখাবে
                    description: "Preview unavailable due to security.",
                    image: null 
                };
            }
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
    return matches ? matches.map(tag => tag.substring(1)).filter(t => !t.includes('http')) : []; // # ছাড়া শুধু শব্দটা রিটার্ন করবে
}

// ৬. Universal Media Embed
export function getUniversalEmbedHTML(text) {
    if (!text) return null;
    let url = text.trim();

    try {
        // YouTube
        const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
        const ytMatch = url.match(ytRegex);
        if (ytMatch) {
            return `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; margin-bottom:10px; background: #000;">
                    <iframe src="https://www.youtube.com/embed/${ytMatch[1]}" 
                        style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: 0;" 
                        loading="lazy" 
                        referrerpolicy="no-referrer-when-downgrade" 
                        sandbox="allow-scripts allow-same-origin allow-presentation" 
                        allowfullscreen></iframe></div>`;
        }

        // 🔥 Instagram Logic (Loading Text Fix)
        const instaRegex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(p|reel|tv)\/([a-zA-Z0-9_-]+)/;
        const instaMatch = url.match(instaRegex);
        
        if (instaMatch) {
            const postType = instaMatch[1]; 
            const postId = instaMatch[2];
            // 'captioned' বাদ দিয়ে ক্লিন 'embed' ব্যবহার করলে লোডিং টেক্সট কম আসে
            const embedUrl = `https://www.instagram.com/${postType}/${postId}/embed/captioned/?cr=1&v=14&wp=540`; 

            return `
            <div style="position: relative; background: #ffffff; border-radius: 12px; border: 1px solid #dbdbdb; overflow: hidden; min-height: 450px; display: flex; align-items: center; justify-content: center;">
                
                <!-- ১. কাস্টম লোডার (ইনস্টাগ্রামের লোডিং টেক্সট এর বদলে এটি দেখাবে) -->
                <div style="position: absolute; z-index: 1; color: #999; font-size: 12px; display: flex; flex-direction: column; align-items: center; gap: 5px;">
                    <div class="sync-spinner" style="border-color: #ccc; border-top-color: #2563eb;"></div>
                    <span>Loading Post...</span>
                </div>

                <!-- ২. আইফ্রেম (শুরুতে opacity 0 থাকবে, লোড হলে ভেসে উঠবে) -->
                <iframe src="${embedUrl}" 
                    style="width: 100%; height: 550px; border: 0; position: relative; z-index: 2; opacity: 0; transition: opacity 0.8s ease;" 
                    onload="this.style.opacity='1'; this.previousElementSibling.style.display='none';"
                    frameborder="0" 
                    scrolling="no" 
                    allowtransparency="true" 
                    allowfullscreen>
                </iframe>
                
            </div>
            <div style="text-align:center; padding: 5px;">
                <a href="${url}" target="_blank" style="font-size:12px; color:#2563eb; text-decoration:none; font-weight:500;">View on Instagram ↗</a>
            </div>`;
        }

        // Facebook
        if (url.includes('facebook.com') || url.includes('fb.watch')) {
            let cleanUrl = url.split('?')[0];
            cleanUrl = cleanUrl.replace('m.facebook.com', 'www.facebook.com');
            const encodedUrl = encodeURIComponent(cleanUrl);
            
            if (url.includes('/videos/') || url.includes('/reel/') || url.includes('/watch') || url.includes('fb.watch')) {
                return `<div style="position: relative; padding-bottom: 56.25%; height: 0; overflow: hidden; border-radius: 8px; margin-bottom:10px;">
                        <iframe src="https://www.facebook.com/plugins/video.php?href=${encodedUrl}&show_text=false" 
                            style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; border: none;" 
                            loading="lazy" 
                            referrerpolicy="no-referrer-when-downgrade" 
                            sandbox="allow-scripts allow-same-origin allow-presentation" 
                            allowfullscreen="true" 
                            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>
                        </div>`;
            }
            return `<div style="border: 1px solid #ddd; border-radius: 8px; overflow: hidden; background: #fff; margin-bottom: 10px;">
                    <iframe src="https://www.facebook.com/plugins/post.php?href=${encodedUrl}&show_text=true&width=500" 
                        width="100%" height="500" style="border:none; overflow:hidden" 
                        scrolling="no" frameborder="0" 
                        loading="lazy" 
                        referrerpolicy="no-referrer-when-downgrade" 
                        sandbox="allow-scripts allow-same-origin allow-presentation" 
                        allowfullscreen="true" 
                        allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"></iframe>
                    </div>`;
        }
        
        return null;
    } catch (error) {
        console.warn('Embed generation error:', error);
        return null;
    }
}

// ৭. Cloudinary Image Optimization
export function optimizeCloudinaryUrl(url) {
    if (!url || !url.includes('cloudinary.com')) return url;
    
    if (url.includes('/upload/')) {
        return url.replace('/upload/', '/upload/f_auto,q_auto,w_600/');
    }
    return url;
}


// 🔥 অটো ট্যাগ জেনারেটর (টেক্সট + মেটাডাটা থেকে)
export function generateAutoTags(text, metadata = {}) {
    // URL গুলোকে টেক্সট থেকে সরিয়ে ফেলা হচ্ছে যাতে সেগুলো ট্যাগ না হয়
    let cleanText = text.replace(/(https?:\/\/[^\s]+)/g, "");
    let combinedText = cleanText + " " + (metadata.title || "") + " " + (metadata.description || "");
    
    // ১. হ্যাশট্যাগগুলো খুঁজে বের করা (#example)
    const hashtagRegex = /#(\w+)/g;
    const hashtags = [...combinedText.matchAll(hashtagRegex)].map(match => match[1].toLowerCase());

    // ২. গুরুত্বপূর্ণ শব্দ বের করা (৪ অক্ষরের বেশি লম্বা শব্দ)
    const words = combinedText.toLowerCase()
        .replace(/[^\w\s]/g, '') // স্পেশাল ক্যারেক্টার রিমুভ
        .split(/\s+/)
        .filter(word => word.length > 4 && !['https', 'www', 'com', 'instagram', 'facebook', 'youtube'].includes(word));

    // ৩. সব ট্যাগ মিলিয়ে ইউনিক ট্যাগ লিস্ট তৈরি (সর্বোচ্চ ৮টি)
    const allTags = [...new Set([...hashtags, ...words])];
    return allTags.slice(0, 8); 
}
