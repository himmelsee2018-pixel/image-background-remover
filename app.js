const REMOVE_BG_API_KEY = 'TkBAVP5RkLhqZMrsQKzPbtjj';
const API_BASE = 'https://bgremover-api.a313c3342ac554acbbce04eafd257530.workers.dev';

// ============================================================
//  State
// ============================================================
let currentUser = null;   // { google_id, email, name, picture, credits, _credential }
let resultBlob  = null;

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
//  Credits UI
// ============================================================
function updateCreditsBadge() {
  const badge = document.getElementById('creditsBadge');
  const count = document.getElementById('creditsCount');
  if (!badge || !count) return;
  const c = currentUser?.credits;
  count.textContent = (c !== null && c !== undefined) ? c : '–';
  badge.classList.toggle('credits-low', c !== null && c !== undefined && c <= 1);
}

// ============================================================
//  Google Auth
// ============================================================
async function handleCredentialResponse(response) {
  try {
    // Call backend to upsert user & get credits
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ credential: response.credential }),
    });
    const data = await res.json();

    if (data.user) {
      currentUser = { ...data.user, _credential: response.credential };
      localStorage.setItem('bgr_user', JSON.stringify(currentUser));
      showApp(currentUser);
    } else {
      // Fallback: parse from JWT if backend unavailable
      const payload = JSON.parse(atob(response.credential.split('.')[1]));
      currentUser = {
        google_id: payload.sub,
        name:      payload.name,
        email:     payload.email,
        picture:   payload.picture,
        credits:   5,
        _credential: response.credential,
      };
      localStorage.setItem('bgr_user', JSON.stringify(currentUser));
      showApp(currentUser);
    }
  } catch(e) {
    console.warn('Backend unavailable, using local auth', e);
    const payload = JSON.parse(atob(response.credential.split('.')[1]));
    currentUser = {
      google_id: payload.sub,
      name:      payload.name,
      email:     payload.email,
      picture:   payload.picture,
      credits:   parseInt(localStorage.getItem(`credits_${payload.sub}`) || '5'),
      _credential: response.credential,
    };
    localStorage.setItem('bgr_user', JSON.stringify(currentUser));
    showApp(currentUser);
  }
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
  const guestCredits = parseInt(localStorage.getItem('guest_credits') || '1');
  currentUser = { google_id: 'guest', name: 'Guest', email: '', picture: '', credits: guestCredits, isGuest: true };

  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('userBar').style.display  = 'none';
  document.getElementById('guestBar').style.display = 'flex';
  updateCreditsBadge();

  if (guestCredits <= 0) showQuotaBanner();
}

function showApp(user) {
  currentUser = user;
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('mainApp').style.display   = 'block';
  document.getElementById('userBar').style.display   = 'flex';
  document.getElementById('guestBar').style.display  = 'none';

  const avatar = document.getElementById('userAvatar');
  if (avatar) avatar.src = user.picture || '';
  const nameEl = document.getElementById('userName');
  if (nameEl) nameEl.textContent = user.name || user.email || '';

  updateCreditsBadge();
  if ((user.credits ?? 1) <= 0) showQuotaBanner();
}

// ============================================================
//  Credit deduction (via backend)
// ============================================================
async function deductCreditBackend() {
  if (!currentUser || currentUser.isGuest) {
    // Guest: use localStorage
    const c = parseInt(localStorage.getItem('guest_credits') || '1');
    if (c <= 0) return false;
    localStorage.setItem('guest_credits', String(c - 1));
    currentUser.credits = c - 1;
    updateCreditsBadge();
    return true;
  }

  try {
    const res = await fetch(`${API_BASE}/api/process`, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${currentUser._credential}`,
      },
    });
    const data = await res.json();
    if (res.status === 402) return false; // insufficient credits
    if (data.success) {
      currentUser.credits = data.credits_remaining;
      localStorage.setItem('bgr_user', JSON.stringify(currentUser));
      updateCreditsBadge();
      return true;
    }
    return false;
  } catch(e) {
    // Fallback to local if backend unreachable
    console.warn('Backend unreachable, using local credit deduction');
    const c = currentUser.credits ?? 0;
    if (c <= 0) return false;
    currentUser.credits = c - 1;
    localStorage.setItem('bgr_user', JSON.stringify(currentUser));
    updateCreditsBadge();
    return true;
  }
}

// ============================================================
//  Quota banner / modals
// ============================================================
function showQuotaBanner() {
  const banner = document.getElementById('quotaBanner');
  if (banner) banner.style.display = 'block';
}

function closeModal(id) {
  document.getElementById(id).style.display = 'none';
}

// ============================================================
//  Page load
// ============================================================
window.addEventListener('load', () => {
  const stored = localStorage.getItem('bgr_user');
  if (stored) {
    try {
      const user = JSON.parse(stored);
      // Refresh credits from backend silently
      if (user._credential && !user.isGuest) {
        fetch(`${API_BASE}/api/user/credits`, {
          headers: { Authorization: `Bearer ${user._credential}` },
        })
          .then(r => r.json())
          .then(data => {
            if (typeof data.credits === 'number') {
              user.credits = data.credits;
              localStorage.setItem('bgr_user', JSON.stringify(user));
            }
            showApp(user);
          })
          .catch(() => showApp(user));
      } else {
        showApp(user);
      }
    } catch(e) {}
  }

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
  const credits = currentUser.credits ?? 0;
  if (credits <= 0) {
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
      headers: { 'X-Api-Key': REMOVE_BG_API_KEY },
      body:    formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.errors?.[0]?.title || `Request failed (${response.status})`);
    }

    // Deduct credit (after success)
    const deducted = await deductCreditBackend();
    if (!deducted) {
      // Edge case: ran out between check and deduction
      loading.style.display = 'none';
      uploadArea.style.display = 'block';
      document.getElementById('upgradeModal').style.display = 'flex';
      return;
    }

    resultBlob = await response.blob();
    resultImg.src = URL.createObjectURL(resultBlob);
    loading.style.display    = 'none';
    resultArea.style.display = 'block';

    if ((currentUser.credits ?? 1) <= 0) showQuotaBanner();

  } catch (err) {
    loading.style.display    = 'none';
    uploadArea.style.display = 'block';
    showError('Processing failed: ' + err.message);
  }
}

function showError(msg) {
  errorMsg.textContent   = msg;
  errorMsg.style.display = 'block';
}

function hideError() {
  errorMsg.style.display = 'none';
}
