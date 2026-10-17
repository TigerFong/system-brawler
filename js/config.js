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

    SLINGSHOT: {
      MAX_PULL: 240,
      MIN_PULL: 34,
      MIN_LAUNCH: 420,
      MAX_LAUNCH: 2600,
      FULL_TENSION: 0.92
    }
  };

  DB.WEAPON_TYPES = {
    light_dart:  { label: '⚡ 杀毒探针',   w: 100, h: 34, r: 24, damage: 10 },
    stun_chip:   { label: '🛑 阻断芯片',   w: 100, h: 34, r: 26, damage: 13 },
    fire_shield: { label: '🛡️ 防火墙模块', w: 116, h: 38, r: 28, damage: 19 },
    link:        { label: '🔗 数据牵引',   w: 100, h: 34, r: 24, damage: 5,  effect: 'pull' },
    gravity:     { label: '🌐 重力模块',   w: 126, h: 42, r: 32, damage: 25, effect: 'earthquake' }
  };

  // 新增：黑客专属武器外观
  DB.HACKER_WEAPON_TYPES = {
    light_dart:  { label: '💀 木马飞刀', w: 100, h: 34, r: 24, damage: 10 },
    stun_chip:   { label: '🧬 宏病毒',   w: 100, h: 34, r: 26, damage: 13 },
    fire_shield: { label: '☣️ 勒索炸弹', w: 116, h: 38, r: 28, damage: 19 },
    link:        { label: '🕸️ 蠕虫牵引', w: 100, h: 34, r: 24, damage: 5,  effect: 'pull' },
    gravity:     { label: '☠️ 零日漏洞', w: 126, h: 42, r: 32, damage: 25, effect: 'earthquake' }
  };

  DB.ENEMY_CFG = {
    droneHp: 30,
    wormHp: 45,
    shieldHp: 80,
    wormSpeed: 150
  };

  DB.CHIP_TYPES = {
    damage: { label: 'DMG+', color: '#ff7a9a', desc: '武器伤害 +15%' },
    grab:   { label: 'RNG+', color: '#5ae8ff', desc: '抓取范围 +40' },
    launch: { label: 'SPD+', color: '#c08bff', desc: '弹射速度 +15%' },
    heal:   { label: 'HP+',  color: '#5ee6a8', desc: '恢复 20 点健康度' },
    max_hp: { label: 'MAX+', color: '#ffcc00', desc: '生命上限 +20 (并恢复)' }
  };

  DB.BOSS_CFG = {
    hp: 400,              
    maxHp: 400,
    radius: 60,
    fireInterval: 3.0,    
    summonInterval: 10.0  
  };

  DB.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  DB.circleRectHit = function (cx, cy, cr, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < cr * cr;
  };

})(window.DB);