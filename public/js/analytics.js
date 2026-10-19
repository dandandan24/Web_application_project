/* Impact analytics - views over time with publication / update markers (Chart.js) */
'use strict';
(function () {
  const el = App.el;
  const pickerList = document.getElementById('picker-list');
  const pickerSearch = document.getElementById('picker-search');
  const rangeSelect = document.getElementById('range');
  const intervalSelect = document.getElementById('interval');
  const title = document.getElementById('chart-title');
  const summary = document.getElementById('chart-summary');
  const placeholder = document.getElementById('chart-placeholder');
  const impactTable = document.getElementById('impact-table');
  const impactRows = document.getElementById('impact-rows');
  const canvas = document.getElementById('views-chart');

  let selectedId = document.getElementById('main').dataset.selected || null;
  let chart = null;
  let markers = [];

  function formatLabel(iso, interval) {
    const d = new Date(iso);
    if (interval === 'day') return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  // Chart.js plugin that draws a dashed vertical line at every publication time
  const publishMarkers = {
    id: 'publishMarkers',
    afterDatasetsDraw: function (c) {
      const xScale = c.scales.x;
      const area = c.chartArea;
      const ctx = c.ctx;
      markers.forEach(function (m, index) {
        const x = xScale.getPixelForValue(m.position);
        if (Number.isNaN(x) || x < area.left - 1 || x > area.right + 1) return;
        ctx.save();
        ctx.strokeStyle = '#b3141b';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(x, area.top);
        ctx.lineTo(x, area.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#b3141b';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = x > area.right - 70 ? 'right' : 'left';
        // Labels are staggered on 3 rows so close updates do not overlap
        ctx.fillText(m.label, x + (ctx.textAlign === 'right' ? -4 : 4), area.top + 12 + (index % 3) * 14);
        ctx.restore();
      });
    }
  };

  function drawChart(data) {
    const step = data.interval === 'day' ? 24 * 3600 * 1000 : 3600 * 1000;
    const start = new Date(data.points.length ? data.points[0].t : data.from).getTime();
    // Marker position on the category axis (fractional index between two points)
    markers = data.events.map(function (e) {
      return {
        position: (new Date(e.at).getTime() - start) / step,
        label: e.isFirstPublish ? 'Published' : 'v' + e.version
      };
    });

    const config = {
      type: 'line',
      data: {
        labels: data.points.map(function (p) { return formatLabel(p.t, data.interval); }),
        datasets: [{
          label: data.interval === 'day' ? 'Views per day' : 'Views per hour',
          data: data.points.map(function (p) { return p.views; }),
          borderColor: '#1d5fa8',
          backgroundColor: 'rgba(29, 95, 168, 0.12)',
          fill: true,
          tension: 0.15,
          pointRadius: data.points.length > 80 ? 0 : 2,
          pointHoverRadius: 4,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        interaction: { mode: 'index', intersect: false },
        scales: {
          x: { type: 'linear', min: 0, max: Math.max(1, data.points.length - 1),
            title: { display: true, text: 'Time' },
            ticks: { maxTicksLimit: 10, callback: function (value) {
              const point = data.points[Math.round(value)];
              return point ? formatLabel(point.t, data.interval) : '';
            } } },
          y: { beginAtZero: true, title: { display: true, text: 'Views' }, ticks: { precision: 0 } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: {
            title: function (items) { const p = data.points[Math.round(items[0].parsed.x)]; return p ? formatLabel(p.t, data.interval) : ''; }
          } }
        }
      },
      plugins: [publishMarkers]
    };
    // Linear x axis, so data is given as {x, y}
    config.data.datasets[0].data = data.points.map(function (p, i) { return { x: i, y: p.views }; });

    if (chart) chart.destroy();
    chart = new Chart(canvas, config);
  }

  function renderImpact(events) {
    impactTable.classList.toggle('hidden', events.length === 0);
    impactRows.replaceChildren.apply(impactRows, events.map(function (e) {
      let change = '—';
      let cls = '';
      if (e.changePct !== null) {
        change = (e.changePct > 0 ? '+' : '') + e.changePct + '%';
        cls = e.changePct >= 0 ? 'change-up' : 'change-down';
      }
      return el('tr', {}, [
        el('td', { text: App.formatDateTime(e.at) }),
        el('td', { text: e.isFirstPublish ? 'First publication' : 'Update v' + e.version }),
        el('td', { class: 'num', text: String(e.avgBefore) }),
        el('td', { class: 'num', text: String(e.avgAfter) }),
        el('td', { class: 'num ' + cls, text: change })
      ]);
    }));
  }

  async function loadStats() {
    if (!selectedId) return;
    const params = new URLSearchParams({ range: rangeSelect.value });
    if (intervalSelect.value) params.set('interval', intervalSelect.value);
    try {
      const data = await App.api('/api/stats/articles/' + selectedId + '?' + params);
      title.textContent = data.article.title;
      summary.textContent = data.totalInRange.toLocaleString() + ' views in this range · ' +
        data.article.viewCount.toLocaleString() + ' total · ' + data.article.totalUpdates + ' update(s) after publication';
      placeholder.classList.add('hidden');
      drawChart(data);
      renderImpact(data.events);
      history.replaceState(null, '', '/editor/analytics?article=' + selectedId);
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  async function loadPicker() {
    const q = pickerSearch.value.trim();
    try {
      const data = await App.api('/api/stats/articles?limit=40' + (q ? '&q=' + encodeURIComponent(q) : ''));
      pickerList.replaceChildren.apply(pickerList, data.items.map(function (item) {
        const btn = el('button', { type: 'button', class: item.id === selectedId ? 'active' : '' }, [
          el('span', { text: item.title }),
          el('small', { text: item.viewCount.toLocaleString() + ' views · ' + item.updates + ' update(s) · ' + item.category })
        ]);
        btn.addEventListener('click', function () {
          selectedId = item.id;
          pickerList.querySelectorAll('button').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          loadStats();
        });
        return el('li', {}, [btn]);
      }));
      if (!data.items.length) pickerList.replaceChildren(el('li', { class: 'muted', text: 'No published articles found' }));
    } catch (err) {
      App.toast(err.message, 'error');
    }
  }

  pickerSearch.addEventListener('input', App.debounce(loadPicker, 300));
  rangeSelect.addEventListener('change', loadStats);
  intervalSelect.addEventListener('change', loadStats);

  loadPicker();
  loadStats();
})();
