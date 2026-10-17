(function (DB) {
  'use strict';

  DB.tryUltimate = function () {
    const st = DB.state;
    if (st.energy < st.energyMax) return;

    st.energy = 0;

    // 献祭场上所有武器（先数，再清）
    const sacrifice = DB.weapons.filter(w => !w.dead && w.warning <= 0).length;

    for (const w of DB.weapons.slice()) {
      if (w.dead) continue;
      DB.spawnParticles(w.x, w.y, 10, '#c08bff', 300);
      DB.removeWeapon(w);
    }
    DB.heldWeapon = null;

    const p = DB.player;
    const cx = p.x;
    const cy = p.y;

    st.shake   = 30;
    st.hitstop = 0.1;
    st.flash   = 0.6;

    const dmg = 26 + sacrifice * 30;

    for (const t of DB.targets) {
      if (!t.broken) DB.hitTarget(t, dmg, 1400);
    }

    for (let ring = 0; ring < 3; ring++) {
      for (let i = 0; i < 42; i++) {
        const a  = (i / 42) * Math.PI * 2 + ring * 0.4;
        const sp = 420 + ring * 260;
        DB.particles.push({
          x: cx, y: cy,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: 0.7, maxLife: 0.7,
          size: 3.5,
          color: ring === 0 ? '#ffffff' : (ring === 1 ? '#c08bff' : '#5ae8ff'),
          spin: 0, rot: a
        });
      }
    }
  };

})(window.DB);