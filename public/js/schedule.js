const fetchOpts = { credentials: 'include' };
let fleetInfo = { address: '' };
let accountType = 'Customer';
let __VEHICLES__ = [];
let __SCHEDULES__ = [];

/** Muestra un mensaje en pantalla */
const showMsg = (text, cls) => {
  const m = document.getElementById('msg');
  m.textContent = text;
  m.className = 'alert ' + cls;
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    const prof = await fetch('/api/customer-profile', fetchOpts);
    if (!prof.ok) throw 'No autorizado';
    const d = await prof.json();
    fleetInfo.address = d.address;
    accountType = d.accountType;

    document.querySelector('nav a').href =
      accountType === 'Fleet' ? 'fleet.html' : 'customer.html';

    const [vehRes, svcRes, schRes] = await Promise.all([
      fetch('/api/vehicles', fetchOpts),
      fetch('/api/services', fetchOpts),
      fetch(`/api/schedule?userId=${d._id}`, fetchOpts)
    ]);
    if (!vehRes.ok || !svcRes.ok) throw 'Error al cargar datos';

    __VEHICLES__ = await vehRes.json();
    const services = await svcRes.json();
    __SCHEDULES__ = schRes.ok ? await schRes.json() : [];

    renderTable(__VEHICLES__, services, __SCHEDULES__);
    configureSubmitButton();

  } catch (e) {
    showMsg(e, 'error');
  }

  document.getElementById('my-location-btn').addEventListener('click', () => {
    if (!navigator.geolocation) {
      return showMsg('Tu navegador no soporta Geolocalización', 'error');
    }
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coord = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
        document.querySelectorAll('input[name^="addr_"]').forEach(i => i.value = coord);
        showMsg('Ubicación copiada a todos', 'success');
      },
      err => showMsg('Error geolocalización: ' + err.message, 'error')
    );
  });
});

function idOf(item) {
  return item._id?.$oid || item._id || '';
}

function generateSlots() {
  const slots = [];
  for (let h = 9; h <= 21; h++) {
    for (let m of [0, 15, 30, 45]) {
      if (h === 21 && m > 0) continue;
      let hr12 = (h % 12) || 12;
      const suf = h < 12 ? 'AM' : 'PM';
      slots.push(`${String(hr12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suf}`);
    }
  }
  return slots;
}

