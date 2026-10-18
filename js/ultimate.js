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
        for (const t of DB.enemies) t.hp -= dmg;
        if (DB.boss && DB.boss.phase === 'normal') { DB.boss.hp -= dmg; DB.boss.flashT = 0.2; }
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
        // 核心熔毁：献祭所有武器
        const sacrifice = DB.weapons.filter(w => !w.dead && w.warning <= 0).length;
        for (const w of DB.weapons.slice()) { DB.removeWeapon(w); }
        DB.heldWeapon = null;
        
        const dmg = (30 + sacrifice * 40) * totalDmgMult; 
        for (const t of DB.enemies) t.hp -= dmg;
        if (DB.boss && DB.boss.phase === 'normal') { DB.boss.hp -= dmg; DB.boss.flashT = 0.3; }
      }
    } 
    else {
      // ================= 黑客方大招 =================
      if (key === '1') {
        // 逻辑炸弹
        const dmg = 50 * totalDmgMult;
        for (const t of DB.enemies) { 
          t.hp -= dmg; 
          t.vulnerable = 6.0; 
          DB.spawnParticles(t.x, t.y, 10, '#ff5a7a', 300);
        }
        if (DB.boss && DB.boss.phase === 'normal') { DB.boss.hp -= dmg; DB.boss.flashT = 0.2; }
        
        for (let i = 0; i < 100; i++) {
          DB.particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, life: 1.5, maxLife: 1.5, size: 6, color: '#ff5a7a', spin: 0, rot: 0 });
        }
      } 
      else if (key === '2') {
        // 冻结协议
        DB.enemyBullets.length = 0; 
        for (const e of DB.enemies) e.slowT = 4.0; // 稍微削弱了减速时间
        
        for (let i = 0; i < 100; i++) {
          DB.particles.push({ x: Math.random() * W, y: Math.random() * H, vx: 0, vy: 0, life: 1.5, maxLife: 1.5, size: 5, color: '#5ae8ff', spin: 0, rot: 0 });
        }
      } 
      else if (key === '3') {
        // 紧急重启
        state.hp = Math.min(state.hpMax, state.hp + state.hpMax * 0.4);
        for (let i = 0; i < 3; i++) {
          const w = DB.spawnWeapon('light_dart');
          if (w) w.warning = 0.001;
        }
        DB.sfx.chip();
      } 
      else if (key === '4') {
        // 4: 万剑归宗 -> 所有场上武器自动飞向最近的敌人
        DB.heldWeapon = null; 
        for (const w of DB.weapons.slice()) {
          if (w.dead) continue;
          w.held = false; 
          
          let target = null; let minDist = Infinity;
          for (const e of DB.enemies) {
            const d = Math.hypot(w.x - e.x, w.y - e.y);
            if (d < minDist) { minDist = d; target = e; }
          }
          if (!target && DB.boss && DB.boss.phase === 'normal') target = DB.boss;

          if (target) {
            w.thrown = true;
            w.homing = true;         // <--- 开启追踪
            w.homingTarget = target; // <--- 记录目标
            w.age = 0;
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