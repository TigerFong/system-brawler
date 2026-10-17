(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const W     = CFG.W;
  const H     = CFG.H;

  /* ==================== 容器 ==================== */
  DB.enemies      = [];
  DB.enemyBullets = [];
  DB.chips        = [];

  const ENEMY_HP      = DB.ENEMY_CFG.droneHp;
  const ENEMY_R       = 20;
  const FIRE_INTERVAL = 2.2;
  const BULLET_SPEED  = 260;
  const BULLET_R      = 6;
  const BULLET_DMG    = 8;
  const BULLET_LIFE   = 6;
  const CHIP_DROP_RATE = 0.6;
  const CHIP_LIFETIME  = 14;

  /* ==================== 波次与 Boss ==================== */
  DB.spawnWave = function (n) {
    const droneCount = 2 + Math.floor(n / 2);
    const wormCount  = 1 + Math.floor(n / 2);
    const shieldCount = n >= 3 ? 1 : 0;

    for (let i = 0; i < droneCount; i++) {
      const x = 120 + Math.random() * (W - 240);
      const y = 160 + Math.random() * 180;
      DB.enemies.push({
        type: 'drone', x, y, baseX: x, baseY: y,
        seed: Math.random() * 100, hp: ENEMY_HP, r: ENEMY_R,
        fireCd: 0.8 + Math.random() * 1.6, flashT: 0, frozen: 0
      });
    }

    for (let i = 0; i < wormCount; i++) {
      const fromLeft = Math.random() > 0.5;
      DB.enemies.push({
        type: 'worm', x: fromLeft ? -40 : W + 40, y: CFG.GROUND_Y - 15,
        vx: 0, hp: DB.ENEMY_CFG.wormHp, r: 22,
        seed: Math.random() * 100, flashT: 0, frozen: 0,
        phase: Math.random() * Math.PI * 2
      });
    }

    for (let i = 0; i < shieldCount; i++) {
      const fromLeft = Math.random() > 0.5;
      DB.enemies.push({
        type: 'shield', x: fromLeft ? -40 : W + 40, y: CFG.GROUND_Y - 25,
        vx: 0, hp: DB.ENEMY_CFG.shieldHp, r: 28,
        seed: Math.random() * 100, flashT: 0, frozen: 0,
        facing: fromLeft ? 1 : -1
      });
    }
  };

  DB.spawnBoss = function () {
    DB.boss = {
      x: W / 2, y: 200,
      hp: DB.BOSS_CFG.hp, maxHp: DB.BOSS_CFG.maxHp,
      r: DB.BOSS_CFG.radius,
      fireCd: 2.0, summonCd: 3.0, phase: 'normal', flashT: 0, frozen: 0,
      seed: Math.random() * 100
    };
    state.qte.active = false;
    state.hp = Math.min(state.hpMax, state.hp + state.hpMax * 0.5);
    DB.enemies.length = 0; 
  };

  /* ==================== 芯片生成 ==================== */
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

    if (c.type === 'damage') { mods.damage = Math.min(0.75, mods.damage + 0.15); floatText = '伤害 +15%'; floatColor = '#ff7a9a'; }
    else if (c.type === 'grab') { mods.grab = Math.min(120, mods.grab + 40); floatText = '范围 +40'; floatColor = '#5ae8ff'; }
    else if (c.type === 'launch') { mods.launch = Math.min(0.6, mods.launch + 0.15); floatText = '弹射 +15%'; floatColor = '#c08bff'; }
    else if (c.type === 'heal') { 
      state.hp = Math.min(state.hpMax, state.hp + 20); floatText = '+20 HP'; floatColor = '#5ee6a8';
      state.flash = Math.max(state.flash, 0.15); DB.spawnParticles(p.x, p.y, 20, '#5ee6a8', 300);
    } else if (c.type === 'max_hp') {
      state.hpMax += 20; state.hp += 20; floatText = '上限 +20'; floatColor = '#ffcc00';
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

  /* ==================== 伤害与击杀 ==================== */
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
    if (!e) return;
    const color = e.type === 'worm' ? '#5ee6a8' : (e.type === 'shield' ? '#a88bff' : '#ff7a9a');
    DB.spawnParticles(e.x, e.y, 24, color, 460);
    DB.spawnParticles(e.x, e.y, 10, '#ffffff', 620);
    state.energy = Math.min(state.energyMax, state.energy + 8);
    state.shake  = Math.min(state.shake + 5, 24);
    
    // 动态掉率（基础 60% + 升级加成）
    const upData = JSON.parse(localStorage.getItem('sys_brawler_upgrades') || '{"hp":0,"energy":0,"chip":0}');
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

    DB.enemies.splice(index, 1);
  }

  // 开放接口给 weapons.js（黑客拖拽爆破使用）
  DB.killEnemy = function(index) { killEnemy(index); };
  
  DB.damageEnemy = function (e, index, dmg, isEarthquake) {
    const finalDmg = dmg * 1.2 * (1 + state.mods.damage); // 拖拽近战 1.2 倍加成
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

    if (e.hp <= 0) killEnemy(index);
  };

  /* ==================== 每帧更新 ==================== */
  DB.updateEnemies = function (dt) {
    const p = DB.player;

    /* --- 1. Boss AI --- */
    if (DB.boss) {
      const b = DB.boss;
      if (b.flashT > 0) b.flashT -= dt;

      if (b.frozen > 0) {
        b.frozen -= dt;
      } else if (b.phase === 'normal') {
        b.x = W / 2 + Math.sin(state.t * 0.5) * 100;
        b.y = 200 + Math.sin(state.t * 0.8) * 30;
        b.fireCd -= dt;
        if (b.fireCd <= 0) {
          b.fireCd = DB.BOSS_CFG.fireInterval;
          const count = 8; 
          for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + state.t;
            DB.enemyBullets.push({ x: b.x, y: b.y, vx: Math.cos(a) * 150, vy: Math.sin(a) * 150, r: 8, life: 8 });
          }
          DB.sfx.hurt();
        }
        b.summonCd -= dt;
        if (b.summonCd <= 0) {
          b.summonCd = DB.BOSS_CFG.summonInterval;
          DB.enemies.push({ type: 'drone', x: b.x, y: b.y + 60, baseX: b.x, baseY: b.y + 60, seed: Math.random() * 100, hp: ENEMY_HP, r: ENEMY_R, fireCd: 1.0, flashT: 0, frozen: 0 });
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

    /* --- 2. 敌人 AI --- */
    for (let i = DB.enemies.length - 1; i >= 0; i--) {
      const e = DB.enemies[i];
      if (e.flashT > 0) e.flashT -= dt;

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
          DB.enemyBullets.push({ x: e.x, y: e.y, vx: (dx / d) * BULLET_SPEED, vy: (dy / d) * BULLET_SPEED, r: BULLET_R, life: BULLET_LIFE });
        }
      } 
      else if (e.type === 'worm') {
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.phase += dt * 15;
        const speed = DB.ENEMY_CFG.wormSpeed * (1 + Math.sin(e.phase) * 0.15);
        e.x += (dx / d) * speed * dt;
        e.y += (dy / d) * speed * dt;
        if (d < e.r + p.r) { damagePlayer(12, e.x, e.y); killEnemy(i); }
      }
      else if (e.type === 'shield') {
        const dx = p.x - e.x, dy = p.y - e.y;
        const d = Math.hypot(dx, dy) || 1;
        e.facing = dx > 0 ? 1 : -1; 
        e.x += (dx / d) * 60 * dt;
        e.y += (dy / d) * 60 * dt;
        if (d < e.r + p.r) damagePlayer(15, e.x, e.y);
      }
    }

    /* --- 3. 敌方子弹 --- */
    for (let i = DB.enemyBullets.length - 1; i >= 0; i--) {
      const b = DB.enemyBullets[i];
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy < (b.r + p.r) * (b.r + p.r)) {
        damagePlayer(BULLET_DMG, b.x, b.y);
        DB.enemyBullets.splice(i, 1);
        continue;
      }
      if (b.life <= 0 || b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) {
        DB.enemyBullets.splice(i, 1);
      }
    }

    /* --- 4. 污染武器 --- */
    for (const e of DB.enemies) {
      for (const w of DB.weapons) {
        if (w.dead || w.held || w.thrown || w.corrupted || w.warning > 0) continue;
        const dx = w.x - e.x, dy = w.y - e.y;
        const radius = w.r + e.r + 10;
        if (dx * dx + dy * dy < radius * radius) {
          w.corrupted = true;
          DB.spawnParticles(w.x, w.y, 8, '#ff5a7a', 200);
        }
      }
    }

    /* --- 5. 武器 vs Boss & 小怪（防守方弹射逻辑） --- */
    for (let wi = DB.weapons.length - 1; wi >= 0; wi--) {
      const w = DB.weapons[wi];
      if (w.dead || w.held || !w.thrown) continue;
      const speed = Math.hypot(w.vx, w.vy);
      if (speed < 180) continue;

      let hit = false;

      // 砸 Boss
      if (DB.boss && DB.boss.phase === 'normal') {
        const b = DB.boss;
        const dx = w.x - b.x, dy = w.y - b.y;
        if (dx * dx + dy * dy < (w.r + b.r) * (w.r + b.r)) {
          const power = DB.clamp(speed / 700, 0.5, 2.4);
          b.hp -= w.def.damage * power * (1 + state.mods.damage);
          b.flashT = 0.1;
          state.hitstop = Math.max(state.hitstop, 0.05);
          state.shake = Math.min(state.shake + 5, 22);
          DB.spawnParticles(w.x, w.y, 20, '#ffffff', 500);
          DB.sfx.hit();
          DB.removeWeapon(w);
          hit = true;

          if (w.def.effect === 'earthquake' && DB.triggerQuake) {
             DB.triggerQuake(b.x, b.y, w.def.damage * (1 + state.mods.damage));
          }

          if (b.hp <= 0) {
            b.hp = 0;
            b.phase = 'paralyzed';
            state.qte.active = true;
            state.qte.timer = 8.0;
            state.qte.inputIndex = 0;
            let seq = "";
            for(let i=0; i<6; i++) seq += Math.floor(Math.random() * 10);
            state.qte.sequence = seq;
            state.flash = 0.5;
            state.hitstop = 0.15;
          }
        }
      }

      if (hit) continue;

      // 砸小怪
      for (let ei = DB.enemies.length - 1; ei >= 0; ei--) {
        const e = DB.enemies[ei];
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
          const finalDmg = w.def.damage * power * (1 + state.mods.damage);
          e.hp -= finalDmg;
          e.flashT = 0.12;
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
              DB.particles.push({
                x: e.x + (DB.player.x - e.x) * t,
                y: e.y + (DB.player.y - e.y) * t,
                vx: (Math.random()-0.5)*100, vy: (Math.random()-0.5)*100,
                life: 0.4, maxLife: 0.4, size: 4,
                color: '#5ae8ff', spin: 0, rot: 0
              });
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
    if (DB.boss) {
      const b = DB.boss;
      const flash = b.flashT > 0;
      ctx.save();
      const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r * 2);
      g.addColorStop(0, flash ? 'rgba(255,255,255,0.8)' : 'rgba(120, 90, 255, 0.4)');
      g.addColorStop(1, 'rgba(120, 90, 255, 0)');
      ctx.fillStyle = g; ctx.fillRect(b.x - b.r * 2, b.y - b.r * 2, b.r * 4, b.r * 4);

      ctx.fillStyle = b.phase === 'paralyzed' ? '#ffcc00' : (b.frozen > 0 ? '#5ae8ff' : '#0a0a2a');
      ctx.strokeStyle = b.phase === 'paralyzed' ? '#ffffff' : '#5ae8ff';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();

      ctx.fillStyle = b.phase === 'paralyzed' ? '#000000' : '#5ae8ff';
      ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
      ctx.fillText(b.phase === 'paralyzed' ? 'SYSTEM HALT' : ':(', b.x, b.y + 8);
      ctx.restore();
    }

    for (const e of DB.enemies) {
      const flash = e.flashT > 0;
      ctx.save();

      if (e.frozen > 0) {
        ctx.shadowColor = '#5ae8ff';
        ctx.shadowBlur = 30;
      }

      if (e.type === 'drone') {
        const w = 44, h = 34, x = e.x - w / 2, y = e.y - h / 2;
        const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 40);
        g.addColorStop(0, flash ? 'rgba(255,255,255,.7)' : (e.frozen > 0 ? 'rgba(90,240,255,.7)' : 'rgba(255, 90, 120, .35)'));
        g.addColorStop(1, e.frozen > 0 ? 'rgba(90,240,255,0)' : 'rgba(255, 90, 120, 0)');
        ctx.fillStyle = g; ctx.fillRect(e.x - 40, e.y - 40, 80, 80);
        ctx.fillStyle = flash ? '#ffffff' : (e.frozen > 0 ? '#0a2a3a' : 'rgba(30, 12, 24, 0.95)');
        ctx.strokeStyle = flash ? '#ffffff' : (e.frozen > 0 ? '#5ae8ff' : 'rgba(255, 90, 120, 0.9)');
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.roundRect(x, y, w, h, 4); ctx.fill(); ctx.stroke();
        ctx.fillStyle = flash ? 'rgba(255,255,255,.3)' : (e.frozen > 0 ? 'rgba(90,240,255,.3)' : 'rgba(255, 90, 120, 0.25)');
        ctx.fillRect(x + 2, y + 2, w - 4, 9);
      } 
      else if (e.type === 'worm') {
        const color = flash ? '#ffffff' : (e.frozen > 0 ? '#5ae8ff' : '#5ee6a8');
        ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 15;
        for (let i = 0; i < 3; i++) {
          const offset = Math.sin(e.phase + i * 1.5) * 8;
          const cx = e.x - (i * 14), cy = e.y + offset;
          ctx.beginPath(); ctx.arc(cx, cy, e.r * (1 - i * 0.25), 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = '#ff5a7a';
        ctx.beginPath(); ctx.arc(e.x + 6, e.y - 4, 3, 0, Math.PI * 2); ctx.fill();
      }
      else if (e.type === 'shield') {
        ctx.fillStyle = flash ? '#ffffff' : (e.frozen > 0 ? '#1a3a4a' : '#1a1a30');
        ctx.strokeStyle = e.frozen > 0 ? '#5ae8ff' : '#a88bff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        const shieldX = e.x + e.facing * 25;
        ctx.fillStyle = e.frozen > 0 ? '#ffffff' : '#5ae8ff';
        ctx.fillRect(shieldX - 5, e.y - 30, 10, 60);
      }
      ctx.restore();
    }
  };

  DB.drawEnemyBullets = function (ctx) {
    for (const b of DB.enemyBullets) {
      ctx.save();
      const tx = b.x - b.vx * 0.03, ty = b.y - b.vy * 0.03;
      const grad = ctx.createLinearGradient(tx, ty, b.x, b.y);
      grad.addColorStop(0, 'rgba(255, 60, 90, 0)'); grad.addColorStop(1, 'rgba(255, 90, 120, 0.85)');
      ctx.strokeStyle = grad; ctx.lineWidth = b.r; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.shadowColor = '#ff5a7a'; ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffd8e2';
      ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  };

})(window.DB);