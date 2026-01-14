import { getUniversalEmbedHTML } from "../core/utils.js";
import { updateNoteContentDB } from "../core/firebase-service.js";

// কপি ফাংশন (গ্লোবাল)
window.copyCodeBlock = (btn) => {
    const wrapper = btn.closest('.code-wrapper');
    const code = wrapper.querySelector('code').innerText;

    navigator.clipboard.writeText(code).then(() => {
        const originalHTML = btn.innerHTML;
        btn.innerHTML = `<span>✔️</span> Copied!`;
        btn.style.color = '#98c379';
        setTimeout(() => {
            btn.innerHTML = originalHTML;
            btn.style.color = '';
        }, 2000);
    }).catch(err => console.error('Copy failed:', err));
};

// নোট কার্ড তৈরি ফাংশন (ইমেজ URL ফিক্স সহ)
export function createNoteCardElement(docSnap, isTrashView, callbacks) {
    const data = docSnap.data();
    const id = docSnap.id;
    const card = document.createElement('div');
    card.className = 'note-card';
    card.setAttribute('data-id', id);
    if(data.color) card.style.backgroundColor = data.color;

    // সিলেকশন চেকবক্স
    const selectCheckbox = document.createElement('input');
    selectCheckbox.type = 'checkbox';
    selectCheckbox.className = 'card-select-checkbox';
    selectCheckbox.setAttribute('data-id', id);
    card.appendChild(selectCheckbox);

    // পিন এবং ড্র্যাগ হ্যান্ডেল
    if(!isTrashView) {
        const dragIcon = document.createElement('div');
        dragIcon.className = 'drag-handle';
        dragIcon.innerHTML = '⋮⋮'; 
        card.appendChild(dragIcon);
        if(data.isPinned) {
            const pin = document.createElement('div');
            pin.className = 'pin-indicator';
            pin.innerHTML = '📌';
            card.appendChild(pin);
        }
    }

    // ফোল্ডার ব্যাজ
    if(data.folder && !isTrashView) {
        const folderBadge = document.createElement('div');
        folderBadge.style.cssText = `display: inline-block; background: rgba(0,0,0,0.06); font-size: 11px; padding: 3px 8px; border-radius: 6px; color: #555; font-weight: 600; margin-bottom: 8px; border: 1px solid rgba(0,0,0,0.05); max-width: 80%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;
        folderBadge.innerText = `📁 ${data.folder}`;
        card.appendChild(folderBadge);
    }

    // কন্টেন্ট জেনারেশন
    let contentHTML = '';

    // প্রথমে চেক করা হচ্ছে এটি কোনো সোশ্যাল মিডিয়া এম্বেড কিনা
    const mediaEmbed = getUniversalEmbedHTML(data.text);

    // A. Audio
    if (data.type === 'audio' && data.fileUrl) {
        contentHTML += `
            <div style="margin-bottom:10px;">
                <audio controls style="width:100%; height:35px;">
                    <source src="${data.fileUrl}" type="audio/mpeg">
                </audio>
            </div>`;
        if(data.text) contentHTML += generateTextHTML(data.text, id);
    }
    // B. Image
    else if (data.type === 'image' && (data.fileUrl || data.image)) {
        const imgUrl = data.fileUrl || data.image;
        contentHTML += `<img src="${imgUrl}" loading="lazy" style="width:100%; border-radius: 8px; display:block; margin-bottom:5px;">`;
        if(data.text) contentHTML += generateTextHTML(data.text, id);
    } 
    
    // 🔥 C. EMBED PRIORITY (FIXED)
    // যদি লিংক হয় কিন্তু এর এম্বেড থাকে (যেমন Instagram/Facebook), তবে এম্বেড দেখাবে
    else if (mediaEmbed) {
        contentHTML += mediaEmbed;
        
        // যদি টাইটেল থাকে (যেমন YouTube এর ক্ষেত্রে)
        const videoTitle = data.title || data.metaTitle;
        if(videoTitle) {
            contentHTML += `<div style="margin-top:10px; margin-bottom:5px; font-weight:600; font-size:15px; color:#1f2937; line-height:1.4;">${videoTitle}</div>`;
        }
        
        // অরিজিনাল লিংক বাটন
        contentHTML += `<div style="text-align:right; margin-bottom:5px;"><a href="${data.text}" target="_blank" style="font-size:11px; color:#888; text-decoration:none;">🔗 Open Original Link</a></div>`;
    }

    // D. Generic Link Preview (যাদের এম্বেড নেই, যেমন ব্লগ বা নিউজ)
    else if (data.type === 'link') {
        const title = data.title || data.metaTitle || data.text;
        const img = data.image || data.metaImg;
        const domain = data.domain || data.metaDomain || 'Link';
        contentHTML += `
        <a href="${data.text}" target="_blank" style="text-decoration:none; color:inherit; display:block; border:1px solid rgba(0,0,0,0.1); border-radius:8px; overflow:hidden; background: rgba(255,255,255,0.6);">
            ${img ? `<div style="height:140px; background-image: url('${img}'); background-size: cover; background-position: center;"></div>` : ''}
            <div style="padding:10px;">
                <h4 style="margin:0 0 5px 0; font-size:14px; color:#333;">${title}</h4>
                <div style="font-size:11px; color:#666;">🔗 ${domain}</div>
            </div>
        </a>`;
    } 
    
    // E. Plain Text
    else {
        contentHTML += generateTextHTML(data.text || '', id);
    }

    // Tags
    if (data.tags && data.tags.length > 0) {
        contentHTML += `<div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:5px; padding-top:5px; border-top:1px dashed rgba(0,0,0,0.05);">`;
        data.tags.forEach(tag => {
            contentHTML += `<span style="background:rgba(0,0,0,0.05); color:#2563eb; font-size:11px; padding:2px 8px; border-radius:12px; font-weight:500;">#${tag}</span>`;
        });
        contentHTML += `</div>`;
    }

    // Footer
    contentHTML += `<div class="card-footer" style="display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:10px; border-top:1px solid rgba(0,0,0,0.05);">
        <small class="card-date" style="font-size:11px; color:#999;">${data.timestamp?.toDate().toLocaleDateString() || ''}</small>`;

    if (isTrashView) {
        contentHTML += `<div class="trash-actions" style="display:flex; gap:10px;"></div>`; 
    } else {
        contentHTML += `<button class="delete-btn context-trigger" style="background:none; border:none; cursor:pointer; font-size:20px; color:#666; padding:0 5px;">⋮</button>`;
    }
    contentHTML += `</div>`;

    const contentWrapper = document.createElement('div');
    contentWrapper.innerHTML = contentHTML;
    card.appendChild(contentWrapper);

    // Event Listeners
    const checkboxes = card.querySelectorAll('.task-checkbox');
    checkboxes.forEach(box => {
        box.addEventListener('change', async (e) => {
            e.stopPropagation();
            const index = parseInt(e.target.dataset.index);
            const isChecked = e.target.checked;
            let lines = data.text.split('\n');
            if (isChecked) lines[index] = lines[index].replace('- [ ]', '- [x]');
            else lines[index] = lines[index].replace('- [x]', '- [ ]');
            await updateNoteContentDB(id, lines.join('\n'));
        });
    });

    if(isTrashView) {
        const actionsDiv = card.querySelector('.trash-actions');
        if(actionsDiv) {
            const rBtn = document.createElement('button'); rBtn.innerHTML='♻️'; 
            rBtn.onclick = (e) => { e.stopPropagation(); callbacks.onRestore(id); };
            const dBtn = document.createElement('button'); dBtn.innerHTML='❌'; 
            dBtn.onclick = (e) => { e.stopPropagation(); callbacks.onDeleteForever(id); };
            actionsDiv.appendChild(rBtn); actionsDiv.appendChild(dBtn);
        }
    } else {
        const ctxBtn = card.querySelector('.context-trigger');
        if(ctxBtn) {
            ctxBtn.addEventListener('click', (e) => { 
                e.stopPropagation(); e.preventDefault();
                callbacks.onContextMenu(e, id); 
            });
        }
        card.addEventListener('contextmenu', (e) => { 
            e.preventDefault(); callbacks.onContextMenu(e, id); 
        });
    }

    const readMoreBtn = card.querySelector('.read-more-btn');
    if (readMoreBtn) {
        readMoreBtn.addEventListener('click', (e) => { 
            e.stopPropagation(); callbacks.onRead(data, id); 
        });
    }

    selectCheckbox.addEventListener('change', (e) => {
        e.stopPropagation();
        if(e.target.checked) {
            card.classList.add('selected');
            callbacks.onSelect(id, true);
        } else {
            card.classList.remove('selected');
            callbacks.onSelect(id, false);
        }
    });

    card.addEventListener('click', (e) => {
        if(document.body.classList.contains('selection-mode') && !e.target.closest('button') && !e.target.closest('a') && !e.target.closest('.task-checkbox')) {
            selectCheckbox.checked = !selectCheckbox.checked;
            selectCheckbox.dispatchEvent(new Event('change'));
        }
    });

    return card;
}

