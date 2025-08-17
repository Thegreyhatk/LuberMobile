// ============================
// Chat Admin Panel - Full JS
// ============================

const socket = io();
let currentConvId = null;
let conversations  = [];
let viewMode       = 'active';
let searchTerm     = '';

const viewSelect   = document.getElementById('view-select');
const searchInput  = document.getElementById('search-archived');

// Emojis
const emojiBtn     = document.getElementById('emoji-btn');
const emojiPicker  = document.getElementById('emoji-picker');
const replyInput   = document.getElementById('reply-input');

const emojis = [
  '😀','😂','😅','😊','😉','😍','😘','😜','🤔','😎',
  '😢','😭','👍','👎','🙏','🎉','💪','🐱‍👤','🚀','⚙️'
];

/* ============================
   Helpers
============================ */
function linkify(text) {
  return text.replace(/(\bhttps?:\/\/[^\s]+)/g,
    url => `<a href="${url}" target="_blank">${url}</a>`
  );
}

/**
 * Devuelve cuántos mensajes consecutivos del FINAL son del cliente
 * hasta encontrar uno de 'office'. Lo usamos para inicializar unreadCount.
 */
function getPendingCount(messages = []) {
  let count = 0;
  for (let i = messages.length - 1; i >= 0; i--) {
    const s = messages[i]?.sender;
    if (s === 'customer') count++;
    else if (s === 'office') break;
  }
  return count;
}

/** Contenido HTML del item (incluye badge con conteo individual) */
function renderItemText(name, email, pending) {
  const emailHtml = email ? ` <span class="email">(${email})</span>` : '';
  const badge = pending > 0 ? `<span class="badge">${pending}</span>` : '';
  const icon  = pending > 0 ? '✉️ ' : '';
  return `${icon}${name}${emailHtml} ${badge}`;
}

/* ============================
   Filtros UI
============================ */
viewSelect.onchange = () => {
  viewMode = viewSelect.value;
  searchInput.style.display = viewMode === 'archived' ? 'block' : 'none';
  renderConversations();
};

searchInput.oninput = () => {
  searchTerm = searchInput.value.toLowerCase();
  renderConversations();
};

/* ============================
   Render lista de conversaciones
============================ */
function renderConversations() {
  const ul = document.getElementById('conversations');
  ul.innerHTML = '';

  conversations
    .filter(c => viewMode === 'active' ? !c.archived : c.archived)
    .filter(c => viewMode === 'active'
      ? true
      : (c.userId?.fullName || 'Usuario').toLowerCase().includes(searchTerm))
    .forEach(c => {
      const li = document.createElement('li');
      li.dataset.id = c._id;
      li.onclick = () => selectConversation(c._id, c.userId?.fullName || 'Usuario');

      // Estado visual
      li.classList.toggle('active', c._id === currentConvId);
      const hasUnread = (c.unreadCount || 0) > 0 && c._id !== currentConvId;
      li.classList.toggle('unread', hasUnread);
      li.classList.toggle('has-new-message', hasUnread); // por compatibilidad con tu CSS

      // Texto (nombre, email, badge)
      const name  = c.userId?.fullName || 'Usuario';
      const email = c.userId?.email || '';
      li.innerHTML = renderItemText(name, email, c.unreadCount || 0);

      ul.appendChild(li);
    });

  // Botón archivar
  document.getElementById('archive-btn').disabled = !currentConvId || viewMode === 'archived';
}

/* ============================
   Selección y mensajes
============================ */
function selectConversation(id, name) {
  currentConvId = id;

  // Al abrir el chat, marcar como atendido: unreadCount = 0
  const conv = conversations.find(c => c._id === id);
  if (conv) conv.unreadCount = 0;

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

    const ts = new Date(m.at || m.createdAt || Date.now())
      .toLocaleTimeString('es-ES', { hour:'2-digit', minute:'2-digit' });
    const span = document.createElement('span');
    span.className = 'timestamp';
    span.textContent = ts;
    d.appendChild(span);

    div.appendChild(d);
  });

  div.scrollTop = div.scrollHeight;
}

/* ============================
   Archivar
============================ */
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

/* ============================
   Acciones header
============================ */
document.getElementById('fleet-approval-btn').onclick = () => {
  window.open('http://localhost:3002/FleetApproval.html', '_blank');
};
document.getElementById('refresh-chat-btn').onclick = () => {
  socket.emit('request_list');
};
document.getElementById('chatbot-btn').onclick = () => {
  window.open('http://localhost:3000/Chatbot.html', '_blank');
};
document.getElementById('paypal-invoices-btn').onclick = () => {
  window.open('http://localhost:3002/paypalInvoiceStatus.html', '_blank');
};

/* ============================
   Sockets
============================ */
socket.on('connect', () => {
  socket.emit('request_list');
});

socket.on('conversation_list', list => {
  // Inicializa unreadCount con la cola de pendientes actual (sin respuesta)
  conversations = list.map(c => ({
    ...c,
    unreadCount: getPendingCount(c.messages || [])
  }));

  if (viewMode === 'active' && conversations.length && !currentConvId) {
    currentConvId = conversations.find(c => !c.archived)?._id || null;
  }
  renderConversations();
  renderMessages();
});

socket.on('conversation_update', updated => {
  const idx = conversations.findIndex(c => c._id === updated._id);
  const lastMsg = (updated.messages || [])[updated.messages.length - 1];
  const isFromCustomer = lastMsg?.sender === 'customer';

  if (idx >= 0) {
    // Preserva el contador y reemplaza datos
    const prev = conversations[idx];
    conversations[idx] = { ...updated, unreadCount: prev.unreadCount };

    // Si el mensaje es del cliente y el chat NO está abierto, incrementa contador
    if (isFromCustomer && updated._id !== currentConvId) {
      conversations[idx].unreadCount = (conversations[idx].unreadCount || 0) + 1;
    }
  } else {
    // Nueva conversación: badge arranca según último mensaje
    conversations.unshift({
      ...updated,
      unreadCount: isFromCustomer ? 1 : 0
    });
  }

  renderConversations();
  // Solo re-render de mensajes si el update es del chat abierto
  if (updated._id === currentConvId) renderMessages();
});

/* ============================
   Envío de mensajes
============================ */
replyInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    document.getElementById('reply-form').dispatchEvent(new Event('submit'));
  }
});

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

/* ============================
   Modal imagen
============================ */
const modal    = document.getElementById('img-modal');
const modalImg = document.getElementById('img-modal-img');
document.getElementById('img-modal-close').onclick = () => modal.style.display = 'none';
function openModal(src) { modal.style.display = 'flex'; modalImg.src = src; }

/* ============================
   Emojis
============================ */
emojis.forEach(e => {
  const span = document.createElement('span');
  span.textContent = e;
  span.onclick = () => {
    const start = replyInput.selectionStart;
    const end   = replyInput.selectionEnd;
    const text  = replyInput.value;
    replyInput.value = text.slice(0, start) + e + text.slice(end);
    replyInput.selectionStart = replyInput.selectionEnd = start + e.length;
    replyInput.focus();
  };
  emojiPicker.appendChild(span);
});

emojiBtn.addEventListener('click', () => {
  emojiPicker.style.display = emojiPicker.style.display === 'block' ? 'none' : 'block';
});
document.addEventListener('click', ev => {
  if (!emojiPicker.contains(ev.target) && ev.target !== emojiBtn) {
    emojiPicker.style.display = 'none';
  }
});
