const chatBox     = document.getElementById('chat-box');
const chatForm    = document.getElementById('chat-form');
const input       = document.getElementById('chat-input');
const replyList   = document.getElementById('reply-list');
const qDisplay    = document.getElementById('q-display');

let replies = [];

async function loadReplies() {
  const res = await fetch('/api/bot/replies');
  replies = await res.json();
  renderReplyList();
}

function renderReplyList() {
  replyList.innerHTML = '';
  replies.forEach(r => {
    const li = document.createElement('li');
    li.textContent = `"${r.question}" → "${r.answer}" (${r.type})`;
    replyList.appendChild(li);
  });
}

function renderMsg(text, who) {
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  div.textContent = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

chatForm.onsubmit = async e => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  renderMsg(text, 'customer');
  input.value = '';

  await fetch('/api/chat/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({ text })
  });

  let match = replies.find(r => {
    const regex = expandRegex(r.question);
    return r.type === 'exact'
      ? regex.test(`^${text}$`)
      : regex.test(text);
  });

  const reply = match?.answer || '🤖 Gracias por tu mensaje. Un asesor te atenderá pronto.';

  setTimeout(async () => {
    const fd = new FormData();
    fd.append('convId', window.currentConvId);
    fd.append('text', reply);
    await fetch('/api/chat/reply', {
      method: 'POST',
      credentials: 'same-origin',
      body: fd
    });
    renderMsg(reply, 'office');
  }, 500);
};

document.getElementById('reply-form').onsubmit = async e => {
  e.preventDefault();
  const q    = qDisplay.innerText.trim();
  const a    = document.getElementById('a-input').value.trim();
  const type = document.getElementById('type-select').value;
  if (!q || !a) return alert('Todos los campos son requeridos.');

  const res = await fetch('/api/bot/replies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: q, answer: a, type })
  });

  const r = await res.json();
  if (r.success) {
    await loadReplies();
    qDisplay.innerHTML = '';
    document.getElementById('a-input').value = '';
    document.getElementById('type-select').value = 'partial';
  }
};

document.getElementById('legend-btn').onclick = () => {
  const box = document.getElementById('legend-box');
  box.style.display = box.style.display === 'block' ? 'none' : 'block';
};

function expandRegex(phrase) {
  return new RegExp(
    phrase.replace(/{{([^}]+)}}/g, (_, opts) => `(${opts.split('|').join('|')})`),
    'i'
  );
}

async function loadChat() {
  const res  = await fetch('/api/chat/history', { credentials: 'same-origin' });
  const data = await res.json();
  data.forEach(m => renderMsg(m.text, m.sender));
}

window.addEventListener('DOMContentLoaded', () => {
  loadReplies();
  loadChat();
});
