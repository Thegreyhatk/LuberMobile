// Tabs: Register / Login
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

// -----------------------------
// Register Stepper Logic
// -----------------------------
const steps = Array.from(document.querySelectorAll('.modal-step'));
const stepIndicators = document.querySelectorAll('.stepper .step');
let currentStep = 0;

function showStep(index) {
  steps.forEach((step, i) => {
    step.classList.toggle('hidden', i !== index);
  });
  updateStepperUI(index);
}

function updateStepperUI(currentIndex) {
  stepIndicators.forEach((step, index) => {
    step.classList.remove('active', 'completed');
    if (index < currentIndex) step.classList.add('completed');
    else if (index === currentIndex) step.classList.add('active');
  });
}

document.querySelectorAll('.next-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    if (currentStep < steps.length - 1) {
      currentStep++;
      showStep(currentStep);
    }
  })
);

document.querySelectorAll('.prev-btn').forEach(btn =>
  btn.addEventListener('click', () => {
    if (currentStep > 0) {
      currentStep--;
      showStep(currentStep);
    }
  })
);

showStep(currentStep); // Init

// -----------------------------
// Dynamic Vehicles
// -----------------------------
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
    alert(`Customers may add up to ${maxCustomerVehicles} vehicles.`);
    return;
  }

  const idx = vehicleCount++;
  const div = document.createElement('div');
  div.className = 'vehicle';
  div.innerHTML = `
    <button type="button" class="remove-btn">×</button>
    <div class="field"><label>Brand</label><select name="vehicles[${idx}][brand]" required>
      <option value="">-- Select a brand --</option>
      <optgroup label="American"><option>BUICK</option><option>CADILLAC</option><option>CHEVROLET</option><option>CHRYSLER</option><option>DODGE</option><option>FORD</option><option>GMC</option><option>JEEP</option><option>LINCOLN</option><option>RAM</option><option>FISKER</option><option>KARMA</option><option>LUCID</option><option>PANOZ</option><option>RIVIAN</option><option>SALEEN</option><option>TESLA</option></optgroup>
      <optgroup label="Asian"><option>ACURA</option><option>HONDA</option><option>HYUNDAI</option><option>INFINITI</option><option>KIA</option><option>LEXUS</option><option>MAZDA</option><option>NISSAN</option><option>SUBARU</option><option>TOYOTA</option><option>MITSUBISHI</option><option>GENESIS</option></optgroup>
      <optgroup label="European"><option>BMW</option><option>MERCEDES-BENZ</option><option>VOLKSWAGEN</option><option>VOLVO</option><option>ALFA ROMEO</option><option>ASTON MARTIN</option><option>AUDI</option><option>BENTLEY</option><option>BUGATTI</option><option>FERRARI</option><option>FIAT</option><option>JAGUAR</option><option>LAMBORGHINI</option><option>LAND ROVER</option><option>LOTUS</option><option>MASERATI</option><option>MCLAREN</option><option>MINI</option><option>MORGAN</option><option>POLESTAR</option><option>PORSCHE</option><option>ROLLS-ROYCE</option><option>SMART</option></optgroup>
    </select></div>
    <div class="field"><label>Year</label><select name="vehicles[${idx}][year]" required>${
      Array.from({ length: 39 }, (_, i) => 2026 - i).map(y => `<option>${y}</option>`).join('')
    }</select></div>
    <div class="field"><label>Model</label><input name="vehicles[${idx}][model]" type="text" required /></div>
    <div class="field"><label>Engine</label><input name="vehicles[${idx}][engine]" type="text" placeholder="e.g. 1.5L L4" required /></div>
    <div class="field"><label>Color</label><input name="vehicles[${idx}][color]" type="text" required /></div>
    <div class="field"><label>Last 3 of Plate</label><input name="vehicles[${idx}][plateLast3]" type="text" maxlength="3" required /></div>
    <div class="field"><label>VIN Image (optional)</label><input name="vehicles[${idx}][vinImage]" type="file" accept="image/*" /></div>
    <div class="field"><label>Vehicle Image (optional)</label><input name="vehicles[${idx}][vehicleImage]" type="file" accept="image/*" /></div>
    <div class="field"><label>VIN</label><input name="vehicles[${idx}][vin]" type="text" /></div>
    <div class="field"><label>Service Interval</label><select name="vehicles[${idx}][serviceIntervals][]" required>
      <option value="30">30</option><option value="60">60</option><option value="90">90</option><option value="120">120</option>
    </select></div>
  `;

  div.querySelector('.remove-btn').onclick = () => {
    vehiclesContainer.removeChild(div);
    vehicleCount--;
  };

  vehiclesContainer.appendChild(div);
}

