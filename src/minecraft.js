/* Minecraft mineshaft world — free-rotating voxel view (lightweight, no deps).
 * Each day is a soil column; the busier the day the deeper it's dug, so its top
 * face sinks lower and exposes a deeper ore. Drag to orbit 360°, scroll to zoom.
 * No-contribution days stay at the surface (grass), forming the horizon. */
(function () {
  'use strict';

  const STRATA = [
    { name: '草地', top: '#7cb342', side: '#5f8f2e', score: 0 },
    { name: '泥土', top: '#9c6b4f', side: '#7a5238', score: 1 },
    { name: '石头', top: '#aab4ba', side: '#828d93', score: 2 },
    { name: '铁矿', top: '#c79a72', side: '#9c7649', score: 6 },
    { name: '金矿', top: '#ffd54f', side: '#e0a200', glow: '#ffe082', score: 20 },
    { name: '岩浆', top: '#ff7a3c', side: '#e2400f', glow: '#ffb74d', score: 60 }
  ];
  const MINED = { name: '已采', top: '#3a3a3a', side: '#2c2c2c', score: 0 }; // emptied cell
  const DEPTH = [0, 1, 2, 3, 5]; // level → layers dug down
  const BASE = 5;                // total soil thickness
  const LY = 0.82;               // world height per layer (x,z spacing = 1)

  function shade(hex, amt) {
    if (!amt) return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + r * amt));
    g = Math.max(0, Math.min(255, g + g * amt));
    b = Math.max(0, Math.min(255, b + b * amt));
    return `rgb(${r | 0},${g | 0},${b | 0})`;
  }
  function easeOut(p) { return 1 - Math.pow(1 - p, 3); }

  function mount(host, cells, opts) {
    void opts;
    host.innerHTML = '';
    host.classList.add('gmc-host');
    const canvas = document.createElement('canvas');
    canvas.className = 'gmc-canvas';
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const legend = document.createElement('div');
    legend.className = 'gmc-legend';
    legend.innerHTML = '<b>越忙挖越深</b>' +
      '<div class="row"><span class="sw" style="background:#7cb342"></span>0 地表</div>' +
      '<div class="row"><span class="sw" style="background:#aab4ba"></span>1–2 泥/石</div>' +
      '<div class="row"><span class="sw" style="background:#c79a72"></span>3 铁矿</div>' +
      '<div class="row"><span class="sw" style="background:#ff7a3c"></span>4 直达岩浆</div>';
    host.appendChild(legend);

    const bar = document.createElement('div');
    bar.className = 'gmc-bar';
    const mkBtn = (txt, title) => { const b = document.createElement('button'); b.className = 'gca-btn ghost'; b.textContent = txt; b.title = title; return b; };
    const bRotL = mkBtn('⟲', '向左转'), bRotR = mkBtn('⟳', '向右转');
    const bZin = mkBtn('＋', '放大'), bZout = mkBtn('－', '缩小'), bReset = mkBtn('⌂', '重置视角');
    const bShot = document.createElement('button'); bShot.className = 'gca-btn'; bShot.textContent = '📸 截图分享';
    bar.append(bRotL, bRotR, bZin, bZout, bReset, bShot);
    host.appendChild(bar);
    const tip = document.createElement('div'); tip.className = 'gmc-tip'; host.appendChild(tip);

    const loot = document.createElement('div'); loot.className = 'gmc-loot';
    host.appendChild(loot);
    function renderLoot(hl) {
      const order = ['泥土', '石头', '铁矿', '金矿', '岩浆'];
      const have = order.filter((n) => state.loot[n]);
      if (!have.length) { loot.innerHTML = '<b>🎒 战利品</b><div class="hint">开挖中…</div>'; return; }
      const colorOf = (n) => (STRATA.find((s) => s.name === n) || MINED).top;
      let rows = '';
      have.forEach((n) => {
        rows += `<div class="row${n === hl ? ' pop' : ''}"><span class="sw" style="background:${colorOf(n)}"></span><span class="nm">${n}</span><span class="n">${state.loot[n]}</span></div>`;
      });
      loot.innerHTML = `<b>🎒 战利品</b>${rows}<div class="score${hl ? ' pop' : ''}">⭐ ${state.score}</div>`;
    }

    const weeks = cells.reduce((m, c) => (c.week > m ? c.week : m), 0) + 1;
    const user = (location.pathname.split('/')[1] || 'github').replace(/[^\w.-]/g, '') || 'github';
    const total = (window.GCA.totalContributions && window.GCA.totalContributions(cells));

    const DEF = { yaw: Math.PI / 4 };
    const PITCH = { core: 0.4, pit: 0.6 }; // core needs a lower angle to reveal the columns
    const state = {
      cells: cells.map((c) => ({ x: c.week, z: c.dow, level: c.level, count: c.count, date: c.date })),
      yaw: DEF.yaw, pitch: PITCH.core, S: 14, panX: 0, panY: 0, anim: 0, animStart: 0,
      mode: 'core', // 'core' = solid ore columns, 'pit' = dug-out holes
      mined: new Set(), loot: {}, score: 0, fx: [] // collection system
    };
    const C = { x: (weeks - 1) / 2, z: 3, y: -BASE * LY / 2 };

    let DPR = Math.min(window.devicePixelRatio || 1, 2);
    function W() { return host.clientWidth || 800; }
    function H() { return host.clientHeight || 500; }

    // orthographic projection with yaw (about vertical) + pitch (tilt)
    function project(wx, wy, wz, S) {
      const x = wx - C.x, z = wz - C.z, y = wy - C.y;
      const cy = Math.cos(state.yaw), sy = Math.sin(state.yaw);
      const X = x * cy - z * sy, Z = x * sy + z * cy;
      const cp = Math.cos(state.pitch), sp = Math.sin(state.pitch);
      const Y = y * cp - Z * sp;
      const depth = y * sp + Z * cp;
      return { sx: X * S, sy: -Y * S, depth };
    }

    function resize() {
      DPR = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(W() * DPR); canvas.height = Math.floor(H() * DPR);
      canvas.style.width = W() + 'px'; canvas.style.height = H() + 'px';
      draw();
    }

    // fit zoom so the whole world fits the viewport at the current orientation
    function fitView() {
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const c of state.cells) {
        for (const dx of [-0.5, 0.5]) for (const dz of [-0.5, 0.5]) for (const wy of [0, -BASE * LY]) {
          const p = project(c.x + dx, wy, c.z + dz, 1);
          if (p.sx < minX) minX = p.sx; if (p.sx > maxX) maxX = p.sx;
          if (p.sy < minY) minY = p.sy; if (p.sy > maxY) maxY = p.sy;
        }
      }
      const w = maxX - minX || 1, h = maxY - minY || 1;
      state.S = Math.max(3, Math.min(40, Math.min(W() * 0.9 / w, (H() - 110) * 0.92 / h)));
      state.panX = 0; state.panY = 0;
    }

    function quad(p1, p2, p3, p4, fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.moveTo(p1.sx, p1.sy); ctx.lineTo(p2.sx, p2.sy); ctx.lineTo(p3.sx, p3.sy); ctx.lineTo(p4.sx, p4.sy);
      ctx.closePath(); ctx.fill();
    }

    function strataAt(layer) {
      return STRATA[Math.max(0, Math.min(STRATA.length - 1, Math.round(layer)))];
    }

    function draw() {
      const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
      g.addColorStop(0, '#4a90d9'); g.addColorStop(0.55, '#8fc1e8'); g.addColorStop(1, '#cfe8c5');
      ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!state.cells.length) return;
      const S = state.S, core = state.mode === 'core';

      const faces = [];
      const maxD = state.cells.reduce((m, c) => Math.max(m, c.x + c.z), 1);
      for (const c of state.cells) {
        const local = state.anim >= 1 ? 1 : Math.max(0, Math.min(1, (state.anim - (c.x + c.z) / (maxD + 1) * 0.5) / 0.5));
        const dug = DEPTH[c.level] * easeOut(local);
        // core: solid column from surface (0) down to -dug; pit: remaining block
        const yT = core ? 0 : -dug * LY;
        const yB = core ? -dug * LY : -BASE * LY;
        const sideTop = core ? 0 : dug;     // strata layer at the face's top edge
        const sideBot = core ? dug : BASE;  // ...and bottom edge
        const isMined = state.mined.has(c);
        const topStrat = core ? STRATA[0] : (isMined ? MINED : strataAt(dug)); // grass cap vs exposed ore
        const botStrat = core ? (isMined ? MINED : strataAt(dug)) : null;      // column's deepest ore (faces down)
        const x0 = c.x - 0.5, x1 = c.x + 0.5, z0 = c.z - 0.5, z1 = c.z + 0.5;
        const T = [project(x0, yT, z0, S), project(x1, yT, z0, S), project(x1, yT, z1, S), project(x0, yT, z1, S)];
        const B = [project(x0, yB, z0, S), project(x1, yB, z0, S), project(x1, yB, z1, S), project(x0, yB, z1, S)];
        const avg = (a) => a.reduce((s, p) => s + p.depth, 0) / a.length;
        faces.push({ pts: T, depth: avg(T), kind: 'top', color: topStrat.top, glow: core ? null : topStrat.glow });
        if (Math.abs(yT - yB) > 0.001) {
          const sd = [[T[0], T[1], B[1], B[0], 0], [T[1], T[2], B[2], B[1], -0.12], [T[2], T[3], B[3], B[2], -0.22], [T[3], T[0], B[0], B[3], -0.12]];
          for (const s of sd) faces.push({ pts: [s[0], s[1], s[2], s[3]], depth: avg([s[0], s[1], s[2], s[3]]), kind: 'side', sideTop, sideBot, sh: s[4] });
          if (botStrat) faces.push({ pts: [B[3], B[2], B[1], B[0]], depth: avg(B), kind: 'top', color: botStrat.top, glow: botStrat.glow });
        }
      }
      faces.sort((a, b) => a.depth - b.depth);

      ctx.save();
      ctx.scale(DPR, DPR);
      ctx.translate(W() / 2 + state.panX, H() / 2 + state.panY);
      for (const f of faces) {
        if (f.kind === 'top') {
          if (f.glow) { ctx.save(); ctx.shadowColor = f.glow; ctx.shadowBlur = 14; }
          quad(f.pts[0], f.pts[1], f.pts[2], f.pts[3], f.color);
          if (f.glow) ctx.restore();
        } else {
          const top = f.pts[0], bot = f.pts[3];
          const grd = ctx.createLinearGradient(top.sx, top.sy, bot.sx, bot.sy);
          for (let L = 0; L <= 6; L++) {
            const layer = f.sideTop + (f.sideBot - f.sideTop) * L / 6;
            grd.addColorStop(L / 6, shade(strataAt(layer).side, f.sh));
          }
          quad(f.pts[0], f.pts[1], f.pts[2], f.pts[3], grd);
        }
      }
      ctx.restore();
      drawFx();
    }

    // flying loot bits in screen space (coin-pickup feel)
    function drawFx() {
      if (!state.fx.length) return;
      ctx.save(); ctx.scale(DPR, DPR);
      for (const f of state.fx) {
        const e = easeOut(Math.min(1, f.t));
        const x = f.x0 + (f.x1 - f.x0) * e;
        const y = f.y0 + (f.y1 - f.y0) * e - Math.sin(Math.PI * Math.min(1, f.t)) * 42;
        ctx.globalAlpha = f.t < 0.7 ? 1 : Math.max(0, 1 - (f.t - 0.7) / 0.3);
        const sz = f.big ? 12 : 9;
        if (f.glow) { ctx.shadowColor = f.glow; ctx.shadowBlur = 12; }
        ctx.fillStyle = f.color; ctx.fillRect(x - sz / 2, y - sz / 2, sz, sz);
        ctx.shadowBlur = 0;
        ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x - sz / 2, y - sz / 2, sz, sz);
        ctx.fillStyle = '#fff'; ctx.font = `700 ${f.big ? 15 : 12}px -apple-system, sans-serif`; ctx.textBaseline = 'middle';
        ctx.fillText(f.text, x + sz, y);
      }
      ctx.globalAlpha = 1; ctx.restore();
    }

    let rafId = 0, running = false, lastT = 0;
    function ensureLoop() { if (running) return; running = true; lastT = performance.now(); rafId = requestAnimationFrame(tick); }
    function tick(now) {
      const dt = Math.min(64, now - lastT) / 1000; lastT = now;
      if (state.anim < 1) state.anim = Math.min(1, (now - state.animStart) / 1100);
      // auto-mine: once the shafts are dug, harvest the ore cell-by-cell
      if (state.anim >= 1 && state.queue.length) {
        const n = Math.min(4, state.queue.length);
        let last;
        for (let i = 0; i < n; i++) { const nm = mineOne(state.queue.shift()); if (nm) last = nm; }
        if (last) renderLoot(last);
      }
      if (state.fx.length) { for (const f of state.fx) f.t += dt / f.dur; state.fx = state.fx.filter((f) => f.t < 1); }
      draw();
      if (state.anim < 1 || state.queue.length || state.fx.length) rafId = requestAnimationFrame(tick);
      else running = false;
    }
    function startAnim() { state.anim = 0; state.animStart = performance.now(); ensureLoop(); }

    // harvest one cell: tally loot + fling a coin toward the panel (no render)
    function mineOne(cell) {
      if (!cell || cell.level === 0 || state.mined.has(cell)) return null;
      const mine = strataAt(DEPTH[cell.level]);
      const amount = Math.max(1, cell.count != null ? cell.count : cell.level);
      state.mined.add(cell);
      state.loot[mine.name] = (state.loot[mine.name] || 0) + amount;
      state.score += mine.score * amount;
      const topY = state.mode === 'core' ? 0 : -DEPTH[cell.level] * LY;
      const p = project(cell.x, topY, cell.z, state.S);
      state.fx.push({
        x0: W() / 2 + state.panX + p.sx, y0: H() / 2 + state.panY + p.sy,
        x1: W() - 64, y1: 58, t: 0, dur: 0.7,
        color: mine.top, glow: mine.glow, big: !!mine.glow, text: '+' + amount
      });
      return mine.name;
    }

    function hitTest(mx, my) {
      const S = state.S, ox = W() / 2 + state.panX, oy = H() / 2 + state.panY;
      let best = null, bestD = -1e9;
      for (const c of state.cells) {
        const topY = state.mode === 'core' ? 0 : -DEPTH[c.level] * LY;
        const p = project(c.x, topY, c.z, S);
        const dx = mx - (ox + p.sx), dy = my - (oy + p.sy);
        if (dx * dx + dy * dy < (S * 0.6) * (S * 0.6) && p.depth > bestD) { bestD = p.depth; best = c; }
      }
      return best;
    }

    let dragging = false, lastX = 0, lastY = 0, downLX = 0, downLY = 0, moved = false;
    function onDown(e) {
      dragging = true; moved = false; lastX = e.clientX; lastY = e.clientY;
      const r = canvas.getBoundingClientRect(); downLX = e.clientX - r.left; downLY = e.clientY - r.top;
    }
    function onUp() { dragging = false; } // mining is automatic; drag only orbits
    function onMove(e) {
      const rect = canvas.getBoundingClientRect();
      const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
      if (dragging) {
        const dx = e.clientX - lastX, dy = e.clientY - lastY;
        if (Math.abs(dx) + Math.abs(dy) > 2) moved = true;
        state.yaw += dx * 0.01;
        state.pitch = Math.max(0.15, Math.min(1.45, state.pitch + dy * 0.008));
        lastX = e.clientX; lastY = e.clientY; tip.style.display = 'none'; draw();
        return;
      }
      const hit = hitTest(lx, ly);
      if (hit) {
        const mine = STRATA[Math.min(DEPTH[hit.level], STRATA.length - 1)].name;
        tip.style.display = 'block'; tip.style.left = lx + 'px'; tip.style.top = ly + 'px';
        tip.textContent = hit.count != null ? `${hit.date} · ${hit.count}次 · 挖到${mine}` : `${hit.date} · ${mine}`;
      } else tip.style.display = 'none';
    }
    function onWheel(e) { e.preventDefault(); const f = e.deltaY < 0 ? 1.12 : 1 / 1.12; state.S = Math.max(3, Math.min(60, state.S * f)); draw(); }

    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('mousemove', onMove);
    canvas.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
    canvas.addEventListener('wheel', onWheel, { passive: false });

    bRotL.onclick = () => { state.yaw -= Math.PI / 8; draw(); };
    bRotR.onclick = () => { state.yaw += Math.PI / 8; draw(); };
    bZin.onclick = () => { state.S = Math.min(60, state.S * 1.2); draw(); };
    bZout.onclick = () => { state.S = Math.max(3, state.S / 1.2); draw(); };
    bReset.onclick = () => { state.yaw = DEF.yaw; state.pitch = PITCH[state.mode]; fitView(); draw(); };
    bShot.onclick = () => {
      const banner = 64 * DPR;
      const out = document.createElement('canvas');
      out.width = canvas.width; out.height = canvas.height + banner;
      const o = out.getContext('2d');
      o.drawImage(canvas, 0, banner);
      o.fillStyle = '#0d1117'; o.fillRect(0, 0, out.width, banner);
      o.fillStyle = '#7cf04a'; o.font = `800 ${26 * DPR}px -apple-system, "Segoe UI", sans-serif`; o.textBaseline = 'middle';
      o.fillText(`⛏️ @${user} 的 GitHub 矿井`, 18 * DPR, banner / 2);
      if (total != null) {
        o.fillStyle = '#e6edf3'; o.font = `600 ${18 * DPR}px -apple-system, sans-serif`;
        const t = `${total} 次贡献`;
        o.fillText(t, out.width - o.measureText(t).width - 18 * DPR, banner / 2);
      }
      const a = document.createElement('a');
      a.download = `github-mineshaft-${user}.png`;
      a.href = out.toDataURL('image/png'); a.click();
    };

    state.queue = state.cells.filter((c) => c.level > 0).sort((a, b) => (a.x + a.z) - (b.x + b.z));
    renderLoot();
    fitView(); resize(); startAnim();
    window.__GMC_ACTIVE__ = state;
    const ro = new ResizeObserver(() => resize());
    ro.observe(host);

    return {
      destroy() { cancelAnimationFrame(rafId); ro.disconnect(); window.removeEventListener('mouseup', onUp); host.innerHTML = ''; host.classList.remove('gmc-host'); },
      fit() { fitView(); draw(); }
    };
  }

  window.GCA.registerGame({ id: 'minecraft', label: 'Minecraft', icon: '⛏️', mount });
})();