function minDate() {
  const d = new Date();
  while (d.getDay() !== 3 && d.getDay() !== 6) {
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}


function recalcTotal() {
  let sum = 0;
  document.querySelectorAll('#vehicles-tbody tr')
    .forEach(tr => {
      // Ignorar los que ya están agendados (inputs deshabilitados)
      const disabled = tr.querySelector('input[disabled]');
      if (!disabled) {
        const priceEl = tr.querySelector('.price-cell span');
        if (priceEl) sum += parseFloat(priceEl.textContent) || 0;
      }
    });

  document.getElementById('total-price').textContent = sum.toFixed(2);
}


function renderTable(vehicles, services, schedules) {
  const tbody = document.getElementById('vehicles-tbody');
  tbody.innerHTML = '';

  const svcHtml = services.map(s => `<option value="${idOf(s)}">${s.name}</option>`).join('');
  const oilHtml = `
    <option value="">-- Oil type --</option>
    <option>Blend</option>
    <option>Full Synthetic</option>
  `;

  vehicles.forEach(v => {
    const vid = idOf(v);
    const existing = schedules.find(s => s.vehicles.some(vv => String(vv.vehicleId) === vid));
    const hasSchedule = Boolean(existing);
    const ve = existing?.vehicles?.find(vv => String(vv.vehicleId) === vid);
    const serviceName = ve ? services.find(s => idOf(s) === String(ve.serviceId))?.name : '';

    const statusHtml = hasSchedule
      ? `<div class="veh-status">✅ Schedule confirmado</div>` : '';

    const imageHtml = v.vehicleImageUrl
      ? `<img src="${v.vehicleImageUrl}" class="veh-thumb" data-full="${v.vehicleImageUrl}"/>`
      : `<div style="width:60px;height:60px;background:#ccc;border-radius:4px;"></div>`;

    const thumb = `<div class="veh-wrapper">${statusHtml}${imageHtml}</div>`;
    const tr = document.createElement('tr');
    tr.dataset.vid = vid;
    if (hasSchedule) tr.style.backgroundColor = 'rgba(0, 200, 0, 0.1)';

    tr.innerHTML = hasSchedule ? `
      <td>${thumb}</td>
      <td><input type="date" value="${existing.date}" disabled/></td>
      <td><select disabled><option>${existing.time}</option></select></td>
      <td><select disabled><option>${serviceName}</option></select></td>
      <td><select disabled><option>${ve.oilType}</option></select></td>
      <td class="price-cell">$<span>${ve.price.toFixed(2)}</span></td>
      <td style="font-size: 0.75rem; line-height: 1.2; padding: 4px;">
        <label style="display: inline-flex; align-items: center; gap: 4px; margin-right: 8px;">
          <input type="checkbox" disabled ${ve.airFilter ? 'checked' : ''} style="transform: scale(0.9);"/> Engine ($25)
        </label>
        <label style="display: inline-flex; align-items: center; gap: 4px;">
          <input type="checkbox" disabled ${ve.cabinFilter ? 'checked' : ''} style="transform: scale(0.9);"/> Cabin ($20)
        </label>
      </td>
      <td><input type="text" value="${ve.serviceAddress || fleetInfo.address}" disabled style="width:200px;"/></td>
    ` : `
      <td>${thumb}</td>
      <td><input type="date" name="date_${vid}" min="${minDate()}"/></td>
      <td><select name="time_${vid}" disabled><option>Select date</option></select></td>
      <td><select name="service_${vid}" style="min-width:140px;">
            <option value="">-- Service --</option>${svcHtml}
          </select></td>
      <td><select name="oil_${vid}">${oilHtml}</select></td>
      <td class="price-cell">$<span>0.00</span></td>
      <td>
        <label><input type="checkbox" name="air_${vid}"/> Engine ($25)</label><br/>
        <label><input type="checkbox" name="cabin_${vid}"/> Cabin ($20)</label>
      </td>
      <td><input type="text" name="addr_${vid}" placeholder="Address" style="width:200px;"/></td>
    `;

    tbody.appendChild(tr);

    if (!hasSchedule) {
      const dateIn = tr.querySelector(`[name="date_${vid}"]`);
      const timeSel = tr.querySelector(`[name="time_${vid}"]`);
      const svcSel = tr.querySelector(`[name="service_${vid}"]`);
      const oilSel = tr.querySelector(`[name="oil_${vid}"]`);
      const airCb = tr.querySelector(`[name="air_${vid}"]`);
      const cabCb = tr.querySelector(`[name="cabin_${vid}"]`);
      const priceSp = tr.querySelector('.price-cell span');

      dateIn.addEventListener('change', () => {
        const [year, month, day] = dateIn.value.split('-').map(Number);
        const selected = new Date(Date.UTC(year, month - 1, day));
        const dayOfWeek = selected.getUTCDay(); // ✅ usa getUTCDay

        if (dayOfWeek !== 3 && dayOfWeek !== 6) {
          alert('Solo puedes agendar en miércoles o sábado.\nYou can only schedule on Wednesday or Saturday.');
          dateIn.value = '';
          timeSel.disabled = true;
          timeSel.innerHTML = '<option>Select date</option>';
          return;
        }        

        let s = generateSlots();
        const today = new Date().toISOString().slice(0, 10);
        if (dateIn.value === today) {
          const now = new Date();
          s = s.filter(opt => {
            let [t, ampm] = opt.split(' ');
            let [h, m] = t.split(':').map(Number);
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            return h > now.getHours() || (h === now.getHours() && m > now.getMinutes());
          });
        }

        timeSel.innerHTML = s.map(o => `<option>${o}</option>`).join('');
        timeSel.disabled = false;
      });

      const updatePrice = () => {
        const svc = services.find(x => idOf(x) === svcSel.value);
        let price = 0;
        if (svc && oilSel.value) {
          price = parseFloat(
            oilSel.value === 'Blend'
              ? (svc.priceRange?.from || svc.priceFrom)
              : (svc.priceRange?.to || svc.priceTo)
          );
          if (airCb.checked) price += 25;
          if (cabCb.checked) price += 20;
        }
        priceSp.textContent = price.toFixed(2);
        recalcTotal();
      };
      [svcSel, oilSel, airCb, cabCb].forEach(el => el.addEventListener('change', updatePrice));
    }
  });

  recalcTotal();

  document.getElementById('copy-all-btn').addEventListener('click', () => {
    const v = document.querySelector('input[name^="addr_"]')?.value;
    if (v) document.querySelectorAll('input[name^="addr_"]').forEach(i => i.value = v);
  });
}


function configureSubmitButton() {
  const btn = document.getElementById('submit-btn');
  if (accountType === 'Fleet') {
    btn.textContent = 'Fleet Schedule';
    btn.onclick = sendFleetSchedule;
  } else {
    btn.textContent = 'Pagar con PayPal';
    btn.onclick = payWithPayPal;
  }
}

async function sendFleetSchedule() {
  try {
    const trs = [...document.querySelectorAll('#vehicles-tbody tr')]
      .filter(r => !r.querySelector('input[disabled]') && 
        r.querySelector('select[name^="service_"]').value &&
        r.querySelector('select[name^="oil_"]').value);

    if (!trs.length) return showMsg('No hay vehículos seleccionados', 'error');

    const vehicles = [];
    for (const tr of trs) {
      const vid = tr.dataset.vid;
      const v = __VEHICLES__.find(x => idOf(x) === vid);
      const label = `${v?.brand || ''} ${v?.model || ''} ${v?.year || ''} (${v?.plateLast3 || ''})`;

      const milage = parseInt(prompt(`Ingrese el millaje para: ${label}`), 10);
      if (isNaN(milage) || milage < 0) {
        showMsg(`Millaje inválido para ${label}`, 'error');
        return;
      }

      // Guardar millaje
      await fetch(`/api/vehicles/${vid}/milage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ milage })
      });

      vehicles.push({
        vehicleId: vid,
        serviceId: tr.querySelector(`[name="service_${vid}"]`).value,
        oilType: tr.querySelector(`[name="oil_${vid}"]`).value,
        airFilter: tr.querySelector(`[name="air_${vid}"]`).checked,
        cabinFilter: tr.querySelector(`[name="cabin_${vid}"]`).checked,
        serviceAddress: tr.querySelector(`[name="addr_${vid}"]`).value.trim() || fleetInfo.address,
        price: parseFloat(tr.querySelector('.price-cell span').textContent) || 0,
        vehicleInfo: v?.vehicleInfo || {}
      });
    }

    const payload = {
      date: trs[0].querySelector(`[name^="date_"]`).value,
      time: trs[0].querySelector(`[name^="time_"]`).value,
      clientAddress: trs[0].querySelector(`[name^="addr_"]`).value.trim() || fleetInfo.address,
      total: vehicles.reduce((sum, v) => sum + v.price, 0),
      vehicles
    };

    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok) {
      trs.forEach(tr => {
        tr.style.backgroundColor = 'rgba(0, 200, 0, 0.1)';
        tr.querySelectorAll('input, select').forEach(el => el.disabled = true);
      });
      document.getElementById('total-price').textContent = '0.00';
      showMsg('✅ Cita creada exitosamente para vehículos seleccionados', 'success');
    } else {
      throw new Error(data.error || 'Error creando la cita');
    }

  } catch (err) {
    console.error('❌ Error en sendFleetSchedule:', err);
    showMsg('Error al agendar cita Fleet: ' + err.message, 'error');
  }
}


async function payWithPayPal() {
  try {
    const trs = [...document.querySelectorAll('#vehicles-tbody tr')].filter(r => !r.querySelector('input[disabled]'));
    const vehicles = [];

    for (const tr of trs) {
      const vid = tr.dataset.vid;
      const v = __VEHICLES__.find(x => idOf(x) === vid);
      const label = `${v?.brand || ''} ${v?.model || ''} ${v?.year || ''} (${v?.plateLast3 || ''})`;

      const svcVal = tr.querySelector(`[name="service_${vid}"]`)?.value;
      const oilVal = tr.querySelector(`[name="oil_${vid}"]`)?.value;
      const addrVal = tr.querySelector(`[name="addr_${vid}"]`)?.value.trim();
      if (!svcVal || !oilVal) continue;

      const milage = parseInt(prompt(`Ingrese el millaje para: ${label}`), 10);
      if (isNaN(milage) || milage < 0) {
        showMsg(`Millaje inválido para ${label}`, 'error');
        continue;
      }

      await fetch(`/api/vehicles/${vid}/milage`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ milage })
      });

      vehicles.push({
        vehicleId: vid,
        serviceId: svcVal,
        oilType: oilVal,
        airFilter: tr.querySelector(`[name="air_${vid}"]`).checked,
        cabinFilter: tr.querySelector(`[name="cabin_${vid}"]`).checked,
        serviceAddress: addrVal || fleetInfo.address,
        vehicleInfo: v?.vehicleInfo || {},
        price: parseFloat(tr.querySelector('.price-cell span').textContent) || 0
      });
    }

    if (vehicles.length === 0) return showMsg('No hay vehículos válidos para agendar', 'error');

    const payload = {
      date: trs[0].querySelector(`[name^="date_"]`).value,
      time: trs[0].querySelector(`[name^="time_"]`).value,
      clientAddress: trs[0].querySelector(`[name^="addr_"]`).value.trim() || fleetInfo.address,
      total: vehicles.reduce((sum, v) => sum + v.price, 0),
      vehicles
    };

    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.paypal?.approveLink) {
      document.getElementById('total-price').textContent = '0.00';
      window.location.href = data.paypal.approveLink;
    } else {
      throw data.error || 'No se pudo crear la orden';
    }

  } catch (e) {
    showMsg('Error PayPal: ' + e, 'error');
  }
}

