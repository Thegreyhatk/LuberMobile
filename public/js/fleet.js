const fetchOpts = { credentials: 'same-origin' };
let prevCount = 0, chatOpen = false;
let fleetInfo = {}, schedules = [];

function linkify(text) {
  return text.replace(/(https?:\/\/[^\s]+)/g,
    url => `<a href="${url}" target="_blank">${url}</a>`);
}

async function loadProfile() {
  const res = await fetch('/api/customer-profile', fetchOpts);
  if (!res.ok) return;
  const d = await res.json();
  if (d.accountType !== 'Fleet') {
    window.location.href = '/customer.html';
    return;
  }
  fleetInfo = { id: d._id, name: d.fullName, email: d.email, address: d.address };

  document.getElementById('fullName').textContent    = d.fullName;
  document.getElementById('contactName').textContent = d.fullName;
  document.getElementById('accountType').textContent = d.accountType;
  document.getElementById('phone').textContent       = d.phone;
  document.getElementById('email').textContent       = d.email;
  document.getElementById('address').textContent     = d.address;
  document.getElementById('profilePic').src          = d.profilePictureUrl || '/images/default-fleet.png';

  const schRes = await fetch(`/api/schedule?userId=${d._id}`, fetchOpts);
  schedules = schRes.ok ? await schRes.json() : [];

  const denied = schedules.find(s => s.reason && s.reason.trim() && s.reason !== 'awaiting Reason');
  const reasonEl = document.getElementById('deniedReason');
  if (denied) {
    reasonEl.innerHTML = `❌ Tu servicio fue rechazado por la siguiente razón:<br><em>${denied.reason}</em>`;
  } else {
    reasonEl.innerHTML = '';
  }

  renderFleet(d.vehicles);
  renderCancellations(d.cancellations || []);
  updateTimestamp();
  setupScheduleButton();
}

function renderFleet(vehicles) {
  const grid = document.getElementById('vehiclesContainer');
  grid.innerHTML = '';
  vehicles.forEach(v => {
    // Filtrar citas que incluyan este vehículo
    const related = schedules.filter(s =>
      s.vehicles.some(item => String(item.vehicleId) === String(v._id))
    );
    // Seleccionar cita más cercana
    const appt = related.sort((a,b) => {
      const [timeA, suffixA] = a.time.split(' ');
      const [hA, mA] = timeA.split(':').map(Number);
      let hourA = (suffixA === 'PM' && hA < 12) ? hA + 12
                 : (suffixA === 'AM' && hA === 12 ? 0 : hA);
      const dateA = new Date(a.date);
      dateA.setHours(hourA, mA, 0, 0);

      const [timeB, suffixB] = b.time.split(' ');
      const [hB, mB] = timeB.split(':').map(Number);
      let hourB = (suffixB === 'PM' && hB < 12) ? hB + 12
                 : (suffixB === 'AM' && hB === 12 ? 0 : hB);
      const dateB = new Date(b.date);
      dateB.setHours(hB, mB, 0, 0);

      return dateA - dateB;
    })[0];

    const dateText = appt
      ? `${new Date(appt.date).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'})} a las ${appt.time}`
      : 'Sin cita';

    const deniedIcon = appt?.reason && appt.reason.trim() && appt.reason !== 'awaiting Reason'
      ? '<span class="denied-icon"></span>' : '';

    const icons = appt
      ? `${appt.processed ? '<span class="processed-icon"></span>' : ''}
         ${appt.confirmed ? '<span class="approved-icon"></span>' : ''}
         ${deniedIcon}`
      : '';

    const note = `<div class="vehicle-note">
                    ${icons}
                    Próxima cita: ${dateText}
                  </div>`;

    // 🔢 Crear dígitos del odómetro
    const milageDigits = String(v.milage ?? 0).padStart(6, '0')
      .split('')
      .map(d => `<span class="digit">${d}</span>`)
      .join('');

    const card = document.createElement('div');
    card.className = 'vehicle';
    card.innerHTML = `
    ${v.vehicleImageUrl
      ? `<img src="${v.vehicleImageUrl}" alt="Vehículo"/>`
      : `<div style="height:140px;background:#ddd;"></div>`}
    <div class="vehicle-details">
      <div><strong>Marca:</strong> ${v.brand}</div>
      <div><strong>Año:</strong> ${v.year}</div>
      <div><strong>Modelo:</strong> ${v.model}</div>
      <div><strong>Motor:</strong> ${v.engine}</div>
      <div><strong>Color:</strong> ${v.color}</div>
      <div><strong>Placa:</strong> ${v.plateLast3}</div>
      ${v.vinImageUrl
        ? `<img src="${v.vinImageUrl}" alt="VIN" style="margin:8px 0;border-radius:4px;"/>`
        : ''}
      <div><strong>VIN:</strong> ${v.vin || '—'}</div>
      <div class="milage-display">
        <strong>Kilometraje:</strong>
        <div class="odometer">
          ${milageDigits}<span class="km">km</span>
          <button class="edit-km-btn" title="Editar kilometraje" onclick="editMilage('${v._id}')">⚙️</button>
        </div>
      </div>
    </div>
    <div class="vehicle-interval">Intervalo: ${v.interval} km/días</div>
    ${note}
  `;
  

    if (appt) {
      const apptDateObj = new Date(appt.date + 'T00:00:00');
      const todayObj = new Date();
      todayObj.setHours(0, 0, 0, 0);
      const diffMs = apptDateObj - todayObj;
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays >= 1) {
        const btn = document.createElement('button');
        btn.className = 'cancel-btn';
        btn.textContent = 'Cancelar Cita';
        btn.dataset.id = appt._id;
        btn.onclick = handleCancel;
        card.appendChild(btn);
      }
    }

    grid.appendChild(card);
  });
}


