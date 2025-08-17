// js/fleet.js

// Configuración global de fetch
const fetchOpts = { credentials: 'same-origin' };
let prevCount = 0, chatOpen = false;
let fleetInfo = {}, schedules = [];

// Inicializar Socket.io
const socket = io('http://localhost:3001', { transports: ['websocket'] });
socket.on('connect', () => {
  console.log('🔌 Conectado a Socket.io en Fleet');
});
socket.on('conversation_update', conv => {
  loadChat();
  if (!chatOpen) {
    document.getElementById('chat-widget').classList.add('unread');
  }
});

// Convierte URLs en links clicables
function linkify(text) {
  return text.replace(/(https?:\/\/[^\s]+)/g,
    url => `<a href="${url}" target="_blank">${url}</a>`);
}

// Carga perfil, flota, citas, cancelaciones y cambios de aceite
async function loadProfile() {
  const res = await fetch('/api/customer-profile', fetchOpts);
  if (!res.ok) return;
  const d = await res.json();
  if (d.accountType !== 'Fleet') {
    window.location.href = '/customer.html';
    return;
  }
  fleetInfo = {
    id:       d._id,
    name:     d.fullName,
    email:    d.email,
    address:  d.address,
    vehicles: d.vehicles
  };

  // Header data
  document.getElementById('fullName').textContent    = d.fullName;
  document.getElementById('contactName').textContent = d.fullName;
  document.getElementById('accountType').textContent = d.accountType;
  document.getElementById('phone').textContent       = d.phone;
  document.getElementById('email').textContent       = d.email;
  document.getElementById('address').textContent     = d.address;
  document.getElementById('profilePic').src          = d.profilePictureUrl || '/images/default-fleet.png';

  // Appointments
  const schRes = await fetch(`/api/schedule?userId=${d._id}`, fetchOpts);
  schedules = schRes.ok ? await schRes.json() : [];

  // Show denial reason if exists
  const denied = schedules.find(s =>
    s.reason && s.reason.trim() && s.reason.toLowerCase() !== 'awaiting reason'
  );
  document.getElementById('deniedReason').innerHTML = denied
    ? `❌ Your service was denied for:<br><em>${denied.reason}</em>`
    : '';

  // Render sections
  renderFleet(d.vehicles);
  renderCancellations(d.cancellations || []);
  renderOilChanges(d.oilChanges || []);

  updateTimestamp();
  setupScheduleButton();
}


// Dibuja tarjetas de vehículos con próximas citas
function renderFleet(vehicles) {
  const grid = document.getElementById('vehiclesContainer');
  grid.innerHTML = '';
  vehicles.forEach(v => {
    const related = schedules.filter(s =>
      s.vehicles.some(it => String(it.vehicleId) === String(v._id))
    );
    const appt = related.sort((a, b) => {
      const toTs = s => {
        const [time, suf] = s.time.split(' ');
        let [h, m] = time.split(':').map(Number);
        if (suf === 'PM' && h < 12) h += 12;
        if (suf === 'AM' && h === 12) h = 0;
        const d = new Date(s.date);
        d.setHours(h, m, 0, 0);
        return d.getTime();
      };
      return toTs(a) - toTs(b);
    })[0];

    const dateText = appt
      ? `${new Date(appt.date).toLocaleDateString('en-US')} at ${appt.time}`
      : 'No appointment';

    const icons = appt
      ? `${appt.processed ? '<span class="processed-icon"></span>' : ''}
         ${appt.confirmed ? '<span class="approved-icon"></span>' : ''}
         ${appt.reason && appt.reason.trim() && appt.reason.toLowerCase() !== 'awaiting reason'
            ? '<span class="denied-icon"></span>' : ''}`
      : '';

    const milageDigits = String(v.milage || 0).padStart(6, '0')
      .split('').map(d => `<span class="digit">${d}</span>`).join('');

    const note = `<div class="vehicle-note">
                    ${icons}
                    Next appointment: ${dateText}
                  </div>`;

    const card = document.createElement('div');
    card.className = 'vehicle';
    card.innerHTML = `
      ${v.vehicleImageUrl
        ? `<img src="${v.vehicleImageUrl}" alt="Vehicle"/>`
        : `<div style="height:140px;background:#ddd;"></div>`}
      <div class="vehicle-details">
        <div><strong>Brand:</strong> ${v.brand}</div>
        <div><strong>Year:</strong> ${v.year}</div>
        <div><strong>Model:</strong> ${v.model}</div>
        <div><strong>Engine:</strong> ${v.engine}</div>
        <div><strong>Color:</strong> ${v.color}</div>
        <div><strong>Plate:</strong> ${v.plateLast3}</div>
        ${v.vinImageUrl
          ? `<img src="${v.vinImageUrl}" alt="VIN" style="margin:8px 0;border-radius:4px;"/>`
          : ''}
        <div><strong>VIN:</strong> ${v.vin || '—'}</div>
        <div class="milage-display">
          <strong>Milage:</strong>
          <div class="odometer">
            ${milageDigits}<span class="km">km</span>
            <button class="edit-km-btn" onclick="editMilage('${v._id}')">⚙️</button>
          </div>
        </div>
      </div>
      <div class="vehicle-interval">Interval: ${v.interval} km/days</div>
      ${note}
    `;

    if (appt) {
      const apptDate = new Date(appt.date + 'T00:00:00');
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if ((apptDate - today) / (1000 * 60 * 60 * 24) >= 1) {
        const btn = document.createElement('button');
        btn.className = 'cancel-btn';
        btn.textContent = 'Cancel Appointment';
        btn.dataset.id = appt._id;
        btn.onclick = handleCancel;
        card.appendChild(btn);
      }
    }

    grid.appendChild(card);
  });
}

