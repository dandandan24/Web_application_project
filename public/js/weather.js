/* Sidebar weather widget - data comes from our server, which caches the external service */
'use strict';
(function () {
  const body = document.getElementById('weather-body');
  const select = document.getElementById('weather-city');
  if (!body || !select) return;

  const STORAGE_KEY = 'dw-weather-city';
  const REFRESH_MS = 10 * 60 * 1000;
  const el = App.el;
  let timer;

  function render(data) {
    body.replaceChildren(
      el('div', { class: 'weather-main' }, [
        el('span', { class: 'weather-icon', 'aria-hidden': 'true', text: data.icon }),
        el('div', {}, [
          el('div', { class: 'weather-temp', text: data.temperature + '°C' }),
          el('p', { class: 'weather-desc', text: data.description })
        ])
      ]),
      el('ul', { class: 'weather-details' }, [
        el('li', { text: 'Feels like ' + data.feelsLike + '°' }),
        data.min !== null ? el('li', { text: 'Low ' + data.min + '° / High ' + data.max + '°' }) : null,
        el('li', { text: 'Humidity ' + data.humidity + '%' }),
        el('li', { text: 'Wind ' + data.wind + ' km/h' })
      ]),
      el('p', { class: 'weather-updated muted', text: 'Updated ' + App.timeAgo(data.fetchedAt) + (data.stale ? ' (service temporarily unreachable)' : '') })
    );
  }

  async function load() {
    clearTimeout(timer);
    body.setAttribute('aria-busy', 'true');
    try {
      const data = await App.api('/api/weather?city=' + encodeURIComponent(select.value));
      render(data);
    } catch (err) {
      body.replaceChildren(el('p', { class: 'muted', text: 'Weather is not available right now. We will try again shortly.' }));
    } finally {
      body.removeAttribute('aria-busy');
      timer = setTimeout(load, REFRESH_MS);
    }
  }

  async function init() {
    try {
      const cities = await App.api('/api/weather/cities');
      select.replaceChildren.apply(select, cities.map(function (c) { return el('option', { value: c.key, text: c.name }); }));
      const saved = App.storageGet(STORAGE_KEY);
      if (saved && cities.some(function (c) { return c.key === saved; })) select.value = saved;
    } catch (err) {
      /* keep the default city */
    }
    load();
  }

  select.addEventListener('change', function () {
    App.storageSet(STORAGE_KEY, select.value);
    load();
  });

  init();
})();