function renderCancellations(cancellations) {
  const container = document.getElementById('cancellationsContainer');
  const noMsg = document.getElementById('noCancellationsMsg');
  container.innerHTML = '';

  const showArchived = document.getElementById('showArchivedCheckbox').checked;
  // Filtrar según archived
  const filtered = cancellations.filter(c => showArchived ? c.archived : !c.archived);

  if (!filtered || filtered.length === 0) {
    noMsg.style.display = 'block';
    return;
  }
  noMsg.style.display = 'none';

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  filtered.forEach(entry => {
    const card = document.createElement('div');
    card.className = 'cancellation-card';

    const info = document.createElement('div');
    info.className = 'cancellation-info';

    const fechaTexto = new Date(entry.date).toLocaleDateString('es-ES', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    });
    info.innerHTML = `
      <div><strong>Fecha de cancelación:</strong> ${fechaTexto}</div>
      <div><strong>Servicio:</strong> ${entry.serviceName}</div>
      <div><strong>Vehículo:</strong> ${entry.vehicleInfo.brand} ${entry.vehicleInfo.model} (${entry.vehicleInfo.plateLast3})</div>
    `;

    const toggleDiv = document.createElement('div');
    toggleDiv.className = 'archive-toggle';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = entry.archived;
    checkbox.dataset.date = entry.date;
    checkbox.onclick = () => handleArchiveToggle(entry.date);
    const label = document.createElement('label');
    label.textContent = 'Archivada';
    toggleDiv.appendChild(checkbox);
    toggleDiv.appendChild(label);

    card.appendChild(info);
    card.appendChild(toggleDiv);
    container.appendChild(card);
  });
}

