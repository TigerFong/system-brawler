(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const keys  = DB.keys;

  DB.updatePlayer = function (dt) {
    const p = DB.player;

    let ax = 0, ay = 0;
    if (keys.has('a')) ax -= 1;
    if (keys.has('d')) ax += 1;
    if (keys.has('w')) ay -= 1;
    if (keys.has('s')) ay += 1;

    const len = Math.hypot(ax, ay);
    if (len > 0) { ax /= len; ay /= len; }

    p.vx += ax * p.accel * dt;
    p.vy += ay * p.accel * dt;

    const fr = Math.exp(-p.friction * dt);
    p.vx *= fr;
    p.vy *= fr;

    const sp = Math.hypot(p.vx, p.vy);
    if (sp > p.maxSpeed) {
      const k = p.maxSpeed / sp;
      p.vx *= k;
      p.vy *= k;
    }

    p.x += p.vx * dt;
    p.y += p.vy * dt;

    const PAD = 46;
    if (p.x < PAD)         { p.x = PAD;         p.vx = 0; }
    if (p.x > CFG.W - PAD) { p.x = CFG.W - PAD; p.vx = 0; }
    if (p.y < CFG.PLAY_TOP)      { p.y = CFG.PLAY_TOP;      p.vy = 0; }
    if (p.y > CFG.GROUND_Y - 8)  { p.y = CFG.GROUND_Y - 8;  p.vy = 0; }
  };

  DB.drawPlayer = function (ctx) {
    const p = DB.player;
    const t = state.t;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3.2);

    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 76);
    g.addColorStop(0, `rgba(80, 230, 255, ${0.34 + pulse * 0.16})`);
    g.addColorStop(0.45, 'rgba(80, 230, 255, 0.10)');
    g.addColorStop(1, 'rgba(80, 230, 255, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(p.x - 76, p.y - 76, 152, 152);

    // 抓取范围环（强化版）
    const range = CFG.GRAB_RANGE + DB.state.mods.grab;
    
    ctx.save();
    // 1. 填充一层极淡的底色，让范围有“场”的感觉
    ctx.fillStyle = `rgba(90, 240, 255, ${0.03 + pulse * 0.02})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, range, 0, Math.PI * 2);
    ctx.fill();

    // 2. 外圈实线（边界）
    ctx.strokeStyle = `rgba(90, 240, 255, ${0.4 + pulse * 0.2})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, range, 0, Math.PI * 2);
    ctx.stroke();

    // 3. 内圈滚动虚线（动态感）
    ctx.strokeStyle = `rgba(140, 250, 255, ${0.7 + pulse * 0.3})`;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([10, 15]);
    ctx.lineDashOffset = -t * 60; // 滚动速度加快
    ctx.beginPath();
    ctx.arc(p.x, p.y, range - 6, 0, Math.PI * 2);
    ctx.stroke();
    
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#0a2a3a';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 26, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI / 4 + Math.sin(t * 2.1) * 0.07);
    ctx.shadowColor = '#5ae8ff';
    ctx.shadowBlur = 26;

    const s = 15;
    ctx.fillStyle = 'rgba(150, 250, 255, 0.88)';
    ctx.beginPath();
    ctx.rect(-s, -s, s * 2, s * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    ctx.beginPath();
    ctx.rect(-s * 0.42, -s * 0.42, s * 0.84, s * 0.84);
    ctx.fill();
    ctx.restore();
  };

})(window.DB);