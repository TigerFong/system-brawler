(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const dom   = DB.dom;
  const W     = CFG.W;
  const H     = CFG.H;
  const VW    = CFG.VIEW_W;
  const VH    = CFG.VIEW_H;

  let highestScore = parseInt(localStorage.getItem('sys_brawler_highscore') || '0', 10);
  let sysPoints = parseInt(localStorage.getItem('sys_brawler_points') || '0', 10);

  const defaultUpgrades = { hp:0, energy:0, chip:0, weapon:0, duration:0, damage:0, crit:0 };
  let savedUpgrades = JSON.parse(localStorage.getItem('sys_brawler_upgrades') || '{}');
  DB.upgrades = { ...defaultUpgrades, ...savedUpgrades };

  /* ==================== 音效 ==================== */
  DB.sfx = (function () {
    let ctx = null;
    function getCtx() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } return ctx; }
    function tone(freq, dur, type, vol, slide) {
      const ac = getCtx(); if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, ac.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ac.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.06, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
    }
    function noise(dur, vol) {
      const ac = getCtx(); if (!ac) return;
      const len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = buf; g.gain.setValueAtTime(vol || 0.05, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      src.connect(g); g.connect(ac.destination); src.start();
    }
    return {
      grab:  () => tone(520, 0.08, 'sine', 0.04, 260), throw: () => { tone(180, 0.12, 'sawtooth', 0.05, -120); noise(0.06, 0.03); },
      hit:   () => { noise(0.08, 0.06); tone(880, 0.05, 'square', 0.03, -400); }, hurt:  () => { tone(220, 0.2, 'sawtooth', 0.06, -140); noise(0.1, 0.04); },
      chip:  () => tone(1200, 0.06, 'sine', 0.035, 400), clear: () => { tone(440, 0.12, 'sine', 0.05, 220); tone(660, 0.18, 'sine', 0.04, 220); },
      start: () => { tone(330, 0.08, 'sine', 0.05, 220); tone(660, 0.14, 'sine', 0.045, 300); }, error: () => { tone(150, 0.15, 'sawtooth', 0.05, -50); noise(0.1, 0.05); },
      tension:     () => { tone(440, 0.08, 'triangle', 0.045, 110); }, fullTension: () => { tone(880, 0.07, 'sine', 0.05, 220); tone(1320, 0.11, 'sine', 0.035, 100); }
    };
  })();

  /* ==================== 背景网格 ==================== */
  const gridCanvas = document.createElement('canvas');
  gridCanvas.width  = W; gridCanvas.height = H;
  function initBackground() {
    const g = gridCanvas.getContext('2d');
    const GRID = 64;
    g.clearRect(0, 0, W, H);
    g.lineWidth = 1; g.strokeStyle = 'rgba(120, 90, 255, 0.085)';
    g.beginPath();
    for (let x = 0; x <= W; x += GRID) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
    for (let y = 0; y <= H; y += GRID) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
    g.stroke();
    g.fillStyle = 'rgba(140, 110, 255, 0.20)';
    for (let x = 0; x <= W; x += GRID) for (let y = 0; y <= H; y += GRID) g.fillRect(x - 1, y - 1, 2, 2);
    const grad = g.createLinearGradient(0, CFG.GROUND_Y - 26, 0, CFG.GROUND_Y + 8);
    grad.addColorStop(0, 'rgba(90, 240, 255, 0)'); grad.addColorStop(0.7, 'rgba(90, 240, 255, 0.14)'); grad.addColorStop(1, 'rgba(90, 240, 255, 0)');
    g.fillStyle = grad; g.fillRect(0, CFG.GROUND_Y - 26, W, 34);
    g.strokeStyle = 'rgba(90, 240, 255, 0.30)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, CFG.GROUND_Y + 0.5); g.lineTo(W, CFG.GROUND_Y + 0.5); g.stroke();
  }

  /* ==================== 拉弓张力 vignette ==================== */
  let vignetteEl = null;
  function initVignette() {
    vignetteEl = document.createElement('div');
    vignetteEl.style.cssText = 'position:absolute;inset:0;z-index:19;pointer-events:none;opacity:0;transition:opacity 0.12s ease-out;';
    vignetteEl.style.boxShadow = 'inset 0 0 140px rgba(255, 80, 80, 0.78)';
    dom.stage.appendChild(vignetteEl);
  }

  /* ==================== 标题画面 ==================== */
  let currentMode = 'defender';
  const RULES_DEFENDER = `
    <div style="color:#5ae8ff; font-weight:bold; margin-bottom:8px; border-bottom:1px dashed rgba(90,240,255,0.3); padding-bottom:4px;">🛡️ 安全卫士操作指南</div>
    <div class="rule-row"><span class="key">WASD</span><span class="txt">移动走位，躲避弹幕</span></div>
    <div class="rule-row"><span class="key">鼠标</span><span class="txt">抓取模块，向后拉弓，松手弹射。<b>拉得越满越猛</b>（有音效与屏幕提示）</span></div>
    <div class="rule-row"><span class="key">SHIFT</span><span class="txt"><b>全息反射盾</b>：1.5秒内减伤80%，反伤周围敌人。</span></div>
    <div class="rule-row"><span class="key">1-4</span><span class="txt">能量满时释放大招；Boss瘫痪时处决</span></div>
  `;
  const RULES_HACKER = `
    <div style="color:#ff5a7a; font-weight:bold; margin-bottom:8px; border-bottom:1px dashed rgba(255,90,122,0.3); padding-bottom:4px;">😈 黑客入侵指南</div>
    <div class="rule-row"><span class="key">WASD</span><span class="txt">移动走位，躲避杀毒软件</span></div>
    <div class="rule-row"><span class="key">鼠标</span><span class="txt">抓取病毒，<b>按住瞄准，松开瞬发激光狙击</b>。</span></div>
    <div class="rule-row"><span class="key">SHIFT</span><span class="txt"><b>病毒引爆</b>：清空全屏子弹，感染所有敌人引发连环爆炸。</span></div>
    <div class="rule-row"><span class="key">1-4</span><span class="txt">能量满时释放大招；Boss瘫痪时处决</span></div>
  `;

  function showTitle() { dom.titleEl.classList.remove('hidden'); }
  function hideTitle() { dom.titleEl.classList.add('hidden'); }

  function bindTitleEvents() {
    const cardDef = document.getElementById('mode-defender');
    const cardHack = document.getElementById('mode-hacker');
    const rulesPanel = document.getElementById('rules-panel');
    const btnStart = document.getElementById('btn-start');

    const modalLayer = document.getElementById('modal-layer');
    const modalClose = document.getElementById('modal-close');
    const upPanel = document.getElementById('upgrade-panel');
    const btnOpenRules = document.getElementById('btn-open-rules');
    const btnOpenUpgrades = document.getElementById('btn-open-upgrades');

    function selectMode(mode) {
      if (currentMode === mode) return;
      currentMode = mode;
      if (mode === 'defender') {
        cardDef.classList.add('active'); cardHack.classList.remove('active');
        dom.titleEl.classList.remove('hacker-theme'); rulesPanel.innerHTML = RULES_DEFENDER;
        btnStart.textContent = '点击 / 按任意键 开始编译';
      } else {
        cardHack.classList.add('active'); cardDef.classList.remove('active');
        dom.titleEl.classList.add('hacker-theme'); rulesPanel.innerHTML = RULES_HACKER;
        btnStart.textContent = '点击 / 按任意键 执行入侵';
      }
    }
    cardDef.addEventListener('click', (e) => { e.stopPropagation(); selectMode('defender'); });
    cardHack.addEventListener('click', (e) => { e.stopPropagation(); selectMode('hacker'); });
    rulesPanel.innerHTML = RULES_DEFENDER;

    // ===== 新手教程按钮绑定 =====
    const btnTutDef = document.getElementById('btn-tut-def');
    const btnTutHack = document.getElementById('btn-tut-hack');
    if (btnTutDef) btnTutDef.addEventListener('click', (e) => { e.stopPropagation(); startTutorial('defender'); });
    if (btnTutHack) btnTutHack.addEventListener('click', (e) => { e.stopPropagation(); startTutorial('hacker'); });

    modalClose.addEventListener('click', () => { modalLayer.style.display = 'none'; });
    modalLayer.addEventListener('click', (e) => { if (e.target === modalLayer) modalLayer.style.display = 'none'; });
    btnOpenRules.addEventListener('click', (e) => { e.stopPropagation(); modalLayer.style.display = 'flex'; rulesPanel.style.display = 'block'; upPanel.style.display = 'none'; });
    btnOpenUpgrades.addEventListener('click', (e) => { e.stopPropagation(); modalLayer.style.display = 'flex'; rulesPanel.style.display = 'none'; upPanel.style.display = 'block'; updateUpgradeUI(); });

    const pointsText = document.getElementById('sys-points-text');
    const btnHp = document.getElementById('up-hp'), btnEnergy = document.getElementById('up-energy'), btnChip = document.getElementById('up-chip');
    const btnWeapon = document.getElementById('up-weapon'), btnDuration = document.getElementById('up-duration'), btnDamage = document.getElementById('up-damage'), btnCrit = document.getElementById('up-crit');

    function getCost(type, level) {
      level = level || 0;
      if (type === 'hp') return Math.floor(50 * (1.3 ** level));
      if (type === 'energy') return Math.floor(80 * (1.5 ** level));
      if (type === 'chip') return Math.floor(100 * (1.4 ** level));
      if (type === 'weapon') return Math.floor(150 * (1.6 ** level));
      if (type === 'duration') return Math.floor(120 * (1.5 ** level));
      if (type === 'damage') return Math.floor(200 * (1.4 ** level));
      if (type === 'crit') return Math.floor(150 * (1.4 ** level));
      return 9999;
    }

    function updateUpgradeUI() {
      pointsText.textContent = sysPoints;
      const makeHTML = (label, lv, maxLv, cost) => {
        lv = lv || 0;
        return `${label} (Lv.${lv}/${maxLv})<br><span class="up-cost" style="color:${lv>=maxLv?'#ff5a7a':'#aaa'};">${lv>=maxLv ? 'MAX' : 'Cost: '+cost}</span>`;
      };
      btnHp.disabled = sysPoints < getCost('hp', DB.upgrades.hp) || DB.upgrades.hp >= 99; btnHp.innerHTML = makeHTML('生命上限 +20', DB.upgrades.hp, 99, getCost('hp', DB.upgrades.hp));
      btnEnergy.disabled = sysPoints < getCost('energy', DB.upgrades.energy) || DB.upgrades.energy >= 10; btnEnergy.innerHTML = makeHTML('初始能量 +10', DB.upgrades.energy, 10, getCost('energy', DB.upgrades.energy));
      btnChip.disabled = sysPoints < getCost('chip', DB.upgrades.chip) || DB.upgrades.chip >= 30; btnChip.innerHTML = makeHTML('芯片掉率 +10%', DB.upgrades.chip, 30, getCost('chip', DB.upgrades.chip));
      btnWeapon.disabled = sysPoints < getCost('weapon', DB.upgrades.weapon) || DB.upgrades.weapon >= 10; btnWeapon.innerHTML = makeHTML('武器上限 +1', DB.upgrades.weapon, 10, getCost('weapon', DB.upgrades.weapon));
      btnDuration.disabled = sysPoints < getCost('duration', DB.upgrades.duration) || DB.upgrades.duration >= 10; btnDuration.innerHTML = makeHTML('武器存活 +2s', DB.upgrades.duration, 10, getCost('duration', DB.upgrades.duration));
      btnDamage.disabled = sysPoints < getCost('damage', DB.upgrades.damage) || DB.upgrades.damage >= 20; btnDamage.innerHTML = makeHTML('初始伤害 +10%', DB.upgrades.damage, 20, getCost('damage', DB.upgrades.damage));
      btnCrit.disabled = sysPoints < getCost('crit', DB.upgrades.crit) || DB.upgrades.crit >= 20;
      if(btnCrit) btnCrit.innerHTML = makeHTML('暴击伤害 +10%', DB.upgrades.crit, 20, getCost('crit', DB.upgrades.crit));
    }

    function buyUpgrade(type, maxLv) {
      const cost = getCost(type, DB.upgrades[type]);
      if (sysPoints >= cost && DB.upgrades[type] < maxLv) {
        sysPoints -= cost; DB.upgrades[type]++;
        localStorage.setItem('sys_brawler_points', sysPoints.toString());
        localStorage.setItem('sys_brawler_upgrades', JSON.stringify(DB.upgrades));
        DB.sfx.chip(); updateUpgradeUI();
      }
    }

    btnHp.onclick = () => buyUpgrade('hp', 99); btnEnergy.onclick = () => buyUpgrade('energy', 10); btnChip.onclick = () => buyUpgrade('chip', 30);
    btnWeapon.onclick = () => buyUpgrade('weapon', 10); btnDuration.onclick = () => buyUpgrade('duration', 10); btnDamage.onclick = () => buyUpgrade('damage', 20);
    btnCrit.onclick = () => buyUpgrade('crit', 20);
  }

  /* ==================== 结算蓝屏 ==================== */
  let gameOverEl = null;
  function showGameOver() {
    if (gameOverEl) gameOverEl.remove();
    gameOverEl = document.createElement('div');
    gameOverEl.style.cssText = `position:absolute; inset:0; z-index:30; background:rgba(10, 20, 60, 0.95); display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:ui-monospace, monospace; color:#dff3ff; pointer-events:none; opacity:0; transition:opacity .35s ease; backdrop-filter: blur(4px);`;
    const face = document.createElement('div'); face.textContent = ':('; face.style.cssText = 'font-size:64px;font-weight:700;letter-spacing:8px;text-shadow:0 0 30px #7fd0ff; margin-bottom: 10px;';
    const title = document.createElement('div'); title.textContent = 'SYSTEM INTEGRITY FAILURE'; title.style.cssText = 'font-size:18px;letter-spacing:4px;color:#9fd6ff; margin-bottom: 40px;';
    const statsBox = document.createElement('div'); statsBox.style.cssText = `display: flex; flex-direction: column; gap: 16px; background: rgba(0, 0, 0, 0.4); padding: 24px 40px; border: 1px solid rgba(90, 240, 255, 0.2); border-radius: 8px; margin-bottom: 40px;`;
    const isNewRecord = state.score >= highestScore && state.score > 0;
    statsBox.innerHTML = `<div><span style="color:rgba(150,200,255,0.6);">本局得分</span> <span style="color:#ffcc00; font-size:24px; font-weight:bold; margin-left:40px;">${state.score}</span></div><div><span style="color:rgba(150,200,255,0.6);">最高连击</span> <span style="color:#5ae8ff; font-size:24px; font-weight:bold; margin-left:40px;">${state.maxCombo} <span style="font-size:14px;">HITS</span></span></div><div><span style="color:rgba(150,200,255,0.6);">历史最高</span> <span style="color:${isNewRecord?'#5ee6a8':'#ffffff'}; font-size:24px; font-weight:bold; margin-left:40px;">${highestScore} ${isNewRecord?'★ NEW':''}</span></div>`;
    const hint = document.createElement('div'); hint.textContent = '点击 / 按任意键 返回标题'; hint.style.cssText = 'font-size:13px;letter-spacing:2px;color:rgba(180,220,255,.6); animation: startBlink 1.5s infinite;';
    gameOverEl.appendChild(face); gameOverEl.appendChild(title); gameOverEl.appendChild(statsBox); gameOverEl.appendChild(hint);
    dom.stage.appendChild(gameOverEl); requestAnimationFrame(() => { gameOverEl.style.opacity = '1'; });
  }
  function hideGameOver() { if (gameOverEl) gameOverEl.style.opacity = '0'; }

  /* ==================== 世界重置 ==================== */
  function resetWorld(withWave) {
    for (const w of DB.weapons.slice()) DB.removeWeapon(w);
    DB.enemyBullets.length = 0; DB.enemies.length = 0; DB.chips.length = 0; DB.particles.length = 0;
    DB.boss = null; state.qte.active = false; DB.heldWeapon = null; DB.keys.clear(); DB.mouse.down = false;

    state.hpMax = 100 + (DB.upgrades.hp * 20); state.hp = state.hpMax; state.energy = DB.upgrades.energy * 10;
    state.wave = 1; state.waveBreakT = 0; state.damageFlash = 0; state.shake = 0; state.flash = 0; state.hitstop = 0; state.gameOverLock = 0;
    state.bossEnrageFlash = 0; state.bossEnrageTextT = 0;
    state.mods = { damage: 0, grab: 0, launch: 0, lifesteal: 0, moveSpeed: 0, critRate: 0, critDmg: 0 }; state.combo = 0; state.maxCombo = 0; state.score = 0;
    state.skillCd = 0; state.skillActiveT = 0;
    state.camera.x = W / 2 - VW / 2; state.camera.y = H / 2 - VH / 2;
    state.tutorial.active = false;

    DB.player.x = W * 0.34; DB.player.y = 600; DB.player.vx = 0; DB.player.vy = 0;
    
    if (withWave) {
      for (let i = 0; i < 3; i++) { const w = DB.spawnWeapon('light_dart'); if (w) w.warning = 0.001; }
      DB.spawnWave(1);
    }
    DB.updateHUD();
  }

  function startGame() {
    hideTitle(); resetWorld(true); state.mode = currentMode; state.scene = 'playing'; DB.sfx.start();
  }
  function backToTitle() { 
    hideGameOver(); resetWorld(false); showTitle(); state.scene = 'title'; 
    setTimeout(() => { if (gameOverEl) { gameOverEl.remove(); gameOverEl = null; } }, 400);
  }

  /* ==================== 新手教程逻辑 ==================== */
  function startTutorial(mode) {
    hideTitle(); resetWorld(false);
    state.mode = mode;
    state.scene = 'playing';
    state.tutorial.active = true;
    state.tutorial.step = 1;
    state.tutorial.startX = DB.player.x;
    state.tutorial.startY = DB.player.y;
    state.tutorial.hitDummy = false;
    state.tutorial.pullDist = 0;

    state.energy = state.energyMax; // 方便测试大招
    
    for (let i = 0; i < 3; i++) { const w = DB.spawnWeapon('light_dart'); if (w) w.warning = 0.001; }
    if (mode === 'defender') {
      DB.spawnTutorialDummy(DB.player.x + 400, DB.player.y);
    } else {
      DB.spawnTutorialDummy(DB.player.x + 500, DB.player.y);
    }
    DB.sfx.start();
  }

  function updateTutorial(dt) {
    const tut = state.tutorial;
    const p = DB.player;

    if (tut.step === 1) {
      const moved = Math.hypot(p.x - tut.startX, p.y - tut.startY);
      if (moved > 100) tut.step = 2;
    }
    else if (tut.step === 2) {
      if (state.mode === 'defender') {
        if (DB.heldWeapon) {
          const dd = Math.hypot(DB.mouse.x - DB.heldWeapon.anchorX, DB.mouse.y - DB.heldWeapon.anchorY);
          if (dd > 100) { tut.pullDist = dd; tut.step = 3; }
        }
      } else {
        const dist = Math.hypot(DB.mouse.x - p.x, DB.mouse.y - p.y);
        if (dist > 200) tut.step = 3;
      }
    }
    else if (tut.step === 3) {
      if (tut.hitDummy) tut.step = 4;
    }
    else if (tut.step === 4) {
      if (state.skillCd > 0) tut.step = 5;
    }
    else if (tut.step === 5) {
      if (state.energy === 0) {
        tut.step = 6;
        state.flash = 1.0;
        DB.sfx.clear();
      }
    }
  }

  /* ==================== 波次 ==================== */
  function updateWaves(dt) {
    if (state.scene !== 'playing') return;
    
    // 教程拦截
    if (state.tutorial.active) {
      updateTutorial(dt);
      return;
    }

    if (state.waveBreakT > 0) {
      state.waveBreakT -= dt;
      if (state.waveBreakT <= 0) {
        state.wave++;
        if (state.wave % 10 === 0) DB.spawnBoss(true);
        else if (state.wave % 5 === 0) DB.spawnBoss(false);
        else DB.spawnWave(state.wave);
      }
      return;
    }
    if (DB.enemies.length === 0 && !DB.boss) {
      state.hp = Math.min(state.hpMax, state.hp + state.hpMax * 0.2);
      state.waveBreakT = 2.0; DB.sfx.clear();
    }
  }

  /* ==================== 渲染 ==================== */
  function render() {
    if (state.qte.active) dom.weaponLayer.style.opacity = '0';
    else dom.weaponLayer.style.opacity = '1';

    let targetX = DB.player.x - VW / 2;
    let targetY = DB.player.y - VH / 2;
    targetX = DB.clamp(targetX, 0, W - VW);
    targetY = DB.clamp(targetY, 0, H - VH);

    state.camera.x += (targetX - state.camera.x) * 0.15;
    state.camera.y += (targetY - state.camera.y) * 0.15;

    const camX = state.camera.x;
    const camY = state.camera.y;

    let sx = 0, sy = 0;
    if (state.shake > 0.15) {
      sx = (Math.random() * 2 - 1) * state.shake;
      sy = (Math.random() * 2 - 1) * state.shake;
    }

    dom.weaponLayer.style.transform = `translate3d(${-(camX - sx).toFixed(2)}px, ${-(camY - sy).toFixed(2)}px, 0)`;

    const bgCtx = dom.bgCtx;
    bgCtx.clearRect(0, 0, W, H);

    bgCtx.save();
    bgCtx.translate(-camX + sx, -camY + sy);
    bgCtx.drawImage(gridCanvas, 0, 0);
    DB.drawDeployedWeapons(bgCtx);
    DB.drawChips(bgCtx); DB.drawEnemyBullets(bgCtx); DB.drawEnemies(bgCtx); DB.drawPlayer(bgCtx); DB.drawSpawnWarnings(bgCtx);
    bgCtx.restore();

    if (state.scene === 'playing') {
      bgCtx.save();

      bgCtx.textAlign = 'center'; bgCtx.font = 'bold 22px ui-monospace, monospace';
      bgCtx.fillStyle = 'rgba(150, 200, 255, 0.55)'; bgCtx.shadowColor = 'rgba(90, 240, 255, 0.6)'; bgCtx.shadowBlur = 16;

      if (!state.tutorial.active) {
        bgCtx.fillText(`WAVE ${String(state.wave).padStart(2, '0')}`, VW / 2, 46);
      }

      // ===== 教程悬浮 UI =====
      if (state.tutorial.active) {
        const tut = state.tutorial;
        let title = '', desc = '';
        if (tut.step === 1) { title = "第一课：移动"; desc = "使用 [W][A][S][D] 移动你的角色。"; }
        else if (tut.step === 2) { 
          title = "第二课：抓取与瞄准"; 
          desc = state.mode === 'defender' ? "按住鼠标抓取武器，向后拉动，感受张力提示。" : "按住鼠标抓取病毒，移动鼠标瞄准木桩。"; 
        }
        else if (tut.step === 3) { title = "第三课：开火"; desc = "松开鼠标开火，命中远处的木桩！"; }
        else if (tut.step === 4) { title = "第四课：核心技能"; desc = "按下 [SHIFT] 释放阵营专属技能。"; }
        else if (tut.step === 5) { title = "第五课：终极绝招"; desc = "按数字键 [1] 释放大招，扫清一切！"; }
        else if (tut.step === 6) { title = "教程完成！"; desc = "准备就绪。点击屏幕返回主菜单，开始真正的战斗吧！"; }

        bgCtx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        bgCtx.strokeStyle = state.mode === 'defender' ? '#5ae8ff' : '#ff5a7a';
        bgCtx.lineWidth = 2;
        bgCtx.beginPath(); bgCtx.roundRect(VW/2 - 300, 100, 600, 100, 10); bgCtx.fill(); bgCtx.stroke();
        
        bgCtx.shadowBlur = 0;
        bgCtx.fillStyle = state.mode === 'defender' ? '#5ae8ff' : '#ff5a7a';
        bgCtx.font = 'bold 20px ui-monospace, monospace';
        bgCtx.fillText(title, VW / 2, 135);
        
        bgCtx.fillStyle = '#ffffff';
        bgCtx.font = '14px ui-monospace, monospace';
        bgCtx.fillText(desc, VW / 2, 170);

        if (tut.step === 2 && state.mode === 'defender' && DB.heldWeapon) {
          const bx = DB.heldWeapon.x - camX, by = DB.heldWeapon.y - camY;
          const ax = DB.heldWeapon.anchorX - camX, ay = DB.heldWeapon.anchorY - camY;
          bgCtx.strokeStyle = '#ffcc00'; bgCtx.lineWidth = 2; bgCtx.setLineDash([5, 5]);
          bgCtx.beginPath(); bgCtx.arc(ax, ay, 60, 0, Math.PI * 2); bgCtx.stroke();
          bgCtx.fillStyle = '#ffcc00'; bgCtx.font = '12px monospace';
          bgCtx.fillText('往圈外拉', ax, ay - 70);
        }
      }

      // ===== 正常战斗的 HUD 逻辑 =====
      if (!state.tutorial.active) {
        // (Boss血条、连击、大招提示等，全部直接沿用你原本的代码，无需删减)
      }

      bgCtx.restore();
    }

    const fxCtx = dom.fxCtx;
    fxCtx.clearRect(0, 0, W, H);

    fxCtx.save();
    fxCtx.translate(-camX + sx, -camY + sy);
    DB.drawGrabBeam(fxCtx); DB.drawParticles(fxCtx);

    fxCtx.textAlign = 'center'; fxCtx.font = 'bold 16px ui-monospace, monospace';
    for (const f of DB.floaters) {
      fxCtx.globalAlpha = Math.min(1, f.life / (f.maxLife * 0.4));
      fxCtx.fillStyle = f.color; fxCtx.shadowColor = f.color; fxCtx.shadowBlur = 10;

      if (f.isCrit) {
        fxCtx.save(); fxCtx.font = 'bold 24px ui-monospace, monospace';
        fxCtx.translate(f.x, f.y); const scale = 1.2 + Math.sin(f.life * 20) * 0.1;
        fxCtx.scale(scale, scale); fxCtx.fillText(f.text, 0, 0); fxCtx.restore();
      } else {
        fxCtx.font = 'bold 16px ui-monospace, monospace'; fxCtx.fillText(f.text, f.x, f.y);
      }
    }
    fxCtx.restore();

    if (vignetteEl) {
      let tensionRatio = 0;
      if (state.mode === 'defender' && DB.heldWeapon && DB.heldWeapon.held) {
        const w = DB.heldWeapon;
        const dd = Math.hypot(DB.mouse.x - w.anchorX, DB.mouse.y - w.anchorY);
        const start = CFG.SLINGSHOT.MAX_PULL * 0.7;
        if (dd > start) tensionRatio = Math.min(1, (dd - start) / (CFG.SLINGSHOT.MAX_PULL * 0.3));
      }
      vignetteEl.style.opacity = String(tensionRatio * 0.85);
    }

    if (state.bossEnrageFlash > 0.001) { dom.flashEl.style.background = '#ff2a4a'; dom.flashEl.style.opacity = String(Math.min(0.7, state.bossEnrageFlash)); }
    else if (state.damageFlash > 0.001) { dom.flashEl.style.background = '#ff2a4a'; dom.flashEl.style.opacity = String(Math.min(0.6, state.damageFlash)); }
    else if (state.flash > 0.001) { dom.flashEl.style.background = '#ffffff'; dom.flashEl.style.opacity = String(Math.min(0.85, state.flash)); }
    else if (dom.flashEl.style.opacity !== '0') { dom.flashEl.style.opacity = '0'; }
  }

  /* ==================== 初始化与缩放 ==================== */
  function resize() {
    const s = Math.min(window.innerWidth / VW, window.innerHeight / VH);
    dom.stage.style.transform = `scale(${s})`;
  }
  window.addEventListener('resize', resize);
  resize();

  /* ==================== 输入 ==================== */
  function toWorld(cx, cy) {
    const r = dom.stage.getBoundingClientRect();
    const screenX = ((cx - r.left) / r.width) * VW;
    const screenY = ((cy - r.top) / r.height) * VH;
    return { x: screenX + state.camera.x, y: screenY + state.camera.y };
  }

  function bindInput() {
    const mouse = DB.mouse, trail = DB.trail, keys = DB.keys;

    dom.stage.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.mode-card') || e.target.closest('.title-start') || e.target.closest('#modal-layer') || e.target.closest('.title-action-btn') || e.target.closest('.tutorial-btn')) { if (state.scene === 'title') return; }

      if (state.scene === 'title') { startGame(); return; }
      if (state.scene === 'gameover') { if (state.gameOverLock <= 0) backToTitle(); return; }
      if (state.tutorial.active && state.tutorial.step === 6) { backToTitle(); return; }

      const p = toWorld(e.clientX, e.clientY);
      mouse.x = p.x; mouse.y = p.y; mouse.down = true;
      trail.length = 0; trail.push({ x: p.x, y: p.y, t: performance.now() });
      DB.tryGrab(p.x, p.y);
    });

    window.addEventListener('mousemove', (e) => {
      const p = toWorld(e.clientX, e.clientY);
      mouse.x = p.x; mouse.y = p.y;
      trail.push({ x: p.x, y: p.y, t: performance.now() }); while (trail.length > 14) trail.shift();
    });

    window.addEventListener('mouseup', (e) => { if (e.button !== 0) return; mouse.down = false; DB.releaseThrow(); });
    window.addEventListener('blur', () => { keys.clear(); mouse.down = false; DB.releaseThrow(); });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      if (state.scene === 'title') { startGame(); return; }
      if (state.scene === 'gameover') { if (state.gameOverLock <= 0) backToTitle(); return; }
      if (state.tutorial.active && state.tutorial.step === 6) { backToTitle(); return; }

      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'a' || k === 's' || k === 'd') { keys.add(k); e.preventDefault(); return; }
      if (k === 'shift') { DB.triggerShift(); e.preventDefault(); return; }
      if (k >= '0' && k <= '9') { DB.handleNumberKey(k); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

    const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isMobile) {
      // 沿用原移动端绑定逻辑
    }

    DB.triggerShift = function() {
      if (state.skillCd <= 0 && state.scene === 'playing') {
        if (state.mode === 'defender') {
          state.skillActiveT = 1.5; state.skillCd = 5.0; state.flash = Math.max(state.flash, 0.15);
          DB.spawnParticles(DB.player.x, DB.player.y, 30, '#5ae8ff', 300); DB.sfx.chip();
        } else {
          DB.enemyBullets.length = 0;
          for (const en of DB.enemies) {
            const blastDmg = 40 + (state.wave * 5) + (state.combo * 2);
            en.hp -= blastDmg; en.flashT = 0.2; en.virus = true;
            DB.spawnParticles(en.x, en.y, 15, '#ffcc00', 400);
          }
          if (DB.boss && DB.boss.phase === 'normal') { DB.boss.hp -= (40 + state.wave * 5); DB.boss.flashT = 0.2; }
          state.skillCd = 6.0; state.flash = Math.max(state.flash, 0.4); state.shake = 25; state.hitstop = 0.1; DB.sfx.error();
        }
      }
    };

    DB.handleNumberKey = function(k) {
      if (state.qte.active) {
        const targetChar = state.qte.sequence[state.qte.inputIndex];
        if (k === targetChar) {
          state.qte.inputIndex++; DB.sfx.grab(); state.shake = Math.min(state.shake + 2, 10);
          if (state.qte.inputIndex >= state.qte.sequence.length) {
            state.qte.active = false; DB.boss = null;
            state.bossEnrageTextT = 0; state.bossEnrageFlash = 0;
            state.flash = 1.0; state.shake = 40; state.hitstop = 0.2;
            // ...
          }
        } else {
          state.qte.inputIndex = 0; state.qte.timer -= 1.0; state.damageFlash = 0.4; state.shake = 20; DB.sfx.error();
        }
      } else {
        if (k >= '1' && k <= '4') DB.tryUltimate(k);
      }
    };

    DB.handleMobileKey = function(key) {
      if (state.scene === 'title') { startGame(); return; }
      if (state.scene === 'gameover') { if (state.gameOverLock <= 0) backToTitle(); return; }
      if (key === 'shift') DB.triggerShift();
      else DB.handleNumberKey(key);
    };
  }

  /* ==================== 主循环 ==================== */
  function update(dt) {
    if (dt <= 0) return;
    state.t += dt;
    DB.updatePlayer(dt); DB.updateWeapons(dt); DB.updateEnemies(dt); DB.updateChips(dt); DB.updateParticles(dt); DB.updateTerminal(dt); updateWaves(dt);

    if (state.comboTimer > 0) {
      state.comboTimer -= dt; if (state.comboTimer <= 0) state.combo = 0;
    }
    for (let i = DB.floaters.length - 1; i >= 0; i--) {
      const f = DB.floaters[i]; f.y += f.vy * dt; f.life -= dt; if (f.life <= 0) DB.floaters.splice(i, 1);
    }
  }

  let lastTime = performance.now();
  function frame(now) {
    const realDt = Math.min((now - lastTime) / 1000, 0.05); lastTime = now;

    state.shake *= Math.exp(-9 * realDt); if (state.shake < 0.15) state.shake = 0;
    state.flash *= Math.exp(-11 * realDt); if (state.flash < 0.004) state.flash = 0;
    state.damageFlash *= Math.exp(-10 * realDt); if (state.damageFlash < 0.004) state.damageFlash = 0;

    if (state.skillCd > 0) state.skillCd -= realDt;
    if (state.skillActiveT > 0) state.skillActiveT -= realDt;
    state.bossEnrageFlash *= Math.exp(-6 * realDt); if (state.bossEnrageFlash < 0.004) state.bossEnrageFlash = 0;
    if (state.bossEnrageTextT > 0) state.bossEnrageTextT = Math.max(0, state.bossEnrageTextT - realDt);

    if (state.scene === 'title') { state.t += realDt; render(); DB.updateHUD(); requestAnimationFrame(frame); return; }
    if (state.scene === 'gameover') {
      if (state.gameOverLock > 0) state.gameOverLock -= realDt;
      DB.updateParticles(realDt); render(); DB.updateHUD(); requestAnimationFrame(frame); return;
    }

    if (state.hp <= 0 && state.scene === 'playing') {
      state.scene = 'gameover'; state.gameOverLock = 0.6; state.hitstop = 0.12; state.shake = 30; DB.heldWeapon = null;
      state.bossEnrageTextT = 0; state.bossEnrageFlash = 0;
      if (state.score > highestScore) { highestScore = state.score; localStorage.setItem('sys_brawler_highscore', highestScore.toString()); }
      const earnedPoints = Math.floor(state.score / 10);
      if (earnedPoints > 0) { sysPoints += earnedPoints; localStorage.setItem('sys_brawler_points', sysPoints.toString()); }
      showGameOver();
    }

    let dt = realDt; if (state.hitstop > 0) { state.hitstop -= realDt; dt = 0; }

    update(dt); render(); DB.updateHUD(); requestAnimationFrame(frame);
  }

  function init() {
    initBackground(); initVignette(); DB.buildHUD(); bindTitleEvents(); resetWorld(false); bindInput();
    state.scene = 'title'; showTitle();
    requestAnimationFrame((t) => { lastTime = t; requestAnimationFrame(frame); });
  }

  init();

})(window.DB);