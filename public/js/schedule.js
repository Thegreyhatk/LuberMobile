const fetchOpts    = { credentials: 'include' };
let fleetInfo      = { address: '' };
let accountType    = 'Customer';
let __VEHICLES__   = [];
let __SCHEDULES__  = [];

/** Muestra un mensaje en pantalla */
const showMsg = (text, cls) => {
  const m = document.getElementById('msg');
  m.textContent = text;
  m.className   = 'alert ' + cls;
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // 1) Cargar perfil
    const prof = await fetch('/api/customer-profile', fetchOpts);
    if (!prof.ok) throw 'No autorizado';
    const d = await prof.json();
    fleetInfo.address = d.address;
    accountType       = d.accountType;

    // 2) Ajustar enlace "Mi Cuenta"
    document.querySelector('nav a').href =
      accountType === 'Fleet' ? 'fleet.html' : 'customer.html';

    // 3) Cargar vehículos, servicios y citas
    const [vehRes, svcRes, schRes] = await Promise.all([
      fetch('/api/vehicles', fetchOpts),
      fetch('/api/services', fetchOpts),
      fetch(`/api/schedule?userId=${d._id}`, fetchOpts)
    ]);
    if (!vehRes.ok || !svcRes.ok) throw 'Error al cargar datos';

    __VEHICLES__  = await vehRes.json();
    const services = await svcRes.json();
    __SCHEDULES__ = schRes.ok ? await schRes.json() : [];

    renderTable(__VEHICLES__, services, __SCHEDULES__);
    configureSubmitButton();

  } catch (e) {
    showMsg(e, 'error');
  }

  // My Location
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

// Helpers
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
  const d = new Date(), wk = [0, 6];
  let cnt = 0;
  while (cnt < 3) {
    d.setDate(d.getDate() + 1);
    if (!wk.includes(d.getDay())) cnt++;
  }
  return d.toISOString().slice(0, 10);
}

function recalcTotal() {
  let sum = 0;
  document.querySelectorAll('.price-cell span')
    .forEach(el => sum += parseFloat(el.textContent) || 0);
  document.getElementById('total-price').textContent = sum.toFixed(2);
}

