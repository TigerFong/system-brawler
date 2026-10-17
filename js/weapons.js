(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const layer = DB.dom.weaponLayer;
  const W     = CFG.W;

  /* ---------- 计数 ---------- */
  function countActiveWeapons() {
    let n = 0;
    for (const w of DB.weapons) if (!w.dead) n++;
    return n;
  }

  /* ---------- 九宫格伪随机生成点 ---------- */
  function pickSpawnPoint() {
    const COLS = 4, ROWS = 3;
    const cw = W / COLS;
    const ch = (CFG.GROUND_Y - 60 - CFG.PLAY_TOP) / ROWS;

    const c = Math.floor(Math.random() * COLS);
    const r = Math.floor(Math.random() * ROWS);

    return {
      x: cw * c + cw * 0.5 + (Math.random() - 0.5) * cw * 0.42,
      y: CFG.PLAY_TOP + ch * r + ch * 0.5 + (Math.random() - 0.5) * ch * 0.42
    };
  }

  /* ---------- 生成 ---------- */
  DB.spawnWeapon = function (type) {
    if (countActiveWeapons() >= CFG.MAX_WEAPONS) return null;

    const def = DB.WEAPON_TYPES[type];
    if (!def) return null;

    const p = pickSpawnPoint();

    const w = {
      id: DB.nextUid(),
      type, def,
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
      el: null,
      anchorX: 0,          // 弹弓锚点（抓取时记录）
      anchorY: 0
    };

    DB.weapons.push(w);
    return w;
  };

  /* ---------- DOM ---------- */
  function createWeaponEl(w) {
    const el = document.createElement('div');
    el.className = 'weapon';
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

  /* ---------- 抓取（记录锚点） ---------- */
  DB.tryGrab = function (mx, my) {
    let best = null;
    let bestD = Infinity;

    for (const w of DB.weapons) {
      if (w.dead || w.warning > 0 || w.held) continue;
      const d = Math.hypot(w.x - mx, w.y - my);
      if (d < w.r + CFG.GRAB_PICK_R && d < bestD) {
        bestD = d;
        best = w;
      }
    }

    if (!best) return;

    const grabRange = CFG.GRAB_RANGE + DB.state.mods.grab;
    const distToPlayer = Math.hypot(best.x - DB.player.x, best.y - DB.player.y);
    if (distToPlayer > grabRange) {
      DB.spawnParticles(best.x, best.y, 6, '#ff5a7a', 160);
      return;
    }

    best.held   = true;
    best.thrown = false;
    best.vx = 0;
    best.vy = 0;
    best.rotV = 0;
    best.anchorX = best.x;   // ← 关键：抓住瞬间的位置成为锚点
    best.anchorY = best.y;
    if (best.el) best.el.classList.add('held');
    DB.sfx.grab();
    DB.heldWeapon = best;
  };

  /* ---------- 释放（弹弓） ---------- */
  DB.releaseThrow = function () {
    const w = DB.heldWeapon;
    if (!w) return;

    const SL = CFG.SLINGSHOT;

    const dx = w.x - w.anchorX;
    const dy = w.y - w.anchorY;
    const pullDist = Math.hypot(dx, dy);

    w.held = false;
    if (w.el) w.el.classList.remove('held');
    DB.heldWeapon = null;

    /* --- 轻放：拉伸不足，回到悬浮 --- */
    if (pullDist < SL.MIN_PULL) {
      w.thrown = false;
      w.vx = 0;
      w.vy = 0;
      w.rotV = 0;
      w.anchorX = 0;
      w.anchorY = 0;
      return;
    }

    /* --- 弹弓：方向 = 武器指向锚点（被拉离方向的反向） --- */
    const inv  = 1 / pullDist;
    const dirX = -dx * inv;
    const dirY = -dy * inv;

    const t = DB.clamp(pullDist / SL.MAX_PULL, 0, 1);
    let speed = SL.MIN_LAUNCH + (SL.MAX_LAUNCH - SL.MIN_LAUNCH) * t;
    speed *= (1 + DB.state.mods.launch);

    w.thrown = true;
    w.age = 0;
    w.vx = dirX * speed;
    w.vy = dirY * speed;
    w.rotV = (Math.random() > 0.5 ? 1 : -1) * (6 + t * 14);

    /* --- 反馈 --- */
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

  /* ---------- 物理更新 ---------- */
  DB.updateWeapons = function (dt) {
    const arr = DB.weapons;
    const SL  = CFG.SLINGSHOT;

    for (let i = arr.length - 1; i >= 0; i--) {
      const w = arr[i];
      if (w.dead) continue;

      /* --- 预警阶段 --- */
      if (w.warning > 0) {
        w.warning -= dt;
        if (w.warning <= 0) {
          w.warning = 0;
          w.el = createWeaponEl(w);
          positionWeaponEl(w);
        }
        continue;
      }

      /* --- 超时销毁 --- */
      w.age += dt;
      if (w.age > CFG.WEAPON_LIFETIME) {
        DB.spawnParticles(w.x, w.y, 8, '#6a7fa8', 140);
        DB.removeWeapon(w);
        continue;
      }

      if (w.hitCd > 0) w.hitCd -= dt;

      /* --- 被持有：皮兜拉拽 --- */
      if (w.held) {
        const mouse = DB.mouse;

        // 目标位置受锚点 MAX_PULL 半径限制，像皮兜拉到底
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
        w.vx = 0;
        w.vy = 0;

        // 满张力微抖动
        const pull = Math.hypot(w.x - w.anchorX, w.y - w.anchorY);
        if (pull > SL.MAX_PULL * 0.7) {
          const jitter = (pull / SL.MAX_PULL) * 1.6;
          w.x += (Math.random() - 0.5) * jitter;
          w.y += (Math.random() - 0.5) * jitter;
        }
      }
      /* --- 悬浮 --- */
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
      /* --- 飞行物理 --- */
      else {
        w.vy += CFG.GRAVITY * dt;
        w.vx *= Math.exp(-CFG.AIR_DRAG * dt);

        w.x += w.vx * dt;
        w.y += w.vy * dt;
        w.rot += w.rotV * dt;

        // 地面
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

        // 左右墙 / 上边界
        if (w.x < w.r)          { w.x = w.r;          w.vx =  Math.abs(w.vx) * CFG.WALL_BOUNCE; }
        if (w.x > W - w.r)      { w.x = W - w.r;      w.vx = -Math.abs(w.vx) * CFG.WALL_BOUNCE; }
        if (w.y < CFG.PLAY_TOP) { w.y = CFG.PLAY_TOP; w.vy =  Math.abs(w.vy) * CFG.WALL_BOUNCE; }
      }

      /* --- 生命周期视觉 --- */
      if (w.el) {
        if (w.age > CFG.WEAPON_LIFETIME - 2) {
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

      const k = 1 - w.warning / CFG.SPAWN_WARN; // 0 -> 1 (进度)
      
      // 最后 0.1 秒快速闪烁提示
      let alpha = 0.4 + k * 0.6;
      if (w.warning < 0.1) {
        alpha = (Math.sin(state.t * 50) > 0) ? 1 : 0.3;
      }

      ctx.save();
      ctx.globalAlpha = alpha;

      // 1. 更亮的光柱
      const grad = ctx.createLinearGradient(0, w.y - 200, 0, w.y + 20);
      grad.addColorStop(0, 'rgba(90, 240, 255, 0)');
      grad.addColorStop(0.8, 'rgba(90, 240, 255, 0.4)');
      grad.addColorStop(1, 'rgba(140, 250, 255, 1.0)'); // 底部最亮
      ctx.fillStyle = grad;
      ctx.fillRect(w.x - 6, w.y - 200, 12, 220); // 加宽光柱

      // 2. 地面上的多层扩散圆环
      // 外圈：固定的最大警示范围
      ctx.strokeStyle = 'rgba(140, 250, 255, 0.8)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 40, 0, Math.PI * 2);
      ctx.stroke();

      // 内圈：由大到小收缩
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(w.x, w.y, 40 - k * 30, 0, Math.PI * 2);
      ctx.stroke();

      // 3. 落点中心的十字光标
      ctx.strokeStyle = 'rgba(140, 250, 255, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(w.x - 10, w.y);
      ctx.lineTo(w.x + 10, w.y);
      ctx.moveTo(w.x, w.y - 10);
      ctx.lineTo(w.x, w.y + 10);
      ctx.stroke();

      ctx.restore();
    }
  };

  /* ---------- 皮筋绘制 ---------- */
  DB.drawGrabBeam = function (ctx) {
    const w = DB.heldWeapon;
    if (!w) return;

    const SL = CFG.SLINGSHOT;
    const ax = w.anchorX;
    const ay = w.anchorY;
    const bx = w.x;
    const by = w.y;

    const dx = bx - ax;
    const dy = by - ay;
    const pullDist = Math.hypot(dx, dy);

    if (pullDist < 4) return;

    const t = DB.clamp(pullDist / SL.MAX_PULL, 0, 1);

    /* --- 颜色：青蓝 → 白 → 橙红 --- */
    let r, g, b;
    if (t < 0.5) {
      const k = t / 0.5;
      r = 90  + (255 - 90)  * k;
      g = 240 + (255 - 240) * k;
      b = 255;
    } else {
      const k = (t - 0.5) / 0.5;
      r = 255;
      g = 255 + (120 - 255) * k;
      b = 255 + (60  - 255) * k;
    }

    const color = `rgb(${r|0}, ${g|0}, ${b|0})`;
    const glow  = `rgba(${r|0}, ${g|0}, ${b|0}, 0.7)`;

    /* --- 皮筋弯曲方向（垂直于拉伸） --- */
    const nx = -dy / pullDist;
    const ny =  dx / pullDist;
    const sag = Math.min(26, pullDist * 0.18) * (0.6 + Math.sin(state.t * 18) * 0.4);

    /* --- 两条皮筋（上下） --- */
    for (let side = -1; side <= 1; side += 2) {
      const midX = (ax + bx) / 2 + nx * sag * side;
      const midY = (ay + by) / 2 + ny * sag * side;

      ctx.save();
      ctx.strokeStyle = color;
      ctx.shadowColor = glow;
      ctx.shadowBlur  = 10 + t * 18;
      ctx.lineWidth   = 2.2 + (1 - t) * 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo(midX, midY, bx, by);
      ctx.stroke();
      ctx.restore();
    }

    /* --- 满张力火花 --- */
    if (t > 0.7) {
      const sparks = Math.floor((t - 0.7) / 0.3 * 6);
      for (let i = 0; i < sparks; i++) {
        const p  = Math.random();
        const sx = ax + dx * p + nx * (Math.random() - 0.5) * 18;
        const sy = ay + dy * p + ny * (Math.random() - 0.5) * 18;
        ctx.save();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
        ctx.restore();
      }
    }

    /* --- 弹射方向预览 --- */
    if (pullDist > SL.MIN_PULL * 0.6) {
      const dirX = -dx / pullDist;
      const dirY = -dy / pullDist;
      const len  = 60 + t * 120;
      const ex = bx + dirX * len;
      const ey = by + dirY * len;

      ctx.save();
      ctx.strokeStyle = `rgba(${r|0}, ${g|0}, ${b|0}, ${0.35 + t * 0.5})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 6]);
      ctx.lineDashOffset = -state.t * 40;
      ctx.beginPath();
      ctx.moveTo(bx + dirX * 22, by + dirY * 22);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.restore();
    }
  };

})(window.DB);