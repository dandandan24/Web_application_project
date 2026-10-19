/* Article lists: reporter work area (/workspace) and editorial desk (/editor) */
'use strict';
(function () {
  const el = App.el;
  const role = window.WS_ROLE;
  const isDesk = Boolean(window.WS_EDITOR_DESK);
  const rows = document.getElementById('ws-rows');
  const empty = document.getElementById('ws-empty');
  const pager = document.getElementById('ws-pager');
  const search = document.getElementById('ws-search');
  const tabs = document.querySelectorAll('#status-tabs .tab');
  const newBtn = document.getElementById('new-article');

  const STORAGE_KEY = isDesk ? 'dw-desk-status' : 'dw-ws-status';
  const initialTab = document.querySelector('#status-tabs .tab.active');
  const state = { status: initialTab ? initialTab.dataset.status : '', page: 1, q: '' };
  const saved = App.storageGet(STORAGE_KEY);
  if (saved !== null && document.querySelector('#status-tabs .tab[data-status="' + saved + '"]')) state.status = saved;

  function setActiveTab() {
    tabs.forEach(function (t) {
      const active = t.dataset.status === state.status;
      t.classList.toggle('active', active);
      t.setAttribute('aria-selected', String(active));
    });
  }

  function editable(item) {
    if (role === 'editor') return true;
    return ['draft', 'returned', 'published'].includes(item.status);
  }

  function actions(item) {
    const buttons = [];
    if (role === 'editor') {
      buttons.push(el('a', { class: 'btn btn-small', href: '/editor/articles/' + item.id, text: item.status === 'pending' ? 'Review' : 'Open' }));
    }
    if (editable(item)) {
      buttons.push(el('a', { class: 'btn btn-small btn-ghost', href: '/workspace/articles/' + item.id + '/edit', text: 'Edit' }));
    } else {
      buttons.push(el('a', { class: 'btn btn-small btn-ghost', href: '/workspace/articles/' + item.id + '/preview', text: 'View' }));
    }
    if (item.isLive) {
      buttons.push(el('a', { class: 'btn btn-small btn-ghost', href: '/articles/' + item.id, target: '_blank', rel: 'noopener', text: 'Public page' }));
    }
    return el('div', { class: 'row-actions' }, buttons);
  }

  function row(item) {
    const titleHref = role === 'editor' ? '/editor/articles/' + item.id
      : (editable(item) ? '/workspace/articles/' + item.id + '/edit' : '/workspace/articles/' + item.id + '/preview');
    const titleCell = el('td', {}, [
      el('a', { class: 'row-title', href: titleHref, text: item.title }),
      el('span', { class: 'row-sub', text: item.category || 'No category yet' }),
      item.status === 'returned' && item.editorNote ? el('span', { class: 'row-sub', text: 'Editor note: ' + item.editorNote }) : null
    ]);
    return el('tr', {}, [
      titleCell,
      role === 'editor' ? el('td', { text: item.author }) : null,
      el('td', {}, [
        App.statusPill(item.status, item.statusLabel),
        item.isLive && item.status !== 'published' ? el('span', { class: 'live-pill', title: 'An approved version is currently public', text: 'LIVE' }) : null
      ]),
      el('td', { text: App.formatDateTime(item.updatedAt) }),
      el('td', { class: 'num', text: item.isLive ? item.viewCount.toLocaleString() : '—' }),
      el('td', {}, [actions(item)])
    ]);
  }

  function renderPager(data) {
    pager.replaceChildren();
    const pages = Math.max(1, Math.ceil(data.total / 25));
    if (pages <= 1) return;
    const prev = el('button', { type: 'button', class: 'btn btn-small btn-ghost', text: '← Previous', disabled: data.page <= 1 });
    const next = el('button', { type: 'button', class: 'btn btn-small btn-ghost', text: 'Next →', disabled: !data.hasMore });
    prev.addEventListener('click', function () { state.page -= 1; load(); });
    next.addEventListener('click', function () { state.page += 1; load(); });
    pager.append(prev, el('span', { class: 'muted', text: 'Page ' + data.page + ' of ' + pages }), next);
  }

  function renderCounts(counts) {
    let all = 0;
    Object.values(counts).forEach(function (n) { all += n; });
    document.querySelectorAll('#status-tabs .count').forEach(function (span) {
      const key = span.dataset.count;
      span.textContent = '(' + (key === 'all' ? all : (counts[key] || 0)) + ')';
    });
  }

  let controller;
  async function load() {
    if (controller) controller.abort();
    controller = new AbortController();
    const params = new URLSearchParams({ page: state.page });
    if (state.status) params.set('status', state.status);
    if (state.q) params.set('q', state.q);
    rows.setAttribute('aria-busy', 'true');
    try {
      const data = await App.api('/api/workspace/articles?' + params, { signal: controller.signal });
      rows.replaceChildren.apply(rows, data.items.map(row));
      empty.classList.toggle('hidden', data.items.length > 0);
      renderPager(data);
      renderCounts(data.counts);
    } catch (err) {
      if (err.name !== 'AbortError') App.toast(err.message, 'error');
    } finally {
      rows.removeAttribute('aria-busy');
    }
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      state.status = tab.dataset.status;
      state.page = 1;
      App.storageSet(STORAGE_KEY, state.status);
      setActiveTab();
      load();
    });
  });

  search.addEventListener('input', App.debounce(function () {
    state.q = search.value.trim();
    state.page = 1;
    load();
  }, 300));

  if (newBtn) {
    newBtn.addEventListener('click', async function () {
      newBtn.disabled = true;
      try {
        const article = await App.api('/api/workspace/articles', { method: 'POST', body: {} });
        window.location.href = '/workspace/articles/' + article.id + '/edit';
      } catch (err) {
        newBtn.disabled = false;
        App.toast(err.message, 'error');
      }
    });
  }

  setActiveTab();
  load();
})();
