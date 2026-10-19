/* Article editor with continuous autosave.
   - Every change is saved to the server automatically (no "Save" button needed)
   - A local backup in localStorage protects against closing the tab before the save finished
   - Coming back from any computer loads the latest saved version from the server */
'use strict';
(function () {
  const el = App.el;
  const articleId = document.getElementById('main').dataset.article;
  const role = window.EDITOR_ROLE;
  const form = document.getElementById('article-form');
  const saveState = document.getElementById('save-state');
  let statusPill = document.getElementById('status-pill');
  const noteBox = document.getElementById('editor-note');
  const liveNotice = document.getElementById('live-notice');
  const lockedNotice = document.getElementById('locked-notice');
  const submitBtn = document.getElementById('submit-btn');
  const reviewLink = document.getElementById('review-link');
  const deleteBtn = document.getElementById('delete-btn');
  const previewLink = document.getElementById('preview-link');
  const formMessage = document.getElementById('form-message');
  const imagePreview = document.getElementById('image-preview');
  const fileInput = document.getElementById('image-file');
  const wordCount = document.getElementById('word-count');

  const FIELDS = ['title', 'summary', 'category', 'imageUrl', 'body'];
  const BACKUP_KEY = 'dw-backup-' + articleId;
  const SAVE_DELAY = 1000;

  let article = null;
  let lastSaved = null;   // content the server confirmed
  let saving = false;
  let saveAgain = false;
  let timer = null;

  function readForm() {
    const content = {};
    FIELDS.forEach(function (f) { content[f] = form.elements[f].value; });
    return content;
  }

  function fillForm(content) {
    FIELDS.forEach(function (f) { form.elements[f].value = content[f] || ''; });
    updateImagePreview();
    updateWordCount();
  }

  function sameContent(a, b) {
    return FIELDS.every(function (f) { return (a[f] || '') === (b[f] || ''); });
  }

  function setSaveState(text, isError) {
    saveState.textContent = text;
    saveState.classList.toggle('error', Boolean(isError));
  }

  function canEdit() {
    if (role === 'editor') return true;
    return ['draft', 'returned', 'published'].includes(article.status);
  }

  function renderMeta() {
    statusPill.replaceWith(statusPill = Object.assign(App.statusPill(article.status, article.statusLabel), { id: 'status-pill' }));

    noteBox.classList.toggle('hidden', !(article.status === 'returned' && article.editorNote));
    if (article.status === 'returned' && article.editorNote) {
      noteBox.replaceChildren(el('strong', { text: 'The editor returned this article for corrections:' }), el('p', { text: article.editorNote }));
    }

    liveNotice.classList.toggle('hidden', !article.isLive);
    if (article.isLive) {
      liveNotice.replaceChildren(
        el('strong', { text: 'This article is published. ' }),
        document.createTextNode(article.status === 'published'
          ? 'Changes you make will be saved as a new version. Readers keep seeing the approved version until an editor approves the new one.'
          : 'Readers still see the last approved version. Your changes become public only after an editor approves them. '),
        el('a', { href: '/articles/' + articleId, target: '_blank', rel: 'noopener', text: 'Open the public version' })
      );
    }

    const editable = canEdit();
    FIELDS.forEach(function (f) { form.elements[f].disabled = !editable; });
    fileInput.disabled = !editable;
    form.setAttribute('aria-disabled', String(!editable));
    lockedNotice.classList.toggle('hidden', editable);
    if (!editable) lockedNotice.textContent = 'This article is waiting for editor approval and cannot be changed until the editor approves it or returns it to you.';

    const canSubmit = role === 'reporter' && ['draft', 'returned'].includes(article.status);
    submitBtn.classList.toggle('hidden', !canSubmit);
    submitBtn.textContent = article.status === 'returned' ? 'Send corrections for approval' : 'Send for editor approval';
    reviewLink.classList.toggle('hidden', role !== 'editor');
    reviewLink.href = '/editor/articles/' + articleId;
    deleteBtn.classList.toggle('hidden', !(role === 'reporter' && article.status === 'draft' && !article.isLive));
    previewLink.href = '/workspace/articles/' + articleId + '/preview';
  }

  function updateImagePreview() {
    const url = form.elements.imageUrl.value.trim();
    imagePreview.classList.toggle('hidden', !url);
    if (url) imagePreview.src = url;
  }

  function updateWordCount() {
    const words = form.elements.body.value.trim().split(/\s+/).filter(Boolean).length;
    wordCount.textContent = words;
  }

  /* ---------- Saving ---------- */

  function backupLocally(content) {
    App.storageSet(BACKUP_KEY, JSON.stringify({ content: content, at: Date.now() }));
  }

  function clearBackup() {
    try { localStorage.removeItem(BACKUP_KEY); } catch (err) { /* ignore */ }
  }

  function scheduleSave() {
    if (!article || !canEdit()) return;
    const content = readForm();
    if (lastSaved && sameContent(content, lastSaved)) return;
    backupLocally(content);
    setSaveState('Unsaved changes…');
    clearTimeout(timer);
    timer = setTimeout(save, SAVE_DELAY);
  }

  async function save() {
    clearTimeout(timer);
    if (!article || !canEdit()) return;
    if (saving) { saveAgain = true; return; }
    const content = readForm();
    if (lastSaved && sameContent(content, lastSaved)) return;

    saving = true;
    setSaveState('Saving…');
    try {
      const updated = await App.api('/api/workspace/articles/' + articleId, { method: 'PUT', body: content });
      lastSaved = content;
      const statusChanged = updated.status !== article.status;
      article = updated;
      if (sameContent(readForm(), lastSaved)) clearBackup();
      setSaveState('All changes saved · ' + new Date(updated.workingSavedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      if (statusChanged) {
        renderMeta();
        App.toast('A new version was started. The published version stays online until it is approved.');
      }
    } catch (err) {
      // Keep the local backup - we will retry
      setSaveState(err.network ? 'Offline - changes kept on this device, retrying…' : 'Not saved: ' + err.message, true);
      if (err.network || err.status >= 500) timer = setTimeout(save, 5000);
      if (err.status === 403 || err.status === 409) reload();
    } finally {
      saving = false;
      if (saveAgain) { saveAgain = false; save(); }
    }
  }

  // Save immediately when the user leaves / hides the page
  function flushOnExit() {
    if (!article || !canEdit()) return;
    const content = readForm();
    if (lastSaved && sameContent(content, lastSaved)) return;
    backupLocally(content);
    fetch('/api/workspace/articles/' + articleId, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(content),
      credentials: 'same-origin',
      keepalive: true
    }).then(function (r) { if (r.ok) { lastSaved = content; clearBackup(); } }).catch(function () {});
  }

  async function reload() {
    article = await App.api('/api/workspace/articles/' + articleId);
    renderMeta();
  }

  /* ---------- Actions ---------- */

  function validateComplete(content) {
    const errors = {};
    if (content.title.trim().length < 5) errors.title = 'Title must be at least 5 characters';
    if (content.summary.trim().length < 20) errors.summary = 'Summary must be at least 20 characters';
    if (content.body.trim().length < 100) errors.body = 'Article body must be at least 100 characters';
    if (!content.category) errors.category = 'Please choose a category';
    return errors;
  }

  submitBtn.addEventListener('click', async function () {
    formMessage.textContent = '';
    const errors = validateComplete(readForm());
    App.showFieldErrors(form, errors);
    if (Object.keys(errors).length) {
      formMessage.className = 'form-message error';
      formMessage.textContent = 'Please complete the article before sending it.';
      return;
    }
    submitBtn.disabled = true;
    try {
      await save();
      article = await App.api('/api/workspace/articles/' + articleId + '/status', { method: 'PATCH', body: { status: 'pending' } });
      renderMeta();
      clearBackup();
      formMessage.className = 'form-message success';
      formMessage.textContent = 'Sent! The editor will review your article.';
      App.toast('Article sent for approval', 'success');
    } catch (err) {
      formMessage.className = 'form-message error';
      formMessage.textContent = err.message;
      App.showFieldErrors(form, err.details);
    } finally {
      submitBtn.disabled = false;
    }
  });

  deleteBtn.addEventListener('click', async function () {
    if (deleteBtn.dataset.confirm !== 'yes') {
      deleteBtn.dataset.confirm = 'yes';
      deleteBtn.textContent = 'Click again to confirm';
      setTimeout(function () { deleteBtn.dataset.confirm = ''; deleteBtn.textContent = 'Delete draft'; }, 4000);
      return;
    }
    try {
      clearTimeout(timer);
      await App.api('/api/workspace/articles/' + articleId, { method: 'DELETE' });
      clearBackup();
      article = null;
      window.location.href = '/workspace';
    } catch (err) {
      App.toast(err.message, 'error');
    }
  });

  fileInput.addEventListener('change', function () {
    const file = fileInput.files[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type)) { App.toast('Please choose a PNG, JPEG, GIF or WEBP image', 'error'); return; }
    if (file.size > 2 * 1024 * 1024) { App.toast('Image must be smaller than 2MB', 'error'); return; }
    const reader = new FileReader();
    reader.onload = async function () {
      try {
        setSaveState('Uploading image…');
        const result = await App.api('/api/uploads', { method: 'POST', body: { dataUrl: reader.result } });
        form.elements.imageUrl.value = result.url;
        updateImagePreview();
        scheduleSave();
      } catch (err) {
        App.toast(err.message, 'error');
        setSaveState('');
      } finally {
        fileInput.value = '';
      }
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener('input', function (e) {
    if (e.target === fileInput) return;
    if (e.target.name === 'imageUrl') updateImagePreview();
    if (e.target.name === 'body') updateWordCount();
    scheduleSave();
  });
  form.addEventListener('change', scheduleSave);
  form.addEventListener('submit', function (e) { e.preventDefault(); });
  imagePreview.addEventListener('error', function () { imagePreview.classList.add('hidden'); });

  window.addEventListener('beforeunload', flushOnExit);
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'hidden') flushOnExit();
  });

  /* ---------- Start ---------- */
  async function init() {
    try {
      article = await App.api('/api/workspace/articles/' + articleId);
    } catch (err) {
      setSaveState(err.message, true);
      return;
    }
    fillForm(article.working);
    lastSaved = readForm();
    renderMeta();
    setSaveState(article.workingSavedAt ? 'Last saved ' + App.timeAgo(article.workingSavedAt) : '');

    // A local backup newer than the server copy means the last change did not reach the server
    const raw = App.storageGet(BACKUP_KEY);
    if (raw) {
      try {
        const backup = JSON.parse(raw);
        const serverTime = new Date(article.workingSavedAt).getTime();
        if (canEdit() && backup.at > serverTime && !sameContent(backup.content, lastSaved)) {
          fillForm(backup.content);
          App.toast('Restored changes that were not saved yet');
          save();
        } else {
          clearBackup();
        }
      } catch (err) {
        clearBackup();
      }
    }
  }

  init();
})();
