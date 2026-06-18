/* GitHub Contribution Arcade — shared data layer
 *
 * Reads the contribution calendar straight out of the GitHub profile DOM
 * (no third-party API, no rate limits, no CORS — whoever's page you're on is
 * whose data you get). Every game consumes the same normalized cell list.
 *
 * A cell: { el, date:'YYYY-MM-DD', level:0..4, count:number|null, dow:0..6, week:int }
 *   - dow/week are grid coordinates; week is measured from the Sunday on/before
 *     the first date using floor() so a whole Sun–Sat week shares one column.
 */
(function () {
  'use strict';
  const DAY = 86400000;
  const GCA = (window.GCA = window.GCA || {});
  GCA.DAY = DAY;

  GCA.findCalendar = function () {
    return (
      document.querySelector('table.ContributionCalendar-grid') ||
      document.querySelector('.js-calendar-graph-table') ||
      document.querySelector('table.js-calendar-graph-table')
    );
  };

  // Best-effort contribution count for a day cell. GitHub keeps the number in a
  // <tool-tip> associated by id, or sometimes in data-count / aria-label.
  function readCount(el) {
    const direct = el.getAttribute('data-count');
    if (direct != null && direct !== '') return parseInt(direct, 10) || 0;
    const id = el.id;
    let text = '';
    if (id) {
      const tip = document.querySelector('tool-tip[for="' + id + '"]');
      if (tip) text = tip.textContent || '';
    }
    if (!text) text = el.getAttribute('aria-label') || '';
    if (!text) return null;
    if (/^\s*no contribution/i.test(text)) return 0;
    const m = text.match(/(\d[\d,]*)\s+contribution/i);
    return m ? parseInt(m[1].replace(/,/g, ''), 10) : null;
  }

  GCA.extractCells = function (table) {
    table = table || GCA.findCalendar();
    if (!table) return null;
    const dayEls = table.querySelectorAll(
      'td.ContributionCalendar-day[data-date], rect.ContributionCalendar-day[data-date], [data-date][data-level]'
    );
    const cells = [];
    dayEls.forEach((el) => {
      const date = el.getAttribute('data-date');
      if (!date) return;
      const d = new Date(date + 'T00:00:00');
      if (isNaN(d.getTime())) return;
      cells.push({
        el,
        date,
        time: d.getTime(),
        level: parseInt(el.getAttribute('data-level') || '0', 10) || 0,
        count: readCount(el),
        dow: d.getDay()
      });
    });
    if (!cells.length) return null;

    const minTime = Math.min.apply(null, cells.map((c) => c.time));
    const first = new Date(minTime);
    const firstSunday = new Date(first);
    firstSunday.setDate(first.getDate() - first.getDay());
    const base = firstSunday.getTime();
    cells.forEach((c) => { c.week = Math.floor((c.time - base) / (7 * DAY)); });
    return cells;
  };

  GCA.weeks = function (cells) {
    return cells.reduce((m, c) => (c.week > m ? c.week : m), 0) + 1;
  };

  // Total contributions, if counts were available. Falls back to null.
  GCA.totalContributions = function (cells) {
    let total = 0, any = false;
    cells.forEach((c) => { if (c.count != null) { total += c.count; any = true; } });
    return any ? total : null;
  };

  // --- game registry: each game self-registers; the launcher builds buttons ---
  GCA.games = GCA.games || [];
  GCA.registerGame = function (def) {
    // def: { id, label, icon, mount(host, cells, { onExit }) -> { destroy } }
    GCA.games.push(def);
  };
})();
