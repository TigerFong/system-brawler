(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const dom   = DB.dom;
  const W     = CFG.W;        // 世界宽 2560
  const H     = CFG.H;        // 世界高 1440
  const VW    = CFG.VIEW_W;   // 屏幕宽 1280
  const VH    = CFG.VIEW_H;   // 屏幕高 720

  let highestScore = parseInt(localStorage.getItem('sys_brawler_highscore') || '0', 10);
  let sysPoints = parseInt(localStorage.getItem('sys_brawler_points') || '0', 10);
  
  const defaultUpgrades = { hp:0, energy:0, chip:0, weapon:0, duration:0, damage:0 };
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
      start: () => { tone(330, 0.08, 'sine', 0.05, 220); tone(660, 0.14, 'sine', 0.045, 300); }, error: () => { tone(150, 0.15, 'sawtooth', 0.05, -50); noise(0.1, 0.05); }
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

  /* ==================== 标题画面 ==================== */
  let currentMode = 'defender';
  const RULES_DEFENDER = `
    <div class="rule-row"><span class="key">WASD</span><span class="txt">走位躲避弹幕</span></div>
    <div class="rule-row"><span class="key">鼠标</span><span class="txt">抓取系统模块 · 向后拉 · 松手弹射</span></div>
    <div class="rule-row"><span class="key">1-4</span><span class="txt">能量满时释放大招 / Boss瘫痪时处决</span></div>
    <div class="rule-row"><span class="key">目标</span><span class="txt">清空波次 · 用模块砸碎病毒</span></div>
  `;
  const RULES_HACKER = `
    <div class="rule-row"><span class="key">WASD</span><span class="txt">走位躲避杀毒软件</span></div>
    <div class="rule-row"><span class="key">鼠标</span><span class="txt">抓取病毒 · 拖拽到敌人身上直接引爆</span></div>
    <div class="rule-row"><span class="key">1-4</span><span class="txt">能量满时释放全屏大招 / Boss瘫痪时处决</span></div>
    <div class="rule-row"><span class="key">目标</span><span class="txt">清空波次 · 發射病毒炸碎卫士</span></div>
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

    modalClose.addEventListener('click', () => { modalLayer.style.display = 'none'; });
    modalLayer.addEventListener('click', (e) => { if (e.target === modalLayer) modalLayer.style.display = 'none'; });
    btnOpenRules.addEventListener('click', (e) => { e.stopPropagation(); modalLayer.style.display = 'flex'; rulesPanel.style.display = 'block'; upPanel.style.display = 'none'; });
    btnOpenUpgrades.addEventListener('click', (e) => { e.stopPropagation(); modalLayer.style.display = 'flex'; rulesPanel.style.display = 'none'; upPanel.style.display = 'block'; updateUpgradeUI(); });

    const pointsText = document.getElementById('sys-points-text');
    const btnHp = document.getElementById('up-hp'), btnEnergy = document.getElementById('up-energy'), btnChip = document.getElementById('up-chip');
    const btnWeapon = document.getElementById('up-weapon'), btnDuration = document.getElementById('up-duration'), btnDamage = document.getElementById('up-damage');

    function getCost(type, level) {
      level = level || 0;
      if (type === 'hp') return Math.floor(50 * (1.3 ** level));
      if (type === 'energy') return Math.floor(80 * (1.5 ** level));
      if (type === 'chip') return Math.floor(100 * (1.4 ** level));
      if (type === 'weapon') return Math.floor(150 * (1.6 ** level));
      if (type === 'duration') return Math.floor(120 * (1.5 ** level));
      if (type === 'damage') return Math.floor(200 * (1.4 ** level));
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
    state.mods = { damage: 0, grab: 0, launch: 0 }; state.combo = 0; state.maxCombo = 0; state.score = 0;
    
    state.camera.x = W / 2 - VW / 2; state.camera.y = H / 2 - VH / 2;

    DB.player.x = W * 0.34; DB.player.y = 600; DB.player.vx = 0; DB.player.vy = 0;
    for (let i = 0; i < 3; i++) { const w = DB.spawnWeapon('light_dart'); if (w) w.warning = 0.001; }
    
    if (withWave) DB.spawnWave(1);
    DB.updateHUD();
  }

  function startGame() {
    hideTitle(); resetWorld(true); state.mode = currentMode; state.scene = 'playing'; DB.sfx.start();
  }
  function backToTitle() { 
    hideGameOver(); resetWorld(false); showTitle(); state.scene = 'title'; 
    setTimeout(() => { if (gameOverEl) { gameOverEl.remove(); gameOverEl = null; } }, 400);
  }

  /* ==================== 波次 ==================== */
  function updateWaves(dt) {
    if (state.scene !== 'playing') return;
    if (state.waveBreakT > 0) {
      state.waveBreakT -= dt;
      if (state.waveBreakT <= 0) { 
        state.wave++;
        // 10 的倍数出大 Boss，5 的倍数出小 Boss，否则出普通怪
        if (state.wave % 10 === 0) {
          DB.spawnBoss(true); 
        } else if (state.wave % 5 === 0) {
          DB.spawnBoss(false); 
        } else {
          DB.spawnWave(state.wave);
        }
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
    // ===== 新增：QTE 时隐藏武器层，防止遮挡密码 =====
    if (state.qte.active) {
      dom.weaponLayer.style.opacity = '0';
    } else {
      dom.weaponLayer.style.opacity = '1';
    }

    // 摄像机平滑跟随
    let targetX = DB.player.x - VW / 2;
    let targetY = DB.player.y - VH / 2;
    targetX = DB.clamp(targetX, 0, W - VW);
    targetY = DB.clamp(targetY, 0, H - VH);

    state.camera.x += (targetX - state.camera.x) * 0.15;
    state.camera.y += (targetY - state.camera.y) * 0.15;

    const camX = state.camera.x;
    const camY = state.camera.y;

    // 计算屏幕震动
    let sx = 0, sy = 0;
    if (state.shake > 0.15) {
      sx = (Math.random() * 2 - 1) * state.shake;
      sy = (Math.random() * 2 - 1) * state.shake;
    }

    // DOM 武器层：跟随世界移动
    dom.weaponLayer.style.transform = `translate3d(${-(camX - sx).toFixed(2)}px, ${-(camY - sy).toFixed(2)}px, 0)`;

    const bgCtx = dom.bgCtx;
    bgCtx.clearRect(0, 0, W, H);
    
    // --- 绘制世界层 ---
    bgCtx.save();
    bgCtx.translate(-camX + sx, -camY + sy);
    bgCtx.drawImage(gridCanvas, 0, 0);
    DB.drawChips(bgCtx); DB.drawEnemyBullets(bgCtx); DB.drawEnemies(bgCtx); DB.drawPlayer(bgCtx); DB.drawSpawnWarnings(bgCtx);
    bgCtx.restore();

    // --- 绘制 UI 层（不受摄像机影响） ---
    if (state.scene === 'playing') {
      bgCtx.save();
      
      bgCtx.textAlign = 'center'; bgCtx.font = 'bold 22px ui-monospace, monospace';
      bgCtx.fillStyle = 'rgba(150, 200, 255, 0.55)'; bgCtx.shadowColor = 'rgba(90, 240, 255, 0.6)'; bgCtx.shadowBlur = 16;
      
      const waveY = DB.boss ? 30 : 46;
      bgCtx.fillText(`WAVE ${String(state.wave).padStart(2, '0')}`, VW / 2, waveY);
      
      if (DB.boss) {
        const barW = 600, barH = 12; const barX = (VW - barW) / 2, barY = 46;
        bgCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'; bgCtx.strokeStyle = 'rgba(255, 90, 122, 0.5)'; bgCtx.lineWidth = 1;
        bgCtx.fillRect(barX, barY, barW, barH); bgCtx.strokeRect(barX, barY, barW, barH);
        const hpRatio = Math.max(0, DB.boss.hp / DB.boss.maxHp);
        
        let barColor = DB.boss.isBig ? '#ffaa00' : '#ff5a7a';
        if (DB.boss.phase === 'paralyzed') barColor = '#ffcc00';
        
        bgCtx.fillStyle = barColor; bgCtx.shadowColor = barColor; bgCtx.shadowBlur = 10;
        bgCtx.fillRect(barX, barY, barW * hpRatio, barH); bgCtx.shadowBlur = 0;
        
        bgCtx.font = 'bold 12px ui-monospace, monospace'; bgCtx.fillStyle = '#ffffff';
        let bossName = 'UNKNOWN';
        if (state.mode === 'hacker') {
          if (DB.boss.bossType === 'bsod') bossName = '防火墙矩阵';
          if (DB.boss.bossType === 'firewall') bossName = '查杀引擎主脑';
          if (DB.boss.bossType === 'vampire') bossName = '隔离沙盒';
          if (DB.boss.bossType === 'manager') bossName = '系统总控 (大Boss)';
          if (DB.boss.bossType === 'trojan') bossName = '根权限守卫 (大Boss)';
        } else {
          if (DB.boss.bossType === 'bsod') bossName = '蓝屏死机核心';
          if (DB.boss.bossType === 'firewall') bossName = '防火墙巨像';
          if (DB.boss.bossType === 'vampire') bossName = '内存吸血鬼';
          if (DB.boss.bossType === 'manager') bossName = '安全管家 (大Boss)';
          if (DB.boss.bossType === 'trojan') bossName = '木马母体 (大Boss)';
        }
        if (DB.boss.phase === 'paralyzed') bossName = 'SYSTEM HALTED';
        
        bgCtx.fillText(bossName, VW / 2, barY + 10);
      }

      if (state.combo > 1) {
        bgCtx.save(); bgCtx.textAlign = 'left'; const scale = 1 + Math.min(0.5, state.combo * 0.02);
        bgCtx.translate(30, 90); bgCtx.scale(scale, scale);
        bgCtx.font = 'bold 32px ui-monospace, monospace'; bgCtx.fillStyle = '#ffcc00'; bgCtx.shadowColor = '#ffcc00'; bgCtx.shadowBlur = 15;
        bgCtx.fillText(`${state.combo} COMBO`, 0, 0); bgCtx.restore();
        bgCtx.save(); bgCtx.textAlign = 'left'; bgCtx.font = '14px ui-monospace, monospace'; bgCtx.fillStyle = '#ffffff';
        bgCtx.fillText(`SCORE: ${state.score}`, 32, 115); bgCtx.restore();
      }

      if (state.waveBreakT > 0) {
        bgCtx.textAlign = 'center'; bgCtx.font = '13px ui-monospace, monospace'; bgCtx.fillStyle = 'rgba(150, 200, 255, 0.45)'; bgCtx.shadowBlur = 0;
        bgCtx.fillText(`NEXT WAVE IN ${Math.max(0, state.waveBreakT).toFixed(1)}s`, VW / 2, DB.boss ? 75 : 70);
      }
      
      if (state.qte.active) {
        bgCtx.fillStyle = 'rgba(0, 0, 0, 0.85)'; bgCtx.fillRect(0, VH / 2 - 100, VW, 200); 
        bgCtx.strokeStyle = '#ff5a7a'; bgCtx.lineWidth = 2;
        bgCtx.beginPath(); bgCtx.moveTo(0, VH / 2 - 100); bgCtx.lineTo(VW, VH / 2 - 100); bgCtx.stroke();
        bgCtx.beginPath(); bgCtx.moveTo(0, VH / 2 + 100); bgCtx.lineTo(VW, VH / 2 + 100); bgCtx.stroke();

        bgCtx.textAlign = 'center'; bgCtx.font = 'bold 20px ui-monospace, monospace'; bgCtx.fillStyle = '#ff5a7a'; bgCtx.shadowColor = '#ff5a7a'; bgCtx.shadowBlur = 20;
        bgCtx.fillText('⚠ 核心瘫痪 · 输入覆盖指令 ⚠', VW / 2, VH / 2 - 40);

        bgCtx.font = '14px ui-monospace, monospace'; bgCtx.fillStyle = '#ffffff'; bgCtx.shadowBlur = 0;
        bgCtx.fillText(`剩余时间: ${state.qte.timer.toFixed(1)}s`, VW / 2, VH / 2 + 50);

        // 动态适配 8 位和 10 位数字
        bgCtx.font = 'bold 56px ui-monospace, monospace'; // 字体更大
        const seq = state.qte.sequence; 
        const spacing = 70; // 间距更大
        const totalW = seq.length * spacing; 
        const startX = VW / 2 - totalW / 2 + spacing / 2;

        for (let i = 0; i < seq.length; i++) {
          const char = seq[i]; let color = '#5ae8ff'; 
          if (i < state.qte.inputIndex) color = '#5ee6a8';
          else if (i === state.qte.inputIndex) { color = '#ffcc00'; if (Math.sin(state.t * 30) > 0) color = '#ffffff'; }
          bgCtx.shadowColor = color; bgCtx.shadowBlur = 20; bgCtx.fillStyle = color;
          bgCtx.fillText(char, startX + i * spacing, VH / 2 + 15);
        }
        bgCtx.shadowBlur = 0; 
        bgCtx.fillStyle = 'rgba(255, 255, 255, 0.2)'; bgCtx.fillRect(VW / 2 - 150, VH / 2 + 30, 300, 4);
        bgCtx.fillStyle = '#5ae8ff'; bgCtx.fillRect(VW / 2 - 150, VH / 2 + 30, 300 * (state.qte.inputIndex / seq.length), 4);
      }

      if (!state.qte.active) {
        bgCtx.save(); bgCtx.font = '11px ui-monospace, monospace'; bgCtx.textAlign = 'right'; bgCtx.fillStyle = 'rgba(150, 200, 255, 0.6)';
        if (state.mode === 'hacker') {
          bgCtx.fillText('[4] 万剑归宗', VW - 26, VH - 105); bgCtx.fillText('[3] 紧急重启', VW - 26, VH - 120);
          bgCtx.fillText('[2] 冻结协议', VW - 26, VH - 135); bgCtx.fillText('[1] 逻辑炸弹', VW - 26, VH - 150);
        } else {
          bgCtx.fillText('[4] 核心熔毁', VW - 26, VH - 105); bgCtx.fillText('[3] 系统重载', VW - 26, VH - 120);
          bgCtx.fillText('[2] 时间凝滞', VW - 26, VH - 135); bgCtx.fillText('[1] 代码暴雨', VW - 26, VH - 150);
        }
        bgCtx.restore();
      }
      
      const mods = state.mods;
      if (mods.damage > 0 || mods.grab > 0 || mods.launch > 0) {
        bgCtx.font = '11px ui-monospace, monospace'; bgCtx.textAlign = 'left'; bgCtx.shadowBlur = 0;
        let yy = 30;
        if (mods.damage > 0) { bgCtx.fillStyle = '#ff7a9a'; bgCtx.fillText(`DMG +${Math.round(mods.damage * 100)}%`, 24, yy); yy += 16; }
        if (mods.grab > 0) { bgCtx.fillStyle = '#5ae8ff'; bgCtx.fillText(`RNG +${Math.round(mods.grab)}`, 24, yy); yy += 16; }
        if (mods.launch > 0) { bgCtx.fillStyle = '#c08bff'; bgCtx.fillText(`SPD +${Math.round(mods.launch * 100)}%`, 24, yy); }
      }
      bgCtx.restore();
    }

    // --- 绘制世界层特效 ---
    const fxCtx = dom.fxCtx;
    fxCtx.clearRect(0, 0, W, H);
    
    fxCtx.save();
    fxCtx.translate(-camX + sx, -camY + sy);
    DB.drawGrabBeam(fxCtx); DB.drawParticles(fxCtx);

    fxCtx.textAlign = 'center'; fxCtx.font = 'bold 16px ui-monospace, monospace';
    for (const f of DB.floaters) {
      fxCtx.globalAlpha = Math.min(1, f.life / (f.maxLife * 0.4));
      fxCtx.fillStyle = f.color; fxCtx.shadowColor = f.color; fxCtx.shadowBlur = 10;
      fxCtx.fillText(f.text, f.x, f.y);
    }
    fxCtx.restore();

    if (state.damageFlash > 0.001) { dom.flashEl.style.background = '#ff2a4a'; dom.flashEl.style.opacity = String(Math.min(0.6, state.damageFlash)); }
    else if (state.flash > 0.001) { dom.flashEl.style.background = '#ffffff'; dom.flashEl.style.opacity = String(Math.min(0.85, state.flash)); }
    else if (dom.flashEl.style.opacity !== '0') { dom.flashEl.style.opacity = '0'; }
  }

  /* ==================== 输入 ==================== */
  // 鼠标屏幕坐标转化为世界坐标
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
      if (e.target.closest('.mode-card') || e.target.closest('.title-start') || e.target.closest('#modal-layer') || e.target.closest('.title-action-btn')) { if (state.scene === 'title') return; }
      
      if (state.scene === 'title') { startGame(); return; }
      if (state.scene === 'gameover') { if (state.gameOverLock <= 0) backToTitle(); return; }

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

      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'a' || k === 's' || k === 'd') { keys.add(k); e.preventDefault(); return; }

      if (k >= '0' && k <= '9') {
        if (state.qte.active) {
          const targetChar = state.qte.sequence[state.qte.inputIndex];
          if (k === targetChar) {
            state.qte.inputIndex++; DB.sfx.grab(); state.shake = Math.min(state.shake + 2, 10);
            if (state.qte.inputIndex >= state.qte.sequence.length) {
              state.qte.active = false; DB.boss = null;
              state.flash = 1.0; state.shake = 40; state.hitstop = 0.2;
              for (let i = 0; i < 120; i++) {
                DB.particles.push({ x: W/2 + (Math.random()-0.5)*600, y: 100 + Math.random()*500, vx: (Math.random()-0.5)*100, vy: 300 + Math.random()*500, life: 1.5, maxLife: 1.5, size: 4 + Math.random()*6, color: '#5ee6a8', spin: 0, rot: 0 });
              }
              
              // ===== 新增：Boss 战后的丰富奖励 =====
              // 1. 满血复活
              state.hp = state.hpMax;
              // 2. 能量充满
              state.energy = state.energyMax;
              // 3. 在玩家周围爆出 15 个芯片，像天女散花
              for (let i = 0; i < 15; i++) {
                const angle = (i / 15) * Math.PI * 2;
                const dist = 100 + Math.random() * 150;
                DB.spawnChip(DB.player.x + Math.cos(angle) * dist, DB.player.y + Math.sin(angle) * dist);
              }
              // 4. 少量额外补给武器
              for (let i = 0; i < 3; i++) {
                const w = DB.spawnWeapon('fire_shield');
                if (w) w.warning = 0.001;
              }
              // =====================================

              DB.sfx.clear(); state.waveBreakT = 4.0; // 给玩家 4 秒时间吃满地的芯片
            }
          } else {
            state.qte.inputIndex = 0; state.qte.timer -= 1.0; state.damageFlash = 0.4; state.shake = 20; DB.sfx.error();
          }
        } else { if (k >= '1' && k <= '4') DB.tryUltimate(k); }
        e.preventDefault();
      }
    });
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
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

    if (state.scene === 'title') { state.t += realDt; render(); DB.updateHUD(); requestAnimationFrame(frame); return; }
    if (state.scene === 'gameover') {
      if (state.gameOverLock > 0) state.gameOverLock -= realDt;
      DB.updateParticles(realDt); render(); DB.updateHUD(); requestAnimationFrame(frame); return;
    }

    if (state.hp <= 0 && state.scene === 'playing') {
      state.scene = 'gameover'; state.gameOverLock = 0.6; state.hitstop = 0.12; state.shake = 30; DB.heldWeapon = null; 
      if (state.score > highestScore) { highestScore = state.score; localStorage.setItem('sys_brawler_highscore', highestScore.toString()); }
      const earnedPoints = Math.floor(state.score / 10);
      if (earnedPoints > 0) { sysPoints += earnedPoints; localStorage.setItem('sys_brawler_points', sysPoints.toString()); }
      showGameOver();
    }

    let dt = realDt; if (state.hitstop > 0) { state.hitstop -= realDt; dt = 0; }

    update(dt); render(); DB.updateHUD(); requestAnimationFrame(frame);
  }

  /* ==================== 初始化 ==================== */
  function resize() { const s = Math.min(window.innerWidth / VW, window.innerHeight / VH); dom.stage.style.transform = `scale(${s})`; }
  window.addEventListener('resize', resize); resize();

  function init() {
    initBackground(); DB.buildHUD(); bindTitleEvents(); resetWorld(false); bindInput();
    state.scene = 'title'; showTitle();
    requestAnimationFrame((t) => { lastTime = t; requestAnimationFrame(frame); });
  }

  init();

})(window.DB);