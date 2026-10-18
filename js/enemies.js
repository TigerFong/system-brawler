(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const W     = CFG.W;
  const H     = CFG.H;

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

  DB.spawnWave = function (n) {
    const camX = state.camera.x;
    const camY = state.camera.y;
    const minX = DB.clamp(camX - 100, 0, CFG.W);
    const maxX = DB.clamp(camX + CFG.VIEW_W + 100, 0, CFG.W);
    const minY = DB.clamp(camY - 100, CFG.PLAY_TOP, CFG.GROUND_Y);
    const maxY = DB.clamp(camY + CFG.VIEW_H, CFG.PLAY_TOP, CFG.GROUND_Y);

    // ===== 调整：怪物血量成长放缓到 1.28 =====
    const hpMult = Math.pow(1.28, n - 1);     
    
    // 小怪子弹基础伤害随波次成长
    const waveDmgMult = 1 + (n - 1) * 0.15; 

    const droneCount = 2 + Math.floor(n / 3);
    const wormCount  = 1 + Math.floor(n / 3);
    const shieldCount = 1 + Math.floor(n / 5); 

    for (let i = 0; i < droneCount; i++) {
      const x = minX + Math.random() * (maxX - minX);
      const y = minY + Math.random() * ((maxY - minY) * 0.5);
      DB.enemies.push({
        type: 'drone', x, y, baseX: x, baseY: y,
        seed: Math.random() * 100, 
        hp: Math.floor(ENEMY_HP * hpMult),
        maxHp: Math.floor(ENEMY_HP * hpMult),
        r: ENEMY_R,
        dmg: Math.floor(10 * waveDmgMult), // 子弹伤害成长
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
        dmg: Math.floor(18 * waveDmgMult), // 碰撞伤害成长
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
        dmg: Math.floor(22 * waveDmgMult), // 碰撞伤害成长
        seed: Math.random() * 100, flashT: 0, frozen: 0,
        facing: fromLeft ? 1 : -1
      });
    }
  };

  DB.spawnBoss = function (isBig) {
    const camX = state.camera.x;
    const camY = state.camera.y;
    
    const typePool = isBig ? DB.BIG_BOSS_TYPES : DB.SMALL_BOSS_TYPES;
    const bossType = typePool[Math.floor(Math.random() * typePool.length)];
    
    // ===== 调整：Boss 血量放缓到 1.32 倍 =====
    const waveMult = Math.pow(1.32, state.wave - 1);
    const baseHp = isBig ? DB.BOSS_CFG.bigHp : DB.BOSS_CFG.smallHp;
    const hp = Math.floor(baseHp * waveMult);

    const startX = camX + CFG.VIEW_W / 2;
    const startY = camY + 200;

    DB.boss = {
      x: startX, y: startY, baseX: startX, baseY: startY,
      hp: hp, maxHp: hp,
      r: isBig ? DB.BOSS_CFG.radius * 1.2 : DB.BOSS_CFG.radius,
      isBig: isBig, bossType: bossType,
      fireCd: 2.0, summonCd: 3.0, phase: 'normal', flashT: 0, frozen: 0,
      seed: Math.random() * 100, angle: 0
    };
    state.qte.active = false;
    state.hp = Math.min(state.hpMax, state.hp + state.hpMax * 0.5);
    DB.enemies.length = 0; 
  };

  DB.spawnChip = function (x, y) {
    const keys = Object.keys(DB.CHIP_TYPES);
    const type = keys[Math.floor(Math.random() * keys.length)];
    DB.chips.push({ id: DB.nextUid(), type, x, y, r: 12, seed: Math.random() * 6.28, age: 0, dead: false });
  };

  function applyChip(c) {
    const mods = state.mods;
    const cfg  = DB.CHIP_TYPES[c.type];
    const p = DB.player;
    
    let floatText = '', floatColor = '#ffffff';

    if (c.type === 'damage') { mods.damage += 0.05; floatText = '伤害 +5%'; floatColor = '#ff7a9a'; }
    else if (c.type === 'grab') { mods.grab += 15; floatText = '范围 +15'; floatColor = '#5ae8ff'; }
    else if (c.type === 'launch') { mods.launch += 0.05; floatText = '弹射 +5%'; floatColor = '#c08bff'; }
    else if (c.type === 'heal') { 
      state.hp = Math.min(state.hpMax, state.hp + 15); floatText = '+15 HP'; floatColor = '#5ee6a8';
      state.flash = Math.max(state.flash, 0.15); DB.spawnParticles(p.x, p.y, 20, '#5ee6a8', 300);
    } else if (c.type === 'max_hp') {
      state.hpMax += 10; state.hp += 10; floatText = '上限 +10'; floatColor = '#ffcc00';
      state.flash = Math.max(state.flash, 0.15); DB.spawnParticles(p.x, p.y, 30, '#ffcc00', 400);
    }

    if (DB.floaters) DB.floaters.push({ text: floatText, x: p.x, y: p.y - 40, vy: -50, life: 1.2, maxLife: 1.2, color: floatColor });

    DB.sfx.chip();
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

      const g = ctx.createRadialGradient(x, y, 0, x, y, 22);
      g.addColorStop(0, cfg.color + '88'); g.addColorStop(1, cfg.color + '00');
      ctx.fillStyle = g; ctx.fillRect(x - 22, y - 22, 44, 44);

      ctx.save(); ctx.translate(x, y); ctx.rotate(state.t * 1.5 + c.seed);
      ctx.fillStyle = cfg.color; ctx.shadowColor = cfg.color; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(-10, 0);
      ctx.closePath(); ctx.fill(); ctx.restore();
    }
  };

  function damagePlayer(dmg, px, py) {
    if (state.gameOver || state.scene !== 'playing') return;
    state.hp = Math.max(0, state.hp - dmg);
    state.damageFlash = Math.max(state.damageFlash, 0.5);
    state.shake   = Math.min(state.shake + 10, 30);
    state.hitstop = Math.max(state.hitstop, 0.05);
    DB.spawnParticles(px, py, 12, '#ff5a7a', 300);
    DB.sfx.hurt();
    
    state.combo = 0;
  }

  function killEnemy(index) {
    const e = DB.enemies[index];
    if (!e || e.dead) return;
    e.dead = true;

    const color = e.type === 'worm' ? '#5ee6a8' : (e.type === 'shield' ? '#a88bff' : '#ff7a9a');
    DB.spawnParticles(e.x, e.y, 24, color, 460);
    DB.spawnParticles(e.x, e.y, 10, '#ffffff', 620);
    state.energy = Math.min(state.energyMax, state.energy + 8);
    state.shake  = Math.min(state.shake + 5, 24);
    
    const upData = DB.upgrades || { chip: 0 };
    let dropChance = 0.6 + (upData.chip * 0.1); 
    
    while (dropChance > 0) {
      if (Math.random() < Math.min(1, dropChance)) {
        DB.spawnChip(e.x, e.y);
      }
      dropChance -= 1;
    }

    DB.sfx.hit();
    state.combo++;
    state.comboTimer = 3.0;
    if (state.combo > state.maxCombo) state.maxCombo = state.combo;
    state.score += 100 * state.combo;

    const idx = DB.enemies.indexOf(e);
    if (idx !== -1) DB.enemies.splice(idx, 1);
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

    if (isEarthquake && DB.triggerQuake) {
      DB.triggerQuake(e.x, e.y, finalDmg); 
    }

    if (e.hp <= 0) {
      const idx = DB.enemies.indexOf(e);
      if (idx !== -1) killEnemy(idx);
    }
  };

  DB.updateEnemies = function (dt) {
    const p = DB.player;

    // 每帧强制清理僵尸怪
    for (let i = DB.enemies.length - 1; i >= 0; i--) {
      const e = DB.enemies[i];
      if (e.hp <= 0 || isNaN(e.hp)) {
        e.hp = 0;
        DB.killEnemy(i);
      }
    }

    if (DB.boss) {
      const b = DB.boss;
      
      if (b.hp <= 0 && b.phase !== 'paralyzed') {
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
      }
      
      if (b.flashT > 0) b.flashT -= dt;

      if (b.frozen > 0) {
        b.frozen -= dt;
      } else if (b.phase === 'normal') {
        b.x = b.baseX + Math.sin(state.t * 0.5) * 150;
        b.y = b.baseY + Math.sin(state.t * 0.8) * 30;
        b.fireCd -= dt;      
        
        // ===== 攻击全面膨胀：速度+射速+弹幕数量+子弹伤害 =====
        const waveScale = 1 + (state.wave - 1) * 0.15; 
        const speedScale = 1 + (state.wave - 1) * 0.08; 
        const bossDmg = Math.floor(20 * waveScale); // Boss子弹基础伤害

        if (b.fireCd <= 0) {
          if (b.bossType === 'bsod') {
            b.fireCd = DB.BOSS_CFG.fireInterval / speedScale;
            const count = 8 + Math.floor(state.wave / 2);
            for (let i = 0; i < count; i++) {
              const a = (i / count) * Math.PI * 2 + state.t;
              DB.enemyBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 150 * speedScale, vy: Math.sin(a) * 150 * speedScale, r: 8, life: 8, dmg: bossDmg });
            }
          } 
          else if (b.bossType === 'firewall') {
            b.fireCd = 2.5 / speedScale; 
            const dx = p.x - b.x, dy = p.y - b.y;
            const d = Math.hypot(dx, dy) || 1;
            const count = 3 + Math.floor(state.wave / 4);
            for(let i=0; i<count; i++){
               DB.enemyBullets.push({ x: b.x, y: b.y, vx: (dx/d)*250*speedScale, vy: (dy/d)*250*speedScale, r: 12, life: 6, color: '#ffaa00', dmg: bossDmg * 1.5 });
            }
            DB.sfx.hurt();
          }
          else if (b.bossType === 'vampire') {
            b.fireCd = 5.0 / speedScale; 
            let absorbed = false;
            for (let i = DB.weapons.length - 1; i >= 0; i--) {
              const w = DB.weapons[i];
              if (w.dead || w.held || w.warning > 0 || w.safeTimer > 0) continue; 

              const distToBoss = Math.hypot(w.x - b.x, w.y - b.y);
              if (distToBoss < 600) {
                DB.spawnParticles(w.x, w.y, 15, '#ff7a9a', 400);
                DB.removeWeapon(w);
                b.hp = Math.min(b.maxHp, b.hp + 50 * waveScale); 
                absorbed = true;
              }
            }
            if (absorbed) {
              DB.spawnParticles(b.x, b.y, 30, '#5ee6a8', 300);
              state.hitstop = Math.max(state.hitstop, 0.05);
            }
          }
          else if (b.bossType === 'manager') {
            b.fireCd = 1.5 / speedScale;
            b.angle += 0.4 * speedScale;
            const count = 16 + Math.floor(state.wave / 2);
            for (let i = 0; i < count; i++) {
              const a = (i / count) * Math.PI * 2 + b.angle;
              DB.enemyBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 220 * speedScale, vy: Math.sin(a) * 220 * speedScale, r: 6, life: 6, color: '#5ee6a8', dmg: bossDmg * 0.8 });
            }
          }
          else if (b.bossType === 'trojan') {
            b.fireCd = Math.max(0.1, 0.2 / speedScale); 
            b.angle += 0.8 * speedScale;
            for(let s=-1; s<=1; s+=2) {
              const a = b.angle * s;
              DB.enemyBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 180 * speedScale, vy: Math.sin(a) * 180 * speedScale, r: 8, life: 8, color: '#c08bff', dmg: bossDmg * 0.7 });
            }
          }
        }

        b.summonCd -= dt;
        if (b.summonCd <= 0) {
          b.summonCd = (b.isBig ? 5.0 : 8.0) / speedScale;
          const count = (b.isBig ? 3 : 1) + Math.floor(state.wave / 5);
          for(let c=0; c<count; c++){
            const hpMult = Math.pow(1.28, state.wave - 1);
            const waveDmgMult = 1 + (state.wave - 1) * 0.15;
            DB.enemies.push({ 
              type: 'drone', x: b.x + (Math.random()-0.5)*100, y: b.y + 60, 
              baseX: b.x, baseY: b.y + 60, seed: Math.random() * 100, 
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

      if (e.frozen > 0) {
        e.frozen -= dt;
        continue;
      }

      if (e.type === 'drone') {
        e.x = e.baseX + Math.sin(state.t * 0.8 + e.seed) * 40;
        e.y = e.baseY + Math.sin(state.t * 1.3 + e.seed * 2) * 18;
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          e.fireCd = FIRE_INTERVAL + Math.random() * 0.6;
          const dx = p.x - e.x, dy = p.y - e.y;
          const d = Math.hypot(dx, dy) || 1;
          const bulletColor = state.mode === 'hacker' ? '#5ee6a8' : '#ff5a7a';
          DB.enemyBullets.push({ x: e.x, y: e.y, vx: (dx / d) * BULLET_SPEED, vy: (dy / d) * BULLET_SPEED, r: BULLET_R, life: BULLET_LIFE, color: bulletColor, dmg: e.dmg });
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
        if (d < e.r + p.r) { damagePlayer(e.dmg, e.x, e.y); killEnemy(i); }
      }
      else if (e.type === 'shield') {
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.facing = dx > 0 ? 1 : -1; 
        const moveSpeed = (e.speed || 60) * ((e.slowT > 0) ? 0.4 : 1.0);
        e.x += (dx / d) * moveSpeed * dt;
        e.y += (dy / d) * moveSpeed * dt;
        if (d < e.r + p.r) damagePlayer(e.dmg, e.x, e.y);
      }
    }

    for (let i = DB.enemyBullets.length - 1; i >= 0; i--) {
      const b = DB.enemyBullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy < (b.r + p.r) * (b.r + p.r)) {
        damagePlayer(b.dmg || 10, b.x, b.y); // 使用子弹自身伤害
        DB.enemyBullets.splice(i, 1);
        continue;
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
          const hitDmg = w.baseDamage * power * (1 + state.mods.damage);
          b.hp -= hitDmg;
          
          if (DB.floaters) DB.floaters.push({ text: `-${Math.round(hitDmg)}`, x: b.x + (Math.random() - 0.5) * 40, y: b.y - b.r, vy: -50, life: 1, maxLife: 1, color: '#ffffff' });
          state.hitstop = Math.max(state.hitstop, 0.05);
          state.shake = Math.min(state.shake + 5, 22);
          DB.spawnParticles(w.x, w.y, 20, '#ffffff', 500);
          DB.sfx.hit();
          DB.removeWeapon(w);
          hit = true;

          if (w.def.effect === 'earthquake' && DB.triggerQuake) {
             DB.triggerQuake(b.x, b.y, w.baseDamage * (1 + state.mods.damage));
          }

          if (b.hp <= 0) {
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
          const finalDmg = w.baseDamage * power * (1 + state.mods.damage);
          e.hp -= finalDmg;
          e.flashT = 0.12;
          if (DB.floaters) DB.floaters.push({ text: `-${Math.round(finalDmg)}`, x: e.x, y: e.y - 30, vy: -50, life: 1, maxLife: 1, color: '#ffffff' });
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
            state.shake = 26; 
            state.flash = Math.max(state.flash, 0.15); 
            DB.sfx.error(); 
          } else if (w.def.effect === 'earthquake' && DB.triggerQuake) {
            DB.triggerQuake(e.x, e.y, finalDmg);
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
      
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2);
      g.addColorStop(0, flash ? 'rgba(255,255,255,0.8)' : 'rgba(120, 90, 255, 0.4)');
      g.addColorStop(1, 'rgba(120, 90, 255, 0)');
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

      ctx.fillStyle = flash ? '#ffffff' : mainColor;
      ctx.strokeStyle = flash ? '#ffffff' : strokeColor;
      ctx.lineWidth = b.isBig ? 6 : 4;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      ctx.fillStyle = strokeColor;
      ctx.font = `bold ${b.isBig ? '32px' : '20px'} monospace`; 
      ctx.textAlign = 'center';
      ctx.fillText(text, b.x, b.y + (b.isBig ? 12 : 8));
      
      ctx.restore();
    }

    for (const e of DB.enemies) {
      const flash = e.flashT > 0;
      ctx.save();

      if (e.frozen > 0) {
        ctx.shadowColor = '#5ae8ff';
        ctx.shadowBlur = 30;
      }
      
      if (e.vulnerable > 0 || e.slowT > 0) {
        ctx.shadowColor = '#c08bff';
        ctx.shadowBlur = 20;
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
          ctx.fillStyle = '#5ee6a8';
          ctx.font = '12px monospace';
          ctx.textAlign = 'center';
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
          ctx.fillStyle = '#000';
          ctx.font = 'bold 10px monospace';
          ctx.fillText('✓', shieldX, e.y - 10);
          ctx.fillText('✕', shieldX, e.y + 15);
        }
      }
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