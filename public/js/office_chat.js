const socket = io();
let currentConvId = null;
let conversations  = [];
let viewMode       = 'active';
let searchTerm     = '';
let bootstrapped   = false;   // ← sabemos si ya hicimos la carga inicial

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

/** Unread = mensajes del cliente desde _seenAt */
function getUnreadCustomerCount(conv) {
  const start = conv._seenAt ?? 0;
  let count = 0;
  for (let i = start; i < conv.messages.length; i++) {
    if (conv.messages[i]?.sender === 'customer') count++;
  }
  return count;
}

/** HTML del item con badge */
function renderItemText(name, email, unreadCount) {
  const emailHtml = email ? ` <span class="email">(${email})</span>` : '';
  const badge = unreadCount > 0 ? `<span class="badge">${unreadCount}</span>` : '';
  const icon  = unreadCount > 0 ? '✉️ ' : '';
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
    .filter(c => viewMode === 'active' ? true
      : (c.userId?.fullName || 'Usuario').toLowerCase().includes(searchTerm))
    .forEach(c => {
      const li = document.createElement('li');
      li.dataset.id = c._id;
      li.onclick = () => selectConversation(c._id, c.userId?.fullName || 'Usuario');
      li.classList.toggle('active', c._id === currentConvId);

      const unread = getUnreadCustomerCount(c);
      const shouldBlink = viewMode === 'active' && unread > 0 && c._id !== currentConvId;

      li.classList.toggle('unread', shouldBlink);
      li.classList.toggle('has-new-message', shouldBlink);

      const name  = c.userId?.fullName || 'Usuario';
      const email = c.userId?.email || '';
      li.innerHTML = renderItemText(name, email, unread);

      ul.appendChild(li);
    });

  document.getElementById('archive-btn').disabled = !currentConvId || viewMode === 'archived';
}

/* ============================
   Selección y mensajes
============================ */
function selectConversation(id, name) {
  currentConvId = id;
  document.getElementById('chat-header').textContent = 'Chat con ' + name;

  // Al abrir el chat, lo marco como visto (badge = 0)
  const conv = conversations.find(c => c._id === id);
  if (conv) conv._seenAt = conv.messages.length;

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

  // Mientras está abierto, mantenlo visto
  conv._seenAt = conv.messages.length;

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

/**
 * Carga inicial: marco todas como vistas para no llenar de badges antiguos.
 * Guardo _seenAt por id; si vuelves a pedir la lista, conservo _seenAt existente.
 */
socket.on('conversation_list', list => {
  const mapPrev = new Map(conversations.map(c => [c._id, c]));
  conversations = list.map(c => {
    const prev = mapPrev.get(c._id);
    return {
      ...c,
      _lastCount: c.messages.length,
      _seenAt: prev
        ? (prev._seenAt ?? prev.messages.length) // conservar estado local
        : (bootstrapped ? 0 : c.messages.length)  // si ya arrancó la app: nuevo -> badge; si es primera carga: sin badges
    };
  });

  if (!bootstrapped) bootstrapped = true;

  if (viewMode === 'active' && conversations.length && !currentConvId) {
    currentConvId = conversations.find(c => !c.archived)?._id || null;
  }
  renderConversations();
  renderMessages();
});

/**
 * Llega un update:
 * - Si existe, conservo _seenAt (no marcar visto automáticamente).
 * - Si NO existe (nueva conversación), y ya está bootstrapped, pongo _seenAt = 0 ⇒ badge desde el primer mensaje.
 * - Si la conversación es la abierta, la marco vista al final (por si el update fue propio).
 */
socket.on('conversation_update', updated => {
  const idx = conversations.findIndex(c => c._id === updated._id);
  if (idx >= 0) {
    const prev = conversations[idx];
    conversations[idx] = {
      ...updated,
      _lastCount: prev._lastCount,
      _seenAt: prev._seenAt ?? 0
    };
  } else {
    conversations.unshift({
      ...updated,
      _lastCount: (updated.messages?.length || 0),
      _seenAt: bootstrapped ? 0 : (updated.messages?.length || 0) // nueva: badge si ya estamos operando
    });
  }

  // Si es la conversación abierta, mantenerla vista
  const open = conversations.find(c => c._id === currentConvId);
  if (open) open._seenAt = open.messages.length;

  renderConversations();
  renderMessages();
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
  renderMessages(); // esto mantendrá la abierta como vista
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
