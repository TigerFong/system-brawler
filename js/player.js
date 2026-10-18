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

    // 【新增】移速芯片加成，封顶 +100%
    const moveMul = Math.min(2.0, 1 + (state.mods.moveSpeed || 0));
    const effAccel = p.accel * moveMul;
    const effMaxSpeed = p.maxSpeed * moveMul;

    p.vx += ax * effAccel * dt;
    p.vy += ay * effAccel * dt;

    const fr = Math.exp(-p.friction * dt);
    p.vx *= fr;
    p.vy *= fr;

    const sp = Math.hypot(p.vx, p.vy);
    if (sp > effMaxSpeed) {
      const k = effMaxSpeed / sp;
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
    const isHacker = state.mode === 'hacker';
    
    // 猩红色 / 青色
    const mainColor = isHacker ? '255, 90, 122' : '80, 230, 255'; 
    const shadowColor = isHacker ? '#ff5a7a' : '#5ae8ff';

    // 外发光
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 76);
    g.addColorStop(0, `rgba(${mainColor}, ${0.34 + pulse * 0.16})`);
    g.addColorStop(0.45, `rgba(${mainColor}, 0.10)`);
    g.addColorStop(1, `rgba(${mainColor}, 0)`);
    ctx.fillStyle = g;
    ctx.fillRect(p.x - 76, p.y - 76, 152, 152);

    // ===== 抓取范围环（明显增强版） =====
    const range = CFG.GRAB_RANGE + (state.mods ? state.mods.grab : 0);
    
    ctx.save();
    // 1. 内圈极淡底色
    ctx.fillStyle = `rgba(${mainColor}, ${0.03 + pulse * 0.02})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, range, 0, Math.PI * 2);
    ctx.fill();

    // 2. 外圈虚线边界（更亮）
    ctx.strokeStyle = `rgba(${mainColor}, ${0.4 + pulse * 0.3})`;
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 12]);
    ctx.lineDashOffset = -t * 40;
    ctx.beginPath();
    ctx.arc(p.x, p.y, range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 地面投影
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = isHacker ? '#3a0a1a' : '#0a2a3a';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 26, 22, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 菱形本体
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(Math.PI / 4 + Math.sin(t * 2.1) * 0.07);
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = 26;

    const s = 15;
    ctx.fillStyle = isHacker ? 'rgba(255, 150, 170, 0.88)' : 'rgba(150, 250, 255, 0.88)';
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