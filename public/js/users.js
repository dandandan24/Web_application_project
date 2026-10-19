/* Users management (editors only) - full CRUD with Ajax */
'use strict';
(function () {
  const el = App.el;
  const form = document.getElementById('user-form');
  const rows = document.getElementById('user-rows');
  const search = document.getElementById('user-search');
  const message = document.getElementById('user-message');
  const submitBtn = document.getElementById('user-submit');
  const cancelBtn = document.getElementById('user-cancel');
  const formTitle = document.getElementById('user-form-title');
  const passwordLabel = document.getElementById('u-password-label');
  const f = form.elements;

  function resetForm() {
    form.reset();
    f.id.value = '';
    f.username.disabled = false;
    formTitle.textContent = 'Add a user';
    submitBtn.textContent = 'Create user';
    passwordLabel.textContent = 'Password';
    cancelBtn.classList.add('hidden');
    App.showFieldErrors(form, null);
  }

  function startEdit(user) {
    f.id.value = user.id;
    f.username.value = user.username;
    f.username.disabled = true;
    f.displayName.value = user.displayName;
    f.role.value = user.role;
    f.password.value = '';
    formTitle.textContent = 'Edit ' + user.displayName;
    submitBtn.textContent = 'Save changes';
    passwordLabel.textContent = 'New password (leave empty to keep)';
    cancelBtn.classList.remove('hidden');
    message.textContent = '';
    f.displayName.focus();
  }

  function row(user) {
    const editBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', text: 'Edit' });
    editBtn.addEventListener('click', function () { startEdit(user); });
    const delBtn = el('button', { type: 'button', class: 'btn btn-small btn-danger btn-ghost', text: 'Delete', disabled: user.id === window.CURRENT_USER_ID });
    delBtn.addEventListener('click', async function () {
      if (delBtn.dataset.confirm !== 'yes') {
        delBtn.dataset.confirm = 'yes';
        delBtn.textContent = 'Confirm?';
        setTimeout(function () { delBtn.dataset.confirm = ''; delBtn.textContent = 'Delete'; }, 4000);
        return;
      }
      try {
        await App.api('/api/users/' + user.id, { method: 'DELETE' });
        App.toast('User deleted', 'success');
        load();
      } catch (err) {
        App.toast(err.message, 'error');
      }
    });
    return el('tr', {}, [
      el('td', { text: user.displayName }),
      el('td', { text: user.username }),
      el('td', { text: user.role === 'editor' ? 'Editor' : 'Reporter' }),
      el('td', { class: 'num', text: String(user.articleCount) }),
      el('td', { text: user.lastLoginAt ? App.formatDateTime(user.lastLoginAt) : 'Never' }),
      el('td', {}, [el('div', { class: 'row-actions' }, [editBtn, delBtn])])
    ]);
  }

  async function load() {
    const q = search.value.trim();
    try {
      const data = await App.api('/api/users' + (q ? '?q=' + encodeURIComponent(q) : ''));
      rows.replaceChildren.apply(rows, data.items.map(row));
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const id = f.id.value;
    const payload = { displayName: f.displayName.value.trim(), role: f.role.value };
    if (!id) payload.username = f.username.value.trim().toLowerCase();
    if (f.password.value) payload.password = f.password.value;

    const errors = {};
    if (!id && !/^[a-z0-9_.-]{3,30}$/.test(payload.username)) errors.username = 'Use 3-30 lowercase letters, digits, . _ -';
    if (payload.displayName.length < 2) errors.displayName = 'Display name is too short';
    if ((!id || payload.password) && (!payload.password || payload.password.length < 6)) errors.password = 'Password must be at least 6 characters';
    App.showFieldErrors(form, errors);
    message.textContent = '';
    if (Object.keys(errors).length) return;

    submitBtn.disabled = true;
    try {
      await App.api(id ? '/api/users/' + id : '/api/users', { method: id ? 'PUT' : 'POST', body: payload });
      App.toast(id ? 'User updated' : 'User created', 'success');
      resetForm();
      load();
    } catch (err) {
      message.className = 'form-message error';
      message.textContent = err.message;
      App.showFieldErrors(form, err.details);
    } finally {
      submitBtn.disabled = false;
    }
  });

  cancelBtn.addEventListener('click', resetForm);
  search.addEventListener('input', App.debounce(load, 300));
  load();
})();
