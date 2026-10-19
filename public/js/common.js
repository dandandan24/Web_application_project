/* Shared helpers used by all pages (Vanilla JavaScript, no libraries) */
'use strict';

const App = (function () {
  // Ajax helper around fetch(): sends/receives JSON and throws readable errors
  async function api(url, options) {
    const opts = options || {};
    const init = { method: opts.method || 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin' };
    if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }
    if (opts.keepalive) init.keepalive = true;
    if (opts.signal) init.signal = opts.signal;

    let response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      const networkError = new Error('Network error - please check your connection');
      networkError.network = true;
      throw networkError;
    }
    if (response.status === 204) return null;
    let data = null;
    try {
      data = await response.json();
    } catch (err) {
      data = null;
    }
    if (!response.ok) {
      const error = new Error((data && data.error) || 'Request failed (' + response.status + ')');
      error.status = response.status;
      error.details = data && data.details;
      throw error;
    }
    return data;
  }

  // Creates DOM elements safely (text is never parsed as HTML -> no XSS)
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    Object.entries(attrs || {}).forEach(function ([key, value]) {
      if (value === undefined || value === null || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key === 'dataset') Object.assign(node.dataset, value);
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    [].concat(children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === 'string' || typeof child === 'number' ? document.createTextNode(String(child)) : child);
    });
    return node;
  }

  function toast(message, type) {
    const area = document.getElementById('toast-area');
    if (!area) return;
    const node = el('div', { class: 'toast ' + (type || ''), role: 'status', text: message });
    area.appendChild(node);
    setTimeout(function () { node.remove(); }, 4500);
  }

  function formatDate(value) {
    if (!value) return '';
    return new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function formatDateTime(value) {
    if (!value) return '';
    return new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function timeAgo(value) {
    const seconds = Math.round((Date.now() - new Date(value).getTime()) / 1000);
    if (seconds < 10) return 'just now';
    if (seconds < 60) return seconds + ' seconds ago';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return minutes + (minutes === 1 ? ' minute ago' : ' minutes ago');
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours + (hours === 1 ? ' hour ago' : ' hours ago');
    return formatDateTime(value);
  }

  function debounce(fn, wait) {
    let timer;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(null, args); }, wait);
    };
  }

  // Shows server validation errors next to the matching form fields
  function showFieldErrors(form, details) {
    form.querySelectorAll('.field-error').forEach(function (p) { p.textContent = ''; });
    form.querySelectorAll('.invalid').forEach(function (i) { i.classList.remove('invalid'); });
    if (!details) return;
    Object.entries(details).forEach(function ([field, message]) {
      const target = form.querySelector('.field-error[data-for="' + field + '"]');
      if (target) target.textContent = message;
      const input = form.querySelector('[name="' + field + '"]');
      if (input) input.classList.add('invalid');
    });
  }

  function statusPill(status, label) {
    return el('span', { class: 'status-pill' }, [el('span', { class: 'status-dot status-' + status }), label]);
  }

  function storageGet(key) {
    try { return localStorage.getItem(key); } catch (err) { return null; }
  }

  function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (err) { /* storage may be disabled */ }
  }

  return { api, el, toast, formatDate, formatDateTime, timeAgo, debounce, showFieldErrors, statusPill, storageGet, storageSet };
})();

/* ---------- Header behaviour ---------- */
(function () {
  const today = document.getElementById('today');
  if (today) {
    today.textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }

  const toggle = document.querySelector('.menu-toggle');
  const nav = document.getElementById('main-nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  const logout = document.getElementById('logout-btn');
  if (logout) {
    logout.addEventListener('click', async function () {
      logout.disabled = true;
      try {
        await App.api('/api/auth/logout', { method: 'POST' });
      } catch (err) {
        /* even if it fails we go to the home page */
      }
      window.location.href = '/';
    });
  }
})();
