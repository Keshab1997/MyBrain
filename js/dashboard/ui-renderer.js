import { getUniversalEmbedHTML } from "../core/utils.js";
import { updateNoteContentDB, updateNoteFolderDB, updateNoteTagsDB } from "../core/firebase-service.js";

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
        
        // পিন ইন্ডিকেটর যোগ করা
        if(data.isPinned) {
            const pinIcon = document.createElement('div');
            pinIcon.className = 'pin-indicator';
            pinIcon.innerHTML = '📌';
            card.appendChild(pinIcon);
            card.style.border = "2px solid #2563eb"; // পিন করা নোটের বর্ডার নীল হবে
        }
    }

    // ফোল্ডার ব্যাজ
    if(data.folder && !isTrashView) {
        const folderBadge = document.createElement('div');
        folderBadge.style.cssText = `display: inline-block; background: rgba(0,0,0,0.06); font-size: 11px; padding: 3px 8px; border-radius: 6px; color: #555; font-weight: 600; margin-bottom: 8px; border: 1px solid rgba(0,0,0,0.05); max-width: 80%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`;
        folderBadge.innerText = `📁 ${data.folder}`;
        card.appendChild(folderBadge);
    }

    // ১. Inline Folder Selector (Premium Look)
    if(!isTrashView) {
        const folderContainer = document.createElement('div');
        folderContainer.style.margin = "0 0 10px 0";
        
        // ফোল্ডার লিস্ট পাওয়ার জন্য একটি Set ব্যবহার করছি যাতে ডুপ্লিকেট না হয়
        const folderSet = new Set(["General"]); 
        
        // ১. ইনপুট এরিয়ার ড্রপডাউন থেকে ফোল্ডারগুলো নিন
        document.querySelectorAll('#folderSelect option').forEach(opt => {
            if(opt.value) folderSet.add(opt.value);
        });

        // ২. উপরের ফোল্ডার চিপস (Folder Chips) থেকেও নামগুলো নিন
        document.querySelectorAll('.folder-chip').forEach(chip => {
            const name = chip.innerText.replace('📁', '').replace('×', '').trim();
            if(name) folderSet.add(name);
        });

        const allFolders = Array.from(folderSet);
        
        let folderOptions = allFolders.map(f => `<option value="${f}" ${data.folder === f ? 'selected' : ''}>${f}</option>`).join('');

        folderContainer.innerHTML = `
            <select class="inline-folder-select" style="background: rgba(37, 99, 235, 0.1); border: none; font-size: 11px; padding: 4px 8px; border-radius: 6px; color: #2563eb; font-weight: 600; cursor: pointer; outline: none; max-width: 120px;">
                ${folderOptions}
            </select>
        `;

        const select = folderContainer.querySelector('select');
        select.addEventListener('change', async (e) => {
            const newFolder = e.target.value;
            try {
                await updateNoteFolderDB(id, newFolder);
            } catch (err) {
                console.error("Folder update failed:", err);
            }
        });
        card.appendChild(folderContainer);
    }

    // কন্টেন্ট জেনারেশন
    let contentHTML = '';
    const mediaEmbed = getUniversalEmbedHTML(data.text);

    if (data.type === 'audio' && data.fileUrl) {
        contentHTML += `<div style="margin-bottom:10px;"><audio controls style="width:100%; height:35px;"><source src="${data.fileUrl}" type="audio/mpeg"></audio></div>`;
        if(data.text) contentHTML += generateTextHTML(data.text, id);
    } else if (data.type === 'image' && (data.fileUrl || data.image)) {
        contentHTML += `<img src="${data.fileUrl || data.image}" loading="eager" style="width:100%; min-height:200px; background:#f1f5f9; border-radius: 8px; display:block; margin-bottom:5px;">`;
        if(data.text) contentHTML += generateTextHTML(data.text, id);
    } else if (mediaEmbed) {
        contentHTML += `<div class="embed-container" style="min-height:300px; background:#000; border-radius:8px; overflow:hidden;">${mediaEmbed}</div>`;
        const autoCaption = (data.title && !data.title.includes("Instagram")) ? data.title : (data.description || "");
        if (autoCaption && autoCaption !== "Instagram Post") {
            contentHTML += `<div class="insta-caption" style="font-size: 13px; color: var(--text-main); margin: 10px 0; line-height: 1.5; max-height: 150px; overflow-y: auto; padding: 10px; background: rgba(37, 99, 235, 0.05); border-left: 3px solid #2563eb; border-radius: 4px;">${autoCaption}</div>`;
        }
        contentHTML += `<div style="text-align:right; margin-top:5px;"><a href="${data.text}" target="_blank" style="font-size:11px; color:#2563eb; text-decoration:none; font-weight:bold;">🔗 Open Original Link</a></div>`;
    } else if (data.type === 'link') {
        const linkCard = document.createElement('a');
        linkCard.href = data.text;
        linkCard.style.cssText = "text-decoration:none; color:inherit; display:block; border:1px solid rgba(0,0,0,0.1); border-radius:8px; overflow:hidden; background: rgba(255,255,255,0.6);";
        
        // ইন-অ্যাপ ব্রাউজার ইভেন্ট যোগ করা
        linkCard.addEventListener('click', (e) => {
            const url = data.text;
            // যদি এটি ইউটিউব/ফেসবুক/ইনস্টাগ্রাম না হয়, তবে ইন-অ্যাপ ব্রাউজারে খোলো
            if (!url.includes('youtube.com') && !url.includes('facebook.com') && !url.includes('instagram.com')) {
                e.preventDefault();
                import('./browser-modal.js').then(module => {
                    module.openInAppBrowser(url);
                });
            }
        });
        
        linkCard.innerHTML = `${data.image ? `<div style="height:140px; background-image: url('${data.image}'); background-size: cover; background-position: center;"></div>` : ''}<div style="padding:10px;"><h4 style="margin:0 0 5px 0; font-size:14px; color:#333;">${data.title || data.text}</h4><div style="font-size:11px; color:#666;">🔗 ${data.domain || 'Link'}</div></div>`;
        
        contentHTML += linkCard.outerHTML;
    } else {
        contentHTML += generateTextHTML(data.text || '', id);
    }

    // Content Wrapper তৈরি এবং কার্ডে যোগ করা
    const contentWrapper = document.createElement('div');
    contentWrapper.innerHTML = contentHTML;
    card.appendChild(contentWrapper);

    // Tags Section (Interactive)
    const tagsWrapper = document.createElement('div');
    tagsWrapper.style.cssText = "margin-top:10px; display:flex; flex-wrap:wrap; gap:5px; padding-top:5px; border-top:1px dashed rgba(0,0,0,0.05);";
    
    if (data.tags) {
        data.tags.forEach((tag, index) => {
            const tagSpan = document.createElement('span');
            tagSpan.style.cssText = "background:rgba(0,0,0,0.05); color:#2563eb; font-size:11px; padding:2px 8px; border-radius:12px; font-weight:500; cursor:pointer;";
            tagSpan.innerHTML = `#${tag} <span style="color:red; margin-left:4px;">×</span>`;
            tagSpan.onclick = async (e) => {
                e.stopPropagation();
                const newTags = data.tags.filter((_, i) => i !== index);
                await updateNoteTagsDB(id, newTags);
            };
            tagsWrapper.appendChild(tagSpan);
        });
    }
    const addTagBtn = document.createElement('span');
    addTagBtn.innerText = "+ Tag";
    addTagBtn.style.cssText = "font-size:11px; color:#999; cursor:pointer; padding:2px 8px; border:1px dashed #ccc; border-radius:12px;";
    addTagBtn.onclick = async (e) => {
        e.stopPropagation();
        const newTag = prompt("Enter new tag:");
        if (newTag) {
            const updatedTags = [...(data.tags || []), newTag.replace('#', '').trim()];
            await updateNoteTagsDB(id, updatedTags);
        }
    };
    tagsWrapper.appendChild(addTagBtn);
    card.appendChild(tagsWrapper);

    // Footer
    const footer = document.createElement('div');
    footer.className = 'card-footer';
    footer.style.cssText = "display:flex; justify-content:space-between; align-items:center; margin-top:10px; padding-top:10px; border-top:1px solid rgba(0,0,0,0.05);";
    
    // তারিখ ফরম্যাট করার জন্য একটি সেফ ফাংশন
    const formatNoteDate = (ts) => {
        if (!ts) return "";
        // যদি এটি ফায়ারবেস টাইমস্ট্যাম্প হয় (যাতে .toDate ফাংশন আছে)
        if (typeof ts.toDate === 'function') {
            return ts.toDate().toLocaleDateString();
        }
        // যদি এটি লোকাল স্টোরেজ থেকে আসা অবজেক্ট হয় (যাতে শুধু seconds আছে)
        if (ts.seconds) {
            return new Date(ts.seconds * 1000).toLocaleDateString();
        }
        // অন্যথায় সাধারণ ডেট হিসেবে রিটার্ন করবে
        return new Date(ts).toLocaleDateString();
    };

    const leftFooter = document.createElement('div');
    leftFooter.innerHTML = `<small style="font-size:11px; color:#999;">${formatNoteDate(data.timestamp)}</small>`;
    footer.appendChild(leftFooter);

    const rightActions = document.createElement('div');
    rightActions.style.display = "flex";
    rightActions.style.gap = "12px";
    rightActions.style.alignItems = "center";

    // 🔥 WhatsApp Direct Share Button (Fixed for Photos)
    if (!isTrashView) {
        const waBtn = document.createElement('button');
        waBtn.innerHTML = ' <img src="https://cdn-icons-png.flaticon.com/512/733/733585.png" width="18" height="18" style="opacity:0.7;">';
        waBtn.style.cssText = "background:none; border:none; cursor:pointer; display:flex; align-items:center;";
        waBtn.title = "Share to WhatsApp";
        
        waBtn.onclick = async (e) => {
            e.stopPropagation();
            
            // ১. টেক্সট থেকে হ্যাশট্যাগ রিমুভ করে ক্লিন করা
            const cleanText = data.text ? data.text.replace(/#\w+/g, '').trim() : "";
            const fileUrl = data.fileUrl || ""; // ফটোর লিংক
            
            // ২. যদি ব্রাউজার Web Share API সাপোর্ট করে (মোবাইলের জন্য বেস্ট)
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'MindVault Note',
                        text: cleanText,
                        url: fileUrl // এখানে লিংক দিলে হোয়াটসঅ্যাপ ফটো প্রিভিউ দেখাবে
                    });
                    return; // সাকসেস হলে এখানেই শেষ
                } catch (err) {
                    console.log("Web Share failed, falling back to URL...");
                }
            }

            // ৩. ফলব্যাক: যদি Web Share কাজ না করে (ডেস্কটপ বা পুরনো ব্রাউজার)
            // টেক্সট এবং ফটোর লিংক একসাথে পাঠানো হচ্ছে যাতে প্রিভিউ আসে
            const finalMessage = `${cleanText}\n\n${fileUrl}`.trim();
            const waUrl = `https://wa.me/?text=${encodeURIComponent(finalMessage)}`;
            window.open(waUrl, '_blank');
        };
        rightActions.appendChild(waBtn);
    }

    if (isTrashView) {
        const rBtn = document.createElement('button'); rBtn.innerHTML='♻️'; 
        rBtn.onclick = (e) => { e.stopPropagation(); callbacks.onRestore(id); };
        const dBtn = document.createElement('button'); dBtn.innerHTML='❌'; 
        dBtn.onclick = (e) => { e.stopPropagation(); callbacks.onDeleteForever(id); };
        rightActions.appendChild(rBtn); rightActions.appendChild(dBtn);
    } else {
        const menuBtn = document.createElement('button');
        menuBtn.className = 'delete-btn context-trigger';
        menuBtn.innerHTML = '⋮';
        menuBtn.style.fontSize = "20px";
        menuBtn.onclick = (e) => { e.stopPropagation(); callbacks.onContextMenu(e, id); };
        rightActions.appendChild(menuBtn);
    }
    
    footer.appendChild(rightActions);
    card.appendChild(footer);

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
        const isChecked = e.target.checked;
        card.classList.toggle('selected', isChecked);
        callbacks.onSelect(id, isChecked);
    });

    // কার্ডের যেকোনো জায়গায় ক্লিক করলে সিলেক্ট হবে (যদি সিলেকশন মোড অন থাকে)
    card.addEventListener('click', (e) => {
        if(document.body.classList.contains('selection-mode')) {
            // যদি ক্লিকটি বাটন বা লিঙ্কে না হয়
            if (!e.target.closest('button') && !e.target.closest('a') && !e.target.closest('select')) {
                selectCheckbox.checked = !selectCheckbox.checked;
                selectCheckbox.dispatchEvent(new Event('change'));
            }
        }
    });

    return card;
}

