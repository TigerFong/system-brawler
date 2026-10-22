(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const layer = DB.dom.weaponLayer;
  const W     = CFG.W;
  const H     = CFG.H;

  function countActiveWeapons() {
    let n = 0;
    for (const w of DB.weapons) if (!w.dead) n++;
    return n;
  }

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

  DB.spawnWeapon = function (type, customText, customDmg) {
    const isCode = type === 'code_slash';
    if (isCode) {
      const exists = DB.weapons.some(w => w.type === 'code_slash' && !w.dead);
      if (exists) {
        if (DB.floaters) DB.floaters.push({ text: '❌ 代码武器已占用', x: DB.player.x, y: DB.player.y - 40, vy: -50, life: 1, color: '#ff5a7a' });
        DB.sfx.error();
        return null;
      }
    }

    const maxWeapons = CFG.MAX_WEAPONS + (DB.upgrades ? DB.upgrades.weapon : 0);
    if (!isCode && countActiveWeapons() >= maxWeapons) return null;

    const isHacker = state.mode === 'hacker';
    const table = isHacker ? DB.HACKER_WEAPON_TYPES : DB.WEAPON_TYPES;
    const def = table[type];
    if (!def) return null;

    const p = pickSpawnPoint();

    const w = {
      id: DB.nextUid(),
      type, def,
      baseDamage: customDmg || (def.damage * (1 + (DB.upgrades && DB.upgrades.damage ? DB.upgrades.damage : 0) * 0.1)),
      displayText: customText || null,
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
      anchorY: 0,
      deployed: false,
      deployT: 0,
      deployMaxT: 1,
      tickCd: 0,
      lastTensionTier: 0,
      homing: false,
      homingTarget: null
    };

    DB.weapons.push(w);
    return w;
  };

  DB.createWeaponEl = function(w) {
    const el = document.createElement('div');
    el.className = 'weapon';

    if (state.mode === 'hacker') {
      el.classList.add('hacker-weapon');
    }

    if (w.type === 'code_slash') {
      el.style.width = w.def.w + 'px';
      el.style.height = w.def.h + 'px';
      el.style.padding = '0 10px';
      el.style.color = '#00ffcc';
      el.style.borderColor = 'rgba(0, 255, 204, 0.8)';
      el.style.background = 'rgba(0, 255, 204, 0.15)';
      el.style.boxShadow = '0 0 15px rgba(0, 255, 204, 0.5)';
      el.style.borderRadius = '4px';
      el.style.fontSize = '12px';
      el.style.letterSpacing = '0px';
      el.style.whiteSpace = 'nowrap';
      el.style.overflow = 'hidden';
      el.style.textOverflow = 'ellipsis';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.textContent = w.displayText;
    } else {
      el.style.width  = w.def.w + 'px';
      el.style.height = w.def.h + 'px';
      el.textContent = w.def.label;
    }
    layer.appendChild(el);
    return el;
  }

  function positionWeaponEl(w) {
    if (!w.el || w.deployed) return;
    const bob = w.thrown ? 0 : Math.sin(state.t * 2.6 + w.seed) * 4;
    const tx = w.x - w.def.w / 2;
    const ty = w.y - w.def.h / 2 + bob;
    w.el.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) rotate(${w.rot.toFixed(4)}rad)`;
  }

  DB.removeWeapon = function (w) {
    if (w.dead) return;
    w.dead = true;
    if (w.el && w.el.parentNode) w.el.remove();

    const i = DB.weapons.indexOf(w);
    if (i >= 0) DB.weapons.splice(i, 1);
    if (DB.heldWeapon === w) DB.heldWeapon = null;
  };

  DB.tryGrab = function (mx, my) {
    let best = null;
    let bestD = Infinity;
    for (const w of DB.weapons) {
      if (w.dead || w.warning > 0 || w.held || w.deployed) continue;
      const d = Math.hypot(w.x - mx, w.y - my);
      const pickR = state.mode === 'hacker' ? CFG.GRAB_PICK_R + 20 : CFG.GRAB_PICK_R;
      if (d < w.r + pickR && d < bestD) { bestD = d; best = w; }
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
      state.hp = Math.max(0, state.hp - 15);
      state.damageFlash = Math.max(state.damageFlash, 0.6);
      state.shake = 26; state.hitstop = 0.08;
      DB.sfx.hurt(); DB.removeWeapon(best);
      return;
    }

    best.held = true;
    best.thrown = false;
    best.homing = false;
    best.homingTarget = null;
    best.vx = 0; best.vy = 0; best.rotV = 0;
    best.lastTensionTier = 0;
    if (state.mode !== 'hacker') {
      best.anchorX = best.x;
      best.anchorY = best.y;
    }
    if (best.el) best.el.classList.add('held');
    DB.sfx.grab();
    DB.heldWeapon = best;
  };

  DB.releaseThrow = function () {
    const w = DB.heldWeapon;
    if (!w) return;

    w.held = false;
    if (w.el) w.el.classList.remove('held');
    DB.heldWeapon = null;

    // ===== 黑客方：远程投送部署武器 =====
    if (state.mode === 'hacker') {
      const p = DB.player;
      const mouse = DB.mouse;
      const dx = mouse.x - p.x; const dy = mouse.y - p.y;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      const range = CFG.VIEW_W * 2;

      if (dist < 30) return;

      switch (w.type) {
        case 'light_dart': {
          DB.hitscanShot(p.x, p.y, angle - 0.05, range, w);
          DB.hitscanShot(p.x, p.y, angle, range, w);
          DB.hitscanShot(p.x, p.y, angle + 0.05, range, w);
          DB.removeWeapon(w);
          break;
        }
        case 'stun_chip': {
          DB.hitscanBounce(p.x, p.y, angle, range, w, 3);
          DB.removeWeapon(w);
          break;
        }
        case 'fire_shield': {
          const tx = DB.clamp(mouse.x, 40, W - 40);
          const ty = DB.clamp(mouse.y, CFG.PLAY_TOP + 20, CFG.GROUND_Y - 10);
          DB.spawnZone({ kind: 'firewall', x: tx, y: ty, w: 180, h: 180, life: 0.35, dmg: w.baseDamage * 3, tickInterval: 0.1, color: '#ff7a3a' });
          DB.spawnParticles(tx, ty, 24, '#ff7a3a', 400);
          DB.removeWeapon(w);
          break;
        }
        case 'link': {
          DB.spawnBeam(p.x, p.y, angle, range, w, 1.2);
          DB.removeWeapon(w);
          break;
        }
        case 'gravity': {
          const hit = DB.hitscanShot(p.x, p.y, angle, range, w);
          // 命中点或鼠标位置
          const tx = hit ? hit.x : DB.clamp(mouse.x, 40, W - 40);
          const ty = hit ? hit.y : DB.clamp(mouse.y, CFG.PLAY_TOP + 20, CFG.GROUND_Y - 10);
          
          const blastDmg = w.baseDamage * 4; // 巨额伤害
          const blastR = 300; // 大范围 AOE

          // 范围判定
          for (const e of DB.enemies) {
            if (Math.hypot(e.x - tx, e.y - ty) < blastR) {
              e.hp -= DB.applyVulnerable(e, blastDmg);
              e.flashT = 0.25;
              e.vulnerable = Math.max(e.vulnerable || 0, 3); // 附加易伤
            }
          }
          if (DB.boss && DB.boss.phase === 'normal') {
            if (Math.hypot(DB.boss.x - tx, DB.boss.y - ty) < blastR) {
              DB.boss.hp -= DB.applyVulnerable(DB.boss, blastDmg);
              DB.boss.flashT = 0.25;
            }
          }
          
          // 视觉爆发
          DB.spawnParticles(tx, ty, 50, '#ffaa00', 800);
          DB.spawnParticles(tx, ty, 30, '#ffffff', 1000);
          if (DB.floaters) DB.floaters.push({ text: '☠️ 漏洞引爆!', x: tx, y: ty - 30, vy: -60, life: 1, maxLife: 1, color: '#ffaa00', isCrit: true });
          
          state.shake = Math.max(state.shake, 25);
          DB.sfx.error();
          DB.removeWeapon(w);
          break;
        }
        case 'blackhole': {
          for (let i = -2; i <= 2; i++) {
            DB.hitscanShot(p.x, p.y, angle + i * 0.15, range, w);
          }
          DB.removeWeapon(w);
          break;
        }
        case 'chain': {
          DB.hitscanChain(p.x, p.y, angle, range, w, 5);
          DB.removeWeapon(w);
          break;
        }
        case 'code_slash': {
          const fragW = Object.assign({}, w); // 克隆一份临时武器数据
          fragW.baseDamage = w.baseDamage * 0.4; // 每道碎片伤害降至 40%
          for (let i = 0; i < 8; i++) {
            DB.hitscanShot(p.x, p.y, (i / 8) * Math.PI * 2, 400, fragW);
          }
          DB.removeWeapon(w);
          break;
        }
        default: {
          DB.hitscanShot(p.x, p.y, angle, range, w);
          DB.removeWeapon(w);
        }
      }
      return;
    }

    // ===== 防守方的部署分支：生成对应场地 zone =====
    if (w.type === 'gravity') {
      DB.spawnZone({ kind: 'gravity', x: w.x, y: w.y, r: 280, life: 4, dmg: 8, tickInterval: 0.6, pushDown: 500, color: '#ffcc00' });
      DB.spawnParticles(w.x, w.y, 24, '#ffcc00', 320);
      DB.sfx.chip();
      DB.removeWeapon(w);
      return;
    }
    if (w.type === 'blackhole') {
      DB.spawnZone({ kind: 'hackhole', x: w.x, y: w.y, r: 260, life: 3, dmg: 6, tickInterval: 0.5, pull: 300, color: '#c08bff' });
      DB.spawnParticles(w.x, w.y, 24, '#c08bff', 320);
      DB.sfx.chip();
      DB.removeWeapon(w);
      return;
    }
    if (w.type === 'chain') {
      // 电塔：每 0.5s 触发一次 5 跳闪电
      DB.spawnZone({ kind: 'chain_tower', x: w.x, y: w.y, r: 0, life: 4, dmg: 0, tickInterval: 0.5, color: '#5ae8ff' });
      // 用 zoneTick 单独处理 chain_tower（见下）
      w.deployed = true;
      w.thrown = false;
      w.vx = 0; w.vy = 0; w.rotV = 0;
      w.deployT = 4.0;
      w.deployMaxT = 4.0;
      w.tickCd = 0.5;
      if (w.el) w.el.style.display = 'none';
      DB.spawnParticles(w.x, w.y, 24, '#5ae8ff', 320);
      DB.sfx.chip();
      return;
    }

    // ===== 防守方的拉弓分支 =====
    const SL = CFG.SLINGSHOT;
    const dx = w.x - w.anchorX; const dy = w.y - w.anchorY;
    const pullDist = Math.hypot(dx, dy);

    if (pullDist < SL.MIN_PULL) return;

    const t = DB.clamp(pullDist / SL.MAX_PULL, 0, 1);
    const speed = (SL.MIN_LAUNCH + (SL.MAX_LAUNCH - SL.MIN_LAUNCH) * t) * (1 + state.mods.launch);
    const dirX = -dx / pullDist; const dirY = -dy / pullDist;

    w.thrown = true; w.age = 0;
    w.vx = dirX * speed; w.vy = dirY * speed;
    if (w.type === 'code_slash') {
      w.boomerang = true;
      w.rotV = 0; w.rot = 0;
    } else {
      w.rotV = (Math.random() > 0.5 ? 1 : -1) * (6 + t * 14);
    }

    DB.sfx.throw();
  };

  DB.triggerQuake = function (cx, cy, dmg) {
    state.shake = Math.max(state.shake, 22);
    state.hitstop = Math.max(state.hitstop, 0.04);
    DB.sfx.error();
    for (const e of DB.enemies) {
      if (Math.hypot(e.x - cx, e.y - cy) < 300) {
        e.hp -= DB.applyVulnerable(e, dmg * 2);
        e.flashT = 0.15;
      }
    }
    if (DB.boss && DB.boss.phase === 'normal') {
      if (Math.hypot(DB.boss.x - cx, DB.boss.y - cy) < 300) DB.boss.hp -= DB.applyVulnerable(DB.boss, dmg * 2);
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      DB.particles.push({ x: cx, y: cy, vx: Math.cos(a) * 800, vy: Math.sin(a) * 800, life: 0.6, maxLife: 0.6, size: 6, color: '#ffcc00', spin: 0, rot: a });
    }
  };

  DB.triggerBlackhole = function (cx, cy, dmg) {
    state.shake = Math.max(state.shake, 10);
    for (const e of DB.enemies) {
      const dx = cx - e.x, dy = cy - e.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      if (d < 300) {
        e.x += (dx / d) * 400 * (1 - d / 300);
        e.y += (dy / d) * 400 * (1 - d / 300);
        e.hp -= DB.applyVulnerable(e, dmg * 0.5);
        e.flashT = 0.1;
      }
    }
    for (let i = 0; i < 15; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 50 + Math.random() * 250;
      DB.particles.push({ x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist, vx: -Math.cos(a) * 600, vy: -Math.sin(a) * 600, life: 0.8, maxLife: 0.8, size: 6, color: '#c08bff', spin: 0, rot: a });
    }
  };

  DB.triggerBlackholeBurst = function (cx, cy, dmg) {
    state.shake = Math.max(state.shake, 8);
    for (const e of DB.enemies) {
      const dx = cx - e.x, dy = cy - e.y;
      if (Math.hypot(dx, dy) < 300) {
        e.hp -= DB.applyVulnerable(e, dmg * 0.6);
        e.flashT = 0.1;
      }
    }
    if (DB.boss && DB.boss.phase === 'normal') {
      if (Math.hypot(DB.boss.x - cx, DB.boss.y - cy) < 300) {
        DB.boss.hp -= DB.applyVulnerable(DB.boss, dmg * 0.6);
        DB.boss.flashT = 0.1;
      }
    }
    for (let i = 0; i < 8; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = 30 + Math.random() * 200;
      DB.particles.push({
        x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist,
        vx: -Math.cos(a) * 500, vy: -Math.sin(a) * 500,
        life: 0.5, maxLife: 0.5, size: 5, color: '#c08bff', spin: 0, rot: a
      });
    }
  };

  DB.triggerChain = function (cx, cy, baseDmg) {
    let lastX = cx, lastY = cy;
    let currentDmg = baseDmg;
    const hitSet = new Set();
    for (let chain = 0; chain < 5; chain++) {
      let nearest = null, minD = 250;
      for (const e of DB.enemies) {
        if (hitSet.has(e)) continue;
        const d = Math.hypot(e.x - lastX, e.y - lastY);
        if (d < minD && e.hp > 0) { minD = d; nearest = e; }
      }
      if (!nearest) break;
      hitSet.add(nearest);

      for (let i = 0; i < 10; i++) {
        const t = i / 10;
        DB.particles.push({ x: lastX + (nearest.x - lastX) * t + (Math.random()-0.5)*20, y: lastY + (nearest.y - lastY) * t + (Math.random()-0.5)*20, vx: 0, vy: 0, life: 0.15, maxLife: 0.15, size: 4, color: '#5ae8ff', spin: 0, rot: 0 });
      }
      nearest.hp -= DB.applyVulnerable(nearest, currentDmg);
      nearest.flashT = 0.15;
      currentDmg *= 0.85;
      lastX = nearest.x; lastY = nearest.y;
    }
  };

  DB.updateWeapons = function (dt) {
    const arr = DB.weapons;
    const SL  = CFG.SLINGSHOT;
    const lifetime = CFG.WEAPON_LIFETIME + (DB.upgrades ? DB.upgrades.duration * 2 : 0);

    for (let i = arr.length - 1; i >= 0; i--) {
      const w = arr[i];
      if (w.dead) continue;

      if (w.deployed) {
        w.deployT -= dt;
        if (w.deployT <= 0) {
          DB.spawnParticles(w.x, w.y, 20, '#ffffff', 300);
          DB.removeWeapon(w);
          continue;
        }

        if (w.type === 'blackhole') {
          for (const e of DB.enemies) {
            const dx = w.x - e.x, dy = w.y - e.y;
            const d = Math.max(1, Math.hypot(dx, dy));
            if (d < 300 && d > 8) {
              const pullStr = 260 * (1 - d / 300);
              e.x += (dx / d) * pullStr * dt;
              e.y += (dy / d) * pullStr * dt;
              if (e.type === 'drone') {
                e.baseX += (dx / d) * pullStr * dt;
                e.baseY += (dy / d) * pullStr * dt;
              }
            }
          }
        }

        w.tickCd = (w.tickCd || 0) - dt;
        if (w.tickCd <= 0) {
          const tickIntervals = { gravity: 0.8, blackhole: 0.4, chain: 0.5 };
          w.tickCd = tickIntervals[w.type] || 0.5;
          const dmg = w.baseDamage * (1 + state.mods.damage);
          if (w.type === 'gravity')   DB.triggerQuake(w.x, w.y, dmg);
          else if (w.type === 'blackhole') DB.triggerBlackholeBurst(w.x, w.y, dmg);
          else if (w.type === 'chain')     DB.triggerChain(w.x, w.y, dmg);
        }
        continue;
      }

      if (w.warning > 0) {
        w.warning -= dt;
        if (w.warning <= 0) { w.warning = 0; w.el = DB.createWeaponEl(w); positionWeaponEl(w); }
        continue;
      }

      w.age += dt;
      if (w.age > lifetime && !w.held) {
        DB.removeWeapon(w);
        continue;
      }

      if (w.held) {
        const mouse = DB.mouse;
        if (state.mode === 'hacker') {
          const k = 1 - Math.exp(-30 * dt);
          w.x += (mouse.x - w.x) * k; w.y += (mouse.y - w.y) * k;
          w.rot += (0 - w.rot) * Math.min(1, 12 * dt);
        } else {
          let tx = mouse.x, ty = mouse.y;
          const ddx = tx - w.anchorX, ddy = ty - w.anchorY;
          const dd = Math.hypot(ddx, ddy);
          if (dd > SL.MAX_PULL) { tx = w.anchorX + (ddx/dd)*SL.MAX_PULL; ty = w.anchorY + (ddy/dd)*SL.MAX_PULL; }
          const k = 1 - Math.exp(-26 * dt);
          w.x += (tx - w.x) * k; w.y += (ty - w.y) * k;

          const ratio = dd / SL.MAX_PULL;
          const prevTier = w.lastTensionTier || 0;
          let curTier = 0;
          if (ratio >= SL.FULL_TENSION) curTier = 2;
          else if (ratio >= 0.60)      curTier = 1;
          if (curTier > prevTier) {
            if (curTier === 2) DB.sfx.fullTension();
            else               DB.sfx.tension();
          }
          w.lastTensionTier = curTier;
        }
      }
      else if (!w.thrown) {
        const p = DB.player; const dx = p.x - w.x; const dy = p.y - w.y; const d = Math.hypot(dx, dy);
        if (d < 100 && d > 56) {
          w.x += (dx / d) * 220 * dt; w.y += (dy / d) * 220 * dt;
        }
      }
      else {
        if (w.homing && w.homingTarget) {
          const t = w.homingTarget;
          const targetValid = !t.dead
            && (t.hp === undefined || t.hp > 0)
            && (t.phase === undefined || t.phase === 'normal');

          if (targetValid) {
            const dx = t.x - w.x, dy = t.y - w.y;
            const d = Math.hypot(dx, dy) || 1;
            const homingSpeed = 1400;
            const curSpeed = Math.hypot(w.vx, w.vy);

            if (curSpeed < 200) {
              w.vx = (dx / d) * homingSpeed;
              w.vy = (dy / d) * homingSpeed;
            } else {
              const tx = (dx / d) * homingSpeed;
              const ty = (dy / d) * homingSpeed;
              const lerp = Math.min(1, 14 * dt);
              w.vx += (tx - w.vx) * lerp;
              w.vy += (ty - w.vy) * lerp;
            }

            if (Math.random() < 0.6) {
              DB.particles.push({
                x: w.x + (Math.random() - 0.5) * 12,
                y: w.y + (Math.random() - 0.5) * 12,
                vx: (Math.random() - 0.5) * 80,
                vy: (Math.random() - 0.5) * 80,
                life: 0.3, maxLife: 0.3, size: 5,
                color: '#ffcc00', spin: 0, rot: 0
              });
            }
          } else {
            w.homing = false;
            w.homingTarget = null;
          }
        }

        if (!w.homing) {
          if (state.mode === 'hacker') {
            w.vy += CFG.GRAVITY * 0.1 * dt;
            w.vx *= Math.exp(-0.2 * dt);
          } else {
            w.vy += CFG.GRAVITY * dt;
            w.vx *= Math.exp(-CFG.AIR_DRAG * dt);
          }
        }

        // 回旋镖：飞出 1.2s 后飞回玩家
        if (w.boomerang) {
          if (w.age > 1.2) {
            const p = DB.player;
            const dx = p.x - w.x, dy = p.y - w.y;
            const d = Math.hypot(dx, dy) || 1;
            const retSpeed = 1000;
            w.vx += (dx / d) * retSpeed * 3 * dt;
            w.vy += (dy / d) * retSpeed * 3 * dt;
            // 限速
            const sp = Math.hypot(w.vx, w.vy);
            if (sp > 1400) { w.vx = w.vx / sp * 1400; w.vy = w.vy / sp * 1400; }
            if (d < 50) { DB.removeWeapon(w); continue; }
          }
        }

        w.x += w.vx * dt; w.y += w.vy * dt;
        w.rot += w.rotV * dt;

        if (w.x < w.r) { w.x = w.r; w.vx = Math.abs(w.vx) * CFG.WALL_BOUNCE; }
        if (w.x > W - w.r) { w.x = W - w.r; w.vx = -Math.abs(w.vx) * CFG.WALL_BOUNCE; }
        if (w.y < CFG.PLAY_TOP) { w.y = CFG.PLAY_TOP; w.vy = Math.abs(w.vy) * CFG.WALL_BOUNCE; }
      }

      positionWeaponEl(w);
    }
  };

  DB.drawSpawnWarnings = function (ctx) {
    for (const w of DB.weapons) {
      if (w.dead || w.warning <= 0) continue;
      const k = 1 - w.warning / CFG.SPAWN_WARN;
      let alpha = 0.4 + k * 0.6;
      if (w.warning < 0.1) alpha = (Math.sin(state.t * 50) > 0) ? 1 : 0.3;
      ctx.save(); ctx.globalAlpha = alpha;
      const grad = ctx.createLinearGradient(0, w.y - 200, 0, w.y + 20);
      grad.addColorStop(0, 'rgba(90, 240, 255, 0)'); grad.addColorStop(0.8, 'rgba(90, 240, 255, 0.4)'); grad.addColorStop(1, 'rgba(140, 250, 255, 1.0)');
      ctx.fillStyle = grad; ctx.fillRect(w.x - 6, w.y - 200, 12, 220);
      ctx.strokeStyle = 'rgba(140, 250, 255, 0.8)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(w.x, w.y, 40, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  };

  DB.drawDeployedWeapons = function (ctx) {
    for (const w of DB.weapons) {
      if (w.dead || !w.deployed) continue;
      
      const lifeRatio = w.deployT / w.deployMaxT;
      const fadeOut = Math.min(1, lifeRatio * 3);
      const fadeIn = Math.min(1, (1 - lifeRatio) * 10);
      const alpha = fadeOut * fadeIn;
      
      ctx.save();
      ctx.translate(w.x, w.y);
      ctx.globalAlpha = alpha;

      if (w.type === 'gravity') {
        const pulse = 0.5 + 0.5 * Math.sin(state.t * 15 + w.seed);
        ctx.shadowColor = '#ffcc00';
        ctx.shadowBlur = 20;
        
        ctx.strokeStyle = `rgba(255, 204, 0, ${0.4 + pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 300, 0, Math.PI * 2);
        ctx.stroke();

        for (let i = 0; i < 3; i++) {
          const ringT = (state.t * 1.5 + i / 3) % 1;
          const r = 300 * (1 - ringT);
          ctx.strokeStyle = `rgba(255, 204, 0, ${0.6 * ringT})`;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.arc(0, 0, r, 0, Math.PI * 2);
          ctx.stroke();
        }

        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 40);
        g.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
        g.addColorStop(0.5, 'rgba(255, 204, 0, 0.4)');
        g.addColorStop(1, 'rgba(255, 204, 0, 0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(0, 0, 40, 0, Math.PI * 2);
        ctx.fill();

      } else if (w.type === 'blackhole') {
        const pulse = 0.5 + 0.5 * Math.sin(state.t * 8 + w.seed);
        ctx.shadowColor = '#c08bff';
        ctx.shadowBlur = 30;

        ctx.strokeStyle = `rgba(192, 139, 255, ${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(0, 0, 60 + pulse * 10, 20 + pulse * 5, state.t * 2, 0, Math.PI * 2);
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#000000';
        ctx.beginPath();
        ctx.arc(0, 0, 25, 0, Math.PI * 2);
        ctx.fill();
        
        for (let i = 0; i < 6; i++) {
          const angle = state.t * 3 + i * (Math.PI * 2 / 6);
          const dist = 100 + Math.sin(state.t * 5 + i) * 20;
          const px = Math.cos(angle) * dist;
          const py = Math.sin(angle) * dist;
          
          ctx.strokeStyle = `rgba(192, 139, 255, ${0.3 + pulse * 0.3})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.quadraticCurveTo(px * 0.5, py * 0.5, Math.cos(angle + 0.5) * 15, Math.sin(angle + 0.5) * 15);
          ctx.stroke();
        }

      } else if (w.type === 'chain') {
        const pulse = 0.5 + 0.5 * Math.sin(state.t * 20 + w.seed);
        ctx.shadowColor = '#5ae8ff';
        ctx.shadowBlur = 20;

        ctx.strokeStyle = `rgba(90, 232, 255, ${0.6 + pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + state.t;
          const px = Math.cos(a) * 30;
          const py = Math.sin(a) * 30;
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 6, 0, Math.PI * 2);
        ctx.fill();

        if (Math.random() < 0.4) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 1.5;
          const numArcs = 2 + Math.floor(Math.random() * 2);
          for (let k = 0; k < numArcs; k++) {
            const angle = Math.random() * Math.PI * 2;
            const len = 40 + Math.random() * 60;
            ctx.beginPath();
            ctx.moveTo(0, 0);
            let cx = 0, cy = 0;
            const steps = 4;
            for (let s = 1; s <= steps; s++) {
              const t = s / steps;
              const targetX = Math.cos(angle) * len * t;
              const targetY = Math.sin(angle) * len * t;
              cx = targetX + (Math.random() - 0.5) * 20;
              cy = targetY + (Math.random() - 0.5) * 20;
              ctx.lineTo(cx, cy);
            }
            ctx.stroke();
          }
        }
      }

      ctx.restore();
    }
  };

  DB.drawGrabBeam = function (ctx) {
    const w = DB.heldWeapon;
    if (!w) return;
    const SL = CFG.SLINGSHOT;

    if (state.mode === 'hacker') {
      const p = DB.player, mouse = DB.mouse;
      const dx = mouse.x - p.x, dy = mouse.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= 30) return;

      const dirX = dx / dist, dirY = dy / dist;

      ctx.save();
      ctx.strokeStyle = 'rgba(0, 255, 204, 0.85)';
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 18;
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(mouse.x, mouse.y);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = 'rgba(0, 255, 204, 0.35)';
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -state.t * 80;
      const extLen = 2400;
      ctx.beginPath();
      ctx.moveTo(mouse.x, mouse.y);
      ctx.lineTo(mouse.x + dirX * extLen, mouse.y + dirY * extLen);
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 15;
      for (let i = 0; i < 3; i++) {
        const t = ((state.t * 1.5 + i / 3) % 1);
        const px = p.x + (mouse.x - p.x) * t;
        const py = p.y + (mouse.y - p.y) * t;
        ctx.beginPath();
        ctx.arc(px, py, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = '#00ffcc';
      ctx.shadowColor = '#00ffcc';
      ctx.shadowBlur = 15;
      ctx.lineWidth = 2;
      const cx = mouse.x, cy = mouse.y;
      const arm = 14;
      ctx.beginPath();
      ctx.moveTo(cx - arm, cy); ctx.lineTo(cx - 4, cy);
      ctx.moveTo(cx + 4, cy);   ctx.lineTo(cx + arm, cy);
      ctx.moveTo(cx, cy - arm); ctx.lineTo(cx, cy - 4);
      ctx.moveTo(cx, cy + 4);   ctx.lineTo(cx, cy + arm);
      ctx.stroke();

      const pulse = 0.5 + 0.5 * Math.sin(state.t * 10);
      ctx.strokeStyle = `rgba(0, 255, 204, ${0.5 + pulse * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 22 + pulse * 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      return;
    }

    const ax = w.anchorX, ay = w.anchorY, bx = w.x, by = w.y;
    const dx = bx - ax, dy = by - ay;
    const pullDist = Math.hypot(dx, dy);
    if (pullDist < 4) return;
    const t = DB.clamp(pullDist / SL.MAX_PULL, 0, 1);
    let r = 90, g = 240, b = 255;
    if (t >= 0.5) { const k = (t - 0.5) / 0.5; r = 255; g = 255 - 135 * k; b = 255 - 195 * k; }
    const color = `rgb(${r|0}, ${g|0}, ${b|0})`;
    const nx = -dy / pullDist, ny = dx / pullDist;
    const sag = Math.min(26, pullDist * 0.18) * (0.6 + Math.sin(state.t * 18) * 0.4);
    for (let side = -1; side <= 1; side += 2) {
      const midX = (ax + bx) / 2 + nx * sag * side, midY = (ay + by) / 2 + ny * sag * side;
      ctx.save(); ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 10 + t * 18;
      ctx.lineWidth = 2.2 + (1 - t) * 1.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(midX, midY, bx, by); ctx.stroke(); ctx.restore();
    }
  };

  DB.triggerLink = function (cx, cy, dmg) {
    state.shake = Math.max(state.shake, 15);
    DB.sfx.error();

    for (const e of DB.enemies) {
      const dx = cx - e.x, dy = cy - e.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      if (d < 300) {
        e.x += (dx / d) * 300 * (1 - d / 300);
        e.y += (dy / d) * 300 * (1 - d / 300);
        e.hp -= DB.applyVulnerable(e, dmg * 1.5);
        e.flashT = 0.15;
        if (e.hp <= 0 && DB.killEnemy) DB.killEnemy(DB.enemies.indexOf(e));
      }
    }
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const dist = Math.random() * 300;
      DB.particles.push({
        x: cx + Math.cos(a) * dist, y: cy + Math.sin(a) * dist,
        vx: -Math.cos(a) * 500, vy: -Math.sin(a) * 500,
        life: 0.5, maxLife: 0.5, size: 5, color: '#5ae8ff', spin: 0, rot: a
      });
    }
  };

  DB.spawnZone = function (opts) {
    DB.zones.push({
      kind: opts.kind,                 // 'firewall' | 'gravity' | 'hackhole' | 'intake'
      x: opts.x, y: opts.y,
      r: opts.r || 0,
      w: opts.w || 0, h: opts.h || 0,
      life: opts.life,
      maxLife: opts.life,
      dmg: opts.dmg || 0,
      tickCd: 0,
      tickInterval: opts.tickInterval || 0.5,
      color: opts.color || '#5ae8ff',
      seed: Math.random() * 100,
      pull: opts.pull || 0,
      pushDown: opts.pushDown || 0
    });
  };

  DB.zoneTick = function (z) {
    if (z.kind === 'firewall') {
      for (const e of DB.enemies) {
        if (Math.abs(e.x - z.x) < z.w / 2 && Math.abs(e.y - z.y) < z.h / 2) {
          e.hp -= DB.applyVulnerable(e, z.dmg);
          e.flashT = 0.1;
        }
      }
    } else if (z.kind === 'gravity' || z.kind === 'hackhole') {
      for (const e of DB.enemies) {
        if (Math.hypot(e.x - z.x, e.y - z.y) < z.r) {
          const applied = DB.applyVulnerable(e, z.dmg);
          e.hp -= applied;
          e.flashT = 0.12;
          if (DB.floaters) {
            DB.floaters.push({
              text: `-${Math.round(applied)}`,
              x: e.x + (Math.random() - 0.5) * 24,
              y: e.y - 24,
              vy: -60, life: 0.6, maxLife: 0.6,
              color: z.kind === 'gravity' ? '#ffcc00' : '#c08bff'
            });
          }
        }
      }
    }
  };

  DB.updateZones = function (dt) {
    for (let i = DB.zones.length - 1; i >= 0; i--) {
      const z = DB.zones[i];
      z.life -= dt;
      if (z.life <= 0) { DB.zones.splice(i, 1); continue; }

      // 持续位移效果
      if (z.kind === 'gravity') {
        for (const e of DB.enemies) {
          const dx = z.x - e.x, dy = z.y - e.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          if (d < z.r * 1.1 && d > 12) {
            // 缓慢吸附向 zone 中心（重力感），不会把敌人推出去
            const pull = 140 * dt;
            e.x += (dx / d) * pull;
            e.y += (dy / d) * pull;
            if (e.type === 'drone') {
              e.baseX += (dx / d) * pull;
              e.baseY += (dy / d) * pull;
            }
          }
        }
      }
      if ((z.kind === 'hackhole' || z.kind === 'intake') && z.pull > 0) {
        for (const e of DB.enemies) {
          const dx = z.x - e.x, dy = z.y - e.y;
          const d = Math.max(1, Math.hypot(dx, dy));
          if (d < z.r) {
            const k = z.pull * (1 - d / z.r) * dt;
            e.x += (dx / d) * k;
            e.y += (dy / d) * k;
            if (e.type === 'drone') { e.baseX += (dx / d) * k; e.baseY += (dy / d) * k; }
          }
        }
      }

      z.tickCd -= dt;
      if (z.tickCd <= 0) {
        z.tickCd = z.tickInterval;
        DB.zoneTick(z);
      }
    }
  };

  DB.drawZones = function (ctx) {
    for (const z of DB.zones) {
      const fadeIn  = Math.min(1, (z.maxLife - z.life) / 0.2 + 0.2);
      const fadeOut = Math.min(1, z.life / 0.3);
      ctx.save();
      ctx.globalAlpha = fadeIn * fadeOut;

      if (z.kind === 'firewall') {
        const pulse = 0.5 + 0.5 * Math.sin(state.t * 14 + z.seed);
        ctx.fillStyle = `rgba(255, 120, 60, ${0.15 + pulse * 0.15})`;
        ctx.strokeStyle = '#ff7a3a';
        ctx.shadowColor = '#ff7a3a'; ctx.shadowBlur = 18;
        ctx.lineWidth = 2;
        ctx.fillRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
        ctx.strokeRect(z.x - z.w / 2, z.y - z.h / 2, z.w, z.h);
        // 内部网格线
        ctx.globalAlpha *= 0.4;
        ctx.strokeStyle = '#ffcc99';
        ctx.lineWidth = 1;
        for (let x = z.x - z.w / 2 + 20; x < z.x + z.w / 2; x += 20) {
          ctx.beginPath(); ctx.moveTo(x, z.y - z.h / 2); ctx.lineTo(x, z.y + z.h / 2); ctx.stroke();
        }
      } else if (z.kind === 'gravity') {
        const pulse = 0.5 + 0.5 * Math.sin(state.t * 12 + z.seed);
        ctx.fillStyle = `rgba(255, 204, 0, ${0.08 + pulse * 0.06})`;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255, 204, 0, ${0.4 + pulse * 0.4})`;
        ctx.lineWidth = 2; ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 20;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
        // 下压箭头
        ctx.globalAlpha *= 0.7;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + state.t;
          const px = z.x + Math.cos(a) * z.r * 0.7;
          const py = z.y + Math.sin(a) * z.r * 0.7;
          ctx.beginPath();
          ctx.moveTo(px, py - 12); ctx.lineTo(px - 6, py); ctx.lineTo(px + 6, py);
          ctx.closePath(); ctx.fillStyle = '#ffcc00'; ctx.fill();
        }
      } else if (z.kind === 'hackhole') {
        const pulse = 0.5 + 0.5 * Math.sin(state.t * 8 + z.seed);
        ctx.shadowColor = '#c08bff'; ctx.shadowBlur = 30;
        ctx.strokeStyle = `rgba(192, 139, 255, ${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(z.x, z.y, 60 + pulse * 10, 20 + pulse * 5, state.t * 2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.arc(z.x, z.y, 25, 0, Math.PI * 2); ctx.fill();
      } else if (z.kind === 'intake') {
        const pulse = 0.5 + 0.5 * Math.sin(state.t * 10 + z.seed);
        ctx.strokeStyle = `rgba(255, 90, 122, ${0.4 + pulse * 0.4})`;
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 10]);
        ctx.lineDashOffset = -state.t * 60;
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255, 90, 122, 0.15)';
        ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  };

  // ===== 黑客射击系统 =====
  DB.hitscanShot = function (ox, oy, angle, range, w) {
    const tx = ox + Math.cos(angle) * range;
    const ty = oy + Math.sin(angle) * range;
    const hit = DB.hitscanHit(ox, oy, tx, ty, w);
    if (!hit) {
      for (let i = 0; i < 30; i++) {
        const t = i / 30;
        DB.particles.push({
          x: ox + (tx - ox) * t + (Math.random() - 0.5) * 4,
          y: oy + (ty - oy) * t + (Math.random() - 0.5) * 4,
          vx: 0, vy: 0,
          life: 0.18, maxLife: 0.18,
          size: 4, color: '#ff5a7a', spin: 0, rot: 0
        });
      }
    }
    return hit;
  };

  DB.hitscanBounce = function (ox, oy, angle, range, w, bounces) {
    let cx = ox, cy = oy, curAngle = angle;
    const hitSet = new Set();
    for (let i = 0; i <= bounces; i++) {
      const hit = DB.hitscanShot(cx, cy, curAngle, range, w);
      if (!hit) break;
      hitSet.add(hit.enemy || hit.boss);
      if (i >= bounces) break;
      let nearest = null, minD = 350;
      for (const e of DB.enemies) {
        if (e.dead || hitSet.has(e)) continue;
        const d = Math.hypot(e.x - hit.x, e.y - hit.y);
        if (d < minD) { minD = d; nearest = e; }
      }
      if (!nearest) break;
      for (let k = 0; k < 8; k++) {
        const t = k / 8;
        DB.particles.push({ x: hit.x + (nearest.x - hit.x) * t, y: hit.y + (nearest.y - hit.y) * t, vx: 0, vy: 0, life: 0.2, maxLife: 0.2, size: 4, color: '#ff5a7a', spin: 0, rot: 0 });
      }
      cx = hit.x; cy = hit.y;
      curAngle = Math.atan2(nearest.y - cy, nearest.x - cx);
    }
  };

  DB.hitscanChain = function (ox, oy, angle, range, w, count) {
    let cx = ox, cy = oy, curAngle = angle;
    const hitSet = new Set();
    for (let i = 0; i <= count; i++) {
      const hit = DB.hitscanShot(cx, cy, curAngle, range, w);
      if (!hit) break;
      hitSet.add(hit.enemy || hit.boss);
      if (hit.enemy) hit.enemy.virus = true;
      if (hit.boss) hit.boss.virus = true;
      if (i >= count) break;
      let nearest = null, minD = 250;
      for (const e of DB.enemies) {
        if (e.dead || hitSet.has(e)) continue;
        const d = Math.hypot(e.x - hit.x, e.y - hit.y);
        if (d < minD) { minD = d; nearest = e; }
      }
      if (!nearest) break;
      for (let k = 0; k < 6; k++) {
        const t = k / 6;
        DB.particles.push({ x: hit.x + (nearest.x - hit.x) * t, y: hit.y + (nearest.y - hit.y) * t, vx: 0, vy: 0, life: 0.15, maxLife: 0.15, size: 4, color: '#ffcc00', spin: 0, rot: 0 });
      }
      cx = hit.x; cy = hit.y;
      curAngle = Math.atan2(nearest.y - cy, nearest.x - cx);
    }
  };

  DB.spawnBeam = function (ox, oy, angle, range, w, duration) {
    DB.beams.push({
      ox, oy, angle, range,
      life: duration, maxLife: duration,
      dmg: w.baseDamage * (1 + state.mods.damage),
      tickCd: 0, tickInterval: 0.08
    });
  };

  DB.updateBeams = function (dt) {
    for (let i = DB.beams.length - 1; i >= 0; i--) {
      const b = DB.beams[i];
      b.life -= dt;
      if (b.life <= 0) { DB.beams.splice(i, 1); continue; }
      b.tickCd -= dt;
      if (b.tickCd <= 0) {
        b.tickCd = b.tickInterval;
        const tx = b.ox + Math.cos(b.angle) * b.range;
        const ty = b.oy + Math.sin(b.angle) * b.range;
        const dx = tx - b.ox, dy = ty - b.oy;
        const len2 = dx * dx + dy * dy;
        for (const e of DB.enemies) {
          if (e.dead) continue;
          const ex = e.x - b.ox, ey = e.y - b.oy;
          let t = (ex * dx + ey * dy) / len2;
          if (t < 0) continue;
          if (t > 1) t = 1;
          const px = b.ox + dx * t, py = b.oy + dy * t;
          const dd = Math.hypot(e.x - px, e.y - py);
          if (dd < e.r + 12) {
            e.hp -= DB.applyVulnerable(e, b.dmg * 0.8); // 伤害倍率提升接近 3 倍
            e.flashT = 0.1;
            e.slowT = Math.max(e.slowT || 0, 0.5); // 减速加强
          }
        }
      }
    }
  };

  DB.drawBeams = function (ctx) {
    for (const b of DB.beams) {
      const alpha = Math.min(1, b.life / 0.2) * Math.min(1, (b.maxLife - b.life) / 0.1 + 0.5);
      const tx = b.ox + Math.cos(b.angle) * b.range;
      const ty = b.oy + Math.sin(b.angle) * b.range;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ff5a7a';
      ctx.shadowColor = '#ff5a7a';
      ctx.shadowBlur = 20;
      ctx.lineWidth = 8 + Math.sin(state.t * 30) * 2;
      ctx.beginPath();
      ctx.moveTo(b.ox, b.oy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.strokeStyle = '#ffffff';
      ctx.shadowBlur = 10;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(b.ox, b.oy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.restore();
    }
  };

})(window.DB);