addVehicleBtn.onclick = addVehicleBlock;

// -----------------------------
// Register Submit con loader
// -----------------------------
const loader = document.getElementById('loader');

formReg.onsubmit = async e => {
  e.preventDefault();
  loader.classList.remove('hidden');

  const requiredFields = [
    'accountType', 'profilePicture', 'fullName', 'address', 'phone', 'email', 'password'
  ];

  for (const name of requiredFields) {
    const input = formReg[name];
    if (!input || (input.type === 'file' ? !input.files.length : !input.value.trim())) {
      alert(`Please complete the required field: ${name}`);
      const stepIndex = name === 'accountType' ? 0 : 1;
      currentStep = stepIndex;
      showStep(stepIndex);
      input.focus();
      loader.classList.add('hidden');
      return;
    }
  }

  const fd = new FormData(formReg);
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      body: fd
    });
    if (!res.ok) {
      const err = await res.json();
      alert('Registration error: ' + (err.error || res.statusText));
      return;
    }
    const { accountType } = await res.json();
    window.location.href = accountType === 'Fleet' ? '/fleet.html' : '/customer.html';
  } catch (error) {
    alert('Network error during registration: ' + error.message);
  } finally {
    loader.classList.add('hidden');
  }
};

// -----------------------------
// Login Submit con loader
// -----------------------------
formLog.onsubmit = async e => {
  e.preventDefault();
  loader.classList.remove('hidden');

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
      alert('Login error: ' + (err.error || res.statusText));
      return;
    }
    const { accountType } = await res.json();
    window.location.href = accountType === 'Fleet' ? '/fleet.html' : '/customer.html';
  } catch (error) {
    alert('Network error during login: ' + error.message);
  } finally {
    loader.classList.add('hidden');
  }
};

// -----------------------------
// Modal "What is Luber"
// -----------------------------
const icon = document.getElementById("whatsLuberIcon");
const modal = document.getElementById("whatsLuberModal");
const close = document.querySelector(".modal .close");

if (icon && modal && close) {
  icon.addEventListener("click", () => modal.style.display = "block");
  close.addEventListener("click", () => modal.style.display = "none");
  window.addEventListener("click", e => {
    if (e.target === modal) modal.style.display = "none";
  });
}



document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.dropdown-toggle');
  const dropdown = document.querySelector('.header-dropdown');

  toggle?.addEventListener('click', () => {
    dropdown.classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (!dropdown.contains(e.target)) {
      dropdown.classList.remove('show');
    }
  });
});



document.addEventListener('DOMContentLoaded', () => {
  const modals = {
    about: document.getElementById('modal-about'),
    offer: document.getElementById('modal-offer'),
    career: document.getElementById('modal-career')
  };

  const links = document.querySelectorAll('.company-links a');
  const closeBtns = document.querySelectorAll('.close-modal');

  links.forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const text = link.textContent.trim().toLowerCase();
      if (text.includes('about')) modals.about.classList.remove('hidden');
      else if (text.includes('offer')) modals.offer.classList.remove('hidden');
      else if (text.includes('career')) modals.career.classList.remove('hidden');
    });
  });

  closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.modal-info').classList.add('hidden');
    });
  });

  window.addEventListener('click', e => {
    Object.values(modals).forEach(modal => {
      if (e.target === modal) modal.classList.add('hidden');
    });
  });
});




