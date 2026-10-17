(function (DB) {
  'use strict';

  const CFG = DB.CFG;

  DB.spawnParticles = function (x, y, count, color, speed) {
    for (let i = 0; i < count; i++) {
      const a  = Math.random() * Math.PI * 2;
      const sp = speed * (0.25 + Math.random() * 0.9);
      DB.particles.push({
        x, y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 90,
        life: 0.35 + Math.random() * 0.5,
        maxLife: 0.85,
        size: 1.5 + Math.random() * 3.5,
        color,
        spin: (Math.random() - 0.5) * 14,
        rot: Math.random() * 6.28
      });
    }
  };

  DB.updateParticles = function (dt) {
    const arr = DB.particles;
    for (let i = arr.length - 1; i >= 0; i--) {
      const p = arr[i];
      p.vy += 1100 * dt;
      p.vx *= Math.exp(-1.6 * dt);
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      p.life -= dt;

      if (p.y > CFG.GROUND_Y) {
        p.y = CFG.GROUND_Y;
        p.vy *= -0.35;
        p.vx *= 0.6;
      }
      if (p.life <= 0) arr.splice(i, 1);
    }
  };

  DB.drawParticles = function (ctx) {
    for (const p of DB.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  };

})(window.DB);