// File: js/login_registration.js

// Cambiar entre pestañas Registro / Login
const tabReg = document.getElementById('tab-register');
const tabLog = document.getElementById('tab-login');
const formReg = document.getElementById('form-register');
const formLog = document.getElementById('form-login');

tabReg.onclick = () => {
  tabReg.classList.add('active');
  tabLog.classList.remove('active');
  formReg.classList.add('active');
  formLog.classList.remove('active');
};

tabLog.onclick = () => {
  tabLog.classList.add('active');
  tabReg.classList.remove('active');
  formLog.classList.add('active');
  formReg.classList.remove('active');
};

// Vehículos dinámicos
let vehicleCount = 0;
const maxCustomerVehicles = 4;
const vehiclesContainer = document.getElementById('vehiclesContainer');
const addVehicleBtn     = document.getElementById('addVehicleBtn');
const accountTypeSelect = document.getElementById('accountType');

function canAddVehicle() {
  return accountTypeSelect.value === 'Fleet' || vehicleCount < maxCustomerVehicles;
}

function addVehicleBlock() {
  if (!canAddVehicle()) {
    alert(`Clientes pueden agregar hasta ${maxCustomerVehicles} vehículos.`);
    return;
  }

  const idx = vehicleCount++;
  const div = document.createElement('div');
  div.className = 'vehicle';
  div.innerHTML = `
    <button type="button" class="remove-btn">×</button>
    <div class="field">
      <label>Marca</label>
      <select name="vehicles[${idx}][brand]" required>
        <option value="">-- Selecciona una marca --</option>
        <optgroup label="Americanos">
          <option>BUICK</option>
          <option>CADILLAC</option>
          <option>CHEVROLET</option>
          <option>CHRYSLER</option>
          <option>DODGE</option>
          <option>FORD</option>
          <option>GMC</option>
          <option>JEEP</option>
          <option>LINCOLN</option>
          <option>RAM</option>
          <option>FISKER</option>
          <option>KARMA</option>
          <option>LUCID</option>
          <option>PANOZ</option>
          <option>RIVIAN</option>
          <option>SALEEN</option>
          <option>TESLA</option>
        </optgroup>
        <optgroup label="Asiáticos">
          <option>ACURA</option>
          <option>HONDA</option>
          <option>HYUNDAI</option>
          <option>INFINITI</option>
          <option>KIA</option>
          <option>LEXUS</option>
          <option>MAZDA</option>
          <option>NISSAN</option>
          <option>SUBARU</option>
          <option>TOYOTA</option>
          <option>MITSUBISHI</option>
          <option>GENESIS</option>
        </optgroup>
        <optgroup label="Europeos">
          <option>BMW</option>
          <option>MERCEDES-BENZ</option>
          <option>VOLKSWAGEN</option>
          <option>VOLVO</option>
          <option>ALFA ROMEO</option>
          <option>ASTON MARTIN</option>
          <option>AUDI</option>
          <option>BENTLEY</option>
          <option>BUGATTI</option>
          <option>FERRARI</option>
          <option>FIAT</option>
          <option>JAGUAR</option>
          <option>LAMBORGHINI</option>
          <option>LAND ROVER</option>
          <option>LOTUS</option>
          <option>MASERATI</option>
          <option>MCLAREN</option>
          <option>MINI</option>
          <option>MORGAN</option>
          <option>POLESTAR</option>
          <option>PORSCHE</option>
          <option>ROLLS-ROYCE</option>
          <option>SMART</option>
        </optgroup>
      </select>
    </div>
    <div class="field">
      <label>Año</label>
      <select name="vehicles[${idx}][year]" required>
        ${Array.from({ length: 39 }, (_, i) => 2026 - i)
          .map(y => `<option>${y}</option>`)
          .join('')}
      </select>
    </div>
    <div class="field">
      <label>Modelo</label>
      <input name="vehicles[${idx}][model]" type="text" required />
    </div>
    <div class="field">
      <label>Motor</label>
      <input name="vehicles[${idx}][engine]" type="text" placeholder="ej. 1.5L L4" required />
    </div>
    <div class="field">
      <label>Color</label>
      <input name="vehicles[${idx}][color]" type="text" required />
    </div>
    <div class="field">
      <label>Últimos 3 de placa</label>
      <input name="vehicles[${idx}][plateLast3]" type="text" maxlength="3" required />
    </div>
    <div class="field">
      <label>Imagen VIN (opcional)</label>
      <input name="vehicles[${idx}][vinImage]" type="file" accept="image/*" />
    </div>
    <div class="field">
      <label>Imagen del vehículo (opcional)</label>
      <input name="vehicles[${idx}][vehicleImage]" type="file" accept="image/*" />
    </div>
    <div class="field">
      <label>VIN</label>
      <input name="vehicles[${idx}][vin]" type="text" />
    </div>
    <div class="field">
      <label>Intervalo de servicio</label>
      <select name="vehicles[${idx}][serviceIntervals][]" required>
        <option value="30">30</option>
        <option value="60">60</option>
        <option value="90">90</option>
        <option value="120">120</option>
      </select>
    </div>
  `;
  // Botón de eliminar
  div.querySelector('.remove-btn').onclick = () => {
    vehiclesContainer.removeChild(div);
    vehicleCount--;
  };
  vehiclesContainer.appendChild(div);
}

addVehicleBtn.onclick = addVehicleBlock;

// Envío del formulario de Registro
formReg.onsubmit = async e => {
  e.preventDefault();
  const fd = new FormData(formReg);
  try {
    const res = await fetch('/api/register', { method: 'POST', body: fd });
    if (!res.ok) {
      const err = await res.json();
      alert('Error al registrar: ' + (err.error || res.statusText));
      return;
    }
    const { accountType } = await res.json();
    window.location.href = accountType === 'Fleet' ? '/fleet.html' : '/customer.html';
  } catch (error) {
    alert('Error de red al registrar: ' + error.message);
  }
};

// Envío del formulario de Login
formLog.onsubmit = async e => {
  e.preventDefault();
  const body = {
    email: formLog.email.value,
    password: formLog.password.value
  };
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      const err = await res.json();
      alert('Error al iniciar sesión: ' + (err.error || res.statusText));
      return;
    }
    const { accountType } = await res.json();
    window.location.href = accountType === 'Fleet' ? '/fleet.html' : '/customer.html';
  } catch (error) {
    alert('Error de red al iniciar sesión: ' + error.message);
  }
};

// ¡Listo! Tus marcas ahora están ordenadas por regiones como en un GPS bien calibrado. 😉🚗💨