// টেক্সট জেনারেটর (Highlight.js ফিক্স সহ)
function generateTextHTML(text, noteId) {
    if (!text) return "";

    // Marked options সেটআপ
    marked.setOptions({
        highlight: function(code, lang) {
            if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
            }
            return hljs.highlightAuto(code).value;
        },
        breaks: true,
        gfm: true
    });

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

    const parsedText = marked.parse(text);

    // Read More লজিক ফিক্স: কন্টেন্ট যদি খুব ছোট হয় তবে বাটন দেখাবে না
    const charLimit = 250;
    if (text.length > charLimit) {
        const uniqueId = `note-content-${noteId}`;
        return `
            <div id="${uniqueId}" class="note-text-container" style="max-height: 150px; overflow-y: auto; position: relative; padding-right: 5px;">
                <div class="note-text">${parsedText}</div>
            </div>
        `;
    }
    return `<div class="note-text">${parsedText}</div>`;
}

// গ্লোবাল ফাংশন হিসেবে যোগ করুন
window.toggleReadMore = (id, btn) => {
    const container = document.getElementById(id);
    const overlay = container.querySelector('.fade-overlay');
    if (container.style.maxHeight === 'none') {
        container.style.maxHeight = '120px';
        overlay.style.display = 'block';
        btn.textContent = 'Read More';
    } else {
        container.style.maxHeight = 'none';
        overlay.style.display = 'none';
        btn.textContent = 'Show Less';
    }
};