// Renderizado de la tabla
function renderTable(vehicles, services, schedules) {
  const tbody  = document.getElementById('vehicles-tbody');
  tbody.innerHTML = '';

  const svcHtml = services.map(s => `<option value="${idOf(s)}">${s.name}</option>`).join('');
  const oilHtml = `
    <option value="">-- Tipo aceite --</option>
    <option>Blend</option>
    <option>Full Synthetic</option>
  `;

  vehicles.forEach(v => {
    const vid     = idOf(v);
    const thumb   = v.vehicleImageUrl
      ? `<img src="${v.vehicleImageUrl}" class="veh-thumb" data-full="${v.vehicleImageUrl}"/>`
      : `<div style="width:60px;height:60px;background:#ccc;border-radius:4px;"></div>`;
    const existing = schedules.find(s => s.vehicles.some(vv => String(vv.vehicleId) === vid));

    const tr = document.createElement('tr');
    tr.dataset.vid = vid;

    if (existing) {
      // fila deshabilitada
      const ve   = existing.vehicles.find(vv => String(vv.vehicleId) === vid);
      const name = services.find(x => idOf(x) === String(ve.serviceId))?.name || '—';
      tr.innerHTML = `
        <td>${thumb}</td>
        <td><input type="date"   value="${existing.date}" disabled/></td>
        <td><select disabled><option>${existing.time}</option></select></td>
        <td><select disabled><option>${name}</option></select></td>
        <td><select disabled><option>${ve.oilType}</option></select></td>
        <td class="price-cell">$<span>${ve.price.toFixed(2)}</span></td>
        <td>
          <label><input type="checkbox" disabled ${ve.airFilter?'checked':''}/> Motor ($25)</label><br/>
          <label><input type="checkbox" disabled ${ve.cabinFilter?'checked':''}/> Cabina ($20)</label>
        </td>
        <td><input type="text" value="${ve.serviceAddress||fleetInfo.address}" disabled style="width:200px;"/></td>
      `;
    } else {
      // fila editable
      tr.innerHTML = `
        <td>${thumb}</td>
        <td><input type="date"   name="date_${vid}" min="${minDate()}"/></td>
        <td><select name="time_${vid}" disabled><option>Elige fecha</option></select></td>
        <td><select name="service_${vid}" style="min-width:140px;">
              <option value="">-- Servicio --</option>${svcHtml}
            </select></td>
        <td><select name="oil_${vid}">${oilHtml}</select></td>
        <td class="price-cell">$<span>0.00</span></td>
        <td>
          <label><input type="checkbox" name="air_${vid}"/> Motor ($25)</label><br/>
          <label><input type="checkbox" name="cabin_${vid}"/> Cabina ($20)</label>
        </td>
        <td><input type="text" name="addr_${vid}" placeholder="Dirección" style="width:200px;"/></td>
      `;

      // Eventos para slots y precio
      const dateIn = tr.querySelector(`[name="date_${vid}"]`);
      const timeSel= tr.querySelector(`[name="time_${vid}"]`);
      const svcSel = tr.querySelector(`[name="service_${vid}"]`);
      const oilSel = tr.querySelector(`[name="oil_${vid}"]`);
      const airCb  = tr.querySelector(`[name="air_${vid}"]`);
      const cabCb  = tr.querySelector(`[name="cabin_${vid}"]`);
      const priceSp= tr.querySelector('.price-cell span');

      dateIn.addEventListener('change', () => {
        let s = generateSlots();
        const today = new Date().toISOString().slice(0,10);
        if (dateIn.value === today) {
          const now = new Date();
          s = s.filter(opt => {
            let [t,amp] = opt.split(' ');
            let [h,m]   = t.split(':').map(Number);
            if (amp==='PM'&&h<12) h+=12;
            if (amp==='AM'&&h===12) h=0;
            return h>now.getHours() || (h===now.getHours()&&m>now.getMinutes());
          });
        }
        timeSel.innerHTML = s.map(o=>`<option>${o}</option>`).join('');
        timeSel.disabled    = false;
      });

      const updatePrice = () => {
        const svc = services.find(x=>idOf(x)===svcSel.value);
        let price = 0;
        if (svc && oilSel.value) {
          price = parseFloat(
            oilSel.value==='Blend'
              ? (svc.priceRange?.from||svc.priceFrom)
              : (svc.priceRange?.to||svc.priceTo)
          );
          if (airCb.checked) price += 25;
          if (cabCb.checked) price += 20;
        }
        priceSp.textContent = price.toFixed(2);
        recalcTotal();
      };
      [svcSel, oilSel, airCb, cabCb].forEach(el => el.addEventListener('change', updatePrice));
    }

    tbody.appendChild(tr);
    // click en la miniatura para ampliar
    tr.querySelector('.veh-thumb')?.addEventListener('click', e => {
      document.getElementById('veh-modal-img').src       = e.target.dataset.full;
      document.getElementById('veh-modal').style.display = 'flex';
    });
  });

  recalcTotal();
  document.getElementById('copy-all-btn')
    .addEventListener('click', () => {
      const v = document.querySelector('input[name^="addr_"]')?.value;
      if (v) document.querySelectorAll('input[name^="addr_"]').forEach(i=>i.value=v);
    });
}

/** Decide flujo Fleet vs Customer */
function configureSubmitButton(){
  const btn = document.getElementById('submit-btn');
  if (accountType === 'Fleet') {
    btn.textContent = 'Fleet Schedule';
    btn.onclick     = sendFleetSchedule;
  } else {
    btn.textContent = 'Pagar con PayPal';
    btn.onclick     = payWithPayPal;
  }
}

