/* Article page: comments are loaded and added with Ajax */
'use strict';
(function () {
  const el = App.el;
  const section = document.getElementById('comments');
  if (!section) return;
  const articleId = section.dataset.article;
  const form = document.getElementById('comment-form');
  const list = document.getElementById('comment-list');
  const count = document.getElementById('comment-count');
  const noComments = document.getElementById('no-comments');
  const message = document.getElementById('comment-message');
  const chars = document.getElementById('comment-chars');
  const moreBtn = document.getElementById('more-comments');
  let page = 1;

  function commentNode(c, isNew) {
    const li = el('li', { class: 'comment' + (isNew ? ' is-new' : ''), dataset: { id: c.id } }, [
      el('p', { class: 'comment-head' }, [
        el('strong', { text: c.authorName }),
        c.isStaff ? el('span', { class: 'staff-badge', text: 'Staff' }) : null,
        el('time', { datetime: c.createdAt, text: App.formatDateTime(c.createdAt) })
      ]),
      el('p', { class: 'comment-body', text: c.body })
    ]);
    if (window.IS_EDITOR) addModeration(li);
    return li;
  }

  // Editors get delete buttons (the server checks the role again)
  function addModeration(li) {
    if (li.querySelector('.comment-tools')) return;
    const del = el('button', { type: 'button', class: 'btn btn-small btn-danger btn-ghost', text: 'Delete' });
    del.addEventListener('click', async function () {
      del.disabled = true;
      try {
        await App.api('/api/comments/' + li.dataset.id, { method: 'DELETE' });
        li.remove();
        count.textContent = Math.max(0, Number(count.textContent) - 1);
        noComments.classList.toggle('hidden', list.children.length > 0);
        App.toast('Comment deleted', 'success');
      } catch (err) {
        del.disabled = false;
        App.toast(err.message, 'error');
      }
    });
    li.appendChild(el('div', { class: 'comment-tools' }, [del]));
  }

  if (window.IS_EDITOR) list.querySelectorAll('.comment').forEach(addModeration);

  form.elements.body.addEventListener('input', function () {
    chars.textContent = form.elements.body.value.length;
  });

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const payload = { body: form.elements.body.value.trim() };
    if (form.elements.authorName) payload.authorName = form.elements.authorName.value.trim();

    // Client-side validation (the server validates again)
    const errors = {};
    if (form.elements.authorName && payload.authorName.length < 2) errors.authorName = 'Please enter your name (at least 2 characters)';
    if (payload.body.length < 2) errors.body = 'Comment is too short';
    App.showFieldErrors(form, errors);
    message.textContent = '';
    if (Object.keys(errors).length) return;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const comment = await App.api('/api/articles/' + articleId + '/comments', { method: 'POST', body: payload });
      // Show the new comment immediately, without reloading the list
      list.insertBefore(commentNode(comment, true), list.firstChild);
      count.textContent = Number(count.textContent) + 1;
      noComments.classList.add('hidden');
      form.elements.body.value = '';
      chars.textContent = '0';
      message.className = 'form-message success';
      message.textContent = 'Thank you! Your comment was published.';
    } catch (err) {
      message.className = 'form-message error';
      message.textContent = err.message;
      App.showFieldErrors(form, err.details && err.status === 400 ? err.details : null);
    } finally {
      button.disabled = false;
    }
  });

  if (moreBtn) {
    moreBtn.addEventListener('click', async function () {
      moreBtn.disabled = true;
      try {
        const data = await App.api('/api/articles/' + articleId + '/comments?page=' + (page + 1));
        page = data.page;
        const existing = new Set(Array.from(list.children).map(function (li) { return li.dataset.id; }));
        data.items.forEach(function (c) { if (!existing.has(c.id)) list.appendChild(commentNode(c)); });
        moreBtn.classList.toggle('hidden', !data.hasMore);
      } catch (err) {
        App.toast(err.message, 'error');
      } finally {
        moreBtn.disabled = false;
      }
    });
  }
})();
