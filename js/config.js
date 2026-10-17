window.DB = window.DB || {};

(function (DB) {
  'use strict';

  DB.CFG = {
    W: 1280,
    H: 720,
    GROUND_Y: 580,
    PLAY_TOP: 130,

    GRAVITY: 1500,
    AIR_DRAG: 1.1,
    GROUND_FRICTION: 7.0,
    BOUNCE: 0.42,
    WALL_BOUNCE: 0.5,

    GRAB_RANGE: 300,
    GRAB_PICK_R: 30,
    MAX_WEAPONS: 5,
    WEAPON_LIFETIME: 10,
    SPAWN_WARN: 0.5,

    HP_PIPS: 5,
    CPS: 42,

    // ============ 弹弓手感（防守方） ============
    SLINGSHOT: {
      MAX_PULL: 240,        // 最大有效拉伸距离（皮兜拉到底）
      MIN_PULL: 34,         // 低于此拉伸视为轻放，不弹射
      MIN_LAUNCH: 420,      // 最小弹射速度
      MAX_LAUNCH: 2600,     // 最大弹射速度
      FULL_TENSION: 0.92    // 拉伸达到 MAX_PULL 的此比例即视为满张力
    }
  };

  DB.WEAPON_TYPES = {
    light_dart:  { label: '⚡ 杀毒探针',   w: 100, h: 34, r: 24, damage: 10 },
    stun_chip:   { label: '🛑 阻断芯片',   w: 100, h: 34, r: 26, damage: 13 },
    fire_shield: { label: '🛡️ 防火墙模块', w: 116, h: 38, r: 28, damage: 19 }
  };

    /* ---------- 芯片配置 ---------- */
  DB.CHIP_TYPES = {
    damage: { label: 'DMG+', color: '#ff7a9a', desc: '武器伤害 +15%' },
    grab:   { label: 'RNG+', color: '#5ae8ff', desc: '抓取范围 +40' },
    launch: { label: 'SPD+', color: '#c08bff', desc: '弹射速度 +15%' }
  };

  DB.clamp = function (v, lo, hi) {
    return v < lo ? lo : (v > hi ? hi : v);
  };

  DB.circleRectHit = function (cx, cy, cr, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < cr * cr;
  };

})(window.DB);