/** Envía la cita (Fleet) y redirige sin PayPal */
async function sendFleetSchedule(){
  try {
    const trs = [...document.querySelectorAll('#vehicles-tbody tr')]
      .filter(r => !r.querySelector('input[disabled]'));
    if (trs.length === 0) return showMsg('Ninguna cita para agendar', 'error');

    const vehicles = trs.map(tr => {
      const vid = tr.dataset.vid;
      return {
        vehicleId:      vid,
        serviceId:      tr.querySelector(`[name="service_${vid}"]`).value,
        oilType:        tr.querySelector(`[name="oil_${vid}"]`).value,
        airFilter:      tr.querySelector(`[name="air_${vid}"]`).checked,
        cabinFilter:    tr.querySelector(`[name="cabin_${vid}"]`).checked,
        serviceAddress: tr.querySelector(`[name="addr_${vid}"]`).value.trim() || fleetInfo.address,
        vehicleInfo:    __VEHICLES__.find(x => idOf(x) === vid)?.vehicleInfo || {},
        price:          parseFloat(tr.querySelector('.price-cell span').textContent) || 0
      };
    });

    const payload = {
      date:          trs[0].querySelector(`[name^="date_"]`).value,
      time:          trs[0].querySelector(`[name^="time_"]`).value,
      clientAddress: trs[0].querySelector(`[name^="addr_"]`).value.trim() || fleetInfo.address,
      total:         vehicles.reduce((sum,v) => sum + v.price, 0),
      vehicles
    };

    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      ...fetchOpts,
      body: JSON.stringify(payload)
    });

    if (!res.ok) throw await res.text();
    showMsg('Fleet schedule creado', 'success');
    setTimeout(() => window.location.href = 'fleet.html', 1000);
  } catch (e) {
    showMsg('Error fleet: ' + e, 'error');
  }
}


/** Envía la cita vía PayPal */
async function payWithPayPal(){
  try {
    const trs = [...document.querySelectorAll('#vehicles-tbody tr')]
      .filter(r => !r.querySelector('input[disabled]'));
    if (trs.length === 0) return showMsg('Ninguna cita para agendar', 'error');

    const vehicles = trs.map(tr => {
      const vid = tr.dataset.vid;
      return {
        vehicleId:      vid,
        serviceId:      tr.querySelector(`[name="service_${vid}"]`).value,
        oilType:        tr.querySelector(`[name="oil_${vid}"]`).value,
        airFilter:      tr.querySelector(`[name="air_${vid}"]`).checked,
        cabinFilter:    tr.querySelector(`[name="cabin_${vid}"]`).checked,
        serviceAddress: tr.querySelector(`[name="addr_${vid}"]`).value.trim() || fleetInfo.address,
        vehicleInfo:    __VEHICLES__.find(x => idOf(x) === vid)?.vehicleInfo || {},
        price:          parseFloat(tr.querySelector('.price-cell span').textContent) || 0
      };
    });

    const payload = {
      date:          trs[0].querySelector(`[name^="date_"]`).value,
      time:          trs[0].querySelector(`[name^="time_"]`).value,
      clientAddress: trs[0].querySelector(`[name^="addr_"]`).value.trim() || fleetInfo.address,
      total:         vehicles.reduce((sum,v) => sum + v.price, 0),
      vehicles
    };

    const res = await fetch('/api/schedule', {
      method:'POST',
      headers: { 'Content-Type': 'application/json' },
      ...fetchOpts,
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (res.ok && data.paypal?.approveLink) {
      window.location.href = data.paypal.approveLink;
    } else {
      throw data.error || 'No se pudo crear orden';
    }
  } catch (e) {
    showMsg('Error PayPal: ' + e, 'error');
  }
}


// Cerrar modal de imagen
document.getElementById('veh-modal')
  ?.addEventListener('click', () => document.getElementById('veh-modal').style.display = 'none');
