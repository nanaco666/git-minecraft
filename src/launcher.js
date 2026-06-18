/* Launcher — injects a game-picker bar above the contribution graph.
 * A game opens inline (replacing the graph in place); a ⛶ button promotes it to
 * a full-screen overlay by moving the live host node (state is preserved). */
(function () {
  'use strict';
  const GCA = window.GCA;
  if (!GCA) return;

  // current session: { game, controller, wrap, inlineWrap, inlineStage, host,
  //                    overlay, fullscreen, fsBtns: [] }
  let s = null;

  function mkBtn(txt, ghost) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'gca-btn' + (ghost ? ' ghost' : '');
    b.textContent = txt;
    return b;
  }

  function onKey(e) {
    if (e.key !== 'Escape' || !s) return;
    if (s.fullscreen) toggleFullscreen(); else closeSession();
  }

  function closeSession() {
    if (!s) return;
    if (s.controller && s.controller.destroy) s.controller.destroy();
    if (s.overlay) s.overlay.remove();
    if (s.inlineWrap) s.inlineWrap.remove();
    if (s.wrap) s.wrap.style.display = '';
    document.removeEventListener('keydown', onKey);
    s = null;
  }

  function toggleFullscreen() {
    if (!s) return;
    if (!s.fullscreen) {
      const overlay = document.createElement('div');
      overlay.className = 'gca-overlay';
      const head = document.createElement('div');
      head.className = 'gca-overlay-head';
      const title = document.createElement('div');
      title.className = 'gca-overlay-title';
      title.textContent = `${s.game.icon} ${s.game.label}`;
      const spacer = document.createElement('div'); spacer.style.flex = '1';
      const exitFs = mkBtn('⤢ 退出全屏', true);
      const close = mkBtn('✕ 关闭', true);
      exitFs.onclick = toggleFullscreen;
      close.onclick = closeSession;
      head.append(title, spacer, exitFs, close);
      const ostage = document.createElement('div');
      ostage.className = 'gca-stage';
      overlay.append(head, ostage);
      document.body.appendChild(overlay);
      ostage.appendChild(s.host); // move live node, preserve state
      s.overlay = overlay; s.fullscreen = true;
    } else {
      s.inlineStage.appendChild(s.host); // move back
      s.overlay.remove(); s.overlay = null; s.fullscreen = false;
    }
    if (s.controller && s.controller.fit) s.controller.fit();
  }

  function openGame(game) {
    const cells = GCA.extractCells();
    if (!cells || !cells.length) return;
    closeSession();

    const table = GCA.findCalendar();
    const wrap =
      (table && (table.closest('.js-yearly-contributions') || table.closest('.graph-before-activity-overview') || table.parentElement)) ||
      null;
    if (!wrap || !wrap.parentElement) return;

    const inlineWrap = document.createElement('div');
    inlineWrap.className = 'gca-inline-wrap';

    const toolbar = document.createElement('div');
    toolbar.className = 'gca-toolbar';
    const title = document.createElement('div');
    title.className = 'gca-toolbar-title';
    title.textContent = `${game.icon} ${game.label}`;
    const spacer = document.createElement('div'); spacer.style.flex = '1';
    const fsBtn = mkBtn('⛶ 全屏', true);
    const exitBtn = mkBtn('✕ 退出', true);
    fsBtn.onclick = toggleFullscreen;
    exitBtn.onclick = closeSession;
    toolbar.append(title, spacer, fsBtn, exitBtn);

    const inlineStage = document.createElement('div');
    inlineStage.className = 'gca-inline';
    const host = document.createElement('div');
    host.className = 'gca-game-host';
    inlineStage.appendChild(host);

    inlineWrap.append(toolbar, inlineStage);
    wrap.parentElement.insertBefore(inlineWrap, wrap);
    wrap.style.display = 'none';

    const controller = game.mount(host, cells, { onExit: closeSession });
    s = { game, controller, wrap, inlineWrap, inlineStage, host, overlay: null, fullscreen: false };
    document.addEventListener('keydown', onKey);
  }

  function injectBar() {
    const table = GCA.findCalendar();
    if (!table) return false;
    if (document.querySelector('.gca-launch-bar')) return true;
    const cells = GCA.extractCells(table);
    if (!cells || cells.length < 10) return false;
    if (!GCA.games || !GCA.games.length) return false;

    const wrap =
      table.closest('.js-yearly-contributions') ||
      table.closest('.graph-before-activity-overview') ||
      table.parentElement;

    const bar = document.createElement('div');
    bar.className = 'gca-launch-bar';
    const label = document.createElement('span');
    label.className = 'gca-launch-label';
    label.textContent = '🕹️ 把贡献图玩起来：';
    bar.appendChild(label);
    GCA.games.forEach((game) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gca-btn gca-launch-btn';
      btn.textContent = `${game.icon} ${game.label}`;
      btn.onclick = () => openGame(game);
      bar.appendChild(btn);
    });

    if (wrap && wrap.parentElement) wrap.parentElement.insertBefore(bar, wrap);
    else table.parentElement.insertBefore(bar, table);
    return true;
  }

  function boot() {
    if (injectBar()) return;
    let tries = 0;
    const iv = setInterval(() => { tries++; if (injectBar() || tries > 20) clearInterval(iv); }, 500);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  document.addEventListener('turbo:render', boot);
  document.addEventListener('pjax:end', boot);
})();