// Dibuja sección de cancelaciones
function renderCancellations(cancellations) {
  const cont = document.getElementById('cancellationsContainer');
  const noMsg = document.getElementById('noCancellationsMsg');
  cont.innerHTML = '';
  const showA = document.getElementById('showArchivedCheckbox').checked;
  const list = cancellations.filter(c => showA ? c.archived : !c.archived);

  if (list.length === 0) {
    noMsg.style.display = 'block';
    return;
  }
  noMsg.style.display = 'none';

  list.sort((a, b) => new Date(b.date) - new Date(a.date))
      .forEach(e => {
    const card = document.createElement('div');
    card.className = 'cancellation-card';
    const dateStr = new Date(e.date).toLocaleDateString('en-US');
    card.innerHTML = `
      <div class="cancellation-info">
        <div><strong>Date:</strong> ${dateStr}</div>
        <div><strong>Service:</strong> ${e.serviceName}</div>
        <div><strong>Vehicle:</strong> ${e.vehicleInfo.brand} ${e.vehicleInfo.model} (${e.vehicleInfo.plateLast3})</div>
      </div>
    `;
    const tog = document.createElement('div');
    tog.className = 'archive-toggle';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = e.archived;
    cb.onclick = () => handleArchiveToggle(e.date);
    tog.append(cb, Object.assign(document.createElement('label'), { textContent: 'Archived' }));
    card.appendChild(tog);
    cont.appendChild(card);
  });
}

// Nuevo: renderizado de oilChanges
function renderOilChanges(oilChanges) {
  const dd = document.getElementById('oilChangesDropdown');
  const details = document.getElementById('oilChangeDetails');
  dd.innerHTML = '<option value="">— Select an oil change receipt —</option>';
  oilChanges.forEach(oc => {
    const opt = document.createElement('option');
    const sid = oc.scheduleId.$oid || oc.scheduleId;
    opt.value = sid;
    const date = new Date(oc.completedAt?.$date || oc.date);
    const dateStr = date.toLocaleDateString('en-US');
    opt.textContent = `${dateStr} — ${oc.vehicle.vehicleInfo.brand} ${oc.vehicle.vehicleInfo.model} (${oc.vehicle.vehicleInfo.plateLast3})`;
    dd.appendChild(opt);
  });
  dd.onchange = () => showOilChangeDetails(dd.value, oilChanges);
  details.textContent = '';
}


