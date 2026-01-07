import { getUniversalEmbedHTML } from "./utils.js";

// Generate Note Card HTML Object
export function createNoteCardElement(docSnap, isTrashView, callbacks) {
    const data = docSnap.data();
    const id = docSnap.id;
    const card = document.createElement('div');
    card.className = 'note-card'; 
    card.setAttribute('data-id', id);
    if(data.color) card.style.backgroundColor = data.color;

    // 1. Pin & Drag Handle
    if(!isTrashView) {
        const dragIcon = document.createElement('div');
        dragIcon.className = 'drag-handle';
        dragIcon.innerHTML = '⋮⋮'; 
        card.appendChild(dragIcon);
        if(data.isPinned) {
            // পিন ইন্ডিকেটর সুন্দর করার জন্য
            const pin = document.createElement('div');
            pin.className = 'pin-indicator';
            pin.innerHTML = '📌';
            card.appendChild(pin);
        }
    }

    // 2. Folder Badge
    if(data.folder && !isTrashView) {
        const folderBadge = document.createElement('span');
        // ইনলাইন স্টাইল সরিয়ে CSS ক্লাস ব্যবহার করা ভালো, তবে এখানে কাজ চালানোর জন্য ঠিক আছে
        folderBadge.style.cssText = "position:absolute; top:8px; right:30px; background:rgba(0,0,0,0.1); font-size:10px; padding:2px 6px; border-radius:10px; color:#555; pointer-events:none;";
        folderBadge.innerText = data.folder;
        card.appendChild(folderBadge);
    }

    // 3. Content Generation
    let contentHTML = '';
    
    // A. প্রথমেই চেক করুন এটা Facebook/Instagram/YouTube এর Embed কিনা
    const mediaEmbed = getUniversalEmbedHTML(data.text);
    
    if (mediaEmbed) {
        contentHTML += mediaEmbed;
        // নিচে মূল লিংকটা ছোট করে দেওয়া হলো যাতে ক্লিক করে সাইটে যাওয়া যায়
        contentHTML += `<div style="text-align:right; margin-bottom:5px;"><a href="${data.text}" target="_blank" style="font-size:11px; color:#888; text-decoration:none;">🔗 Open Original Link</a></div>`;
    } 
    // B. আপলোড করা ইমেজ
    else if (data.type === 'image' && (data.fileUrl || data.image)) {
        contentHTML += `<img src="${data.fileUrl || data.image}" loading="lazy" style="width:100%; border-radius: 8px; display:block; margin-bottom:5px;">`;
        if(data.text) contentHTML += generateTextHTML(data.text);
    } 
    // C. সাধারণ লিংক প্রিভিউ (এখানেই Variable Name ঠিক করা হয়েছে)
    else if (data.type === 'link' && (data.title || data.metaTitle)) {
        // নতুন এবং পুরনো ডাটা দুটোর জন্যই সাপোর্ট রাখা হলো
        const title = data.title || data.metaTitle || data.text;
        const img = data.image || data.metaImg;
        const domain = data.domain || data.metaDomain || 'Link';

        contentHTML += `
        <a href="${data.text}" target="_blank" style="text-decoration:none; color:inherit; display:block; border:1px solid rgba(0,0,0,0.1); border-radius:8px; overflow:hidden; background: rgba(255,255,255,0.6); transition: all 0.2s;">
            ${img ? `<div style="height:140px; background-image: url('${img}'); background-size: cover; background-position: center;"></div>` : ''}
            <div style="padding:10px;">
                <h4 style="margin:0 0 5px 0; font-size:14px; color:#333; line-height:1.4;">${title}</h4>
                <div style="font-size:11px; color:#666;">🔗 ${domain}</div>
            </div>
        </a>`;
    } 
    // D. সাধারণ টেক্সট
    else {
        contentHTML += generateTextHTML(data.text || '');
    }

    // 4. Footer & Actions
    contentHTML += `<div class="card-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
        <small class="card-date" style="font-size:10px; color:#999;">${data.timestamp?.toDate().toLocaleDateString() || ''}</small>`;

    if (isTrashView) {
        // ট্র্যাশ ভিউ-এর জন্য প্লেসহোল্ডার ডিভ
        contentHTML += `<div class="trash-actions" style="display:flex; gap:10px;"></div>`; 
    } else {
        contentHTML += `<button class="delete-btn context-trigger" style="background:none; border:none; cursor:pointer; font-size:18px;">⋮</button>`;
    }
    contentHTML += `</div>`;
    
    // HTML ইনজেক্ট করা
    const contentWrapper = document.createElement('div');
    contentWrapper.innerHTML = contentHTML;
    card.appendChild(contentWrapper);

    // 5. Event Listeners (DOM তৈরি হওয়ার পর)
    
    // Trash Actions
    if(isTrashView) {
        const actionsDiv = card.querySelector('.trash-actions');
        if(actionsDiv) {
            const rBtn = document.createElement('button'); 
            rBtn.innerHTML='♻️'; 
            rBtn.title = "Restore";
            rBtn.style.cssText = "background:none; border:none; cursor:pointer;";
            rBtn.onclick = (e) => { e.stopPropagation(); callbacks.onRestore(id); };
            
            const dBtn = document.createElement('button'); 
            dBtn.innerHTML='❌'; 
            dBtn.title = "Delete Forever";
            dBtn.style.cssText = "background:none; border:none; cursor:pointer;";
            dBtn.onclick = (e) => { e.stopPropagation(); callbacks.onDeleteForever(id); };
            
            actionsDiv.appendChild(rBtn); 
            actionsDiv.appendChild(dBtn);
        }
    } else {
        // Context Menu
        const ctxBtn = card.querySelector('.context-trigger');
        if(ctxBtn) {
            ctxBtn.onclick = (e) => { 
                e.stopPropagation(); 
                callbacks.onContextMenu(e, id); 
            };
        }
        card.addEventListener('contextmenu', (e) => { 
            e.preventDefault(); 
            callbacks.onContextMenu(e, id); 
        });
    }

    // Read More Button
    const readMoreBtn = card.querySelector('.read-more-btn');
    if (readMoreBtn) {
        readMoreBtn.addEventListener('click', (e) => { 
            e.stopPropagation(); 
            callbacks.onRead(data, id); 
        });
    }

    return card;
}

// Text Helper
function generateTextHTML(text) {
    if (!text) return "";
    
    // marked লাইব্রেরি আছে কিনা চেক করা, না থাকলে প্লেইন টেক্সট দেখাবে
    let parsedText = text;
    if (typeof marked !== 'undefined') {
        try {
            parsedText = marked.parse(text);
        } catch (e) {
            console.error("Markdown parse error", e);
        }
    }

    // টেক্সট বেশি বড় হলে Read More দেখাবে
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = parsedText;
    const plainText = tempDiv.textContent || "";
    
    if (plainText.length > 250) {
        // প্রথম ২৫০ ক্যারেক্টার দেখাবে
        return `<div class="note-text" style="overflow:hidden; max-height:100px; mask-image: linear-gradient(180deg, #000 60%, transparent);">${parsedText}</div>
                <button class="read-more-btn" style="color:#007bff; border:none; background:none; padding:0; cursor:pointer; font-size:13px; margin-top:5px; font-weight:bold;">Read More...</button>`;
    }
    return `<div class="note-text">${parsedText}</div>`;
}