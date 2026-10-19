'use strict';
(function () {
  const form = document.getElementById('login-form');
  const message = document.getElementById('login-message');

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const username = form.elements.username.value.trim();
    const password = form.elements.password.value;
    message.className = 'form-message error';
    if (!username || !password) {
      message.textContent = 'Please enter username and password';
      return;
    }
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    message.textContent = '';
    try {
      const result = await App.api('/api/auth/login', { method: 'POST', body: { username, password, next: form.elements.next.value } });
      message.className = 'form-message success';
      message.textContent = 'Welcome, ' + result.user.displayName + '!';
      window.location.href = result.redirect;
    } catch (err) {
      message.textContent = err.message;
      form.elements.password.value = '';
      form.elements.password.focus();
      button.disabled = false;
    }
  });
})();
