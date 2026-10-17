(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const W     = CFG.W;
  const H     = CFG.H;

  /* ==================== 容器 ==================== */
  DB.enemies      = [];
  DB.enemyBullets = [];
  DB.chips        = [];      // 新增：芯片掉落物

  /* ==================== 数值 ==================== */
  const ENEMY_HP      = 30;
  const ENEMY_R       = 20;
  const FIRE_INTERVAL = 2.2;
  const BULLET_SPEED  = 260;
  const BULLET_R      = 6;
  const BULLET_DMG    = 8;
  const BULLET_LIFE   = 6;
  const CHIP_DROP_RATE = 0.6;
  const CHIP_LIFETIME  = 14;

  /* ==================== 波次 ==================== */
  DB.spawnWave = function (n) {
    const count = 3 + n;
    for (let i = 0; i < count; i++) {
      const x = 120 + Math.random() * (W - 240);
      const y = 160 + Math.random() * 180;
      DB.enemies.push({
        x, y, baseX: x, baseY: y,
        seed: Math.random() * 100,
        hp: ENEMY_HP, r: ENEMY_R,
        fireCd: 0.8 + Math.random() * 1.6,
        flashT: 0
      });
    }
  };

  /* ==================== 芯片生成 ==================== */
  DB.spawnChip = function (x, y) {
    const keys = Object.keys(DB.CHIP_TYPES);
    const type = keys[Math.floor(Math.random() * keys.length)];
    DB.chips.push({
      id: DB.nextUid(),
      type, x, y,
      r: 12,
      seed: Math.random() * 6.28,
      age: 0,
      dead: false
    });
  };

  function applyChip(c) {
    const mods = state.mods;
    const cfg  = DB.CHIP_TYPES[c.type];

    if (c.type === 'damage') {
      mods.damage = Math.min(0.75, mods.damage + 0.15);
    } else if (c.type === 'grab') {
      mods.grab = Math.min(120, mods.grab + 40);
    } else if (c.type === 'launch') {
      mods.launch = Math.min(0.6, mods.launch + 0.15);
    }

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

      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const d  = Math.hypot(dx, dy) || 1;

      // 吸附
      if (d < 120) {
        const pull = (1 - d / 120) * 900 * dt;
        c.x += (dx / d) * pull;
        c.y += (dy / d) * pull;
      }

      // 拾取
      if (d < 24) {
        applyChip(c);
        c.dead = true;
        DB.chips.splice(i, 1);
        continue;
      }

      // 超时
      if (c.age > CHIP_LIFETIME) {
        DB.chips.splice(i, 1);
      }
    }
  };

  DB.drawChips = function (ctx) {
    for (const c of DB.chips) {
      if (c.dead) continue;

      const cfg = DB.CHIP_TYPES[c.type];
      const bob = Math.sin(state.t * 4 + c.seed) * 3;
      const x = c.x;
      const y = c.y + bob;

      // 外发光
      const g = ctx.createRadialGradient(x, y, 0, x, y, 22);
      g.addColorStop(0, cfg.color + '88');
      g.addColorStop(1, cfg.color + '00');
      ctx.fillStyle = g;
      ctx.fillRect(x - 22, y - 22, 44, 44);

      // 菱形
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(state.t * 1.5 + c.seed);
      ctx.fillStyle = cfg.color;
      ctx.shadowColor = cfg.color;
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(10, 0);
      ctx.lineTo(0, 10);
      ctx.lineTo(-10, 0);
      ctx.closePath();
      ctx.fill();

      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // 标签
      ctx.save();
      ctx.font = 'bold 9px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = cfg.color;
      ctx.globalAlpha = c.age > CHIP_LIFETIME - 2
        ? (Math.sin(state.t * 20) > 0 ? 0.9 : 0.2)
        : 0.85;
      ctx.fillText(cfg.label, x, y + 26);
      ctx.restore();
    }
  };

  /* ==================== 射击 ==================== */
  function fireAtPlayer(e) {
    const dx = DB.player.x - e.x;
    const dy = DB.player.y - e.y;
    const d  = Math.hypot(dx, dy) || 1;
    DB.enemyBullets.push({
      x: e.x, y: e.y,
      vx: (dx / d) * BULLET_SPEED,
      vy: (dy / d) * BULLET_SPEED,
      r: BULLET_R, life: BULLET_LIFE
    });
  }

  /* ==================== 玩家受伤 ==================== */
  function damagePlayer(dmg, px, py) {
    if (state.gameOver) return;
    state.hp = Math.max(0, state.hp - dmg);
    state.damageFlash = Math.max(state.damageFlash, 0.5);
    state.shake   = Math.min(state.shake + 10, 30);
    state.hitstop = Math.max(state.hitstop, 0.05);
    DB.spawnParticles(px, py, 12, '#ff5a7a', 300);
    DB.sfx.hurt();
  }

  /* ==================== 击杀 ==================== */
  function killEnemy(index) {
    const e = DB.enemies[index];
    if (!e) return;

    DB.spawnParticles(e.x, e.y, 24, '#ff7a9a', 460);
    DB.spawnParticles(e.x, e.y, 10, '#ffffff', 620);
    state.energy = Math.min(state.energyMax, state.energy + 8);
    state.shake  = Math.min(state.shake + 5, 24);

    if (Math.random() < CHIP_DROP_RATE) {
      DB.spawnChip(e.x, e.y);
    }

    DB.sfx.hit();
    DB.enemies.splice(index, 1);
  }

  /* ==================== 每帧更新 ==================== */
  DB.updateEnemies = function (dt) {
    /* --- 敌人漂移 / 射击 --- */
    for (const e of DB.enemies) {
      e.x = e.baseX + Math.sin(state.t * 0.8 + e.seed) * 40;
      e.y = e.baseY + Math.sin(state.t * 1.3 + e.seed * 2) * 18;

      if (e.flashT > 0) e.flashT -= dt;

      e.fireCd -= dt;
      if (e.fireCd <= 0) {
        e.fireCd = FIRE_INTERVAL + Math.random() * 0.6;
        fireAtPlayer(e);
      }
    }

    /* --- 敌方子弹 --- */
    for (let i = DB.enemyBullets.length - 1; i >= 0; i--) {
      const b = DB.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;

      const dx = b.x - DB.player.x;
      const dy = b.y - DB.player.y;
      if (dx * dx + dy * dy < (b.r + DB.player.r) * (b.r + DB.player.r)) {
        damagePlayer(BULLET_DMG, b.x, b.y);
        DB.enemyBullets.splice(i, 1);
        continue;
      }

      if (b.life <= 0 || b.x < -40 || b.x > W + 40 || b.y < -40 || b.y > H + 40) {
        DB.enemyBullets.splice(i, 1);
      }
    }

    /* --- 武器 vs 敌人（命中即碎） --- */
    for (let wi = DB.weapons.length - 1; wi >= 0; wi--) {
      const w = DB.weapons[wi];
      if (w.dead || w.held || !w.thrown) continue;

      const speed = Math.hypot(w.vx, w.vy);
      if (speed < 180) continue;

      for (let ei = DB.enemies.length - 1; ei >= 0; ei--) {
        const e = DB.enemies[ei];
        const dx = w.x - e.x;
        const dy = w.y - e.y;
        if (dx * dx + dy * dy < (w.r + e.r) * (w.r + e.r)) {
          const power = DB.clamp(speed / 700, 0.5, 2.4);
          const dmg = w.def.damage * power * (1 + state.mods.damage);
          e.hp -= dmg;
          e.flashT = 0.12;

          state.hitstop = Math.max(state.hitstop, 0.045);
          state.shake   = Math.min(state.shake + 4, 22);

          DB.spawnParticles(w.x, w.y, 14, '#ffffff', 480);
          DB.spawnParticles(w.x, w.y, 8,  '#5ae8ff', 320);
          DB.sfx.hit();

          DB.removeWeapon(w);

          if (e.hp <= 0) killEnemy(ei);
          break;
        }
      }
    }
  };

  /* ==================== 绘制：敌人 ==================== */
  DB.drawEnemies = function (ctx) {
    for (const e of DB.enemies) {
      const w = 44, h = 34;
      const x = e.x - w / 2;
      const y = e.y - h / 2;
      const flash = e.flashT > 0;

      ctx.save();

      const g = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, 40);
      g.addColorStop(0, flash ? 'rgba(255,255,255,.7)' : 'rgba(255, 90, 120, .35)');
      g.addColorStop(1, 'rgba(255, 90, 120, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(e.x - 40, e.y - 40, 80, 80);

      ctx.fillStyle = flash ? '#ffffff' : 'rgba(30, 12, 24, 0.95)';
      ctx.strokeStyle = flash ? '#ffffff' : 'rgba(255, 90, 120, 0.9)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, 4);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = flash ? 'rgba(255,255,255,.3)' : 'rgba(255, 90, 120, 0.25)';
      ctx.fillRect(x + 2, y + 2, w - 4, 9);

      ctx.strokeStyle = flash ? '#ff2a4a' : 'rgba(255, 120, 150, 0.95)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + w - 11, y + 4);
      ctx.lineTo(x + w - 5,  y + 10);
      ctx.moveTo(x + w - 5,  y + 4);
      ctx.lineTo(x + w - 11, y + 10);
      ctx.stroke();

      ctx.strokeStyle = flash ? 'rgba(255,255,255,.6)' : 'rgba(255, 120, 150, 0.35)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x + 6, y + 20);
      ctx.lineTo(x + w - 6, y + 20);
      ctx.moveTo(x + 6, y + 25);
      ctx.lineTo(x + w - 14, y + 25);
      ctx.stroke();

      ctx.restore();
    }
  };

  /* ==================== 绘制：敌方子弹 ==================== */
  DB.drawEnemyBullets = function (ctx) {
    for (const b of DB.enemyBullets) {
      ctx.save();

      const tx = b.x - b.vx * 0.03;
      const ty = b.y - b.vy * 0.03;
      const grad = ctx.createLinearGradient(tx, ty, b.x, b.y);
      grad.addColorStop(0, 'rgba(255, 60, 90, 0)');
      grad.addColorStop(1, 'rgba(255, 90, 120, 0.85)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = b.r;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();

      ctx.shadowColor = '#ff5a7a';
      ctx.shadowBlur = 14;
      ctx.fillStyle = '#ffd8e2';
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.6, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  };

})(window.DB);