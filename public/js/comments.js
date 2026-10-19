/* Comments moderation (editors) - list, edit inline, delete */
'use strict';
(function () {
  const el = App.el;
  const list = document.getElementById('mod-list');
  const empty = document.getElementById('mod-empty');
  const more = document.getElementById('mod-more');
  let page = 0;

  function item(c) {
    const bodyP = el('p', { class: 'comment-body', text: c.body });
    const li = el('li', { class: 'comment' }, [
      el('p', { class: 'comment-source muted' }, ['On: ', el('a', { href: '/articles/' + c.article + '#comments', text: c.articleTitle })]),
      el('p', { class: 'comment-head' }, [
        el('strong', { text: c.authorName }),
        c.isStaff ? el('span', { class: 'staff-badge', text: 'Staff' }) : null,
        el('time', { datetime: c.createdAt, text: App.formatDateTime(c.createdAt) })
      ]),
      bodyP
    ]);

    const editBtn = el('button', { type: 'button', class: 'btn btn-small btn-ghost', text: 'Edit' });
    const delBtn = el('button', { type: 'button', class: 'btn btn-small btn-danger btn-ghost', text: 'Delete' });
    const tools = el('div', { class: 'comment-tools' }, [editBtn, delBtn]);
    li.appendChild(tools);

    editBtn.addEventListener('click', function () {
      const textarea = el('textarea', { rows: '3', maxlength: '1000' });
      textarea.value = c.body;
      const save = el('button', { type: 'button', class: 'btn btn-small', text: 'Save' });
      const cancel = el('button', { type: 'button', class: 'btn btn-small btn-ghost', text: 'Cancel' });
      const editor = el('div', {}, [textarea, el('div', { class: 'comment-tools' }, [save, cancel])]);
      bodyP.replaceWith(editor);
      tools.classList.add('hidden');
      cancel.addEventListener('click', function () { editor.replaceWith(bodyP); tools.classList.remove('hidden'); });
      save.addEventListener('click', async function () {
        save.disabled = true;
        try {
          const updated = await App.api('/api/comments/' + c.id, { method: 'PUT', body: { body: textarea.value } });
          c.body = updated.body;
          bodyP.textContent = updated.body;
          editor.replaceWith(bodyP);
          tools.classList.remove('hidden');
          App.toast('Comment updated', 'success');
        } catch (err) {
          save.disabled = false;
          App.toast(err.message, 'error');
        }
      });
    });

    delBtn.addEventListener('click', async function () {
      delBtn.disabled = true;
      try {
        await App.api('/api/comments/' + c.id, { method: 'DELETE' });
        li.remove();
        empty.classList.toggle('hidden', list.children.length > 0);
        App.toast('Comment deleted', 'success');
      } catch (err) {
        delBtn.disabled = false;
        App.toast(err.message, 'error');
      }
    });
    return li;
  }

  async function load() {
    more.disabled = true;
    try {
      const data = await App.api('/api/comments?page=' + (page + 1));
      page = data.page;
      data.items.forEach(function (c) { list.appendChild(item(c)); });
      more.classList.toggle('hidden', !data.hasMore);
      empty.classList.toggle('hidden', list.children.length > 0);
    } catch (err) {
      App.toast(err.message, 'error');
    } finally {
      more.disabled = false;
    }
  }

  more.addEventListener('click', load);
  load();
})();