async function handleCancel(e) {
  const scheduleId = e.currentTarget.dataset.id;
  if (!scheduleId) return;
  const confirmar = confirm('¿Seguro que deseas cancelar esta cita? Debes hacerlo al menos con un día de anticipación.');
  if (!confirmar) return;
  try {
    const res = await fetch(`/api/schedule/${scheduleId}`, {
      method: 'DELETE',
      ...fetchOpts
    });
    if (!res.ok) {
      const errText = await res.text();
      alert('Error al cancelar: ' + errText);
      return;
    }
    await loadProfile();
  } catch (err) {
    console.error('Error cancelando cita:', err);
    alert('Ocurrió un error cancelando la cita.');
  }
}


function editMilage(vehicleId) {
  const nuevo = prompt('Introduce el nuevo kilometraje:');
  const km = parseInt(nuevo);
  if (isNaN(km) || km < 0) {
    alert('Por favor introduce un número válido');
    return;
  }

  fetch(`/api/vehicles/${vehicleId}/milage`, {
    method: 'PUT',
    ...fetchOpts,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ milage: km })
  })
  .then(res => {
    if (!res.ok) throw new Error('Error actualizando');
    return res.json();
  })
  .then(() => {
    alert('Kilometraje actualizado correctamente');
    loadProfile();
  })
  .catch(err => {
    console.error('Error actualizando kilometraje:', err);
    alert('No se pudo actualizar el kilometraje');
  });
}


async function handleArchiveToggle(dateStr) {
  try {
    const res = await fetch(`/api/customer-cancellation-archive`, {
      method: 'PUT',
      ...fetchOpts,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: dateStr })
    });
    if (!res.ok) {
      const errText = await res.text();
      alert('Error al actualizar archivado: ' + errText);
      return;
    }
    await loadProfile();
  } catch (err) {
    console.error('Error archivando/unarchivando:', err);
    alert('Ocurrió un error al actualizar archivado.');
  }
}

function updateTimestamp() {
  const now = new Date();
  document.getElementById('lastUpdated').textContent =
    `Última actualización: ${now.toLocaleTimeString()}`;
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
  const msgs = await res.json();
  const body = document.getElementById('chat-body');
  body.innerHTML = '';
  msgs.forEach(m => {
    const d = document.createElement('div');
    d.className = 'msg ' + m.sender;
    if (m.text) d.innerHTML = linkify(m.text);
    if (m.imageUrl) {
      const img = document.createElement('img');
      img.src = m.imageUrl;
      img.className = 'chat-thumb';
      img.onclick = () => openModal(img.src);
      d.appendChild(img);
    }
    body.appendChild(d);
  });
  body.scrollTop = body.scrollHeight;
  if (msgs.length > prevCount && !chatOpen) {
    document.getElementById('chat-widget').classList.add('unread');
  }
  prevCount = msgs.length;
}

document.getElementById('showArchivedCheckbox').addEventListener('change', () => {
  fetch('/api/customer-profile', fetchOpts)
    .then(res => res.json())
    .then(data => renderCancellations(data.cancellations || []))
    .catch(() => {});
});

function toggleChat() {
  chatOpen = !chatOpen;
  document.getElementById('chat-widget').classList.toggle('open', chatOpen);
  if (chatOpen) {
    document.getElementById('chat-widget').classList.remove('unread');
  }
}

document.getElementById('chat-header').onclick = toggleChat;
document.getElementById('chat-close').onclick = (e) => {
  e.stopPropagation();
  toggleChat();
};

document.getElementById('chat-form').onsubmit = async e => {
  e.preventDefault();
  const text = document.getElementById('chat-input').value.trim();
  if (!text) return;
  await fetch('/api/chat/send', {
    ...fetchOpts,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  document.getElementById('chat-input').value = '';
  loadChat();
};

document.getElementById('img-modal-close').onclick = () =>
  document.getElementById('img-modal').style.display = 'none';

function openModal(src) {
  document.getElementById('img-modal-full').src = src;
  document.getElementById('img-modal').style.display = 'flex';
}

window.addEventListener('DOMContentLoaded', () => {
  loadProfile();
  loadChat();
  setInterval(loadProfile, 15000);
  setInterval(loadChat, 5000);
});