// টেক্সট জেনারেটর (Highlight.js ফিক্স সহ)
function generateTextHTML(text, noteId) {
    if (!text) return "";

    // চেকলিস্ট হ্যান্ডলিং
    if (text.includes('- [ ]') || text.includes('- [x]')) {
        let lines = text.split('\n');
        let html = '<div class="checklist-container" style="text-align:left;">';
        lines.forEach((line, index) => {
            if (line.trim().startsWith('- [ ]')) {
                html += `<div style="display:flex; align-items:center; margin-bottom:4px;"><input type="checkbox" class="task-checkbox" data-index="${index}" style="margin-right:8px;"><span style="font-size:14px;">${line.replace('- [ ]', '').trim()}</span></div>`;
            } else if (line.trim().startsWith('- [x]')) {
                html += `<div style="display:flex; align-items:center; margin-bottom:4px;"><input type="checkbox" class="task-checkbox" data-index="${index}" checked style="margin-right:8px;"><span style="font-size:14px; text-decoration:line-through; color:#999;">${line.replace('- [x]', '').trim()}</span></div>`;
            } else {
                html += `<div style="margin-bottom:4px;">${marked.parse(line)}</div>`;
            }
        });
        html += '</div>';
        return html;
    }

    // Marked.js কনফিগারেশন
    const renderer = new marked.Renderer();
    
    renderer.code = function(code, language) {
        let codeContent = code;
        let codeLang = language;

        // 🔥 চেক করা হচ্ছে 'code' কি অবজেক্ট নাকি স্ট্রিং (নতুন ভার্সন ফিক্স)
        if (typeof code === 'object' && code !== null) {
            codeContent = code.text || code.raw || String(code) || "";
            codeLang = code.lang || language;
        }

        // স্ট্রিং নিশ্চিত করা
        codeContent = String(codeContent || '');
        const validLang = (typeof hljs !== 'undefined' && hljs.getLanguage(codeLang)) ? codeLang : 'plaintext';
        
        let highlighted;
        try {
            if (typeof hljs !== 'undefined') {
                highlighted = hljs.highlight(codeContent, { language: validLang }).value;
            } else {
                highlighted = codeContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
            }
        } catch (e) {
            console.warn("Highlight error:", e);
            highlighted = codeContent.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        }

        return `
        <div class="code-wrapper">
            <div class="code-header">
                <span style="font-weight:600; text-transform:uppercase;">${validLang}</span>
                <button class="copy-code-btn" onclick="window.copyCodeBlock(this)">
                    <span>📋</span> Copy
                </button>
            </div>
            <pre><code class="hljs language-${validLang}">${highlighted}</code></pre>
        </div>`;
    };

    marked.setOptions({ renderer: renderer });

    // টেক্সট পার্সিং
    let parsedText = "";
    try {
        parsedText = marked.parse(text);
    } catch (e) {
        parsedText = text;
    }

    // 🔥 Read More লজিক (FIXED)
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = parsedText;
    const plainText = tempDiv.textContent || "";
    
    // যদি টেক্সট ২০০ ক্যারেক্টারের বেশি হয়
    if (plainText.length > 200) {
        const uniqueId = `note-content-${noteId || Math.random().toString(36).substr(2, 9)}`;
        
        return `
        <div id="${uniqueId}" class="note-text" style="
            overflow: hidden; 
            max-height: 100px; 
            position: relative;
            transition: max-height 0.3s ease;
            line-height: 1.5;
        ">
            ${parsedText}
            <div class="fade-overlay" style="
                position: absolute; 
                bottom: 0; 
                left: 0; 
                width: 100%; 
                height: 30px; 
                background: linear-gradient(to bottom, transparent, white);
                pointer-events: none;
            "></div>
        </div>
        <button class="read-more-btn" onclick="
            const content = document.getElementById('${uniqueId}');
            const overlay = content.querySelector('.fade-overlay');
            const btn = this;
            if (content.style.maxHeight === 'none') {
                content.style.maxHeight = '100px';
                overlay.style.display = 'block';
                btn.textContent = 'Read More...';
            } else {
                content.style.maxHeight = 'none';
                overlay.style.display = 'none';
                btn.textContent = 'Show Less';
            }
        " style="
            color: #2563eb; 
            border: none; 
            background: none; 
            padding: 5px 0; 
            cursor: pointer; 
            font-size: 13px; 
            font-weight: bold; 
            margin-top: 5px;
            display: block;
        ">Read More...</button>`;
    }
    
    return `<div class="note-text">${parsedText}</div>`;
}