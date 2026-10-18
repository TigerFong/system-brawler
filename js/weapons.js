(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const layer = DB.dom.weaponLayer;
  const W     = CFG.W;
  const H     = CFG.H;          // [修复] 补充 H 声明，原代码 pull 效果里使用了 H 但未声明

  /* ---------- 计数 ---------- */
  function countActiveWeapons() {
    let n = 0;
    for (const w of DB.weapons) if (!w.dead) n++;
    return n;
  }

  /* ---------- 动态生成点 ---------- */
  function pickSpawnPoint() {
    const camX = DB.state.camera.x;
    const camY = DB.state.camera.y;
    
    const marginX = 120;
    const marginY = 120;
    const viewMinX = DB.clamp(camX + marginX, 0, CFG.W - marginX * 2);
    const viewMaxX = DB.clamp(camX + CFG.VIEW_W - marginX, marginX * 2, CFG.W);
    const viewMinY = DB.clamp(camY + marginY, CFG.PLAY_TOP, CFG.GROUND_Y - marginY * 2);
    const viewMaxY = DB.clamp(camY + CFG.VIEW_H - 180, CFG.PLAY_TOP, CFG.GROUND_Y);

    for (let attempt = 0; attempt < 15; attempt++) {
      const px = viewMinX + Math.random() * (viewMaxX - viewMinX);
      const py = viewMinY + Math.random() * (viewMaxY - viewMinY);
      
      const distToPlayer = Math.hypot(px - DB.player.x, py - DB.player.y);
      if (distToPlayer < 150 || distToPlayer > CFG.GRAB_RANGE * 1.8) continue;

      let safe = true;
      for (const e of DB.enemies) {
        if (Math.hypot(px - e.x, py - e.y) < 150) { safe = false; break; }
      }
      if (safe) return { x: px, y: py };
    }
    
    return {
      x: DB.player.x + (Math.random() > 0.5 ? 1 : -1) * (200 + Math.random() * 200),
      y: DB.clamp(DB.player.y + (Math.random() - 0.5) * 300, CFG.PLAY_TOP, CFG.GROUND_Y)
    };
  }

  /* ---------- 生成 ---------- */
  DB.spawnWeapon = function (type) {
    const maxWeapons = CFG.MAX_WEAPONS + (DB.upgrades ? DB.upgrades.weapon : 0);
    if (countActiveWeapons() >= maxWeapons) return null;

    const isHacker = state.mode === 'hacker';
    const table = isHacker ? DB.HACKER_WEAPON_TYPES : DB.WEAPON_TYPES;
    const def = table[type];
    if (!def) return null;

    const p = pickSpawnPoint();

    const w = {
      id: DB.nextUid(),
      type, def,
      baseDamage: def.damage * (1 + (DB.upgrades && DB.upgrades.damage ? DB.upgrades.damage : 0) * 0.1) || def.damage,
      x: p.x, y: p.y,
      vx: 0, vy: 0,
      rot: 0, rotV: 0,
      r: def.r,
      seed: Math.random() * 100,
      warning: CFG.SPAWN_WARN,
      thrown: false,
      held: false,
      dead: false,
      hitCd: 0,
      age: 0,
      safeTimer: 3.0,
      el: null,
      anchorX: 0,
      anchorY: 0
    };

    DB.weapons.push(w);
    return w;
  };

  function createWeaponEl(w) {
    const el = document.createElement('div');
    el.className = 'weapon';
    
    if (state.mode === 'hacker') {
      el.style.color = '#ffcc00';
      el.style.borderColor = 'rgba(255, 204, 0, 0.8)';
      el.style.background = 'linear-gradient(180deg, rgba(80, 60, 10, 0.95), rgba(30, 20, 5, 0.98))';
      el.style.boxShadow = '0 0 15px rgba(255, 204, 0, 0.4), 0 0 5px rgba(255, 204, 0, 0.6) inset, 0 6px 18px rgba(0, 0, 0, 0.6)';
      el.style.textShadow = '0 0 8px rgba(255, 204, 0, 0.8)';
    }
    
    el.style.width  = w.def.w + 'px';
    el.style.height = w.def.h + 'px';
    el.textContent = w.def.label;
    layer.appendChild(el);
    return el;
  }

  function positionWeaponEl(w) {
    if (!w.el) return;
    const bob = w.thrown ? 0 : Math.sin(state.t * 2.6 + w.seed) * 4;
    const tx = w.x - w.def.w / 2;
    const ty = w.y - w.def.h / 2 + bob;
    w.el.style.transform =
      `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) rotate(${w.rot.toFixed(4)}rad)`;
  }

  /* ---------- 移除 ---------- */
  DB.removeWeapon = function (w) {
    if (w.dead) return;
    w.dead = true;
    if (w.el && w.el.parentNode) w.el.remove();

    const i = DB.weapons.indexOf(w);
    if (i >= 0) DB.weapons.splice(i, 1);

    if (DB.heldWeapon === w) DB.heldWeapon = null;
  };

  /* ---------- 抓取 ---------- */
  DB.tryGrab = function (mx, my) {
    let best = null;
    let bestD = Infinity;

    for (const w of DB.weapons) {
      if (w.dead || w.warning > 0 || w.held) continue;
      const d = Math.hypot(w.x - mx, w.y - my);
      const pickR = state.mode === 'hacker' ? CFG.GRAB_PICK_R + 20 : CFG.GRAB_PICK_R;
      if (d < w.r + pickR && d < bestD) {
        bestD = d;
        best = w;
      }
    }

    if (!best) return;

    const grabRange = CFG.GRAB_RANGE + state.mods.grab;
    const distToPlayer = Math.hypot(best.x - DB.player.x, best.y - DB.player.y);
    if (distToPlayer > grabRange) {
      DB.spawnParticles(best.x, best.y, 6, '#ff5a7a', 160);
      return;
    }

    if (best.corrupted) {
      DB.spawnParticles(best.x, best.y, 30, '#ff5a7a', 500);
      DB.spawnParticles(best.x, best.y, 15, '#ffffff', 600);
      state.hp = Math.max(0, state.hp - 15);
      state.damageFlash = Math.max(state.damageFlash, 0.6);
      state.shake = 26;
      state.hitstop = 0.08;
      DB.sfx.hurt();
      DB.removeWeapon(best);
      return;
    }

    best.held   = true;
    best.thrown = false;
    best.vx = 0; best.vy = 0; best.rotV = 0;
    
    if (state.mode !== 'hacker') {
      best.anchorX = best.x;
      best.anchorY = best.y;
    }
    
    if (best.el) best.el.classList.add('held');
    DB.sfx.grab();
    DB.heldWeapon = best;
  };

  /* ---------- 释放 ---------- */
  DB.releaseThrow = function () {
    const w = DB.heldWeapon;
    if (!w) return;

    w.held = false;
    if (w.el) w.el.classList.remove('held');
    DB.heldWeapon = null;

    // ===== 黑客：指哪打哪，从当前位置直线飞出 =====
    if (state.mode === 'hacker') {
      const p = DB.player;
      const mouse = DB.mouse;
      const dx = mouse.x - p.x; 
      const dy = mouse.y - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist < 30) {
        w.thrown = false;
        w.vx = 0; w.vy = 0;
      } else {
        w.thrown = true;
        w.age = 0;
        
        const speed = 1800; 
        w.vx = (dx / dist) * speed;
        w.vy = (dy / dist) * speed;
        w.rotV = (Math.random() > 0.5 ? 1 : -1) * 20;
        
        state.shake = Math.min(state.shake + 4, 15);
        DB.spawnParticles(w.x, w.y, 10, '#ffcc00', 300);
        DB.sfx.throw();
      }
      return;
    }

    // ===== 防守方：拉弓 =====
    const SL = CFG.SLINGSHOT;
    const dx = w.x - w.anchorX;
    const dy = w.y - w.anchorY;
    const pullDist = Math.hypot(dx, dy);

    if (pullDist < SL.MIN_PULL) {
      w.thrown = false;
      w.vx = 0; w.vy = 0; w.rotV = 0;
      w.anchorX = 0; w.anchorY = 0;
      return;
    }

    const inv  = 1 / pullDist;
    const dirX = -dx * inv;
    const dirY = -dy * inv;

    const t = DB.clamp(pullDist / SL.MAX_PULL, 0, 1);
    let speed = SL.MIN_LAUNCH + (SL.MAX_LAUNCH - SL.MIN_LAUNCH) * t;
    speed *= (1 + state.mods.launch);

    w.thrown = true;
    w.age = 0;
    w.vx = dirX * speed;
    w.vy = dirY * speed;
    w.rotV = (Math.random() > 0.5 ? 1 : -1) * (6 + t * 14);

    if (t > 0.15) {
      state.shake = Math.min(state.shake + 2 + t * 8, 22);
      DB.spawnParticles(w.x, w.y, Math.floor(4 + t * 14), '#8fd8ff', 200 + t * 300);
    }
    DB.sfx.throw();
    if (t >= SL.FULL_TENSION) {
      state.flash = Math.max(state.flash, 0.12);
      DB.spawnParticles(w.x, w.y, 18, '#ffffff', 420);
    }

    w.anchorX = 0;
    w.anchorY = 0;
  };

  /* ---------- 地震特效 ---------- */
  DB.triggerQuake = function (cx, cy, dmg) {
    state.shake = 35;
    state.hitstop = 0.08;
    state.flash = Math.max(state.flash, 0.3);
    DB.sfx.error();

    for (let i = DB.enemies.length - 1; i >= 0; i--) {
      const e = DB.enemies[i];
      e.hp -= dmg;
      e.flashT = 0.15;
      if (DB.floaters) DB.floaters.push({ text: `-${Math.round(dmg)}`, x: e.x, y: e.y - 30, vy: -50, life: 1, maxLife: 1, color: '#ffcc00' });
      if (e.hp <= 0) {
        const color = e.type === 'worm' ? '#5ee6a8' : '#ff7a9a';
        DB.spawnParticles(e.x, e.y, 24, color, 460);
        state.energy = Math.min(state.energyMax, state.energy + 8);
        if (DB.killEnemy) DB.killEnemy(i);
        else DB.enemies.splice(i, 1);
      }
    }

    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 600 + Math.random() * 400;
      DB.particles.push({
        x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0.6, maxLife: 0.6, size: 5 + Math.random() * 5,
        color: '#ffcc00', spin: 0, rot: a
      });
    }
  };

  /* ---------- 黑洞特效 ---------- */
  DB.triggerBlackhole = function (cx, cy, dmg) {
    state.shake = 20;
    DB.sfx.error();
    for (const e of DB.enemies) {
      const dx = cx - e.x, dy = cy - e.y;
      const d = Math.max(1, Math.hypot(dx, dy));  // [修复] 防止除零产生 NaN
      if (d < 250) {
        e.x += (dx / d) * 300 * (1 - d / 250);
        e.y += (dy / d) * 300 * (1 - d / 250);
        e.hp -= dmg * 1.5;
        e.flashT = 0.1;
      }
    }
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 200;
      DB.particles.push({
        x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist,
        vx: -Math.cos(a) * 400, vy: -Math.sin(a) * 400,
        life: 0.8, maxLife: 0.8, size: 6,
        color: '#c08bff', spin: 10, rot: a
      });
    }
  };

  /* ---------- 连锁闪电特效 ---------- */
  DB.triggerChain = function (cx, cy, baseDmg) {
    let lastX = cx, lastY = cy;
    let currentDmg = baseDmg;
    
    for (let chain = 0; chain < 4; chain++) {
      let nearest = null, minD = Infinity;
      for (const e of DB.enemies) {
        const d = Math.hypot(e.x - lastX, e.y - lastY);
        if (d < 300 && d < minD && e.hp > 0) {
          minD = d; nearest = e;
        }
      }
      if (!nearest) break;

      for (let i = 0; i < 10; i++) {
        const t = i / 10;
        DB.particles.push({
          x: lastX + (nearest.x - lastX) * t + (Math.random()-0.5)*30,
          y: lastY + (nearest.y - lastY) * t + (Math.random()-0.5)*30,
          vx: 0, vy: 0, life: 0.2, maxLife: 0.2, size: 4,
          color: '#5ae8ff', spin: 0, rot: 0
        });
      }

      nearest.hp -= currentDmg;
      nearest.flashT = 0.15;
      currentDmg *= 0.75;
      lastX = nearest.x; lastY = nearest.y;
    }
  };

  /* ---------- 物理更新 ---------- */
  DB.updateWeapons = function (dt) {
    const arr = DB.weapons;
    const SL  = CFG.SLINGSHOT;
    const lifetime = CFG.WEAPON_LIFETIME + (DB.upgrades ? DB.upgrades.duration * 2 : 0);

    for (let i = arr.length - 1; i >= 0; i--) {
      const w = arr[i];
      if (w.dead) continue;

      if (w.warning > 0) {
        w.warning -= dt;
        if (w.warning <= 0) {
          w.warning = 0;
          w.el = createWeaponEl(w);
          positionWeaponEl(w);
        }
        continue;
      }

      w.age += dt;
      
      if (w.safeTimer > 0) {
        w.safeTimer -= dt;
        if (w.el) {
          w.el.style.boxShadow = '0 0 15px #5ae8ff, 0 0 5px #5ae8ff inset';
          w.el.style.borderColor = '#5ae8ff';
        }
      } else if (w.el && !w.corrupted) {
        w.el.style.boxShadow = '';
        w.el.style.borderColor = '';
      }

      if (w.age > lifetime) {
        DB.spawnParticles(w.x, w.y, 8, '#6a7fa8', 140);
        DB.removeWeapon(w);
        continue;
      }

      if (w.hitCd > 0) w.hitCd -= dt;

      if (w.held) {
        const mouse = DB.mouse;
        
        if (state.mode === 'hacker') {
          const k = 1 - Math.exp(-30 * dt);
          w.x += (mouse.x - w.x) * k;
          w.y += (mouse.y - w.y) * k;
          w.rot += (0 - w.rot) * Math.min(1, 12 * dt);
          w.vx = 0; w.vy = 0;
        } else {
          let tx = mouse.x;
          let ty = mouse.y;
          const ddx = tx - w.anchorX;
          const ddy = ty - w.anchorY;
          const dd  = Math.hypot(ddx, ddy);
          if (dd > SL.MAX_PULL) {
            const k = SL.MAX_PULL / dd;
            tx = w.anchorX + ddx * k;
            ty = w.anchorY + ddy * k;
          }

          const k = 1 - Math.exp(-26 * dt);
          w.x += (tx - w.x) * k;
          w.y += (ty - w.y) * k;
          w.rot += (0 - w.rot) * Math.min(1, 12 * dt);
          w.vx = 0; w.vy = 0;

          const pull = Math.hypot(w.x - w.anchorX, w.y - w.anchorY);
          if (pull > SL.MAX_PULL * 0.7) {
            const jitter = (pull / SL.MAX_PULL) * 1.6;
            w.x += (Math.random() - 0.5) * jitter;
            w.y += (Math.random() - 0.5) * jitter;
          }
        }
      }
      else if (!w.thrown) {
        const p = DB.player;
        const dx = p.x - w.x;
        const dy = p.y - w.y;
        const d  = Math.hypot(dx, dy);
        if (d < 100 && d > 56) {
          const pull = (1 - d / 100) * 220 * dt;
          w.x += (dx / d) * pull;
          w.y += (dy / d) * pull;
        }
      }
      else {
        // ===== 飞行物理 =====
        if (w.homing) {
          let target = w.homingTarget;
          
          if (!target || target.hp <= 0 || (target !== DB.boss && DB.enemies.indexOf(target) === -1)) {
            let minDist = Infinity;
            for (const e of DB.enemies) {
              const d = Math.hypot(w.x - e.x, w.y - e.y);
              if (d < minDist) { minDist = d; target = e; }
            }
            if (!target && DB.boss && DB.boss.phase === 'normal') target = DB.boss;
            w.homingTarget = target;
          }

          if (target) {
            const dx = target.x - w.x, dy = target.y - w.y;
            const d = Math.hypot(dx, dy) || 1;
            const speed = 1500;
            const targetVx = (dx / d) * speed;
            const targetVy = (dy / d) * speed;
            w.vx += (targetVx - w.vx) * Math.min(1, 20 * dt);
            w.vy += (targetVy - w.vy) * Math.min(1, 20 * dt);
            w.rot = Math.atan2(w.vy, w.vx) + Math.PI / 4; 
          } else {
            w.homing = false;
          }
        } else {
          if (state.mode === 'hacker') {
            w.vy += CFG.GRAVITY * 0.1 * dt; 
            w.vx *= Math.exp(-0.2 * dt); 
          } else {
            w.vy += CFG.GRAVITY * dt;
            w.vx *= Math.exp(-CFG.AIR_DRAG * dt);
          }
        }

        w.x += w.vx * dt;
        w.y += w.vy * dt;
        if (!w.homing) w.rot += w.rotV * dt;

        // ===== 命中判定 =====
        if (state.mode === 'hacker' && w.thrown) {
          let hitSomething = false;
          const hitRadiusBonus = w.homing ? 30 : 15;

          for (let ei = DB.enemies.length - 1; ei >= 0; ei--) {
            const e = DB.enemies[ei];
            if (Math.hypot(w.x - e.x, w.y - e.y) < w.r + e.r + hitRadiusBonus) {
              DB.sfx.error();
              state.hitstop = Math.max(state.hitstop, 0.06);
              state.shake = Math.min(state.shake + 8, 25);
              DB.spawnParticles(e.x, e.y, 25, '#c08bff', 500);

              const finalDmg = DB.calcWeaponDamage(w.baseDamage * 4.0 * (1 + state.mods.damage), e.x, e.y);

              if (w.type === 'light_dart') {
                const dmg = finalDmg * 2.0;
                DB.damageEnemy(e, ei, dmg, false);
                if (e.hp > 0) e.vulnerable = 5.0;
                if (DB.floaters) DB.floaters.push({ text: `防御瓦解 -${Math.round(dmg)}`, x: e.x, y: e.y - 30, vy: -50, life: 1, maxLife: 1, color: '#ff7a9a' });
              } 
              else if (w.type === 'stun_chip') {
                DB.damageEnemy(e, ei, finalDmg, false);
                if (e.hp > 0) e.slowT = 5.0;
                if (DB.floaters) DB.floaters.push({ text: `系统卡顿 -${Math.round(finalDmg)}`, x: e.x, y: e.y - 30, vy: -50, life: 1, maxLife: 1, color: '#5ae8ff' });
              } 
              else if (w.type === 'fire_shield') {
                const dmg = finalDmg * 3 + (e.maxHp * 0.15);
                DB.damageEnemy(e, ei, dmg, false);
                if (DB.floaters) DB.floaters.push({ text: `文件加密 -${Math.round(dmg)}`, x: e.x, y: e.y - 30, vy: -50, life: 1, maxLife: 1, color: '#ffcc00' });
              } 
              else if (w.type === 'link') {
                DB.damageEnemy(e, ei, finalDmg, false);
                if (e.hp > 0) {
                  const pdx = DB.player.x - e.x, pdy = DB.player.y - e.y;
                  const pd = Math.hypot(pdx, pdy) || 1;
                  e.x += (pdx / pd) * 200; 
                  e.y += (pdy / pd) * 200;
                  e.vulnerable = 3.0;
                }
                if (DB.floaters) DB.floaters.push({ text: `强制牵引 -${Math.round(finalDmg)}`, x: e.x, y: e.y - 30, vy: -50, life: 1, maxLife: 1, color: '#c08bff' });
              } 
              else if (w.type === 'gravity') {
                const dmg = finalDmg * 4;
                DB.damageEnemy(e, ei, dmg, true); 
                state.energy = Math.min(state.energyMax, state.energy + 20);
                if (DB.floaters) DB.floaters.push({ text: `数据窃取 -${Math.round(dmg)}`, x: e.x, y: e.y - 30, vy: -50, life: 1, maxLife: 1, color: '#5ee6a8' });
              }
              // [修复] 补充黑洞/连锁闪电在黑客模式下的敌人命中处理
              else if (w.type === 'blackhole') {
                const dmg = finalDmg * 2.5;
                DB.damageEnemy(e, ei, dmg, false);
                if (DB.triggerBlackhole) DB.triggerBlackhole(e.x, e.y, finalDmg * 1.5);
                if (DB.floaters) DB.floaters.push({ text: `断网封锁 -${Math.round(dmg)}`, x: e.x, y: e.y - 30, vy: -50, life: 1, maxLife: 1, color: '#c08bff' });
              }
              else if (w.type === 'chain') {
                const dmg = finalDmg * 2.0;
                DB.damageEnemy(e, ei, dmg, false);
                if (DB.triggerChain) DB.triggerChain(e.x, e.y, finalDmg * 1.2);
                if (DB.floaters) DB.floaters.push({ text: `病毒传染 -${Math.round(dmg)}`, x: e.x, y: e.y - 30, vy: -50, life: 1, maxLife: 1, color: '#5ae8ff' });
              }

              DB.removeWeapon(w);
              hitSomething = true;
              break;
            }
          }

          if (hitSomething) continue;

          if (DB.boss && DB.boss.phase === 'normal') {
            const b = DB.boss;
            if (Math.hypot(w.x - b.x, w.y - b.y) < w.r + b.r + hitRadiusBonus) {
              const finalDmg = w.baseDamage * 4.0 * (1 + state.mods.damage);
              b.hp -= finalDmg;
              b.flashT = 0.15;
              state.hitstop = Math.max(state.hitstop, 0.08);
              state.shake = Math.min(state.shake + 8, 25);
              DB.spawnParticles(w.x, w.y, 20, '#ff5a7a', 500);
              DB.sfx.hit();
              
              if (DB.floaters) DB.floaters.push({ text: `-${Math.round(finalDmg)}`, x: b.x, y: b.y - b.r, vy: -50, life: 1, maxLife: 1, color: '#ffffff' });

              if (w.def.effect === 'earthquake' && DB.triggerQuake) {
                DB.triggerQuake(b.x, b.y, w.baseDamage * (1 + state.mods.damage));
              } else if (w.def.effect === 'blackhole' && DB.triggerBlackhole) {
                DB.triggerBlackhole(b.x, b.y, w.baseDamage * (1 + state.mods.damage));
              } else if (w.def.effect === 'chain' && DB.triggerChain) {
                DB.triggerChain(b.x, b.y, w.baseDamage * (1 + state.mods.damage));
              }
              
              DB.removeWeapon(w);
              
              if (b.hp <= 0) {
                b.hp = 0;
                b.phase = 'paralyzed';
                state.qte.active = true;
                state.qte.timer = b.isBig ? 9.0 : 7.0;
                state.qte.inputIndex = 0;
                const seqLen = b.isBig ? 8 : 6;
                let seq = "";
                for(let k=0; k<seqLen; k++) seq += Math.floor(Math.random() * 10);
                state.qte.sequence = seq;
                state.flash = 0.5;
                state.hitstop = 0.15;
              }
              continue;
            }
          }
        }

        // ===== 防守方命中与所有武器通用反弹物理 =====
        if (state.mode !== 'hacker') {
          // [修复] 补充 speed 声明，原代码此处直接使用 speed 导致 ReferenceError
          const speed = Math.hypot(w.vx, w.vy);
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
              } else if (w.def.effect === 'blackhole' && DB.triggerBlackhole) {
                 DB.triggerBlackhole(b.x, b.y, w.baseDamage * (1 + state.mods.damage));
              } else if (w.def.effect === 'chain' && DB.triggerChain) {
                 DB.triggerChain(b.x, b.y, w.baseDamage * (1 + state.mods.damage));
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
                   e.baseY = DB.clamp(e.baseY, 60, H - 100);   // [修复] H 现已定义
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
              } else if (w.def.effect === 'blackhole' && DB.triggerBlackhole) {
                DB.triggerBlackhole(e.x, e.y, finalDmg);
              } else if (w.def.effect === 'chain' && DB.triggerChain) {
                DB.triggerChain(e.x, e.y, finalDmg);
              }

              DB.removeWeapon(w);
              if (e.hp <= 0) DB.killEnemy(ei);
              break;
            }
          }
        }
        
        // 地面与墙壁碰撞反弹
        const floorY = CFG.GROUND_Y - w.def.h * 0.32;
        if (w.y > floorY) {
          w.y = floorY;
          if (Math.abs(w.vy) > 90) {
            w.vy *= -CFG.BOUNCE;
            w.vx *= 0.82;
            w.rotV *= 0.7;
            DB.spawnParticles(w.x, CFG.GROUND_Y, 5, '#7aa8e8', 130);
            state.shake = Math.min(state.shake + 1.6, 10);
          } else {
            w.vy = 0;
          }
          w.vx *= Math.exp(-CFG.GROUND_FRICTION * dt);
          w.rotV *= Math.exp(-5 * dt);
          if (Math.abs(w.vx) < 9) w.vx = 0;
          if (Math.abs(w.rotV) < 0.6) w.rotV = 0;
        }

        if (w.x < w.r)          { w.x = w.r;          w.vx =  Math.abs(w.vx) * CFG.WALL_BOUNCE; }
        if (w.x > W - w.r)      { w.x = W - w.r;      w.vx = -Math.abs(w.vx) * CFG.WALL_BOUNCE; }
        if (w.y < CFG.PLAY_TOP) { w.y = CFG.PLAY_TOP; w.vy =  Math.abs(w.vy) * CFG.WALL_BOUNCE; }
      }

      if (w.corrupted && w.el) {
        w.el.style.borderColor = '#ff5a7a';
        w.el.style.color = '#ff5a7a';
        w.el.style.background = 'linear-gradient(135deg, rgba(100, 20, 30, 0.95), rgba(40, 10, 10, 0.98))';
        w.el.style.textShadow = '0 0 8px rgba(255, 90, 122, 0.8)';
        w.el.style.opacity = (Math.sin(state.t * 30) > 0) ? 1 : 0.5;
        if (w.el.textContent !== '⚠ ERROR') w.el.textContent = '⚠ ERROR';
      } else if (w.el && !w.corrupted) {
        w.el.style.opacity = 1; 
      }

      if (w.el && !w.corrupted) {
        if (w.age > lifetime - 2) {
          w.el.style.opacity = (Math.sin(state.t * 26) > 0) ? 1 : 0.25;
        } else {
          w.el.style.opacity = 1;
        }
      }

      positionWeaponEl(w);
    }
  };

  /* ---------- 预警光柱绘制 ---------- */
  DB.drawSpawnWarnings = function (ctx) {
    for (const w of DB.weapons) {
      if (w.dead || w.warning <= 0) continue;

      const k = 1 - w.warning / CFG.SPAWN_WARN;
      let alpha = 0.4 + k * 0.6;
      if (w.warning < 0.1) {
        alpha = (Math.sin(state.t * 50) > 0) ? 1 : 0.3;
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      const grad = ctx.createLinearGradient(0, w.y - 200, 0, w.y + 20);
      grad.addColorStop(0, 'rgba(90, 240, 255, 0)');
      grad.addColorStop(0.8, 'rgba(90, 240, 255, 0.4)');
      grad.addColorStop(1, 'rgba(140, 250, 255, 1.0)');
      ctx.fillStyle = grad;
      ctx.fillRect(w.x - 6, w.y - 200, 12, 220);

      ctx.strokeStyle = 'rgba(140, 250, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w.x, w.y, 40, 0, Math.PI * 2); ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(w.x, w.y, 40 - k * 30, 0, Math.PI * 2); ctx.stroke();

      ctx.strokeStyle = 'rgba(140, 250, 255, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w.x - 10, w.y); ctx.lineTo(w.x + 10, w.y);
      ctx.moveTo(w.x, w.y - 10); ctx.lineTo(w.x, w.y + 10);
      ctx.stroke();

      ctx.restore();
    }
  };

  /* ---------- 瞄准线与皮筋绘制 ---------- */
  DB.drawGrabBeam = function (ctx) {
    const w = DB.heldWeapon;
    if (!w) return;

    const SL = CFG.SLINGSHOT;
    const ax = w.anchorX;
    const ay = w.anchorY;
    const bx = w.x;
    const by = w.y;

    if (state.mode === 'hacker') {
      const p = DB.player;
      const mouse = DB.mouse;
      const dx = mouse.x - p.x;
      const dy = mouse.y - p.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist > 30) {
        const dirX = dx / dist;
        const dirY = dy / dist;
        const len = 2000;

        ctx.save();
        ctx.strokeStyle = 'rgba(255, 204, 0, 0.6)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 8]);
        ctx.lineDashOffset = -state.t * 60;
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        ctx.moveTo(p.x + dirX * 40, p.y + dirY * 40);
        ctx.lineTo(p.x + dirX * len, p.y + dirY * len);
        ctx.stroke();
        ctx.restore();
      }
      return;
    }

    const dx = bx - ax, dy = by - ay;
    const pullDist = Math.hypot(dx, dy);
    if (pullDist < 4) return;

    const t = DB.clamp(pullDist / SL.MAX_PULL, 0, 1);

    let r, g, b;
    if (t < 0.5) {
      const k = t / 0.5;
      r = 90 + (255 - 90) * k; g = 240 + (255 - 240) * k; b = 255;
    } else {
      const k = (t - 0.5) / 0.5;
      r = 255; g = 255 + (120 - 255) * k; b = 255 + (60 - 255) * k;
    }

    const color = `rgb(${r|0}, ${g|0}, ${b|0})`;
    const glow  = `rgba(${r|0}, ${g|0}, ${b|0}, 0.7)`;
    const nx = -dy / pullDist, ny = dx / pullDist;
    const sag = Math.min(26, pullDist * 0.18) * (0.6 + Math.sin(state.t * 18) * 0.4);

    for (let side = -1; side <= 1; side += 2) {
      const midX = (ax + bx) / 2 + nx * sag * side;
      const midY = (ay + by) / 2 + ny * sag * side;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.shadowColor = glow;
      ctx.shadowBlur  = 10 + t * 18;
      ctx.lineWidth   = 2.2 + (1 - t) * 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(midX, midY, bx, by); ctx.stroke();
      ctx.restore();
    }

    if (t > 0.7) {
      const sparks = Math.floor((t - 0.7) / 0.3 * 6);
      for (let i = 0; i < sparks; i++) {
        const p  = Math.random();
        const sx = ax + dx * p + nx * (Math.random() - 0.5) * 18;
        const sy = ay + dy * p + ny * (Math.random() - 0.5) * 18;
        ctx.save(); ctx.globalAlpha = 0.8; ctx.fillStyle = '#ffffff'; ctx.fillRect(sx - 1, sy - 1, 2, 2); ctx.restore();
      }
    }

    if (pullDist > SL.MIN_PULL * 0.6) {
      const dirX = -dx / pullDist, dirY = -dy / pullDist;
      const len  = 60 + t * 120;
      const ex = bx + dirX * len, ey = by + dirY * len;

      ctx.save();
      ctx.strokeStyle = `rgba(${r|0}, ${g|0}, ${b|0}, ${0.35 + t * 0.5})`;
      ctx.lineWidth = 1.5; ctx.setLineDash([6, 6]); ctx.lineDashOffset = -state.t * 40;
      ctx.beginPath(); ctx.moveTo(bx + dirX * 22, by + dirY * 22); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.restore();
    }
  };

})(window.DB);