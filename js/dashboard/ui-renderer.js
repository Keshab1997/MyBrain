import { getUniversalEmbedHTML } from "../core/utils.js";
import { updateNoteContentDB } from "../core/firebase-service.js";

// Generate Note Card HTML Object
export function createNoteCardElement(docSnap, isTrashView, callbacks) {
    const data = docSnap.data();
    const id = docSnap.id;
    const card = document.createElement('div');
    card.className = 'note-card';
    card.setAttribute('data-id', id);
    if(data.color) card.style.backgroundColor = data.color;

    // 🔥 1. Multi-Select Checkbox (New)
    const selectCheckbox = document.createElement('input');
    selectCheckbox.type = 'checkbox';
    selectCheckbox.className = 'card-select-checkbox';
    selectCheckbox.setAttribute('data-id', id);
    card.appendChild(selectCheckbox);

    // 2. Pin & Drag Handle
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

    // 🔥 3. Folder Badge (FIXED: No Overlap)
    // আগে এটি absolute ছিল, এখন এটি relative করা হয়েছে যাতে টেক্সট নিচে নেমে যায়।
    if(data.folder && !isTrashView) {
        const folderBadge = document.createElement('div');
        folderBadge.style.cssText = `
            display: inline-block;
            background: rgba(0,0,0,0.06);
            font-size: 11px;
            padding: 3px 8px;
            border-radius: 6px;
            color: #555;
            font-weight: 600;
            margin-bottom: 8px;
            border: 1px solid rgba(0,0,0,0.05);
            max-width: 80%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        `;
        folderBadge.innerText = `📁 ${data.folder}`;
        card.appendChild(folderBadge);
    }

    // 4. Content Generation
    let contentHTML = '';

    // A. Audio Player
    if (data.type === 'audio' && data.fileUrl) {
        contentHTML += `
            <div style="margin-bottom:10px;">
                <audio controls style="width:100%; height:35px;">
                    <source src="${data.fileUrl}" type="audio/mpeg">
                    Your browser does not support the audio element.
                </audio>
            </div>`;
        if(data.text) contentHTML += generateTextHTML(data.text, id);
    }
    // B. Image
    else if (data.type === 'image' && (data.fileUrl || data.image)) {
        contentHTML += `<img src="${data.fileUrl || data.image}" loading="lazy" style="width:100%; border-radius: 8px; display:block; margin-bottom:5px;">`;
        if(data.text) contentHTML += generateTextHTML(data.text, id);
    } 
    // C. Link Preview
    else if (data.type === 'link' && (data.title || data.metaTitle) && !getUniversalEmbedHTML(data.text)) {
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
    // D. Text / Embed
    else {
        const mediaEmbed = getUniversalEmbedHTML(data.text);
        if (mediaEmbed) {
            contentHTML += mediaEmbed;
            const videoTitle = data.title || data.metaTitle;
            if(videoTitle) {
                contentHTML += `<div style="margin-top:10px; margin-bottom:5px; font-weight:600; font-size:15px; color:#1f2937; line-height:1.4;">${videoTitle}</div>`;
            }
            contentHTML += `<div style="text-align:right; margin-bottom:5px;"><a href="${data.text}" target="_blank" style="font-size:11px; color:#888; text-decoration:none;">🔗 Open Original Link</a></div>`;
        } else {
            contentHTML += generateTextHTML(data.text || '', id);
        }
    }

    // 5. Tags
    if (data.tags && data.tags.length > 0) {
        contentHTML += `<div style="margin-top:8px; display:flex; flex-wrap:wrap; gap:5px; padding-top:5px; border-top:1px dashed rgba(0,0,0,0.05);">`;
        data.tags.forEach(tag => {
            contentHTML += `<span style="background:rgba(0,0,0,0.05); color:#2563eb; font-size:11px; padding:2px 8px; border-radius:12px; font-weight:500;">#${tag}</span>`;
        });
        contentHTML += `</div>`;
    }

    // 6. Footer
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

    // 7. Event Listeners
    const checkboxes = card.querySelectorAll('.task-checkbox');
    checkboxes.forEach(box => {
        box.addEventListener('change', async (e) => {
            e.stopPropagation();
            const index = parseInt(e.target.dataset.index);
            const isChecked = e.target.checked;
            let lines = data.text.split('\n');
            let currentLine = lines[index];
            if (isChecked) lines[index] = currentLine.replace('- [ ]', '- [x]');
            else lines[index] = currentLine.replace('- [x]', '- [ ]');
            const newText = lines.join('\n');
            await updateNoteContentDB(id, newText);
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

    // 🔥 Checkbox Click Event (Selection Logic)
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

    // কার্ডে ক্লিক করলে যদি সিলেকশন মোড অন থাকে তবে সিলেক্ট হবে
    card.addEventListener('click', (e) => {
        if(document.body.classList.contains('selection-mode') && !e.target.closest('button') && !e.target.closest('a') && !e.target.closest('.task-checkbox')) {
            selectCheckbox.checked = !selectCheckbox.checked;
            selectCheckbox.dispatchEvent(new Event('change'));
        }
    });

    return card;
}

function generateTextHTML(text, noteId) {
    if (!text) return "";
    if (text.includes('- [ ]') || text.includes('- [x]')) {
        let lines = text.split('\n');
        let html = '<div class="checklist-container" style="text-align:left;">';
        let hasChecklist = false;
        lines.forEach((line, index) => {
            if (line.trim().startsWith('- [ ]')) {
                hasChecklist = true;
                const content = line.replace('- [ ]', '').trim();
                html += `<div style="display:flex; align-items:center; margin-bottom:4px;"><input type="checkbox" class="task-checkbox" data-index="${index}" style="margin-right:8px; cursor:pointer;"><span style="font-size:14px;">${content}</span></div>`;
            } else if (line.trim().startsWith('- [x]')) {
                hasChecklist = true;
                const content = line.replace('- [x]', '').trim();
                html += `<div style="display:flex; align-items:center; margin-bottom:4px;"><input type="checkbox" class="task-checkbox" data-index="${index}" checked style="margin-right:8px; cursor:pointer;"><span style="font-size:14px; text-decoration:line-through; color:#999;">${content}</span></div>`;
            } else {
                html += `<div style="margin-bottom:4px;">${marked.parse(line)}</div>`;
            }
        });
        html += '</div>';
        if(hasChecklist) return html;
    }
    let parsedText = text;
    if (typeof marked !== 'undefined') { try { parsedText = marked.parse(text); } catch (e) { console.error(e); } }
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = parsedText;
    const plainText = tempDiv.textContent || "";
    if (plainText.length > 250) {
        return `<div class="note-text" style="overflow:hidden; max-height:100px; mask-image: linear-gradient(180deg, #000 60%, transparent);">${parsedText}</div><button class="read-more-btn" style="color:#007bff; border:none; background:none; padding:0; cursor:pointer; font-size:13px; margin-top:5px; font-weight:bold;">Read More...</button>`;
    }
    return `<div class="note-text">${parsedText}</div>`;
}