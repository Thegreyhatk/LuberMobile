const fetchOpts = { credentials: 'same-origin' };
let prevCount=0, chatOpen=false, customerInfo={};

function linkify(text) {
  return text.replace(/(\bhttps?:\/\/[^\s]+)/g, url => `<a href="${url}" target="_blank">${url}</a>`);
}

async function loadProfile() {
  const res = await fetch('/api/customer-profile', fetchOpts);
  if(!res.ok) return;
  const d = await res.json();
  if(d.accountType==='Fleet') return window.location.href='/fleet.html';
  customerInfo = { id:d._id, name:d.fullName, email:d.email, address:d.address };

  document.getElementById('fullName').textContent    = d.fullName;
  document.getElementById('accountType').textContent = d.accountType;
  document.getElementById('address').textContent     = d.address;
  document.getElementById('phone').textContent       = d.phone;
  document.getElementById('officePhone').textContent = d.officePhone;
  document.getElementById('email').textContent       = d.email;
  document.getElementById('profilePic').src          = d.profilePictureUrl||'/images/default-profile.png';

  const schRes    = await fetch(`/api/schedule?userId=${d._id}`, fetchOpts);
  const schedules = schRes.ok ? await schRes.json() : [];

  // Motivo de rechazo
  const denied = schedules.find(s=>s.reason && s.reason.trim().toLowerCase()!=='awaiting reason');
  document.getElementById('deniedReason').innerHTML = denied
    ? `❌ Tu servicio fue rechazado por:<br><em>${denied.reason}</em>`
    : '';

  renderVehicles(d.vehicles, schedules);
  renderCancellations(d.cancellations||[]);
  updateTimestamp();
  setupScheduleButton();
}

function renderVehicles(vehicles, schedules) {
  const grid = document.getElementById('vehiclesContainer');
  grid.innerHTML = '';
  vehicles.forEach(v => {
    const related = schedules.filter(s =>
      s.vehicles.some(it => String(it.vehicleId) === String(v._id))
    );
    const next = related.sort((a, b) => toTs(a) - toTs(b))[0];
    function toTs(s) {
      let [time, suf] = s.time.split(' ');
      let [h, m] = time.split(':').map(Number);
      if (suf === 'PM' && h < 12) h += 12;
      if (suf === 'AM' && h === 12) h = 0;
      let d = new Date(s.date); d.setHours(h, m, 0, 0);
      return d.getTime();
    }

    const dateText = next
      ? `${new Date(next.date).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} a las ${next.time}`
      : 'Sin cita';
    const icons = next
      ? `${next.processed ? '<span class="processed-icon"></span>' : ''}
         ${next.confirmed ? '<span class="approved-icon"></span>' : ''}` : '';
    const note = `<div class="vehicle-note">${icons} Próxima cita: ${dateText}</div>`;

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
  
    if (next) {
      let dObj = new Date(next.date + 'T00:00:00'),
        t0 = new Date(); t0.setHours(0, 0, 0, 0),
        days = (dObj - t0) / (1000 * 60 * 60 * 24);
      if (days >= 1) {
        const btn = document.createElement('button');
        btn.className = 'cancel-btn';
        btn.textContent = 'Cancelar Cita';
        btn.dataset.id = next._id;
        btn.onclick = handleCancel;
        card.appendChild(btn);
      }
    }
    grid.appendChild(card);
  });
}


function renderCancellations(cancellations){
  const cont=document.getElementById('cancellationsContainer'),
        noM =document.getElementById('noCancellationsMsg'),
        showA =document.getElementById('showArchivedCheckbox').checked;
  cont.innerHTML='';
  const list=cancellations.filter(c=> showA?c.archived:!c.archived );
  if(!list.length){ noM.style.display='block'; return }
  noM.style.display='none';
  list.sort((a,b)=>new Date(b.date)-new Date(a.date))
      .forEach(e=>{
        const card=document.createElement('div');
        card.className='cancellation-card';
        const fecha=new Date(e.date).toLocaleDateString('es-ES',{day:'2-digit',month:'2-digit',year:'numeric'});
        card.innerHTML=`
          <div class="cancellation-info">
            <div><strong>Fecha:</strong> ${fecha}</div>
            <div><strong>Servicio:</strong> ${e.serviceName}</div>
            <div><strong>Veh:</strong> ${e.vehicleInfo.brand} ${e.vehicleInfo.model} (${e.vehicleInfo.plateLast3})</div>
          </div>`;
        const tog=document.createElement('div');
        tog.className='archive-toggle';
        const cb=document.createElement('input');
        cb.type='checkbox'; cb.checked=e.archived; cb.dataset.date=e.date;
        cb.onclick=()=>handleArchiveToggle(e.date);
        tog.appendChild(cb);
        tog.appendChild(Object.assign(document.createElement('label'),{textContent:'Archivada'}));
        card.appendChild(tog);
        cont.appendChild(card);
      });
}

