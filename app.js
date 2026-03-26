const API_KEY = 'TkBAVP5RkLhqZMrsQKzPbtjj';

// ========== Google Auth ==========

function handleCredentialResponse(response) {
  // 解析 JWT，获取用户信息
  const payload = JSON.parse(atob(response.credential.split('.')[1]));
  const user = {
    id: payload.sub,
    name: payload.name,
    email: payload.email,
    picture: payload.picture,
  };
  localStorage.setItem('gUser', JSON.stringify(user));
  showApp(user);
}

function signOut() {
  localStorage.removeItem('gUser');
  location.reload();
}

function showApp(user) {
  document.getElementById('loginOverlay').style.display = 'none';
  document.getElementById('mainApp').style.display = 'block';
  document.getElementById('userAvatar').src = user.picture;
  document.getElementById('userName').textContent = user.name;
}

// 页面加载时检查登录状态
window.addEventListener('load', () => {
  const stored = localStorage.getItem('gUser');
  if (stored) {
    showApp(JSON.parse(stored));
  }
});

// ========== 图片处理 ==========

const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const resultArea = document.getElementById('resultArea');
const loading = document.getElementById('loading');
const errorMsg = document.getElementById('errorMsg');
const originalImg = document.getElementById('originalImg');
const resultImg = document.getElementById('resultImg');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

let resultBlob = null;

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
  const a = document.createElement('a');
  a.href = url;
  a.download = 'removed-bg.png';
  a.click();
  URL.revokeObjectURL(url);
});

async function processFile(file) {
  if (!file.type.startsWith('image/')) {
    showError('请上传图片文件（JPG、PNG、WebP）');
    return;
  }
  if (file.size > 12 * 1024 * 1024) {
    showError('图片大小不能超过 12MB');
    return;
  }

  hideError();
  uploadArea.style.display = 'none';
  resultArea.style.display = 'none';
  loading.style.display = 'block';

  originalImg.src = URL.createObjectURL(file);

  try {
    const formData = new FormData();
    formData.append('image_file', file);
    formData.append('size', 'auto');

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': API_KEY },
      body: formData,
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err?.errors?.[0]?.title || `请求失败 (${response.status})`);
    }

    resultBlob = await response.blob();
    resultImg.src = URL.createObjectURL(resultBlob);

    loading.style.display = 'none';
    resultArea.style.display = 'block';
  } catch (err) {
    loading.style.display = 'none';
    uploadArea.style.display = 'block';
    showError('处理失败：' + err.message);
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorMsg.style.display = 'block';
}

function hideError() {
  errorMsg.style.display = 'none';
}
