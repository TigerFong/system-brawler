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
    
    // ===== 新增：计算全局伤害倍率（局外升级 + 局内芯片） =====
    const upData = DB.upgrades || { damage: 0 };
    const totalDmgMult = 1 + (upData.damage * 0.1) + state.mods.damage;
    // =========================================================

    // 共用视觉反馈
    state.shake = 30;
    state.hitstop = 0.1;
    state.flash = 0.6;
    DB.sfx.clear();

    if (key === '1') {
      /* --- 1: 代码暴雨 (高额全屏伤害) --- */
      const dmg = 60 * totalDmgMult; // 应用伤害倍率
      for (const t of DB.enemies) t.hp -= dmg;
      if (DB.boss && DB.boss.phase === 'normal') {
        DB.boss.hp -= dmg;
        DB.boss.flashT = 0.2;
      }
      
      for (let i = 0; i < 120; i++) {
        DB.particles.push({
          x: Math.random() * W, y: -20,
          vx: 0, vy: 800 + Math.random() * 600,
          life: 1.0, maxLife: 1.0, size: 4 + Math.random() * 6,
          color: '#5ae8ff', spin: 0, rot: 0
        });
      }
    } 
    else if (key === '2') {
      /* --- 2: 时间凝滞 (冻结全屏敌人，清空子弹) --- */
      DB.enemyBullets.length = 0; 
      
      for (const e of DB.enemies) e.frozen = 3.0; 
      if (DB.boss) DB.boss.frozen = 3.0;

      for (let ring = 0; ring < 3; ring++) {
        for (let i = 0; i < 40; i++) {
          const a = (i / 40) * Math.PI * 2 + ring * 0.4;
          const sp = 500 + ring * 300;
          DB.particles.push({
            x: p.x, y: p.y,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 0.8, maxLife: 0.8, size: 4,
            color: ring === 0 ? '#ffffff' : '#c08bff',
            spin: 0, rot: a
          });
        }
      }
    } 
    else if (key === '3') {
      /* --- 3: 系统重载 (紧急回血 50%) --- */
      state.hp = Math.min(state.hpMax, state.hp + state.hpMax * 0.5);
      
      for (let i = 0; i < 80; i++) {
        DB.particles.push({
          x: p.x + (Math.random() - 0.5) * 200,
          y: p.y + (Math.random() - 0.5) * 200,
          vx: (Math.random() - 0.5) * 100, vy: -200 - Math.random() * 200,
          life: 1.2, maxLife: 1.2, size: 6,
          color: '#5ee6a8', spin: 0, rot: 0
        });
      }
    } 
    else if (key === '4') {
      /* --- 4: 核心熔毁 (献祭武器，毁天灭地) --- */
      const sacrifice = DB.weapons.filter(w => !w.dead && w.warning <= 0).length;
      
      for (const w of DB.weapons.slice()) {
        if (w.dead) continue;
        DB.spawnParticles(w.x, w.y, 10, '#c08bff', 300);
        DB.removeWeapon(w);
      }
      DB.heldWeapon = null;

      // 应用伤害倍率
      const dmg = (30 + sacrifice * 40) * totalDmgMult; 
      
      for (const t of DB.enemies) t.hp -= dmg;
      if (DB.boss && DB.boss.phase === 'normal') {
        DB.boss.hp -= dmg;
        DB.boss.flashT = 0.3;
      }

      for (let ring = 0; ring < 4; ring++) {
        for (let i = 0; i < 60; i++) {
          const a = (i / 60) * Math.PI * 2 + ring * 0.4;
          const sp = 600 + ring * 400;
          DB.particles.push({
            x: p.x, y: p.y,
            vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            life: 1.0, maxLife: 1.0, size: 5,
            color: ring % 2 === 0 ? '#ffffff' : '#ff7a9a',
            spin: 0, rot: a
          });
        }
      }
    }

    // ===== 修复：清理被打死的敌人（走 killEnemy 逻辑，保证掉落芯片和加分） =====
    for (let i = DB.enemies.length - 1; i >= 0; i--) {
      const e = DB.enemies[i];
      if (e.hp <= 0) {
        if (DB.killEnemy) {
          DB.killEnemy(i); // 正常触发击杀掉落、得分和连击
        } else {
          // 兜底方案
          DB.spawnParticles(e.x, e.y, 20, '#ffffff', 500);
          state.energy = Math.min(state.energyMax, state.energy + 8); 
          DB.enemies.splice(i, 1);
        }
      }
    }
  };

})(window.DB);