async function handleCancel(ev){
  const id=ev.currentTarget.dataset.id;
  if(!confirm('Cancelar cita (24h antes mínimo)?'))return;
  const res=await fetch(`/api/schedule/${id}`,{method:'DELETE',...fetchOpts});
  if(!res.ok)return alert('Error: '+await res.text());
  await loadProfile();
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

async function handleArchiveToggle(dateStr){
  const res=await fetch('/api/customer-cancellation-archive',{
    method:'PUT',...fetchOpts,
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({date:dateStr})
  });
  if(!res.ok)return alert('Error: '+await res.text());
  await loadProfile();
}

function updateTimestamp(){
  document.getElementById('lastUpdated').textContent=
    'Última actualización: '+new Date().toLocaleTimeString();
}
function setupScheduleButton(){
  document.getElementById('schedule-btn').onclick=()=>{
    const qs=new URLSearchParams(customerInfo).toString();
    window.location.href='/schedule.html?'+qs;
  };
}

async function loadChat(){
  const res=await fetch('/api/chat/history',fetchOpts);
  if(!res.ok)return;
  const msgs=await res.json(), body=document.getElementById('chat-body');
  body.innerHTML='';
  msgs.forEach(m=>{
    const d=document.createElement('div');
    d.className='msg '+m.sender;
    if(m.text) d.innerHTML=linkify(m.text);
    if(m.imageUrl){
      const img=document.createElement('img');
      img.src=m.imageUrl; img.onclick=()=>openModal(m.imageUrl);
      d.appendChild(img);
    }
    body.appendChild(d);
  });
  body.scrollTop=body.scrollHeight;
  if(msgs.length>prevCount && !chatOpen)
    document.getElementById('chat-widget').classList.add('unread');
  prevCount=msgs.length;
}

document.getElementById('showArchivedCheckbox').onchange = ()=>renderCancellations(JSON.parse(localStorage.getItem('lastCancellations')||'[]'));
document.getElementById('chat-header').onclick = ()=>{
  chatOpen=!chatOpen;
  document.getElementById('chat-widget').classList.toggle('open',chatOpen);
  if(chatOpen)document.getElementById('chat-widget').classList.remove('unread');
};
document.getElementById('chat-close').onclick = e=>{
  e.stopPropagation(); chatOpen=false;
  document.getElementById('chat-widget').classList.remove('open');
};
document.getElementById('chat-form').onsubmit=async e=>{
  e.preventDefault();
  const txt=document.getElementById('chat-input').value.trim();
  if(!txt)return;
  await fetch('/api/chat/send',{...fetchOpts,method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:txt})});
  document.getElementById('chat-input').value='';
  loadChat();
};
document.getElementById('img-modal-close').onclick = ()=>document.getElementById('img-modal').style.display='none';
function openModal(src){ 
  const m=document.getElementById('img-modal');
  document.getElementById('img-modal-full').src=src; m.style.display='flex';
}

window.addEventListener('DOMContentLoaded',()=>{
  loadProfile().then(()=>{
    // Para permitir toggle archivadas guardamos localmente
    fetch('/api/customer-profile',fetchOpts)
      .then(r=>r.json())
      .then(d=>localStorage.setItem('lastCancellations',JSON.stringify(d.cancellations||[])));
  });
  setInterval(async ()=>{
    await loadProfile();
    await loadChat();
  },15000);
  loadChat();
  setInterval(loadChat,5000);
});