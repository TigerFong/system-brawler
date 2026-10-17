(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const dom   = DB.dom;
  const W     = CFG.W;
  const H     = CFG.H;

  /* ==================== 音效 ==================== */
  DB.sfx = (function () {
    let ctx = null;
    function getCtx() {
      if (!ctx) {
        try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; }
      }
      return ctx;
    }
    function tone(freq, dur, type, vol, slide) {
      const ac = getCtx();
      if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, ac.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ac.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.06, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g); g.connect(ac.destination);
      o.start(); o.stop(ac.currentTime + dur);
    }
    function noise(dur, vol) {
      const ac = getCtx();
      if (!ac) return;
      const len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = buf;
      g.gain.setValueAtTime(vol || 0.05, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      src.connect(g); g.connect(ac.destination);
      src.start();
    }
    return {
      grab:  () => tone(520, 0.08, 'sine', 0.04, 260),
      throw: () => { tone(180, 0.12, 'sawtooth', 0.05, -120); noise(0.06, 0.03); },
      hit:   () => { noise(0.08, 0.06); tone(880, 0.05, 'square', 0.03, -400); },
      hurt:  () => { tone(220, 0.2, 'sawtooth', 0.06, -140); noise(0.1, 0.04); },
      chip:  () => tone(1200, 0.06, 'sine', 0.035, 400),
      clear: () => { tone(440, 0.12, 'sine', 0.05, 220); tone(660, 0.18, 'sine', 0.04, 220); },
      start: () => { tone(330, 0.08, 'sine', 0.05, 220); tone(660, 0.14, 'sine', 0.045, 300); },
      error: () => { tone(150, 0.15, 'sawtooth', 0.05, -50); noise(0.1, 0.05); }
    };
  })();

  /* ==================== 背景网格 ==================== */
  const gridCanvas = document.createElement('canvas');
  gridCanvas.width  = W;
  gridCanvas.height = H;

  function initBackground() {
    const g = gridCanvas.getContext('2d');
    const GRID = 64;
    g.clearRect(0, 0, W, H);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(120, 90, 255, 0.085)';
    g.beginPath();
    for (let x = 0; x <= W; x += GRID) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
    for (let y = 0; y <= H; y += GRID) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
    g.stroke();
    g.fillStyle = 'rgba(140, 110, 255, 0.20)';
    for (let x = 0; x <= W; x += GRID) for (let y = 0; y <= H; y += GRID) g.fillRect(x - 1, y - 1, 2, 2);
    const grad = g.createLinearGradient(0, CFG.GROUND_Y - 26, 0, CFG.GROUND_Y + 8);
    grad.addColorStop(0,   'rgba(90, 240, 255, 0)');
    grad.addColorStop(0.7, 'rgba(90, 240, 255, 0.14)');
    grad.addColorStop(1,   'rgba(90, 240, 255, 0)');
    g.fillStyle = grad;
    g.fillRect(0, CFG.GROUND_Y - 26, W, 34);
    g.strokeStyle = 'rgba(90, 240, 255, 0.30)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.moveTo(0, CFG.GROUND_Y + 0.5);
    g.lineTo(W, CFG.GROUND_Y + 0.5);
    g.stroke();
    g.strokeStyle = 'rgba(90, 240, 255, 0.22)';
    g.lineWidth = 2;
    const CL = 46, P = 18;
    [[P, P, 1, 1], [W - P, P, -1, 1], [P, H - P, 1, -1], [W - P, H - P, -1, -1]]
      .forEach(([x, y, sx, sy]) => {
        g.beginPath(); g.moveTo(x, y + sy * CL); g.lineTo(x, y); g.lineTo(x + sx * CL, y); g.stroke();
      });
  }

  /* ==================== 标题画面逻辑 ==================== */
  let currentMode = 'defender';

  const RULES_DEFENDER = `
    <div class="rule-row"><span class="key">WASD</span><span class="txt">走位躲避弹幕</span></div>
    <div class="rule-row"><span class="key">鼠标</span><span class="txt">抓取系统模块 · 向后拉 · 松手弹射</span></div>
    <div class="rule-row"><span class="key">1-4</span><span class="txt">能量满时释放全屏大招</span></div>
    <div class="rule-row"><span class="key">目标</span><span class="txt">清空波次 · 用模块砸碎病毒</span></div>
  `;

  const RULES_HACKER = `
    <div class="rule-row"><span class="key">WASD</span><span class="txt">走位躲避杀毒软件</span></div>
    <div class="rule-row"><span class="key">鼠标</span><span class="txt">抓取病毒程序包 · 砸向卫士</span></div>
    <div class="rule-row"><span class="key">1-4</span><span class="txt">能量满时释放全屏大招</span></div>
    <div class="rule-row"><span class="key">状态</span><span class="txt" style="color:#ff5a7a;">即将解锁 · 敬请期待</span></div>
  `;

  function showTitle() { 
    dom.titleEl.classList.remove('hidden'); 
  }
  function hideTitle() { 
    dom.titleEl.classList.add('hidden'); 
  }

  function bindTitleEvents() {
    const cardDef = document.getElementById('mode-defender');
    const cardHack = document.getElementById('mode-hacker');
    const rulesPanel = document.getElementById('rules-panel');
    const btnStart = document.getElementById('btn-start');

    function selectMode(mode) {
      if (currentMode === mode) return;
      currentMode = mode;

      if (mode === 'defender') {
        cardDef.classList.add('active');
        cardHack.classList.remove('active');
        dom.titleEl.classList.remove('hacker-theme');
        rulesPanel.innerHTML = RULES_DEFENDER;
        btnStart.textContent = '点击 / 按任意键 开始编译';
      } else {
        cardHack.classList.add('active');
        cardDef.classList.remove('active');
        dom.titleEl.classList.add('hacker-theme');
        rulesPanel.innerHTML = RULES_HACKER;
        btnStart.textContent = '⚠️ 黑客模块正在编译中，暂不可用';
      }
    }

    cardDef.addEventListener('click', (e) => { e.stopPropagation(); selectMode('defender'); });
    cardHack.addEventListener('click', (e) => { e.stopPropagation(); selectMode('hacker'); });

    // 初始注入
    rulesPanel.innerHTML = RULES_DEFENDER;
  }

  /* ==================== 蓝屏 ==================== */
  let gameOverEl = null;

  function buildGameOverEl() {
    gameOverEl = document.createElement('div');
    gameOverEl.style.cssText = `
      position:absolute; inset:0; z-index:30;
      background:#0a2a8a;
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      font-family:ui-monospace, monospace;
      color:#dff3ff;
      pointer-events:none;
      opacity:0; transition:opacity .35s ease;
    `;

    const face = document.createElement('div');
    face.textContent = ':(';
    face.style.cssText = 'font-size:46px;font-weight:700;letter-spacing:8px;text-shadow:0 0 30px #7fd0ff;';

    const title = document.createElement('div');
    title.textContent = 'SYSTEM INTEGRITY FAILURE';
    title.style.cssText = 'margin-top:18px;font-size:16px;letter-spacing:3px;color:#9fd6ff;';

    const hint = document.createElement('div');
    hint.textContent = '点击 / 按任意键 返回标题';
    hint.style.cssText = 'margin-top:8px;font-size:12px;letter-spacing:2px;color:rgba(180,220,255,.6);';

    gameOverEl.appendChild(face);
    gameOverEl.appendChild(title);
    gameOverEl.appendChild(hint);
    dom.stage.appendChild(gameOverEl);
  }

  function showGameOver() {
    if (!gameOverEl) buildGameOverEl();
    requestAnimationFrame(() => { gameOverEl.style.opacity = '1'; });
  }

  function hideGameOver() {
    if (gameOverEl) gameOverEl.style.opacity = '0';
  }

  /* ==================== 世界重置 ==================== */
  function resetWorld(withWave) {
    for (const w of DB.weapons.slice()) DB.removeWeapon(w);
    DB.enemyBullets.length = 0;
    DB.enemies.length = 0;
    DB.chips.length = 0;
    DB.particles.length = 0;
    DB.heldWeapon = null;
    DB.keys.clear();
    DB.mouse.down = false;

    state.hp          = state.hpMax;
    state.energy      = 0;
    state.wave        = 1;
    state.waveBreakT  = 0;
    state.damageFlash = 0;
    state.shake       = 0;
    state.flash       = 0;
    state.hitstop     = 0;
    state.gameOverLock = 0;
    state.mods        = { damage: 0, grab: 0, launch: 0 };

    DB.player.x  = W * 0.34;
    DB.player.y  = 400;
    DB.player.vx = 0;
    DB.player.vy = 0;

    for (let i = 0; i < 3; i++) {
      const w = DB.spawnWeapon('light_dart');
      if (w) w.warning = 0.001;
    }

    if (withWave) DB.spawnWave(1);

    DB.updateHUD();
  }

  /* ==================== 场景切换 ==================== */
  function startGame() {
    if (currentMode !== 'defender') {
      // 黑客模式未实现
      DB.sfx.error();
      return;
    }
    hideTitle();
    resetWorld(true);
    state.scene = 'playing';
    DB.sfx.start();
  }

  function backToTitle() {
    hideGameOver();
    resetWorld(false);
    showTitle();
    state.scene = 'title';
  }

  /* ==================== 波次 ==================== */
  function updateWaves(dt) {
    if (state.scene !== 'playing') return;
    if (state.waveBreakT > 0) {
      state.waveBreakT -= dt;
      if (state.waveBreakT <= 0) { state.wave++; DB.spawnWave(state.wave); }
      return;
    }
    if (DB.enemies.length === 0) {
      state.hp = Math.min(state.hpMax, state.hp + state.hpMax * 0.2);
      state.waveBreakT = 2.0;
      DB.sfx.clear();
    }
  }

  /* ==================== 渲染 ==================== */
  function render() {
    if (state.shake > 0.15) {
      const sx = (Math.random() * 2 - 1) * state.shake;
      const sy = (Math.random() * 2 - 1) * state.shake;
      dom.world.style.transform = `translate3d(${sx.toFixed(2)}px, ${sy.toFixed(2)}px, 0)`;
    } else {
      dom.world.style.transform = 'translate3d(0,0,0)';
    }

    const bgCtx = dom.bgCtx;
    bgCtx.clearRect(0, 0, W, H);
    bgCtx.drawImage(gridCanvas, 0, 0);

    DB.drawChips(bgCtx);
    DB.drawEnemyBullets(bgCtx);
    DB.drawEnemies(bgCtx);
    DB.drawPlayer(bgCtx);
    DB.drawSpawnWarnings(bgCtx);

    if (state.scene === 'playing') {
      bgCtx.save();
      bgCtx.textAlign = 'center';
      bgCtx.font = 'bold 22px ui-monospace, monospace';
      bgCtx.fillStyle = 'rgba(150, 200, 255, 0.55)';
      bgCtx.shadowColor = 'rgba(90, 240, 255, 0.6)';
      bgCtx.shadowBlur = 16;
      bgCtx.fillText(`WAVE ${String(state.wave).padStart(2, '0')}`, W / 2, 46);

      if (state.waveBreakT > 0) {
        bgCtx.font = '13px ui-monospace, monospace';
        bgCtx.fillStyle = 'rgba(150, 200, 255, 0.45)';
        bgCtx.shadowBlur = 0;
        bgCtx.fillText(`NEXT WAVE IN ${Math.max(0, state.waveBreakT).toFixed(1)}s`, W / 2, 70);
      }
      bgCtx.restore();

      const mods = state.mods;
      if (mods.damage > 0 || mods.grab > 0 || mods.launch > 0) {
        bgCtx.save();
        bgCtx.font = '11px ui-monospace, monospace';
        bgCtx.textAlign = 'left';
        let yy = 30;
        if (mods.damage > 0) { bgCtx.fillStyle = '#ff7a9a'; bgCtx.fillText(`DMG +${Math.round(mods.damage * 100)}%`, 24, yy); yy += 16; }
        if (mods.grab > 0) { bgCtx.fillStyle = '#5ae8ff'; bgCtx.fillText(`RNG +${Math.round(mods.grab)}`, 24, yy); yy += 16; }
        if (mods.launch > 0) { bgCtx.fillStyle = '#c08bff'; bgCtx.fillText(`SPD +${Math.round(mods.launch * 100)}%`, 24, yy); }
        bgCtx.restore();
      }
    }

    const fxCtx = dom.fxCtx;
    fxCtx.clearRect(0, 0, W, H);
    DB.drawGrabBeam(fxCtx);
    DB.drawParticles(fxCtx);

    if (state.damageFlash > 0.001) {
      dom.flashEl.style.background = '#ff2a4a';
      dom.flashEl.style.opacity = String(Math.min(0.6, state.damageFlash));
    } else if (state.flash > 0.001) {
      dom.flashEl.style.background = '#ffffff';
      dom.flashEl.style.opacity = String(Math.min(0.85, state.flash));
    } else if (dom.flashEl.style.opacity !== '0') {
      dom.flashEl.style.opacity = '0';
    }
  }

  /* ==================== 输入 ==================== */
  function toWorld(clientX, clientY) {
    const rect = dom.stage.getBoundingClientRect();
    return {
      x: ((clientX - rect.left) / rect.width)  * W,
      y: ((clientY - rect.top)  / rect.height) * H
    };
  }

  function bindInput() {
    const mouse = DB.mouse;
    const trail = DB.trail;
    const keys  = DB.keys;

    dom.stage.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;

      // 拦截 UI 点击
      if (e.target.closest('.mode-card') || e.target.closest('.title-start')) {
         if (state.scene === 'title') return;
      }

      if (state.scene === 'title') { startGame(); return; }
      if (state.scene === 'gameover') {
        if (state.gameOverLock <= 0) backToTitle();
        return;
      }

      const p = toWorld(e.clientX, e.clientY);
      mouse.x = p.x;
      mouse.y = p.y;
      mouse.down = true;

      trail.length = 0;
      trail.push({ x: p.x, y: p.y, t: performance.now() });

      DB.tryGrab(p.x, p.y);
    });

    window.addEventListener('mousemove', (e) => {
      const p = toWorld(e.clientX, e.clientY);
      mouse.x = p.x;
      mouse.y = p.y;

      trail.push({ x: p.x, y: p.y, t: performance.now() });
      while (trail.length > 14) trail.shift();
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      mouse.down = false;
      DB.releaseThrow();
    });

    window.addEventListener('blur', () => {
      keys.clear();
      mouse.down = false;
      DB.releaseThrow();
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (state.scene === 'title') { startGame(); return; }

      if (state.scene === 'gameover') {
        if (state.gameOverLock <= 0) backToTitle();
        return;
      }

      const k = e.key.toLowerCase();

      if (k === 'w' || k === 'a' || k === 's' || k === 'd') {
        keys.add(k);
        e.preventDefault();
        return;
      }

      if (k >= '1' && k <= '4') {
        DB.tryUltimate();
        e.preventDefault();
      }
    });

    window.addEventListener('keyup', (e) => {
      keys.delete(e.key.toLowerCase());
    });
  }

  /* ==================== 主循环 ==================== */
  function update(dt) {
    if (dt <= 0) return;

    state.t += dt;
    DB.updatePlayer(dt);
    DB.updateWeapons(dt);
    DB.updateEnemies(dt);
    DB.updateChips(dt);
    DB.updateParticles(dt);
    DB.updateTerminal(dt);
    updateWaves(dt);

    state.energy = Math.max(0, state.energy - 1.5 * dt);
  }

  let lastTime = performance.now();

  function frame(now) {
    const realDt = Math.min((now - lastTime) / 1000, 0.05);
    lastTime = now;

    state.shake       *= Math.exp(-9 * realDt);
    if (state.shake < 0.15) state.shake = 0;

    state.flash       *= Math.exp(-11 * realDt);
    if (state.flash < 0.004) state.flash = 0;

    state.damageFlash *= Math.exp(-10 * realDt);
    if (state.damageFlash < 0.004) state.damageFlash = 0;

    if (state.scene === 'title') {
      state.t += realDt;
      render();
      DB.updateHUD();
      requestAnimationFrame(frame);
      return;
    }

    if (state.scene === 'gameover') {
      if (state.gameOverLock > 0) state.gameOverLock -= realDt;
      DB.updateParticles(realDt);
      render();
      DB.updateHUD();
      requestAnimationFrame(frame);
      return;
    }

    if (state.hp <= 0 && state.scene === 'playing') {
      state.scene = 'gameover';
      state.gameOverLock = 0.6;
      state.hitstop  = 0.12;
      state.shake    = 30;
      DB.heldWeapon  = null;
      showGameOver();
    }

    let dt = realDt;
    if (state.hitstop > 0) {
      state.hitstop -= realDt;
      dt = 0;
    }

    update(dt);
    render();
    DB.updateHUD();

    requestAnimationFrame(frame);
  }

  /* ==================== 初始化 ==================== */
  function resize() {
    const s = Math.min(window.innerWidth / W, window.innerHeight / H);
    dom.stage.style.transform = `scale(${s})`;
  }
  window.addEventListener('resize', resize);
  resize();

  function init() {
    initBackground();
    DB.buildHUD();
    bindTitleEvents();
    resetWorld(false);
    bindInput();

    state.scene = 'title';
    showTitle();

    requestAnimationFrame((t) => {
      lastTime = t;
      requestAnimationFrame(frame);
    });
  }

  init();

})(window.DB);