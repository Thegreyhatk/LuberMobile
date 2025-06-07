// appointment.js

window.addEventListener('DOMContentLoaded', async () => {
  const API_BASE  = 'http://localhost:3006';
  const fetchOpts = { credentials: 'same-origin' };

  // Utilitario: sumar días hábiles
  function addBusinessDays(startDate, days) {
    const result = new Date(startDate);
    let added = 0;
    while (added < days) {
      result.setDate(result.getDate() + 1);
      const d = result.getDay();
      if (d !== 0 && d !== 6) added++;
    }
    return result;
  }

  // Preseleccionar 3 días hábiles
  const dateInput = document.getElementById('appt-date');
  const nextBiz   = addBusinessDays(new Date(), 3);
  const isoNext   = nextBiz.toISOString().slice(0, 10);
  dateInput.min   = isoNext;
  dateInput.value = isoNext;

  // 1) Obtener perfil de cliente
  const perfilRes = await fetch(`${API_BASE}/api/customer-profile`, fetchOpts);
  if (!perfilRes.ok) {
    return window.location.href = '/login_registration.html';
  }
  const perfil = await perfilRes.json();

  // 2) Rellenar datos ocultos del formulario
  document.getElementById('client-id').value      = perfil._id;
  document.getElementById('client-name').value    = perfil.fullName;
  document.getElementById('client-email').value   = perfil.email;
  document.getElementById('client-address').value = perfil.address;

  // 3) Mostrar tarjetas de vehículos
  const vg = document.getElementById('vehicles-grid');
  vg.innerHTML = '';
  perfil.vehicles.forEach((v, i) => {
    const card = document.createElement('div');
    card.className   = 'vehicle-card';
    card.dataset.idx = i;
    card.innerHTML   = `
      <img src="${v.vehicleImageUrl || '/images/default-vehicle.png'}" alt="Vehículo"/>
      <div class="info">${v.brand} ${v.model} (${v.year})</div>
    `;
    card.addEventListener('click', () => {
      card.classList.toggle('selected');
    });
    vg.appendChild(card);
  });

  // 4) “Cómo funciona” toggle
  document.getElementById('how-it-works-btn').onclick = () =>
    document.getElementById('how-it-works-content')
      .classList.toggle('hidden');

  // 5) Envío del formulario de cita
  document.getElementById('appointment-form').onsubmit = async e => {
    e.preventDefault();

    // Índices de vehículos seleccionados
    const selected = Array.from(
      document.querySelectorAll('.vehicle-card.selected')
    ).map(c => Number(c.dataset.idx));
    if (!selected.length) {
      return alert('Selecciona al menos un vehículo.');
    }

    const date   = dateInput.value;
    const time   = document.getElementById('appt-time').value;
    const notes  = document.getElementById('notes').value;

    if (!date) return alert('Selecciona una fecha.');
    if (!time) return alert('Selecciona una hora.');

    // Revalidar mínimo de 3 días hábiles
    const minSend = addBusinessDays(new Date(), 3)
      .toISOString().slice(0, 10);
    if (date < minSend) {
      return alert(`La fecha debe ser al menos ${minSend}`);
    }

    const payload = {
      vehicleIndices: selected,
      date,
      time,
      notes,
      accepted: false
    };

    try {
      const resp = await fetch(`${API_BASE}/api/appointments`, {
        ...fetchOpts,
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload)
      });
      const json = await resp.json();
      if (!resp.ok) throw new Error(json.error || resp.statusText);

      alert('¡Cita agendada correctamente! 🚗🔧');
      window.location.href = '/customer.html';
    } catch (err) {
      alert('Error al agendar cita: ' + err.message);
    }
  };
});
