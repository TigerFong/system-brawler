(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const W     = CFG.W;
  const H     = CFG.H;

  DB.GROWTH = {
    hpExponent:           1.60,   
    dmgExponent:          0.75,   
    bossDmgPerWave:       0.30,   
    bossSpeedPerWave:     0.15,   
    
    droneCountDiv:        1.5,    
    wormCountDiv:         1.5,
    shieldCountDiv:       1.5,
    turretCountDiv:       1.5,
    chargerCountDiv:      1.5,
    splitterCountDiv:     1.5,
    
    bossBulletDivDefault: 1.5,     
    bossBulletDivFirewall: 2,     
    bossSummonDiv:        2       
  };
  const G = DB.GROWTH;

  DB.enemies      = [];
  DB.enemyBullets = [];
  DB.chips        = [];

  const ENEMY_HP      = DB.ENEMY_CFG.droneHp;
  const ENEMY_R       = 20;
  const FIRE_INTERVAL = 2.2;
  const BULLET_SPEED  = 260;
  const BULLET_R      = 6;
  const BULLET_LIFE   = 6;
  const CHIP_LIFETIME = 14;

  // ===== 【新增】统一的 QTE 触发与清场逻辑 =====
  DB.triggerQTE = function (b) {
    if (b.phase === 'paralyzed') return;
    b.hp = 0;
    b.phase = 'paralyzed';
    state.qte.active = true;
    state.qte.timer = b.isBig ? 9.0 : 7.0;
    state.qte.inputIndex = 0;
    
    const seqLen = b.isBig ? 8 : 6; 
    let seq = "";
    for(let i=0; i<seqLen; i++) seq += Math.floor(Math.random() * 10);
    state.qte.sequence = seq;
    
    state.flash = 0.5;
    state.hitstop = 0.15;
    DB.sfx.hurt();

    // 强制清场，给玩家绝对安全的环境
    DB.enemies.length = 0;
    DB.enemyBullets.length = 0;
    DB.spawnParticles(b.x, b.y, 100, '#ffcc00', 800);
  };

  DB.spawnWave = function (n) {
    const camX = state.camera.x;
    const camY = state.camera.y;
    const minX = DB.clamp(camX - 100, 0, CFG.W);
    const maxX = DB.clamp(camX + CFG.VIEW_W + 100, 0, CFG.W);
    const minY = DB.clamp(camY - 100, CFG.PLAY_TOP, CFG.GROUND_Y);
    const maxY = DB.clamp(camY + CFG.VIEW_H, CFG.PLAY_TOP, CFG.GROUND_Y);

    const hpMult      = Math.pow(G.hpExponent, n - 1);
    const waveDmgMult = Math.pow(G.dmgExponent, n - 1);

    const droneCount    = 2 + Math.floor(n / G.droneCountDiv);
    const wormCount     = 1 + Math.floor(n / G.wormCountDiv);
    const shieldCount   = 1 + Math.floor(n / G.shieldCountDiv);
    const turretCount   = n >= 3 ? 1 + Math.floor((n - 3) / G.turretCountDiv) : 0;
    const chargerCount  = n >= 4 ? 1 + Math.floor((n - 4) / G.chargerCountDiv) : 0;
    const splitterCount = n >= 5 ? 1 + Math.floor((n - 5) / G.splitterCountDiv) : 0;

    for (let i = 0; i < droneCount; i++) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * ((maxY - minY) * 0.5);
      DB.enemies.push({
        type: 'drone', x, y, baseX: x, baseY: y,
        seed: Math.random() * 100, 
        hp: Math.floor(ENEMY_HP * hpMult),
        maxHp: Math.floor(ENEMY_HP * hpMult),
        r: ENEMY_R,
        dmg: Math.floor(10 * waveDmgMult), 
        fireCd: 0.8 + Math.random() * 1.6, flashT: 0, frozen: 0
      });
    }

    for (let i = 0; i < wormCount; i++) {
      const fromLeft = Math.random() > 0.5;
      const x = fromLeft ? minX - 40 : maxX + 40;
      const y = CFG.GROUND_Y - 15;
      DB.enemies.push({
        type: 'worm', x, y,
        vx: 0, 
        hp: Math.floor(DB.ENEMY_CFG.wormHp * hpMult),
        maxHp: Math.floor(DB.ENEMY_CFG.wormHp * hpMult),
        r: 22,
        speed: DB.ENEMY_CFG.wormSpeed, 
        dmg: Math.floor(18 * waveDmgMult), 
        seed: Math.random() * 100, flashT: 0, frozen: 0,
        phase: Math.random() * Math.PI * 2
      });
    }

    for (let i = 0; i < shieldCount; i++) {
      const fromLeft = Math.random() > 0.5;
      const x = fromLeft ? minX - 40 : maxX + 40;
      const y = CFG.GROUND_Y - 25;
      DB.enemies.push({
        type: 'shield', x, y,
        vx: 0, 
        hp: Math.floor(DB.ENEMY_CFG.shieldHp * hpMult),
        maxHp: Math.floor(DB.ENEMY_CFG.shieldHp * hpMult),
        r: 28,
        speed: 60, 
        dmg: Math.floor(22 * waveDmgMult), 
        seed: Math.random() * 100, flashT: 0, frozen: 0,
        facing: fromLeft ? 1 : -1
      });
    }

    for (let i = 0; i < turretCount; i++) {
      const spanW = Math.max(200, (maxX - minX) - 200);
      const x = DB.clamp(minX + 100 + Math.random() * spanW, 80, W - 80);
      const y = CFG.GROUND_Y - 30;
      DB.enemies.push({
        type: 'turret', x, y,
        hp: Math.floor(DB.ENEMY_CFG.turretHp * hpMult),
        maxHp: Math.floor(DB.ENEMY_CFG.turretHp * hpMult),
        r: 26,
        dmg: Math.floor(15 * waveDmgMult),
        seed: Math.random() * 100,
        fireCd: 0.6 + Math.random() * 0.8,
        angle: 0,
        flashT: 0, frozen: 0,
        isNew: true
      });
      if (DB.floaters) DB.floaters.push({ text: '⚠ 炮塔部署', x, y: y - 50, vy: -40, life: 1.6, maxLife: 1.6, color: '#ffaa00' });
    }

    for (let i = 0; i < chargerCount; i++) {
      const fromLeft = Math.random() > 0.5;
      const x = fromLeft ? minX - 40 : maxX + 40;
      const y = CFG.GROUND_Y - 20;
      DB.enemies.push({
        type: 'charger', x, y,
        hp: Math.floor(DB.ENEMY_CFG.chargerHp * hpMult),
        maxHp: Math.floor(DB.ENEMY_CFG.chargerHp * hpMult),
        r: 24,
        dmg: Math.floor(28 * waveDmgMult),
        seed: Math.random() * 100,
        state: 'approach',
        stateT: 0,
        dashDirX: 0, dashDirY: 0,
        facing: fromLeft ? 1 : -1,
        flashT: 0, frozen: 0,
        isNew: true
      });
      if (DB.floaters) DB.floaters.push({ text: '⚠ 冲锋者来袭', x, y: y - 50, vy: -40, life: 1.6, maxLife: 1.6, color: '#ffcc00' });
    }

    for (let i = 0; i < splitterCount; i++) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * ((maxY - minY) * 0.5);
      DB.enemies.push({
        type: 'splitter', x, y,
        seed: Math.random() * 100,
        hp: Math.floor(DB.ENEMY_CFG.splitterHp * hpMult),
        maxHp: Math.floor(DB.ENEMY_CFG.splitterHp * hpMult),
        r: 26,
        dmg: Math.floor(15 * waveDmgMult),
        flashT: 0, frozen: 0,
        isMini: false,
        isNew: true
      });
      if (DB.floaters) DB.floaters.push({ text: '⚠ 裂变体出现', x, y: y - 50, vy: -40, life: 1.6, maxLife: 1.6, color: '#c08bff' });
    }
  };

  DB.spawnBoss = function (isBig) {
    const camX = state.camera.x;
    const camY = state.camera.y;
    
    const typePool = isBig ? DB.BIG_BOSS_TYPES : DB.SMALL_BOSS_TYPES;
    const bossType = typePool[Math.floor(Math.random() * typePool.length)];
    
    const waveMult = Math.pow(G.hpExponent, state.wave - 1);
    const baseHp   = isBig ? DB.BOSS_CFG.bigHp : DB.BOSS_CFG.smallHp;
    const hp       = Math.floor(baseHp * waveMult);

    const startX = camX + CFG.VIEW_W / 2;
    const startY = camY + 200;

    DB.boss = {
      x: startX, y: startY, baseX: startX, baseY: startY,
      hp: hp, maxHp: hp,
      r: isBig ? DB.BOSS_CFG.radius * 1.2 : DB.BOSS_CFG.radius,
      isBig: isBig, bossType: bossType,
      fireCd: 2.0, summonCd: 3.0, phase: 'normal', flashT: 0, frozen: 0,
      seed: Math.random() * 100, angle: 0,
      enraged: false
    };
    state.qte.active = false;
    state.hp = Math.min(state.hpMax, state.hp + state.hpMax * 0.5);
    DB.enemies.length = 0; 
  };

  DB.spawnChip = function (x, y) {
    const wave = state.wave;
    const weights = {
      common: Math.max(30, 65 - wave * 1.5),
      rare:   Math.min(50, 30 + wave * 0.8),
      epic:   Math.min(25,  5 + wave * 0.5)
    };
    const total = weights.common + weights.rare + weights.epic;
    let roll = Math.random() * total;
    let rarity = 'common';
    if (roll < weights.common) rarity = 'common';
    else if (roll < weights.common + weights.rare) rarity = 'rare';
    else rarity = 'epic';

    const pool = Object.keys(DB.CHIP_TYPES).filter(k => DB.CHIP_TYPES[k].rarity === rarity);
    const type = pool[Math.floor(Math.random() * pool.length)];

    DB.chips.push({
      id: DB.nextUid(),
      type, rarity,
      x, y, r: 12,
      seed: Math.random() * 6.28,
      age: 0, dead: false
    });
  };

  function applyChip(c) {
    const mods = state.mods;
    const cfg  = DB.CHIP_TYPES[c.type];
    const p = DB.player;
    let floatText = '', floatColor = '#ffffff';

    if (c.type === 'damage')       { mods.damage += 0.05; floatText = '伤害 +5%';   floatColor = '#ff7a9a'; }
    else if (c.type === 'grab')    { mods.grab += 15;     floatText = '范围 +15';   floatColor = '#5ae8ff'; }
    else if (c.type === 'launch')  { mods.launch += 0.05; floatText = '弹射 +5%';   floatColor = '#c08bff'; }
    else if (c.type === 'heal') {
      state.hp = Math.min(state.hpMax, state.hp + 15);
      floatText = '+15 HP'; floatColor = '#5ee6a8';
      state.flash = Math.max(state.flash, 0.15);
      DB.spawnParticles(p.x, p.y, 20, '#5ee6a8', 300);
    }
    else if (c.type === 'max_hp') {
      state.hpMax += 10; state.hp += 10;
      floatText = '上限 +10'; floatColor = '#ffcc00';
      state.flash = Math.max(state.flash, 0.15);
      DB.spawnParticles(p.x, p.y, 30, '#ffcc00', 400);
    }
    else if (c.type === 'move') {
      mods.moveSpeed += 0.06;
      floatText = '移速 +6%'; floatColor = '#7aff9a';
    }
    else if (c.type === 'damage2') {
      mods.damage += 0.12;
      floatText = '伤害 +12%'; floatColor = '#7aaaff';
      state.flash = Math.max(state.flash, 0.18);
    }
    else if (c.type === 'lifesteal') {
      mods.lifesteal += 3;
      floatText = '击杀吸血 +3'; floatColor = '#ff5a7a';
      state.flash = Math.max(state.flash, 0.18);
    }
    else if (c.type === 'move2') {
      mods.moveSpeed += 0.12;
      floatText = '移速 +12%'; floatColor = '#66ccff';
      state.flash = Math.max(state.flash, 0.18);
    }
    else if (c.type === 'bloodlust') {
      mods.damage += 0.10;
      mods.lifesteal += 5;
      floatText = '伤害 +10% · 吸血 +5'; floatColor = '#d08bff';
      state.flash = Math.max(state.flash, 0.25);
    }
    else if (c.type === 'move3') {
      mods.moveSpeed += 0.20;
      mods.grab += 20;
      floatText = '移速 +20% · 范围 +20'; floatColor = '#d08bff';
      state.flash = Math.max(state.flash, 0.25);
    }
    else if (c.type === 'crit_dmg') {
      mods.critDmg += 0.15;
      floatText = '暴伤 +15%'; floatColor = '#ffcc00';
    }
    else if (c.type === 'crit_rate') {
      mods.critRate += 0.05;
      mods.critDmg += 0.10;
      floatText = '暴击率 +5% · 暴伤 +10%'; floatColor = '#ffaa00';
      state.flash = Math.max(state.flash, 0.18);
    }
    else if (c.type === 'lethal') {
      mods.critRate += 0.10;
      mods.critDmg += 0.30;
      floatText = '暴击率 +10% · 暴伤 +30%'; floatColor = '#ff2a4a';
      state.flash = Math.max(state.flash, 0.25);
    }

    if (DB.floaters) DB.floaters.push({
      text: floatText, x: p.x, y: p.y - 40,
      vy: -50, life: 1.4, maxLife: 1.4, color: floatColor
    });

    DB.sfx.chip();
    if (c.rarity === 'rare')  DB.sfx.chip();
    if (c.rarity === 'epic')  { DB.sfx.chip(); DB.sfx.clear(); }

    DB.spawnParticles(c.x, c.y, 14, cfg.color, 280);
    DB.spawnParticles(c.x, c.y, 6,  '#ffffff', 380);
    state.energy = Math.min(state.energyMax, state.energy + 4);
  }

  DB.updateChips = function (dt) {
    const p = DB.player;
    for (let i = DB.chips.length - 1; i >= 0; i--) {
      const c = DB.chips[i];
      if (c.dead) continue;
      c.age += dt;
      const dx = p.x - c.x, dy = p.y - c.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d < 120) { const pull = (1 - d / 120) * 900 * dt; c.x += (dx / d) * pull; c.y += (dy / d) * pull; }
      if (d < 24) { applyChip(c); c.dead = true; DB.chips.splice(i, 1); continue; }
      if (c.age > CHIP_LIFETIME) DB.chips.splice(i, 1);
    }
  };

  DB.drawChips = function (ctx) {
    for (const c of DB.chips) {
      if (c.dead) continue;
      const cfg = DB.CHIP_TYPES[c.type];
      if (!cfg) continue;
      const bob = Math.sin(state.t * 4 + c.seed) * 3;
      const x = c.x, y = c.y + bob;

      const isEpic   = c.rarity === 'epic';
      const isRare   = c.rarity === 'rare';
      const glowSize = isEpic ? 32 : (isRare ? 26 : 22);
      const glowStr  = isEpic ? 'aa' : (isRare ? '77' : '55');

      const g = ctx.createRadialGradient(x, y, 0, x, y, glowSize);
      g.addColorStop(0, cfg.color + glowStr);
      g.addColorStop(1, cfg.color + '00');
      ctx.fillStyle = g;
      ctx.fillRect(x - glowSize, y - glowSize, glowSize * 2, glowSize * 2);

      if (isEpic) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-state.t * 1.8);
        ctx.strokeStyle = cfg.color;
        ctx.lineWidth = 2;
        ctx.shadowColor = cfg.color;
        ctx.shadowBlur = 12;
        ctx.globalAlpha = 0.7 + Math.sin(state.t * 6) * 0.3;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * 20, Math.sin(a) * 20);
          ctx.lineTo(Math.cos(a) * 28, Math.sin(a) * 28);
          ctx.stroke();
        }
        ctx.restore();
      }

      const sizeMul = isEpic ? 1.3 : (isRare ? 1.15 : 1);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(state.t * 1.5 + c.seed);
      ctx.fillStyle = cfg.color;
      ctx.shadowColor = cfg.color;
      ctx.shadowBlur = isEpic ? 22 : (isRare ? 18 : 14);
      ctx.beginPath();
      ctx.moveTo(0, -10 * sizeMul); ctx.lineTo(10 * sizeMul, 0);
      ctx.lineTo(0, 10 * sizeMul);   ctx.lineTo(-10 * sizeMul, 0);
      ctx.closePath();
      ctx.fill();
      if (isEpic || isRare) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(0, 0, isEpic ? 3.5 : 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  };

  function damagePlayer(dmg, px, py) {
    if (state.gameOver || state.scene !== 'playing') return;
    // QTE 期间玩家无敌
    if (state.qte.active) return; 
    
    let finalDmg = dmg;
    if (state.mode === 'defender' && state.skillActiveT > 0) {
      finalDmg *= 0.2; 
      DB.spawnParticles(px, py, 10, '#5ae8ff', 300); 
      if (DB.floaters) DB.floaters.push({ text: 'BLOCKED', x: px, y: py - 20, vy: -50, life: 0.8, maxLife: 0.8, color: '#5ae8ff' });
    }

    state.hp = Math.max(0, state.hp - finalDmg);
    state.damageFlash = Math.max(state.damageFlash, finalDmg > 0 ? 0.5 : 0.1);
    state.shake   = Math.min(state.shake + 10, 30);
    state.hitstop = Math.max(state.hitstop, 0.05);
    DB.spawnParticles(px, py, 12, '#ff5a7a', 300);
    DB.sfx.hurt();
    state.combo = 0;
  }

  DB.triggerReflectBlast = function (cx, cy, baseDmg) {
    const reflectRadius = 350;
    const reflectDmg = (baseDmg || 10) * 2.5;
    let hitCount = 0;

    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      DB.particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * 800, vy: Math.sin(a) * 800,
        life: 0.5, maxLife: 0.5, size: 5, color: '#5ae8ff', spin: 0, rot: 0
      });
    }
    DB.spawnParticles(cx, cy, 20, '#5ae8ff', 500);
    DB.sfx.hit();

    for (const e of DB.enemies) {
      if (Math.hypot(e.x - cx, e.y - cy) < reflectRadius) {
        e.hp -= reflectDmg;
        e.flashT = 0.15;
        hitCount++;
        DB.spawnParticles(e.x, e.y, 8, '#ffffff', 200);
      }
    }
    if (DB.boss && DB.boss.phase === 'normal') {
      if (Math.hypot(DB.boss.x - cx, DB.boss.y - cy) < reflectRadius) {
        DB.boss.hp -= reflectDmg;
        DB.boss.flashT = 0.15;
        hitCount++;
      }
    }

    if (hitCount > 0 && DB.floaters) {
      DB.floaters.push({ 
        text: `⚡ 反射 x${hitCount}`, 
        x: cx, y: cy - 30, vy: -50, life: 1, maxLife: 1, 
        color: '#5ae8ff' 
      });
    }
  };

  DB.calcWeaponDamage = function (baseDmg, targetX, targetY) {
    let critRate = Math.min(0.80, 0.15 + (state.mods.critRate || 0)); 
    let critMult = 1.5 + (state.mods.critDmg || 0) + ((DB.upgrades.crit || 0) * 0.1);
    
    let isCrit = Math.random() < critRate;
    let finalDmg = baseDmg * (isCrit ? critMult : 1);
    
    if (isCrit && DB.floaters) {
      DB.floaters.push({ 
        text: `暴击 -${Math.round(finalDmg)}!`, 
        x: targetX + (Math.random() - 0.5) * 40, 
        y: targetY - 30, vy: -60, life: 1.2, maxLife: 1.2, 
        color: '#ffcc00', 
        isCrit: true 
      });
      state.shake = Math.min(state.shake + 4, 20);
    }
    return finalDmg;
  };

  function killEnemy(index) {
    const e = DB.enemies[index];
    if (!e || e.dead) return;
    e.dead = true;

    let color = '#ff7a9a';
    if (e.type === 'worm')          color = '#5ee6a8';
    else if (e.type === 'shield')   color = '#a88bff';
    else if (e.type === 'charger')  color = '#ffaa00';
    else if (e.type === 'turret')   color = '#5ae8ff';
    else if (e.type === 'splitter') color = '#c08bff';

    DB.spawnParticles(e.x, e.y, 24, color, 460);
    DB.spawnParticles(e.x, e.y, 10, '#ffffff', 620);
    state.energy = Math.min(state.energyMax, state.energy + 8);
    state.shake  = Math.min(state.shake + 5, 24);
    
    const upData = DB.upgrades || { chip: 0 };
    let dropChance = 0.6 + (upData.chip * 0.1); 
    
    while (dropChance > 0) {
      if (Math.random() < Math.min(1, dropChance)) DB.spawnChip(e.x, e.y);
      dropChance -= 1;
    }

    DB.sfx.hit();
    state.combo++;
    state.comboTimer = 3.0;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    state.score += 100 * state.combo;
    
    if ((state.mods.lifesteal || 0) > 0 && state.hp < state.hpMax) {
      const healAmt = Math.min(state.mods.lifesteal, state.hpMax - state.hp);
      state.hp += healAmt;
      if (DB.floaters) DB.floaters.push({
        text: `+${Math.round(healAmt)} HP`, x: DB.player.x, y: DB.player.y - 30,
        vy: -40, life: 0.9, maxLife: 0.9, color: '#ff5a7a'
      });
    }

    if (state.mode === 'hacker' && e.virus) {
      const blastRadius = 160;
      const blastDmg = 30 + (state.wave * 5);
      let hitCount = 0;
      
      for (const other of DB.enemies) {
        if (other.dead || other === e) continue;
        const dx = other.x - e.x, dy = other.y - e.y;
        if (dx * dx + dy * dy < blastRadius * blastRadius) {
          other.hp -= blastDmg;
          other.flashT = 0.15;
          other.virus = true; 
          hitCount++;
        }
      }
      DB.spawnParticles(e.x, e.y, 30, '#ffcc00', 600);
      if (hitCount > 0 && DB.floaters) {
        DB.floaters.push({ text: `连环引爆 x${hitCount}`, x: e.x, y: e.y - 40, vy: -50, life: 1.2, maxLife: 1.2, color: '#ffcc00' });
      }
    }

    const idx = DB.enemies.indexOf(e);
    if (idx !== -1) DB.enemies.splice(idx, 1);

    if (e.type === 'splitter' && !e.isMini) {
      const hpMult      = Math.pow(G.hpExponent, state.wave - 1);
      const waveDmgMult = Math.pow(G.dmgExponent, state.wave - 1);
      for (let k = 0; k < 2; k++) {
        const angle = (k / 2) * Math.PI * 2 + Math.random() * 0.6;
        const dist = 42;
        const nx = DB.clamp(e.x + Math.cos(angle) * dist, 40, W - 40);
        const ny = DB.clamp(e.y + Math.sin(angle) * dist, CFG.PLAY_TOP + 20, CFG.GROUND_Y - 20);
        DB.enemies.push({
          type: 'splitter', x: nx, y: ny,
          seed: Math.random() * 100,
          hp: Math.floor(DB.ENEMY_CFG.splitterHp * hpMult * 0.35),
          maxHp: Math.floor(DB.ENEMY_CFG.splitterHp * hpMult * 0.35),
          r: 16,
          dmg: Math.floor(10 * waveDmgMult),
          flashT: 0, frozen: 0, isMini: true
        });
      }
      DB.spawnParticles(e.x, e.y, 20, '#c08bff', 400);
    }
  }

  DB.killEnemy = function(index) { killEnemy(index); };
  
  DB.damageEnemy = function (e, index, dmg, isEarthquake) {
    if (!e || e.dead) return;
    let finalDmg = dmg; 
    if (isNaN(finalDmg)) finalDmg = 10; 
    if (e.vulnerable > 0) finalDmg *= 1.5; 
    if (isNaN(e.hp)) e.hp = 10; 
    
    e.hp -= finalDmg;
    e.flashT = 0.15;
    
    state.hitstop = Math.max(state.hitstop, 0.08); 
    state.shake = Math.min(state.shake + 8, 25);
    DB.spawnParticles(e.x, e.y, 20, '#ff5a7a', 500);
    DB.spawnParticles(e.x, e.y, 10, '#ffffff', 600);
    DB.sfx.hit();

    if (isEarthquake && DB.triggerQuake) DB.triggerQuake(e.x, e.y, finalDmg); 

    if (e.hp <= 0) {
      const idx = DB.enemies.indexOf(e);
      if (idx !== -1) killEnemy(idx);
    }
  };

  DB.updateEnemies = function (dt) {
    const p = DB.player;

    for (let i = DB.enemies.length - 1; i >= 0; i--) {
      const e = DB.enemies[i];
      if (e.hp <= 0 || isNaN(e.hp)) { e.hp = 0; DB.killEnemy(i); }
    }

    if (DB.boss) {
      const b = DB.boss;
      
      if (b.hp <= 0 && b.phase !== 'paralyzed') {
        // 【修复】使用统一封装，触发 QTE 并清场
        DB.triggerQTE(b);
      }
      
      if (b.flashT > 0) b.flashT -= dt;

      if (b.phase === 'normal' && !b.enraged && b.hp > 0 && b.hp / b.maxHp <= 0.25) {
        b.enraged = true;
        b.fireCd = 0.4;
        b.summonCd = 2.0;
        state.bossEnrageFlash = 0.8;
        state.bossEnrageTextT = 2.5;
        state.shake = 30;
        state.flash = Math.max(state.flash, 0.35);
        state.hitstop = Math.max(state.hitstop, 0.12);
        const burstCount = b.isBig ? 16 : 12;
        const burstDmg = b.isBig ? 14 : 10;
        for (let i = 0; i < burstCount; i++) {
          const a = (i / burstCount) * Math.PI * 2;
          DB.enemyBullets.push({
            x: b.x, y: b.y,
            vx: Math.cos(a) * 200, vy: Math.sin(a) * 200,
            r: 7, life: 6, color: '#ff2a4a', dmg: burstDmg
          });
        }
        DB.sfx.error();
        DB.spawnParticles(b.x, b.y, 30, '#ff2a4a', 550);
        DB.spawnParticles(b.x, b.y, 15, '#ffffff', 750);
      }

      if (b.frozen > 0) {
        b.frozen -= dt;
      } else if (b.phase === 'normal') {
        const enrage = b.enraged;
        const moveAmp = enrage ? 1.1 : 1;
        const moveFreq = enrage ? 1.15 : 1;
        b.x = b.baseX + Math.sin(state.t * 0.5 * moveFreq) * 150 * moveAmp;
        b.y = b.baseY + Math.sin(state.t * 0.8 * moveFreq) * 30 * moveAmp;
        b.fireCd -= dt;      
        
        const waveScale  = 1 + (state.wave - 1) * G.bossDmgPerWave;
        const speedScale = 1 + (state.wave - 1) * G.bossSpeedPerWave;
        const bossDmg    = Math.floor(20 * waveScale * (enrage ? 1.1 : 1));
        const enSpd = enrage ? 1.15 : 1;
        const enCnt = enrage ? 1.15 : 1;
        const enRate = enrage ? 0.75 : 1;

        if (b.fireCd <= 0) {
          if (b.bossType === 'bsod') {
            b.fireCd = DB.BOSS_CFG.fireInterval / speedScale * enRate;
            const count = Math.floor((8 + Math.floor(state.wave / G.bossBulletDivDefault)) * enCnt);
            for (let i = 0; i < count; i++) {
              const a = (i / count) * Math.PI * 2 + state.t;
              DB.enemyBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 150 * speedScale * enSpd, vy: Math.sin(a) * 150 * speedScale * enSpd, r: 8, life: 8, dmg: bossDmg });
            }
          } 
          else if (b.bossType === 'firewall') {
            b.fireCd = 2.5 / speedScale * enRate; 
            const dx = p.x - b.x, dy = p.y - b.y;
            const d = Math.hypot(dx, dy) || 1;
            const count = Math.floor((3 + Math.floor(state.wave / G.bossBulletDivFirewall)) * enCnt);
            for (let i = 0; i < count; i++) {
              DB.enemyBullets.push({ x: b.x, y: b.y, vx: (dx/d)*250*speedScale*enSpd, vy: (dy/d)*250*speedScale*enSpd, r: 12, life: 6, color: '#ffaa00', dmg: bossDmg * 1.5 });
            }
            DB.sfx.hurt();
          }
          else if (b.bossType === 'vampire') {
            b.fireCd = 5.0 / speedScale * enRate; 
            let absorbed = false;
            const absorbRange = enrage ? 700 : 600;
            const healPerW = 50 * waveScale * (enrage ? 1.3 : 1);
            for (let i = DB.weapons.length - 1; i >= 0; i--) {
              const w = DB.weapons[i];
              if (w.dead || w.held || w.warning > 0 || w.safeTimer > 0) continue; 
              const distToBoss = Math.hypot(w.x - b.x, w.y - b.y);
              if (distToBoss < absorbRange) {
                DB.spawnParticles(w.x, w.y, 15, '#ff7a9a', 400);
                DB.removeWeapon(w);
                b.hp = Math.min(b.maxHp, b.hp + healPerW); 
                absorbed = true;
              }
            }
            if (absorbed) {
              DB.spawnParticles(b.x, b.y, 30, '#5ee6a8', 300);
              state.hitstop = Math.max(state.hitstop, 0.05);
            }
          }
          else if (b.bossType === 'manager') {
            b.fireCd = 1.5 / speedScale * enRate;
            b.angle += 0.4 * speedScale * (enrage ? 1.3 : 1);
            const count = Math.floor((16 + Math.floor(state.wave / G.bossBulletDivDefault)) * enCnt);
            for (let i = 0; i < count; i++) {
              const a = (i / count) * Math.PI * 2 + b.angle;
              DB.enemyBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 220 * speedScale * enSpd, vy: Math.sin(a) * 220 * speedScale * enSpd, r: 6, life: 6, color: '#5ee6a8', dmg: bossDmg * 0.8 });
            }
          }
          else if (b.bossType === 'trojan') {
            b.fireCd = Math.max(0.15, 0.2 / speedScale) * enRate; 
            b.angle += 0.8 * speedScale * (enrage ? 1.2 : 1);
            for (let s = -1; s <= 1; s += 2) {
              const a = b.angle * s;
              DB.enemyBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 180 * speedScale * enSpd, vy: Math.sin(a) * 180 * speedScale * enSpd, r: 8, life: 8, color: '#c08bff', dmg: bossDmg * 0.7 });
            }
          }
        }

        b.summonCd -= dt;
        if (b.summonCd <= 0) {
          b.summonCd = (b.isBig ? 5.0 : 8.0) / speedScale * enRate;
          const count = Math.floor(((b.isBig ? 3 : 1) + Math.floor(state.wave / G.bossSummonDiv)) * (enrage ? 1.25 : 1));
          for (let c = 0; c < count; c++) {
            const hpMult      = Math.pow(G.hpExponent, state.wave - 1);
            const waveDmgMult = Math.pow(G.dmgExponent, state.wave - 1);
            
            const angle = Math.random() * Math.PI * 2;
            const dist = 200 + Math.random() * 150;
            const spawnX = DB.clamp(b.x + Math.cos(angle) * dist, 50, W - 50);
            const spawnY = DB.clamp(b.y + Math.sin(angle) * dist, CFG.PLAY_TOP + 20, CFG.GROUND_Y - 20);

            DB.enemies.push({ 
              type: 'drone', x: spawnX, y: spawnY, 
              baseX: spawnX, baseY: spawnY,
              seed: Math.random() * 100, 
              hp: ENEMY_HP * hpMult, maxHp: ENEMY_HP * hpMult, r: ENEMY_R, 
              dmg: Math.floor(10 * waveDmgMult),
              fireCd: 1.0, flashT: 0, frozen: 0 
            });
          }
        }
      } 
      else if (b.phase === 'paralyzed') {
        state.qte.active = true;
        state.qte.timer -= dt;
        if (state.qte.timer <= 0) {
          state.qte.active = false;
          b.phase = 'normal';
          b.hp = b.maxHp * 0.1;
          state.shake = 30;
          DB.sfx.error();
        }
      }
    }

    for (let i = DB.enemies.length - 1; i >= 0; i--) {
      const e = DB.enemies[i];
      if (e.flashT > 0) e.flashT -= dt;
      if (e.vulnerable > 0) e.vulnerable -= dt;
      if (e.slowT > 0) e.slowT -= dt;

      if (e.isNew) {
        e.newT = (e.newT || 0) + dt;
        if (e.newT > 0.4) e.isNew = false;
      }

      if (e.frozen > 0) { e.frozen -= dt; continue; }

      if (e.type === 'drone') {
        const dxP = p.x - e.baseX;
        const dyP = p.y - e.baseY;
        const distP = Math.hypot(dxP, dyP);
        
        if (distP > 400) {
          const moveSpd = 100; 
          e.baseX += (dxP / distP) * moveSpd * dt;
          e.baseY += (dyP / distP) * moveSpd * dt;
        }

        e.x = e.baseX + Math.sin(state.t * 0.8 + e.seed) * 40;
        e.y = e.baseY + Math.sin(state.t * 1.3 + e.seed * 2) * 18;
        
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          e.fireCd = FIRE_INTERVAL + Math.random() * 0.6;
          const dx = p.x - e.x, dy = p.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          const bulletColor = state.mode === 'hacker' ? '#5ee6a8' : '#ff5a7a';
          DB.enemyBullets.push({ 
            x: e.x, y: e.y, 
            vx: (dx / d) * BULLET_SPEED, vy: (dy / d) * BULLET_SPEED, 
            r: BULLET_R, life: BULLET_LIFE, color: bulletColor, dmg: e.dmg 
          });
        }
      } 
      else if (e.type === 'worm') {
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.phase += dt * 15;
        const speedMult = (e.slowT > 0) ? 0.4 : 1.0;
        const speed = (e.speed || DB.ENEMY_CFG.wormSpeed) * (1 + Math.sin(e.phase) * 0.15) * speedMult;
        e.x += (dx / d) * speed * dt;
        e.y += (dy / d) * speed * dt;
        if (d < e.r + p.r) {
          if (state.mode === 'defender' && state.skillActiveT > 0) {
             DB.triggerReflectBlast(e.x, e.y, e.dmg);
             e.hp -= 99999;
          } else {
             damagePlayer(e.dmg, e.x, e.y);
          }
          killEnemy(i); 
        }
      }
      else if (e.type === 'shield') {
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.facing = dx > 0 ? 1 : -1; 
        const moveSpeed = (e.speed || 60) * ((e.slowT > 0) ? 0.4 : 1.0);
        
        e.x += (dx / d) * moveSpeed * dt;
        e.y += (dy / d) * moveSpeed * dt;

        if (e.hitCd === undefined) e.hitCd = 0;
        if (e.hitCd > 0) e.hitCd -= dt;

        if (d < e.r + p.r && e.hitCd <= 0) {
          if (state.mode === 'defender' && state.skillActiveT > 0) {
            DB.triggerReflectBlast(e.x, e.y, e.dmg);
            e.hp -= 500;
            if (e.hp <= 0) killEnemy(i); 
          } else {
            damagePlayer(e.dmg, e.x, e.y);
          }
          e.hitCd = 1.0; 
          
          const pushForce = 180;
          e.x -= (dx / d) * pushForce * dt;
          e.y -= (dy / d) * pushForce * dt;
          p.vx += (dx / d) * 400;
          p.vy += (dy / d) * 400;
        }
      }
      else if (e.type === 'turret') {
        const dx = p.x - e.x, dy = p.y - e.y;
        e.angle = Math.atan2(dy, dx);
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          e.fireCd = 1.3 / ((e.slowT > 0) ? 0.4 : 1.0) + 1.0;
          const speed = 320;
          const bulletColor = state.mode === 'hacker' ? '#5ee6a8' : '#ffaa00';
          DB.enemyBullets.push({
            x: e.x, y: e.y,
            vx: Math.cos(e.angle) * speed,
            vy: Math.sin(e.angle) * speed,
            r: 5, life: 6, color: bulletColor, dmg: e.dmg
          });
          DB.sfx.hit();
        }
      }
      else if (e.type === 'charger') {
        e.stateT += dt;
        if (e.state === 'approach') {
          const dx = p.x - e.x, dy = p.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          e.facing = dx > 0 ? 1 : -1;
          const moveSpeed = 90 * ((e.slowT > 0) ? 0.4 : 1.0);
          e.x += (dx / d) * moveSpeed * dt;
          e.y += (dy / d) * moveSpeed * dt;
          if (d < 320 || e.stateT > 3.0) { e.state = 'windup'; e.stateT = 0; }
        }
        else if (e.state === 'windup') {
          const dx = p.x - e.x, dy = p.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          e.dashDirX = dx / d; e.dashDirY = dy / d;
          e.facing = dx > 0 ? 1 : -1;
          if (e.stateT > 0.9) { e.state = 'dash'; e.stateT = 0; }
        }
        else if (e.state === 'dash') {
          const dashSpeed = 850 * ((e.slowT > 0) ? 0.4 : 1.0);
          e.x += e.dashDirX * dashSpeed * dt;
          e.y += e.dashDirY * dashSpeed * dt;
          const dx = p.x - e.x, dy = p.y - e.y;
          const d = Math.hypot(dx, dy);
          if (d < e.r + p.r) {
            if (state.mode === 'defender' && state.skillActiveT > 0) {
               DB.triggerReflectBlast(e.x, e.y, e.dmg);
               e.hp -= 99999; 
               killEnemy(i); 
            } else {
               damagePlayer(e.dmg, e.x, e.y);
            }
            e.state = 'recover'; e.stateT = 0;
            e.x = DB.clamp(e.x - e.dashDirX * 60, 40, W - 40);
            e.y = DB.clamp(e.y - e.dashDirY * 60, CFG.PLAY_TOP + 20, CFG.GROUND_Y - 20);
            state.shake = Math.min(state.shake + 12, 30);
          }
          if (e.x < 30 || e.x > W - 30 || e.y < CFG.PLAY_TOP + 20 || e.y > CFG.GROUND_Y - 10) {
            e.state = 'recover'; e.stateT = 0;
            e.x = DB.clamp(e.x, 30, W - 30);
            e.y = DB.clamp(e.y, CFG.PLAY_TOP + 20, CFG.GROUND_Y - 10);
            state.shake = Math.min(state.shake + 8, 20);
            DB.spawnParticles(e.x, e.y, 15, '#ffaa00', 400);
          }
          if (e.stateT > 1.2) { e.state = 'recover'; e.stateT = 0; }
        }
        else if (e.state === 'recover') {
          if (e.stateT > 1.3) { e.state = 'approach'; e.stateT = 0; }
        }
      }
      else if (e.type === 'splitter') {
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        const moveSpeed = 70 * ((e.slowT > 0) ? 0.4 : 1.0);
        e.x += (dx / d) * moveSpeed * dt;
        e.y += (dy / d) * moveSpeed * dt;
        e.x += Math.sin(state.t * 2 + e.seed) * 18 * dt;
        e.y += Math.cos(state.t * 1.5 + e.seed) * 18 * dt;
        if (d < e.r + p.r) { 
          if (state.mode === 'defender' && state.skillActiveT > 0) {
            DB.triggerReflectBlast(e.x, e.y, e.dmg);
            e.hp -= 99999;
          } else {
            damagePlayer(e.dmg, e.x, e.y); 
          }
          killEnemy(i); 
        }
      }
    }

    for (let i = DB.enemyBullets.length - 1; i >= 0; i--) {
      const b = DB.enemyBullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      const dx = b.x - p.x, dy = b.y - p.y;
      
      const isShielding = state.mode === 'defender' && state.skillActiveT > 0;
      const hitRadius = isShielding ? 60 : p.r;
      
      if (dx * dx + dy * dy < (b.r + hitRadius) * (b.r + hitRadius)) {
        if (isShielding) {
          DB.enemyBullets.splice(i, 1);
          DB.triggerReflectBlast(b.x, b.y, b.dmg); 
          continue;
        } else {
          damagePlayer(b.dmg || 10, b.x, b.y);
          DB.enemyBullets.splice(i, 1);
          continue;
        }
      }
      
      if (b.life <= 0 || b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) {
        DB.enemyBullets.splice(i, 1);
      }
    }

    for (const e of DB.enemies) {
      for (const w of DB.weapons) {
        if (w.dead || w.held || w.thrown || w.corrupted || w.warning > 0) continue;
        if (w.safeTimer > 0) continue;
        const dx = w.x - e.x, dy = w.y - e.y;
        const radius = w.r + e.r + 10;
        if (dx * dx + dy * dy < radius * radius) {
          w.corrupted = true;
          DB.spawnParticles(w.x, w.y, 8, '#ff5a7a', 200);
        }
      }
    }

    for (let wi = DB.weapons.length - 1; wi >= 0; wi--) {
      const w = DB.weapons[wi];
      if (w.dead || w.held || !w.thrown) continue;
      const speed = Math.hypot(w.vx, w.vy);
      if (speed < 180) continue;

      let hit = false;
      if (DB.boss && DB.boss.phase === 'normal') {
        const b = DB.boss;
        const dx = w.x - b.x, dy = w.y - b.y;
        if (dx * dx + dy * dy < (w.r + b.r) * (w.r + b.r)) {
          const power = DB.clamp(speed / 700, 0.5, 2.4);
          const hitDmg = DB.calcWeaponDamage(w.baseDamage * power * (1 + state.mods.damage), b.x, b.y);
          b.hp -= hitDmg;
          
          if (w.type === 'code_slash') {
             b.slowT = 3.0; b.vulnerable = 3.0;
             if (DB.floaters) DB.floaters.push({ text: 'GLITCH!', x: b.x, y: b.y - 40, vy: -50, life: 1, maxLife: 1, color: '#00ffcc', isCrit: true });
             DB.spawnParticles(b.x, b.y, 15, '#00ffcc', 300);
          }

          state.hitstop = Math.max(state.hitstop, 0.05);
          state.shake = Math.min(state.shake + 5, 22);
          DB.spawnParticles(w.x, w.y, 20, '#ffffff', 500);
          DB.sfx.hit();
          DB.removeWeapon(w);
          hit = true;

          if (w.def.effect === 'earthquake' && DB.triggerQuake) {
             DB.triggerQuake(b.x, b.y, w.baseDamage * (1 + state.mods.damage));
          } else if (w.def.effect === 'blackhole' && DB.triggerBlackhole) {
             DB.triggerBlackhole(b.x, b.y, w.baseDamage * (1 + state.mods.damage));
          } else if (w.def.effect === 'chain' && DB.triggerChain) {
             DB.triggerChain(b.x, b.y, w.baseDamage * (1 + state.mods.damage));
          }

          if (b.hp <= 0) {
            // 【修复】统一调用
            DB.triggerQTE(b);
          }
        }
      }

      if (hit) continue;

      for (let ei = DB.enemies.length - 1; ei >= 0; ei--) {
        const e = DB.enemies[ei];
        if (e.dead) continue;
        const dx = w.x - e.x, dy = w.y - e.y;
        if (dx * dx + dy * dy < (w.r + e.r) * (w.r + e.r)) {
          if (e.type === 'shield') {
            const isFrontal = (w.vx * e.facing < 0);
            if (isFrontal) {
               DB.spawnParticles(w.x, w.y, 15, '#ffffff', 400);
               state.hitstop = Math.max(state.hitstop, 0.06);
               state.shake = Math.min(state.shake + 4, 20);
               DB.sfx.error();
               DB.removeWeapon(w);
               break; 
            }
          }

          const power = DB.clamp(speed / 700, 0.5, 2.4);
          const finalDmg = DB.calcWeaponDamage(w.baseDamage * power * (1 + state.mods.damage), e.x, e.y);
          e.hp -= finalDmg;
          e.flashT = 0.12;
          
          if (w.type === 'code_slash') {
             e.slowT = 3.0; e.vulnerable = 3.0;
             if (DB.floaters) DB.floaters.push({ text: 'GLITCH!', x: e.x, y: e.y - 40, vy: -50, life: 1, maxLife: 1, color: '#00ffcc', isCrit: true });
             DB.spawnParticles(e.x, e.y, 15, '#00ffcc', 300);
          }

          state.hitstop = Math.max(state.hitstop, 0.045);
          state.shake   = Math.min(state.shake + 4, 22);
          DB.spawnParticles(w.x, w.y, 14, '#ffffff', 480);
          DB.sfx.hit();
          
          if (w.def.effect === 'pull') {
            const pdx = DB.player.x - e.x, pdy = DB.player.y - e.y;
            const pd = Math.hypot(pdx, pdy) || 1;
            const pullDist = 180;
            if (e.type === 'drone') {
               e.baseX += (pdx / pd) * pullDist;
               e.baseY += (pdy / pd) * pullDist;
               e.baseX = DB.clamp(e.baseX, 60, W - 60);
               e.baseY = DB.clamp(e.baseY, 60, H - 100);
            }
            e.x += (pdx / pd) * pullDist; 
            e.y += (pdy / pd) * pullDist;
            for (let k = 0; k < 10; k++) {
              const t = k / 10;
              DB.particles.push({ x: e.x + (DB.player.x - e.x) * t, y: e.y + (DB.player.y - e.y) * t, vx: (Math.random()-0.5)*100, vy: (Math.random()-0.5)*100, life: 0.4, maxLife: 0.4, size: 4, color: '#5ae8ff', spin: 0, rot: 0 });
            }
            state.hitstop = Math.max(state.hitstop, 0.08); 
            state.shake = 26; state.flash = Math.max(state.flash, 0.15); 
            DB.sfx.error(); 
          } else if (w.def.effect === 'earthquake' && DB.triggerQuake) {
            DB.triggerQuake(e.x, e.y, finalDmg);
          } else if (w.def.effect === 'blackhole' && DB.triggerBlackhole) {
            DB.triggerBlackhole(e.x, e.y, finalDmg);
          } else if (w.def.effect === 'chain' && DB.triggerChain) {
            DB.triggerChain(e.x, e.y, finalDmg);
          }

          DB.removeWeapon(w);
          if (e.hp <= 0) killEnemy(ei);
          break;
        }
      }
    }
  };

  DB.drawEnemies = function (ctx) {
    const isHacker = state.mode === 'hacker';

    if (DB.boss) {
      const b = DB.boss;
      const flash = b.flashT > 0;
      ctx.save();
      
      if (b.enraged && b.phase === 'normal') {
        const pulse = 0.5 + 0.5 * Math.sin(state.t * 8);
        ctx.save();
        ctx.globalAlpha = 0.35 + pulse * 0.45;
        ctx.strokeStyle = '#ff2a4a';
        ctx.lineWidth = 3 + pulse * 2;
        ctx.shadowColor = '#ff2a4a';
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 18 + pulse * 14, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 0.18 + pulse * 0.3;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r + 32 + (1 - pulse) * 20, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2);
      const glowR = b.enraged ? '255, 42, 74' : '120, 90, 255';
      g.addColorStop(0, flash ? 'rgba(255,255,255,0.8)' : `rgba(${glowR}, 0.4)`);
      g.addColorStop(1, `rgba(${glowR}, 0)`);
      ctx.fillStyle = g; ctx.fillRect(b.x - b.r * 2, b.y - b.r * 2, b.r * 4, b.r * 4);

      let mainColor = '#0a0a2a';
      let strokeColor = '#5ae8ff';
      let text = ':( ';

      if (isHacker) {
        if (b.bossType === 'bsod') { mainColor = '#0a1a10'; strokeColor = '#5ee6a8'; text = '🛡️'; }
        else if (b.bossType === 'firewall') { mainColor = '#1a1005'; strokeColor = '#ffaa00'; text = '⚙️'; }
        else if (b.bossType === 'vampire') { mainColor = '#1a0a2a'; strokeColor = '#c08bff'; text = '📦'; }
        else if (b.bossType === 'manager') { mainColor = '#2a0a10'; strokeColor = '#ff5a7a'; text = '🔒'; }
        else if (b.bossType === 'trojan') { mainColor = '#0a0a2a'; strokeColor = '#5ae8ff'; text = '🛡️'; }
      } else {
        if (b.bossType === 'firewall') { mainColor = '#1a1005'; strokeColor = '#ffaa00'; text = '🛡️'; }
        else if (b.bossType === 'vampire') { mainColor = '#2a0a10'; strokeColor = '#ff5a7a'; text = '🩸'; }
        else if (b.bossType === 'manager') { mainColor = '#0a2010'; strokeColor = '#5ee6a8'; text = '👑'; }
        else if (b.bossType === 'trojan') { mainColor = '#1f0a2a'; strokeColor = '#c08bff'; text = '🦠'; }
      }

      if (b.phase === 'paralyzed') { mainColor = '#ffcc00'; strokeColor = '#ffffff'; text = 'HALT'; }
      if (b.enraged && b.phase === 'normal') { strokeColor = '#ff2a4a'; }

      ctx.fillStyle = flash ? '#ffffff' : mainColor;
      ctx.strokeStyle = flash ? '#ffffff' : strokeColor;
      ctx.lineWidth = b.isBig ? 6 : 4;
      if (b.enraged && b.phase === 'normal') ctx.shadowColor = '#ff2a4a', ctx.shadowBlur = 25;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.shadowBlur = 0;

      ctx.fillStyle = strokeColor;
      ctx.font = `bold ${b.isBig ? '32px' : '20px'} monospace`; 
      ctx.textAlign = 'center';
      ctx.fillText(text, b.x, b.y + (b.isBig ? 12 : 8));
      
      ctx.restore();
    }

    for (const e of DB.enemies) {
      const flash = e.flashT > 0;
      const newPulse = e.isNew ? (1 + Math.sin(state.t * 40) * 0.15) : 1;
      ctx.save();

      if (e.frozen > 0) { ctx.shadowColor = '#5ae8ff'; ctx.shadowBlur = 30; }
      if (e.vulnerable > 0 || e.slowT > 0) { ctx.shadowColor = '#c08bff'; ctx.shadowBlur = 20; }

      if (e.isNew) {
        ctx.save();
        ctx.translate(e.x, e.y);
        ctx.scale(newPulse, newPulse);
        ctx.translate(-e.x, -e.y);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r + 20 + (1 - e.newT / 0.4) * 40, 0, Math.PI * 2);
        ctx.stroke();
      }

      if (e.type === 'drone') {
        const w = 44, h = 34, x = e.x - w / 2, y = e.y - h / 2;
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 40);
        const mainColor = (e.vulnerable > 0 || e.slowT > 0) ? '192, 139, 255' : (isHacker ? '90, 240, 255' : '255, 90, 120');
        const bgColor = (e.vulnerable > 0 || e.slowT > 0) ? 'rgba(40, 10, 50, 0.95)' : (isHacker ? 'rgba(12, 30, 24, 0.95)' : 'rgba(30, 12, 24, 0.95)');
        g.addColorStop(0, flash ? 'rgba(255,255,255,.7)' : (e.frozen > 0 ? 'rgba(90,240,255,.7)' : `rgba(${mainColor}, .35)`));
        g.addColorStop(1, e.frozen > 0 ? 'rgba(90,240,255,0)' : `rgba(${mainColor}, 0)`);
        ctx.fillStyle = g; ctx.fillRect(e.x - 40, e.y - 40, 80, 80);
        ctx.fillStyle = flash ? '#ffffff' : (e.frozen > 0 ? '#0a2a3a' : bgColor);
        ctx.strokeStyle = flash ? '#ffffff' : (e.frozen > 0 ? '#5ae8ff' : `rgba(${mainColor}, 0.9)`);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = flash ? 'rgba(255,255,255,.3)' : (e.frozen > 0 ? 'rgba(90,240,255,.3)' : `rgba(${mainColor}, 0.25)`);
        ctx.fillRect(x + 2, y + 2, w - 4, 9);
        if (isHacker) {
          ctx.fillStyle = '#5ee6a8'; ctx.font = '12px monospace'; ctx.textAlign = 'center';
          ctx.fillText('🔍', e.x, e.y + 5);
        }
      } 
      else if (e.type === 'worm') {
        const color = flash ? '#ffffff' : (e.frozen > 0 ? '#5ae8ff' : ((e.vulnerable > 0 || e.slowT > 0) ? '#c08bff' : (isHacker ? '#ff5a7a' : '#5ee6a8')));
        ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 15;
        for (let i = 0; i < 3; i++) {
          const offset = Math.sin(e.phase + i * 1.5) * 8;
          const cx = e.x - (i * 14), cy = e.y + offset;
          ctx.beginPath(); ctx.arc(cx, cy, e.r * (1 - i * 0.25), 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = (e.vulnerable > 0 || e.slowT > 0) ? '#c08bff' : (isHacker ? '#5ee6a8' : '#ff5a7a');
        ctx.beginPath(); ctx.arc(e.x + 6, e.y - 4, 3, 0, Math.PI * 2); ctx.fill();
      }
      else if (e.type === 'shield') {
        const shieldColor = (e.vulnerable > 0 || e.slowT > 0) ? '#c08bff' : (isHacker ? '#ffcc00' : '#a88bff');
        ctx.fillStyle = flash ? '#ffffff' : (e.frozen > 0 ? '#1a3a4a' : '#1a1a30');
        ctx.strokeStyle = e.frozen > 0 ? '#5ae8ff' : shieldColor; 
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const shieldX = e.x + e.facing * 25;
        ctx.fillStyle = e.frozen > 0 ? '#ffffff' : shieldColor;
        ctx.fillRect(shieldX - 5, e.y - 30, 10, 60);
        if (isHacker) {
          ctx.fillStyle = '#000'; ctx.font = 'bold 10px monospace';
          ctx.fillText('✓', shieldX, e.y - 10);
          ctx.fillText('✕', shieldX, e.y + 15);
        }
      }
      else if (e.type === 'turret') {
        const baseColor = (e.vulnerable > 0 || e.slowT > 0) ? '#c08bff' : (isHacker ? '#5ee6a8' : '#ffaa00');
        ctx.save(); ctx.translate(e.x, e.y);
        ctx.fillStyle = flash ? '#ffffff' : (e.frozen > 0 ? '#1a3a4a' : '#1a1a20');
        ctx.strokeStyle = e.frozen > 0 ? '#5ae8ff' : baseColor;
        ctx.lineWidth = 2.5; ctx.shadowColor = baseColor; ctx.shadowBlur = 15;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
          const px = Math.cos(a) * e.r, py = Math.sin(a) * e.r;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.save(); ctx.rotate(e.angle);
        ctx.fillStyle = flash ? '#ffffff' : baseColor;
        ctx.shadowColor = baseColor; ctx.shadowBlur = 10;
        ctx.fillRect(0, -4, e.r * 1.4, 8);
        ctx.restore();
        ctx.fillStyle = '#ffffff'; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(0, 0, 5, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      else if (e.type === 'charger') {
        const baseColor = (e.vulnerable > 0 || e.slowT > 0) ? '#c08bff' : (isHacker ? '#5ee6a8' : '#ffaa00');
        const warnColor = isHacker ? '#ff5a7a' : '#ffcc00';
        let color = baseColor;
        if (e.state === 'windup') { const flick = Math.sin(state.t * 30) > 0; color = flick ? warnColor : '#ffffff'; }
        else if (e.state === 'dash') { color = '#ffffff'; }
        else if (e.state === 'recover') { color = isHacker ? '#3a5a4a' : '#6a5a3a'; }
        if (e.state === 'dash') {
          ctx.save(); ctx.globalAlpha = 0.5;
          ctx.fillStyle = isHacker ? '#5ee6a8' : '#ffaa00';
          ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 20;
          for (let k = 1; k <= 5; k++) {
            const tx = e.x - e.dashDirX * k * 22;
            const ty = e.y - e.dashDirY * k * 22;
            ctx.beginPath(); ctx.arc(tx, ty, e.r * (1 - k * 0.15), 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }
        let faceAngle;
        if (e.state === 'windup' || e.state === 'dash') faceAngle = Math.atan2(e.dashDirY, e.dashDirX);
        else faceAngle = Math.atan2(DB.player.y - e.y, DB.player.x - e.x);
        ctx.save(); ctx.translate(e.x, e.y); ctx.rotate(faceAngle);
        ctx.fillStyle = flash ? '#ffffff' : color;
        ctx.strokeStyle = flash ? '#ffffff' : color;
        ctx.shadowColor = color;
        ctx.shadowBlur = e.state === 'windup' ? 30 : (e.state === 'dash' ? 40 : 18);
        ctx.beginPath();
        ctx.moveTo(e.r, 0);
        ctx.lineTo(-e.r * 0.7, -e.r * 0.8);
        ctx.lineTo(-e.r * 0.3, 0);
        ctx.lineTo(-e.r * 0.7, e.r * 0.8);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      else if (e.type === 'splitter') {
        const baseColor = (e.vulnerable > 0 || e.slowT > 0) ? '#ff7a9a' : (isHacker ? '#ffaa00' : '#c08bff');
        const pulse = 0.5 + 0.5 * Math.sin(state.t * 4 + e.seed);
        ctx.save(); ctx.translate(e.x, e.y);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, e.r * 2);
        g.addColorStop(0, `rgba(192, 139, 255, ${0.3 + pulse * 0.3})`);
        g.addColorStop(1, 'rgba(192, 139, 255, 0)');
        ctx.fillStyle = g; ctx.fillRect(-e.r * 2, -e.r * 2, e.r * 4, e.r * 4);
        ctx.rotate(state.t * 0.8 + e.seed);
        ctx.fillStyle = flash ? '#ffffff' : (e.frozen > 0 ? '#1a3a4a' : (e.isMini ? '#8a6ab8' : baseColor));
        ctx.strokeStyle = e.frozen > 0 ? '#5ae8ff' : '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.shadowColor = baseColor; ctx.shadowBlur = e.isMini ? 8 : 16;
        const s = e.r * 0.85;
        ctx.beginPath();
        ctx.moveTo(0, -s); ctx.lineTo(s, 0); ctx.lineTo(0, s); ctx.lineTo(-s, 0);
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'; ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(0, 0, e.r * 0.22, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }

      if (e.isNew) ctx.restore();
      ctx.restore();
    }
  };

  DB.drawEnemyBullets = function (ctx) {
    for (const b of DB.enemyBullets) {
      ctx.save();
      const tx = b.x - b.vx * 0.03, ty = b.y - b.vy * 0.03;
      const grad = ctx.createLinearGradient(tx, ty, b.x, b.y);
      const c = b.color || '#ff5a7a'; 
      grad.addColorStop(0, 'rgba(0, 0, 0, 0)'); 
      grad.addColorStop(1, c);
      ctx.strokeStyle = grad; ctx.lineWidth = b.r; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.shadowColor = c; ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };

})(window.DB);