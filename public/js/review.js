/* Editor review page: compare published vs submitted version, approve / return / delete */
'use strict';
(function () {
  const el = App.el;
  const articleId = document.getElementById('main').dataset.article;
  const approveBtn = document.getElementById('approve-btn');
  const deleteBtn = document.getElementById('delete-btn');
  const returnForm = document.getElementById('return-form');
  const returnNote = document.getElementById('return-note');
  const returnMessage = document.getElementById('return-message');
  const liveCol = document.getElementById('live-col');
  const workingHead = document.getElementById('working-head');
  const updateNotice = document.getElementById('update-notice');
  let article;

  const FIELDS = [
    { key: 'title', label: 'Title' },
    { key: 'summary', label: 'Summary' },
    { key: 'category', label: 'Category' },
    { key: 'imageUrl', label: 'Main image' },
    { key: 'body', label: 'Article text' }
  ];

  // Word level diff (longest common subsequence) used to highlight changes in the text
  function diffWords(oldText, newText) {
    const a = oldText.split(/(\s+)/);
    const b = newText.split(/(\s+)/);
    if (a.length * b.length > 4000000) return null; // too large to compare in the browser
    const rows = a.length + 1;
    const cols = b.length + 1;
    const table = new Uint32Array(rows * cols);
    for (let i = a.length - 1; i >= 0; i--) {
      for (let j = b.length - 1; j >= 0; j--) {
        table[i * cols + j] = a[i] === b[j] ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
      }
    }
    const parts = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { parts.push({ type: 'same', text: a[i] }); i++; j++; }
      else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) { parts.push({ type: 'del', text: a[i] }); i++; }
      else { parts.push({ type: 'ins', text: b[j] }); j++; }
    }
    while (i < a.length) parts.push({ type: 'del', text: a[i++] });
    while (j < b.length) parts.push({ type: 'ins', text: b[j++] });
    return parts;
  }

  function renderDiff(parts) {
    const container = el('div', { class: 'compare-body' });
    let paragraph = el('p');
    parts.forEach(function (part) {
      // Blank lines start a new paragraph
      const chunks = part.text.split(/\n\s*\n/);
      chunks.forEach(function (chunk, index) {
        if (index > 0) { container.appendChild(paragraph); paragraph = el('p'); }
        if (!chunk) return;
        if (part.type === 'same') paragraph.appendChild(document.createTextNode(chunk));
        else paragraph.appendChild(el(part.type === 'ins' ? 'ins' : 'del', { class: 'diff', text: chunk }));
      });
    });
    container.appendChild(paragraph);
    return container;
  }

  function fieldValue(key, value) {
    if (key === 'imageUrl') {
      return value ? el('img', { src: value, alt: 'Main image', loading: 'lazy' }) : el('p', { class: 'muted', text: 'Default category image' });
    }
    if (key === 'body') {
      const box = el('div', { class: 'compare-body' });
      String(value || '').split(/\n\s*\n/).filter(Boolean).forEach(function (p) { box.appendChild(el('p', { text: p })); });
      return box;
    }
    return el('p', { text: value || '—' });
  }

  function renderColumn(target, content, other, isWorking) {
    target.replaceChildren();
    FIELDS.forEach(function (f) {
      const changed = other && (content[f.key] || '') !== (other[f.key] || '');
      let valueNode = fieldValue(f.key, content[f.key]);
      if (isWorking && changed && f.key === 'body') {
        const parts = diffWords(other.body || '', content.body || '');
        if (parts) valueNode = renderDiff(parts);
      }
      target.appendChild(el('div', { class: 'compare-field' + (changed ? ' changed' : '') }, [
        el('h3', {}, [f.label, changed ? el('span', { class: 'changed-label', text: isWorking ? 'changed' : 'will be replaced' }) : null]),
        valueNode
      ]));
    });
  }

  function render() {
    document.getElementById('review-title').textContent = article.working.title || 'Untitled article';
    document.title = 'Review: ' + (article.working.title || 'Untitled');
    const metaParts = ['By ' + article.author.displayName];
    if (article.submittedAt) metaParts.push('submitted ' + App.formatDateTime(article.submittedAt));
    if (article.publishedAt) metaParts.push('first published ' + App.formatDateTime(article.publishedAt));
    if (article.publishEvents.length > 1) metaParts.push((article.publishEvents.length - 1) + ' approved update(s)');
    document.getElementById('review-meta').textContent = metaParts.join(' · ');

    const pill = App.statusPill(article.status, article.statusLabel);
    pill.id = 'status-pill';
    document.getElementById('status-pill').replaceWith(pill);

    const isPending = article.status === 'pending';
    approveBtn.classList.toggle('hidden', !isPending);
    returnForm.classList.toggle('hidden', !isPending);
    document.getElementById('public-btn').classList.toggle('hidden', !article.isLive);
    document.getElementById('stats-btn').classList.toggle('hidden', !article.isLive);

    const isUpdate = article.isLive && article.hasUnpublishedChanges;
    liveCol.classList.toggle('hidden', !isUpdate);
    updateNotice.classList.toggle('hidden', !isUpdate);
    if (isUpdate) {
      updateNotice.textContent = 'This is an update to an article that is already published. ' +
        'Left: what readers see right now. Right: the new version. Changed parts are highlighted ' +
        '(green = added text, red = removed text). Approving replaces the public version.';
    }
    workingHead.textContent = isUpdate ? 'New version (waiting for approval)'
      : (article.status === 'published' ? 'Published version' : 'Submitted version');

    renderColumn(document.getElementById('working-content'), article.working, isUpdate ? article.live : null, true);
    if (isUpdate) renderColumn(document.getElementById('live-content'), article.live, article.working, false);
  }

  async function load() {
    try {
      article = await App.api('/api/workspace/articles/' + articleId);
      render();
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  async function changeStatus(status, note) {
    article = await App.api('/api/workspace/articles/' + articleId + '/status', { method: 'PATCH', body: { status: status, note: note } });
    render();
  }

  approveBtn.addEventListener('click', async function () {
    approveBtn.disabled = true;
    try {
      await changeStatus('published');
      App.toast('Approved - the new version is now public', 'success');
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      approveBtn.disabled = false;
    }
  });

  returnForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    const note = returnNote.value.trim();
    returnMessage.className = 'form-message error';
    if (note.length < 3) {
      returnMessage.textContent = 'Please write a note explaining what needs to be fixed.';
      return;
    }
    returnMessage.textContent = '';
    try {
      await changeStatus('returned', note);
      returnNote.value = '';
      App.toast('Returned to the reporter', 'success');
    } catch (err) {
      returnMessage.textContent = err.message;
    }
  });

  deleteBtn.addEventListener('click', async function () {
    if (deleteBtn.dataset.confirm !== 'yes') {
      deleteBtn.dataset.confirm = 'yes';
      deleteBtn.textContent = 'Click again to delete permanently';
      setTimeout(function () { deleteBtn.dataset.confirm = ''; deleteBtn.textContent = 'Delete article'; }, 4000);
      return;
    }
    try {
      await App.api('/api/workspace/articles/' + articleId, { method: 'DELETE' });
      window.location.href = '/editor';
    } catch (err) {
      App.toast(err.message, 'error');
    }
  });

  load();
})();
