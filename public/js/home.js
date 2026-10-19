/* Home page: search, filters, sorting and infinite scroll - all with Ajax, no page reload */
'use strict';
(function () {
  const el = App.el;
  const form = document.getElementById('feed-controls');
  const feed = document.getElementById('feed');
  const loader = document.getElementById('feed-loader');
  const status = document.getElementById('feed-status');
  const empty = document.getElementById('feed-empty');
  const end = document.getElementById('feed-end');
  const retry = document.getElementById('feed-retry');

  const state = {
    page: window.FEED_STATE.page,
    hasMore: window.FEED_STATE.hasMore,
    loading: false,
    controller: null
  };

  function currentFilters() {
    return {
      q: form.elements.q.value.trim(),
      category: form.elements.category.value,
      viewed: form.elements.viewed.value,
      sort: form.elements.sort.value
    };
  }

  function queryString(filters, page) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(function ([key, value]) {
      if (value && !(key === 'viewed' && value === 'all') && !(key === 'sort' && value === 'date')) params.set(key, value);
    });
    if (page) params.set('page', page);
    return params.toString();
  }

  // Same markup as views/partials/article-card.ejs
  function card(item) {
    return el('article', { class: 'card' + (item.viewed ? ' is-viewed' : '') }, [
      el('a', { class: 'card-image', href: item.url, tabindex: '-1', 'aria-hidden': 'true' }, [
        el('img', { src: item.imageUrl, alt: '', loading: 'lazy', width: '400', height: '225' })
      ]),
      el('div', { class: 'card-body' }, [
        el('div', { class: 'card-meta' }, [
          el('a', { class: 'tag', href: '/?category=' + encodeURIComponent(item.category), text: item.category }),
          item.viewed ? el('span', { class: 'viewed-badge', text: 'Viewed' }) : null
        ]),
        el('h3', { class: 'card-title' }, [el('a', { href: item.url, text: item.title })]),
        el('p', { class: 'card-summary', text: item.summary }),
        el('p', { class: 'card-footer' }, [
          el('span', { text: 'By ' + item.author }),
          el('time', { datetime: item.publishedAt, text: App.formatDate(item.publishedAt) })
        ])
      ])
    ]);
  }

  function updateIndicators(total) {
    status.textContent = total === 1 ? '1 article' : total + ' articles';
    empty.classList.toggle('hidden', feed.children.length > 0);
    loader.classList.toggle('hidden', !state.hasMore);
    end.classList.toggle('hidden', state.hasMore || feed.children.length === 0);
  }

  async function load(reset) {
    if (state.loading && !reset) return;
    if (!reset && !state.hasMore) return;
    if (state.controller) state.controller.abort(); // a new search cancels the previous request
    state.controller = new AbortController();
    state.loading = true;
    retry.classList.add('hidden');

    const filters = currentFilters();
    const page = reset ? 1 : state.page + 1;
    if (reset) {
      loader.classList.remove('hidden');
      feed.setAttribute('aria-busy', 'true');
    }
    try {
      const data = await App.api('/api/articles?' + queryString(filters, page), { signal: state.controller.signal });
      if (reset) {
        feed.replaceChildren();
        window.scrollTo({ top: 0 });
      }
      data.items.forEach(function (item) { feed.appendChild(card(item)); });
      state.page = data.page;
      state.hasMore = data.hasMore;
      updateIndicators(data.total);
      state.loading = false;
      // If the page is still not filled, keep loading
      if (state.hasMore) requestAnimationFrame(checkLoaderVisible);
    } catch (err) {
      if (err.name === 'AbortError') return;
      state.loading = false;
      loader.classList.add('hidden');
      retry.classList.remove('hidden');
      App.toast(err.message, 'error');
    } finally {
      feed.removeAttribute('aria-busy');
    }
  }

  function applyFilters() {
    const qs = queryString(currentFilters());
    history.replaceState(null, '', qs ? '/?' + qs : '/');
    load(true);
  }

  function checkLoaderVisible() {
    const rect = loader.getBoundingClientRect();
    if (!loader.classList.contains('hidden') && rect.top < window.innerHeight + 400) load(false);
  }

  // Infinite scroll: when the loader gets close to the screen, fetch the next 20 articles
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(function (entries) {
      if (entries.some(function (e) { return e.isIntersecting; })) load(false);
    }, { rootMargin: '400px 0px' });
    observer.observe(loader);
  }
  // Fallback for browsers without IntersectionObserver (and a safety net when it is throttled)
  window.addEventListener('scroll', App.debounce(checkLoaderVisible, 150), { passive: true });

  form.addEventListener('submit', function (e) { e.preventDefault(); applyFilters(); });
  form.elements.q.addEventListener('input', App.debounce(applyFilters, 350));
  ['category', 'viewed', 'sort'].forEach(function (name) {
    form.elements[name].addEventListener('change', applyFilters);
  });
  retry.addEventListener('click', function () { load(feed.children.length === 0); });

  // Sidebar sections filter the feed without leaving the page
  document.querySelectorAll('.category-list a[data-category]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      form.elements.category.value = link.dataset.category;
      applyFilters();
    });
  });
})();
