const API_KEY = 'TkBAVP5RkLhqZMrsQKzPbtjj';

// ============================================================
//  Credit system config
// ============================================================
const FREE_GUEST_CREDITS   = 1;   // unregistered users
const FREE_SIGNUP_CREDITS  = 5;   // new Google sign-in users

// ============================================================
//  State
// ============================================================
let currentUser  = null;   // { id, name, email, picture, isGuest }
let resultBlob   = null;

// ============================================================
//  DOM refs
// ============================================================
const uploadArea  = document.getElementById('uploadArea');
const fileInput   = document.getElementById('fileInput');
const resultArea  = document.getElementById('resultArea');
const loading     = document.getElementById('loading');
const errorMsg    = document.getElementById('errorMsg');
const originalImg = document.getElementById('originalImg');
const resultImg   = document.getElementById('resultImg');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn    = document.getElementById('resetBtn');

// ============================================================
//  Credit helpers (stored in localStorage, placeholder for backend)
// ============================================================
function getUserKey(uid) { return `credits_${uid}`; }

function getCredits(uid) {
  const raw = localStorage.getItem(getUserKey(uid));
  if (raw === null) return null;  // first visit
  return parseInt(raw, 10);
}

function setCredits(uid, n) {
  localStorage.setItem(getUserKey(uid), String(n));
}

function deductCredit(uid) {
  const c = getCredits(uid);
  if (c === null || c <= 0) return false;
  setCredits(uid, c - 1);
  updateCreditsBadge();
  return true;
}

function updateCreditsBadge() {
  if (!currentUser) return;
  const badge = document.getElementById('creditsBadge');
  const count = document.getElementById('creditsCount');
  if (!badge || !count) return;
  const c = getCredits(currentUser.id);
  count.textContent = c !== null ? c : '–';
  badge.classList.toggle('credits-low', c !== null && c <= 1);
}

// ============================================================
//  Google Auth
// ============================================================
function handleCredentialResponse(response) {
  const payload = JSON.parse(atob(response.credential.split('.')[1]));
  const user = {
    id:      payload.sub,
    name:    payload.name,
    email:   payload.email,
    picture: payload.picture,
    isGuest: false,
  };
  localStorage.setItem('bgr_user', JSON.stringify(user));

  // Grant signup credits if first time
  if (getCredits(user.id) === null) {
    setCredits(user.id, FREE_SIGNUP_CREDITS);
  }

  showApp(user);
}

function signOut() {
  localStorage.removeItem('bgr_user');
  currentUser = null;
  location.reload();
}

function showLoginOverlay() {
  document.getElementById('loginOverlay').style.display = 'flex';
}

// Guest mode
function tryAsGuest() {
  const guestId = 'guest';
  const user = { id: guestId, name: 'Guest', email: '', picture: '', isGuest: true };

  if (getCredits(guestId) === null) {
    setCredits(guestId, FREE_GUEST_CREDITS);
  }

  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('userBar').style.display = 'none';
  document.getElementById('guestBar').style.display = 'flex';
  currentUser = user;
  updateCreditsBadge();
}

function showApp(user) {
  currentUser = user;
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('mainApp').style.display   = 'block';
  document.getElementById('userBar').style.display   = 'flex';
  document.getElementById('guestBar').style.display  = 'none';
  document.getElementById('userAvatar').src           = user.picture;
  document.getElementById('userName').textContent     = user.name;
  updateCreditsBadge();

  // Show quota banner if 0 credits
  if (getCredits(user.id) === 0) {
    showQuotaBanner();
  }
}

// ============================================================
//  Modal helpers
// ============================================================
function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

function showQuotaBanner() {
  const banner = document.getElementById('quotaBanner');
  if (banner) banner.style.display = 'block';
}

// ============================================================
//  Page load – restore session
// ============================================================
window.addEventListener('load', () => {
  const stored = localStorage.getItem('bgr_user');
  if (stored) {
    try { showApp(JSON.parse(stored)); } catch(e) {}
  }

  // Close upgrade modal on backdrop click
  const modal = document.getElementById('upgradeModal');
  if (modal) {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal('upgradeModal');
    });
  }
});

// ============================================================
//  Upload / process
// ============================================================
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadArea.classList.add('dragover');
});
uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
uploadArea.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadArea.classList.remove('dragover');
  const file = e.dataTransfer.files[0];
  if (file) processFile(file);
});

fileInput.addEventListener('change', () => {
  if (fileInput.files[0]) processFile(fileInput.files[0]);
});

resetBtn.addEventListener('click', () => {
  resultArea.style.display = 'none';
  uploadArea.style.display = 'block';
  fileInput.value = '';
  resultBlob = null;
  hideError();
});

downloadBtn.addEventListener('click', () => {
  if (!resultBlob) return;
  const url = URL.createObjectURL(resultBlob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = 'removed-bg.png';
  a.click();
  URL.revokeObjectURL(url);
});

async function processFile(file) {
  if (!currentUser) {
    showLoginOverlay();
    return;
  }

  // Check credits
  const credits = getCredits(currentUser.id);
  if (credits !== null && credits <= 0) {
    document.getElementById('upgradeModal').style.display = 'flex';
    return;
  }

  if (!file.type.startsWith('image/')) {
    showError('Please upload an image file (JPG, PNG, or WebP).');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showError('Image size must be under 12MB.');
    return;
  }

  hideError();
  uploadArea.style.display = 'none';
  resultArea.style.display = 'none';
  loading.style.display    = 'block';

  originalImg.src = URL.createObjectURL(file);

  try {
    const formData = new FormData();
    formData.append('image_file', file);
    formData.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method:  'POST',
      headers: { 'X-Api-Key': API_KEY },
      body:    formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.errors?.[0]?.title || `Request failed (${response.status})`);
    }

    // Deduct credit on success
    deductCredit(currentUser.id);

    resultBlob = await response.blob();
    resultImg.src = URL.createObjectURL(resultBlob);

    loading.style.display = 'none';
    resultArea.style.display = 'block';

    // If now at 0, show banner below result
    if (getCredits(currentUser.id) === 0) {
      showQuotaBanner();
    }

  } catch (err) {
    loading.style.display = 'none';
    uploadArea.style.display = 'block';
    showError('Processing failed: ' + err.message);
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

function hideError() {
  errorMsg.style.display = 'none';
}
