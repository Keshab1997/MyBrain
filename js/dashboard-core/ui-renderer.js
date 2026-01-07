// ui-renderer.js
import { getUniversalEmbedHTML } from "./utils.js";

// Generate Note Card HTML Object
export function createNoteCardElement(docSnap, isTrashView, callbacks) {
    const data = docSnap.data();
    const id = docSnap.id;
    const card = document.createElement('div');
    card.className = 'note-card'; 
    card.setAttribute('data-id', id);
    if(data.color) card.style.backgroundColor = data.color;

    // Pin & Drag Handle
    if(!isTrashView) {
        const dragIcon = document.createElement('div');
        dragIcon.className = 'drag-handle';
        dragIcon.innerHTML = '⋮⋮'; 
        card.appendChild(dragIcon);
        if(data.isPinned) card.innerHTML += `<div class="pin-indicator">📌</div>`;
    }

    // Folder Badge
    if(data.folder && !isTrashView) {
        const folderBadge = document.createElement('span');
        folderBadge.style.cssText = "position:absolute; top:8px; right:30px; background:rgba(0,0,0,0.1); font-size:10px; padding:2px 6px; border-radius:10px; color:#555;";
        folderBadge.innerText = data.folder;
        card.appendChild(folderBadge);
    }

    // Content Generation
    let contentHTML = '';
    const mediaEmbed = getUniversalEmbedHTML(data.text);
    
    if (mediaEmbed) {
        contentHTML += mediaEmbed;
    } else if (data.type === 'image') {
        contentHTML += `<img src="${data.fileUrl}" loading="lazy" style="width:100%; border-radius: 8px; display:block; margin-bottom:5px;">`;
        if(data.text) contentHTML += generateTextHTML(data.text);
    } else if (data.type === 'link' && data.metaTitle) {
        contentHTML += `
        <a href="${data.text}" target="_blank" style="text-decoration:none; color:inherit; display:block; border:1px solid rgba(0,0,0,0.1); border-radius:10px; overflow:hidden; background: rgba(255,255,255,0.5);">
            ${data.metaImg ? `<div style="height:140px; background-image: url('${data.metaImg}'); background-size: cover; background-position: center;"></div>` : ''}
            <div style="padding:10px;">
                <h4 style="margin:0 0 5px 0; font-size:14px;">${data.metaTitle}</h4>
                <div style="font-size:11px; opacity:0.7;">🔗 ${data.metaDomain || 'Link'}</div>
            </div>
        </a>`;
    } else {
        contentHTML += generateTextHTML(data.text || '');
    }

    // Footer & Actions
    contentHTML += `<div class="card-footer"><small class="card-date">${data.timestamp?.toDate().toLocaleDateString() || ''}</small>`;

    if (isTrashView) {
        const restoreBtn = document.createElement('button');
        restoreBtn.innerHTML = '♻️';
        restoreBtn.onclick = () => callbacks.onRestore(id);
        
        const deleteBtn = document.createElement('button');
        deleteBtn.innerHTML = '❌';
        deleteBtn.style.color = 'red';
        deleteBtn.onclick = () => callbacks.onDeleteForever(id);

        const div = document.createElement('div');
        div.style.display = 'flex'; div.style.gap = '10px';
        div.append(restoreBtn, deleteBtn);
        
        // We append this later via DOM to keep event listeners active
        // For simplicity in this string builder approach:
        contentHTML += `<div class="trash-actions" style="display:flex; gap:10px;"></div>`; 
    } else {
        contentHTML += `<button class="delete-btn context-trigger">⋮</button>`;
    }
    contentHTML += `</div>`;
    
    card.innerHTML += contentHTML;

    // Attach Event Listeners (Safe way)
    if(isTrashView) {
        const actions = card.querySelector('.trash-actions');
        if(actions) {
            const rBtn = document.createElement('button'); rBtn.innerText='♻️'; rBtn.onclick = () => callbacks.onRestore(id);
            const dBtn = document.createElement('button'); dBtn.innerText='❌'; dBtn.onclick = () => callbacks.onDeleteForever(id);
            actions.appendChild(rBtn); actions.appendChild(dBtn);
        }
    } else {
        const ctxBtn = card.querySelector('.context-trigger');
        if(ctxBtn) ctxBtn.onclick = (e) => callbacks.onContextMenu(e, id);
        card.addEventListener('contextmenu', (e) => { e.preventDefault(); callbacks.onContextMenu(e, id); });
    }

    const readMoreBtn = card.querySelector('.read-more-btn');
    if (readMoreBtn) readMoreBtn.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onRead(data, id); });

    return card;
}

function generateTextHTML(text) {
    if (!text) return "";
    // Note: Assuming 'marked' is loaded globally in index.html
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = marked.parse(text);
    const plainText = tempDiv.textContent || "";
    if (plainText.length > 250) {
        return `<div class="note-text">${plainText.substring(0, 250)}...</div><button class="read-more-btn" style="color:#007bff; border:none; background:none; padding:0; cursor:pointer; font-size:13px; margin-top:5px;">Read More...</button>`;
    }
    return `<div class="note-text">${marked.parse(text)}</div>`;
}