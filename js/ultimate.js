(function (DB) {
  'use strict';

  const state = DB.state;
  const W = DB.CFG.W;
  const H = DB.CFG.H;

  DB.tryUltimate = function (key) {
    if (state.energy < state.energyMax) return;
    if (state.scene !== 'playing') return;

    state.energy = 0;
    const p = DB.player;
    const isHacker = state.mode === 'hacker';

    const upData = DB.upgrades || { damage: 0 };
    const totalDmgMult = 1 + (upData.damage * 0.1) + state.mods.damage;

    state.shake = 30;
    state.hitstop = 0.1;
    state.flash = 0.6;
    DB.sfx.clear();

    if (!isHacker) {
      // ================= 防守方大招 =================
      if (key === '1') {
        const dmg = 60 * totalDmgMult;
        for (const t of DB.enemies) t.hp -= DB.applyVulnerable(t, dmg);
        if (DB.boss && DB.boss.phase === 'normal') { DB.boss.hp -= DB.applyVulnerable(DB.boss, dmg); DB.boss.flashT = 0.2; }
        for (let i = 0; i < 120; i++) DB.particles.push({ x: Math.random() * W, y: -20, vx: 0, vy: 800 + Math.random() * 600, life: 1.0, maxLife: 1.0, size: 4 + Math.random() * 6, color: '#5ae8ff', spin: 0, rot: 0 });
      }
      else if (key === '2') {
        DB.enemyBullets.length = 0;
        for (const e of DB.enemies) e.frozen = 3.0;
        if (DB.boss) DB.boss.frozen = 3.0;
      }
      else if (key === '3') {
        state.hp = Math.min(state.hpMax, state.hp + state.hpMax * 0.5);
      }
      else if (key === '4') {
        // ===== 代码熔炉：献祭所有武器，各自原地专属爆炸 → 最后玩家位置中心核爆 =====
        const sacrificeList = [];
        for (const w of DB.weapons.slice()) {
          if (w.dead) continue;
          sacrificeList.push({
            x: w.x, y: w.y,
            type: w.type,
            baseDamage: w.baseDamage,
            deployed: !!w.deployed
          });
        }
        DB.heldWeapon = null;
        for (const w of DB.weapons.slice()) DB.removeWeapon(w);

        // 1) 每把武器在自身原位置触发专属爆炸
        for (const s of sacrificeList) {
          // 用 code_slash 的 baseDamage 巨大，这里压制，避免献祭一把光刃秒 Boss
          const localBase = Math.min(s.baseDamage, 40);
          const localDmg = localBase * 2 * totalDmgMult;

          if (s.type === 'gravity') {
            DB.triggerQuake(s.x, s.y, localDmg);
          } else if (s.type === 'blackhole') {
            DB.triggerBlackhole(s.x, s.y, localDmg * 0.6);
            DB.triggerBlackholeBurst(s.x, s.y, localDmg);
          } else if (s.type === 'chain') {
            DB.triggerChain(s.x, s.y, localDmg);
          } else {
            // 普通武器：小范围 AOE
            for (const e of DB.enemies) {
              if (Math.hypot(e.x - s.x, e.y - s.y) < 160) {
                e.hp -= DB.applyVulnerable(e, localDmg * 0.8);
                e.flashT = 0.15;
              }
            }
            if (DB.boss && DB.boss.phase === 'normal') {
              if (Math.hypot(DB.boss.x - s.x, DB.boss.y - s.y) < 160) {
                DB.boss.hp -= DB.applyVulnerable(DB.boss, localDmg * 0.8);
                DB.boss.flashT = 0.15;
              }
            }
          }

          DB.spawnParticles(s.x, s.y, 24, '#ffcc00', 600);
          DB.spawnParticles(s.x, s.y, 12, '#ffffff', 800);
          for (let k = 0; k < 12; k++) {
            const a = Math.random() * Math.PI * 2;
            const sp = 300 + Math.random() * 500;
            DB.particles.push({
              x: s.x, y: s.y,
              vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
              life: 0.5, maxLife: 0.5, size: 4, color: '#ffcc00', spin: 0, rot: 0
            });
          }
        }

        // 2) 玩家位置中心大核爆（随献祭数量成长，带距离衰减）
        const coreDmg = (40 + sacrificeList.length * 30) * totalDmgMult;
        const cx = DB.player.x, cy = DB.player.y;

        for (const e of DB.enemies) {
          const d = Math.hypot(e.x - cx, e.y - cy);
          if (d < 500) {
            const falloff = 1 - Math.min(0.5, d / 1000);
            e.hp -= DB.applyVulnerable(e, coreDmg * falloff);
            e.flashT = 0.2;
          }
        }
        if (DB.boss && DB.boss.phase === 'normal') {
          const d = Math.hypot(DB.boss.x - cx, DB.boss.y - cy);
          if (d < 500) {
            const falloff = 1 - Math.min(0.5, d / 1000);
            DB.boss.hp -= DB.applyVulnerable(DB.boss, coreDmg * falloff);
          }
          DB.boss.flashT = 0.3;
        }

        // 3) 视觉爆发
        state.shake = Math.max(state.shake, 34);
        state.flash = Math.max(state.flash, 0.7);
        for (let i = 0; i < 80; i++) {
          const a = Math.random() * Math.PI * 2;
          const sp = 400 + Math.random() * 800;
          DB.particles.push({
            x: cx, y: cy,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.8, maxLife: 0.8, size: 5, color: '#ffcc00', spin: 0, rot: 0
          });
        }
        DB.spawnParticles(cx, cy, 40, '#ffffff', 900);
      }
    }
    else {
      // ================= 黑客方大招 =================
      if (key === '1') {
        const dmg = 50 * totalDmgMult;
        for (const t of DB.enemies) {
          t.hp -= DB.applyVulnerable(t, dmg);
          t.vulnerable = 6.0;
          DB.spawnParticles(t.x, t.y, 10, '#ff5a7a', 300);
        }
        if (DB.boss && DB.boss.phase === 'normal') { DB.boss.hp -= DB.applyVulnerable(DB.boss, dmg); DB.boss.flashT = 0.2; }

        for (let i = 0; i < 100; i++) {
          DB.particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, life: 1.5, maxLife: 1.5, size: 6, color: '#ff5a7a', spin: 0, rot: 0 });
        }
      }
      else if (key === '2') {
        DB.enemyBullets.length = 0;
        for (const e of DB.enemies) e.slowT = 4.0;

        for (let i = 0; i < 100; i++) {
          DB.particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, life: 1.5, maxLife: 1.5, size: 5, color: '#5ae8ff', spin: 0, rot: 0 });
        }
      }
      else if (key === '3') {
        state.hp = Math.min(state.hpMax, state.hp + state.hpMax * 0.4);
        for (let i = 0; i < 3; i++) {
          const w = DB.spawnWeapon('light_dart');
          if (w) w.warning = 0.001;
        }
        DB.sfx.chip();
      }
      else if (key === '4') {
        // 万剑归宗：未部署的武器变成追踪导弹；已部署的阵地直接原地过载核爆！
        DB.heldWeapon = null;
        for (const w of DB.weapons.slice()) {
          if (w.dead) continue;
          
          if (w.deployed) {
            const dmg = w.baseDamage * 8 * totalDmgMult;
            if (w.type === 'gravity') DB.triggerQuake(w.x, w.y, dmg);
            if (w.type === 'blackhole') { DB.triggerBlackhole(w.x, w.y, dmg); DB.triggerBlackholeBurst(w.x, w.y, dmg); }
            if (w.type === 'chain') DB.triggerChain(w.x, w.y, dmg);
            
            DB.spawnParticles(w.x, w.y, 50, '#ffcc00', 800);
            DB.spawnParticles(w.x, w.y, 30, '#ffffff', 1000);
            
            DB.removeWeapon(w);
            continue;
          }

          w.held = false;

          let target = null; let minDist = Infinity;
          const aimX = DB.mouse.x, aimY = DB.mouse.y; // 以鼠标为准
          for (const e of DB.enemies) {
            const d = Math.hypot(e.x - aimX, e.y - aimY);
            if (d < minDist) { minDist = d; target = e; }
          }
          if (!target && DB.boss && DB.boss.phase === 'normal') target = DB.boss;
          
          // 如果场上没怪也没 Boss，就朝着鼠标方向飞出去
          if (!target) {
            w.thrown = true;
            w.homing = false;
            const dx = aimX - w.x, dy = aimY - w.y, len = Math.hypot(dx, dy) || 1;
            w.vx = (dx / len) * 1500;
            w.vy = (dy / len) * 1500;
            w.age = 0;
            continue;
          }

          if (target) {
            w.thrown = true;
            w.homing = true;
            w.homingTarget = target;
            w.age = 0;
            w.vx = 0; 
            w.vy = 0;
          }
        }
      }
    }

    // 清理被打死的敌人
    for (let i = DB.enemies.length - 1; i >= 0; i--) {
      if (DB.enemies[i].hp <= 0) {
        if (DB.killEnemy) DB.killEnemy(i);
        else DB.enemies.splice(i, 1);
      }
    }
  };

})(window.DB);