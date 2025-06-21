const socket = io();
let currentConvId = null;
let conversations  = [];
let viewMode       = 'active';
let searchTerm     = '';

const viewSelect   = document.getElementById('view-select');
const searchInput  = document.getElementById('search-archived');

// Nuevo: elementos para emojis
const emojiBtn     = document.getElementById('emoji-btn');
const emojiPicker  = document.getElementById('emoji-picker');
const replyInput   = document.getElementById('reply-input');

// Lista de emojis (puedes ampliarla)
const emojis = [
  '😀','😂','😅','😊','😉','😍','😘','😜','🤔','😎',
  '😢','😭','👍','👎','🙏','🎉','💪','🐱‍👤','🚀','⚙️'
];

viewSelect.onchange = () => {
  viewMode = viewSelect.value;
  searchInput.style.display = viewMode === 'archived' ? 'block' : 'none';
  renderConversations();
};

searchInput.oninput = () => {
  searchTerm = searchInput.value.toLowerCase();
  renderConversations();
};

function linkify(text) {
  return text.replace(/(\bhttps?:\/\/[^\s]+)/g,
    url => `<a href="${url}" target="_blank">${url}</a>`
  );
}

function renderConversations() {
  const ul = document.getElementById('conversations');
  ul.innerHTML = '';
  conversations
    .filter(c => viewMode === 'active' ? !c.archived : c.archived)
    .filter(c => viewMode === 'active' ? true
      : c.userId.fullName.toLowerCase().includes(searchTerm))
    .forEach(c => {
      const li = document.createElement('li');
      li.dataset.id = c._id;
      li.onclick = () => selectConversation(c._id, c.userId.fullName);
      li.classList.toggle('active', c._id === currentConvId);

      const hasNewMessage =
        viewMode === 'active' &&
        c._lastCount != null &&
        c.messages.length > c._lastCount &&
        c._id !== currentConvId;

      if (hasNewMessage) {
        li.classList.add('unread');
        li.classList.add('has-new-message');
      } else {
        li.classList.remove('has-new-message');
      }

      const mailIcon = hasNewMessage ? '✉️ ' : '';
      li.textContent = `${mailIcon}${c.userId.fullName} (${c.userId.email})`;

      c._lastCount = c.messages.length;
      ul.appendChild(li);
    });

  document.getElementById('archive-btn').disabled = !currentConvId || viewMode === 'archived';
}

function selectConversation(id, name) {
  currentConvId = id;
  document.getElementById('chat-header').textContent = 'Chat con ' + name;
  renderConversations();
  renderMessages();
}

function renderMessages() {
  const conv = conversations.find(c => c._id === currentConvId);
  const div  = document.getElementById('chat-messages');
  div.innerHTML = '';
  if (!conv) return;
  conv.messages.forEach(m => {
    const d = document.createElement('div');
    d.className = 'msg ' + m.sender;
    if (m.text) d.innerHTML = linkify(m.text);
    if (m.imageUrl) {
      const img = document.createElement('img');
      img.src = m.imageUrl;
      img.onclick = () => openModal(m.imageUrl);
      d.appendChild(img);
    }
    div.appendChild(d);
  });
  div.scrollTop = div.scrollHeight;
}

async function archiveConversation() {
  if (!currentConvId) return;
  await fetch('/api/chat/archive', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ convId: currentConvId })
  });
  const idx = conversations.findIndex(c => c._id === currentConvId);
  if (idx >= 0) conversations[idx].archived = true;
  currentConvId = null;
  document.getElementById('chat-header').textContent = 'Selecciona una conversación';
  renderConversations();
  renderMessages();
}

document.getElementById('archive-btn').onclick = archiveConversation;

// Resto de botones...
document.getElementById('fleet-approval-btn').onclick     = () => { window.open('http://localhost:3007/FleetApproval.html', '_blank'); };
document.getElementById('customer-approval-btn').onclick  = () => { window.open('http://localhost:3007/CustomerApproval.html', '_blank'); };
document.getElementById('employees-approval-btn').onclick = () => { window.open('http://localhost:3001/index.html', '_blank'); };
document.getElementById('invoices-status-btn').onclick    = () => { window.open('http://localhost:3007/paypalInvoiceStatus.html', '_blank'); };
document.getElementById('chat-settings-btn').onclick      = () => { alert("⚙️ ¡Aquí podrías configurar tus preferencias de chat en el futuro!"); };
document.getElementById('refresh-chat-btn').onclick       = () => { socket.emit('request_list'); };

socket.on('connect', () => {
  socket.emit('request_list');
});

socket.on('conversation_list', list => {
  conversations = list.map(c => ({ ...c, _lastCount: c.messages.length }));
  if (viewMode === 'active' && conversations.length && !currentConvId) {
    currentConvId = conversations.find(c => !c.archived)?._id || null;
  }
  renderConversations();
  renderMessages();
});

socket.on('conversation_update', updated => {
  const idx = conversations.findIndex(c => c._id === updated._id);
  if (idx >= 0) {
    conversations[idx] = { ...updated, _lastCount: conversations[idx]._lastCount };
  } else {
    conversations.unshift({ ...updated, _lastCount: updated.messages.length - 1 });
  }
  renderConversations();
  renderMessages();
});

// Envío de mensajes
document.getElementById('reply-form').onsubmit = async e => {
  e.preventDefault();
  if (!currentConvId) return;
  const form = e.target, fd = new FormData(form);
  fd.append('convId', currentConvId);
  await fetch('/api/chat/reply', {
    credentials: 'same-origin',
    method: 'POST',
    body: fd
  });
  form.reset();
  renderMessages();
};

// Modal de imagen
const modal    = document.getElementById('img-modal'),
      modalImg = document.getElementById('img-modal-img');
document.getElementById('img-modal-close').onclick = () => modal.style.display = 'none';
function openModal(src) { modal.style.display = 'flex'; modalImg.src = src; }

/* ============================
   Lógica para emojis
   ============================ */
// 1. Crear elementos de emoji en el picker
emojis.forEach(e => {
  const span = document.createElement('span');
  span.textContent = e;
  span.onclick = () => {
    // Inserta el emoji en la posición del cursor
    const start = replyInput.selectionStart;
    const end   = replyInput.selectionEnd;
    const text  = replyInput.value;
    replyInput.value = text.slice(0, start) + e + text.slice(end);
    // avanza cursor tras el emoji
    replyInput.selectionStart = replyInput.selectionEnd = start + e.length;
    replyInput.focus();
  };
  emojiPicker.appendChild(span);
});

// 2. Mostrar/ocultar picker al hacer clic en el botón
emojiBtn.addEventListener('click', () => {
  emojiPicker.style.display = emojiPicker.style.display === 'block' ? 'none' : 'block';
});

// 3. Cerrar picker al clicar fuera
document.addEventListener('click', ev => {
  if (!emojiPicker.contains(ev.target) && ev.target !== emojiBtn) {
    emojiPicker.style.display = 'none';
  }
});