// Nuevo: muestra detalles del cambio seleccionado
function showOilChangeDetails(id, oilChanges) {
  const oc = oilChanges.find(o => {
    const sid = o.scheduleId.$oid || o.scheduleId;
    return sid === id;
  });
  const cont = document.getElementById('oilChangeDetails');
  if (!oc) {
    cont.textContent = '';
    return;
  }
  const date = new Date(oc.completedAt?.$date || oc.date)
                  .toLocaleString('en-US');
  cont.innerHTML = `
    <div><strong>Full Date:</strong> ${date}</div>
    <div><strong>Oil Type:</strong> ${oc.vehicle.oilType}</div>
    <div><strong>Service Milage:</strong> ${oc.serviceMilage}</div>
    <div><strong>Completed By:</strong> ${oc.completedBy}</div>
  `;
}

async function handleCancel(ev) {
  const id = ev.currentTarget.dataset.id;
  if (!confirm('Cancel appointment (at least 24h in advance)?')) return;
  const res = await fetch(`/api/schedule/${id}`, { method: 'DELETE', ...fetchOpts });
  if (!res.ok) return alert('Error: ' + await res.text());
  await loadProfile();
}

function editMilage(vehicleId) {
  const input = prompt('Enter the new mileage:');
  const km = parseInt(input);
  if (isNaN(km) || km < 0) {
    alert('Please enter a valid number');
    return;
  }

  fetch(`/api/vehicles/${vehicleId}/milage`, {
    method: 'PUT',
    ...fetchOpts,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ milage: km })
  })
    .then(res => {
      if (!res.ok) throw new Error('Error updating');
      return res.json();
    })
    .then(() => {
      alert('Mileage updated successfully');
      loadProfile();
    })
    .catch(err => {
      console.error('Error updating mileage:', err);
      alert('Could not update mileage');
    });
}


async function handleArchiveToggle(dateStr) {
  const res = await fetch('/api/customer-cancellation-archive', {
    method: 'PUT', ...fetchOpts,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: dateStr })
  });
  if (!res.ok) return alert('Error: ' + await res.text());
  await loadProfile();
}

function updateTimestamp() {
  document.getElementById('lastUpdated').textContent =
    'Last updated: ' + new Date().toLocaleTimeString();
}

function setupScheduleButton() {
  document.getElementById('schedule-btn').onclick = () => {
    const qs = new URLSearchParams({
      clientId: fleetInfo.id,
      name:     fleetInfo.name,
      email:    fleetInfo.email,
      address:  fleetInfo.address
    }).toString();
    window.location.href = `/schedule.html?${qs}`;
  };
}

async function loadChat() {
  const res = await fetch('/api/chat/history', fetchOpts);
  if (!res.ok) return;
  const msgs = await res.json(), body = document.getElementById('chat-body');
  body.innerHTML = '';
  msgs.forEach(m => {
    const d = document.createElement('div');
    d.className = 'msg ' + m.sender;
    if (m.text) d.innerHTML = linkify(m.text);
    if (m.imageUrl) {
      const img = document.createElement('img');
      img.src = m.imageUrl;
      img.onclick = () => openModal(m.imageUrl);
      d.appendChild(img);
    }
    body.appendChild(d);
  });
  if (msgs.length > prevCount && !chatOpen)
    document.getElementById('chat-widget').classList.add('unread');
  prevCount = msgs.length;
}

document.getElementById('showArchivedCheckbox').onchange = loadProfile;
document.getElementById('chat-header').onclick = () => {
  chatOpen = !chatOpen;
  document.getElementById('chat-widget').classList.toggle('open', chatOpen);
  if (chatOpen) document.getElementById('chat-widget').classList.remove('unread');
};
document.getElementById('chat-close').onclick = e => {
  e.stopPropagation();
  chatOpen = false;
  document.getElementById('chat-widget').classList.remove('open');
};
document.getElementById('chat-form').onsubmit = async e => {
  e.preventDefault();
  const txt = document.getElementById('chat-input').value.trim();
  if (!txt) return;
  await fetch('/api/chat/send', {
    ...fetchOpts, method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: txt })
  });
  document.getElementById('chat-input').value = '';
  loadChat();
};
document.getElementById('img-modal-close').onclick = () =>
  document.getElementById('img-modal').style.display = 'none';
function openModal(src) {
  const m = document.getElementById('img-modal');
  document.getElementById('img-modal-full').src = src;
  m.style.display = 'flex';
}

window.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  loadChat();
  setInterval(loadProfile, 15000);
  setInterval(loadChat, 5000);
});
