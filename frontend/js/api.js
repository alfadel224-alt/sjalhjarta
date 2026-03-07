// js/api.js — Shared utilities for all pages
const API = 'https://sjalhjarta-production-6404.up.railway.app/api';

// ── Token Management ──
const Auth = {
  getToken: () => localStorage.getItem('sjh_token'),
  setToken: (t) => localStorage.setItem('sjh_token', t),
  removeToken: () => localStorage.removeItem('sjh_token'),
  getUser: () => { try { return JSON.parse(localStorage.getItem('sjh_user')); } catch { return null; } },
  setUser: (u) => localStorage.setItem('sjh_user', JSON.stringify(u)),
  removeUser: () => localStorage.removeItem('sjh_user'),
  isLoggedIn: () => !!localStorage.getItem('sjh_token'),
  isAdmin: () => { const u = Auth.getUser(); return u?.role === 'admin'; },
  logout: () => {
    Auth.removeToken(); Auth.removeUser();
    window.location.href = '/index.html';
  },
};

// ── API Request ──
async function api(endpoint, options = {}) {
  const token = Auth.getToken();
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API}${endpoint}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (res.status === 401) { Auth.logout(); return; }
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const get = (url) => api(url, { method: 'GET' });
const post = (url, body) => api(url, { method: 'POST', body: JSON.stringify(body) });
const put = (url, body) => api(url, { method: 'PUT', body: JSON.stringify(body) });
const del = (url) => api(url, { method: 'DELETE' });

// ── Toast ──
function toast(icon, title, desc = '', type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.querySelector('.toast-icon').textContent = icon;
  el.querySelector('.toast-title').textContent = title;
  el.querySelector('.toast-desc').textContent = desc;
  el.className = 'show' + (type ? ` toast-${type}` : '');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('show'), 3500);
}

// ── Redirect if not logged in ──
function requireAuth() {
  if (!Auth.isLoggedIn()) {
    window.location.href = '/index.html';
    return false;
  }
  return true;
}

function requireAdmin() {
  if (!Auth.isAdmin()) {
    window.location.href = '/pages/app.html';
    return false;
  }
  return true;
}

// ── Populate nav ──
function initNav() {
  const user = Auth.getUser();
  if (!user) return;
  const avatarEl = document.getElementById('nav-avatar');
  if (avatarEl) avatarEl.textContent = (user.first_name || user.email)[0].toUpperCase();
  const logoutBtns = document.querySelectorAll('[data-action="logout"]');
  logoutBtns.forEach(b => b.addEventListener('click', Auth.logout));
}

// ── Format time ──
function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr);
  const m = Math.floor(diff/60000);
  if (m < 1) return 'just nu';
  if (m < 60) return `${m} min sedan`;
  const h = Math.floor(m/60);
  if (h < 24) return `${h}h sedan`;
  return `${Math.floor(h/24)}d sedan`;
}

function formatDate(dateStr) {
  return new Intl.DateTimeFormat('sv-SE', { day:'numeric', month:'short', year:'numeric' }).format(new Date(dateStr));
}

function formatCurrency(amount, currency = 'SEK') {
  return new Intl.NumberFormat('sv-SE', { style:'currency', currency }).format(amount/100);
}
