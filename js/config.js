window.DB = window.DB || {};

(function (DB) {
  'use strict';

  DB.CFG = {
    W: 2560,            // 扩大世界宽度（原 1280）
    H: 1440,            // 扩大世界高度（原 720）
    VIEW_W: 1280,       // 摄像机视口宽度
    VIEW_H: 720,        // 摄像机视口高度
    GROUND_Y: 1200,     // 地面线拉低
    PLAY_TOP: 100,      // 天花板拉高

    GRAVITY: 1500,
    AIR_DRAG: 1.1,
    GROUND_FRICTION: 7.0,
    BOUNCE: 0.42,
    WALL_BOUNCE: 0.5,

    GRAB_RANGE: 400,    // 世界变大，抓取范围稍微加大
    GRAB_PICK_R: 30,
    MAX_WEAPONS: 5,
    WEAPON_LIFETIME: 10,
    SPAWN_WARN: 0.5,

    HP_PIPS: 5,
    CPS: 42,

    SLINGSHOT: {
      MAX_PULL: 300,
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
    gravity:     { label: '🌐 重力模块',   w: 126, h: 42, r: 32, damage: 25, effect: 'earthquake' },
    blackhole:   { label: '🌀 黑洞发生器', w: 116, h: 38, r: 28, damage: 15, effect: 'blackhole' }, // 新增
    chain:       { label: '⚡ 连锁闪电',   w: 100, h: 34, r: 24, damage: 12, effect: 'chain' } // 新增
  };

  DB.HACKER_WEAPON_TYPES = {
    light_dart:  { label: '💀 木马飞刀', w: 100, h: 34, r: 24, damage: 10 },
    stun_chip:   { label: '🧬 宏病毒',   w: 100, h: 34, r: 26, damage: 13 },
    fire_shield: { label: '☣️ 勒索炸弹', w: 116, h: 38, r: 28, damage: 19 },
    link:        { label: '🕸️ 蠕虫牵引', w: 100, h: 34, r: 24, damage: 5,  effect: 'pull' },
    gravity:     { label: '☠️ 零日漏洞', w: 126, h: 42, r: 32, damage: 25, effect: 'earthquake' },
    blackhole:   { label: '🕳️ 断网协议', w: 116, h: 38, r: 28, damage: 15, effect: 'blackhole' }, // 新增
    chain:       { label: '🦠 病毒传染', w: 100, h: 34, r: 24, damage: 12, effect: 'chain' } // 新增
  };

DB.ENEMY_CFG = {
  droneHp: 240,    
  wormHp: 360,     
  shieldHp: 700,   
  wormSpeed: 300,
  chargerHp: 500,  
  turretHp: 800,   
  splitterHp: 440  
};

DB.BOSS_CFG = {
  smallHp: 9000,  
  bigHp: 27000,    
  radius: 80,
  fireInterval: 2.0,    
  summonInterval: 8.0  
};

  DB.CHIP_TYPES = {
    // ===== Common（白）：基础数值 =====
    damage:   { label: 'DMG+',  color: '#ff7a9a', rarity: 'common', desc: '武器伤害 +5%' },
    grab:     { label: 'RNG+',  color: '#5ae8ff', rarity: 'common', desc: '抓取范围 +15' },
    launch:   { label: 'SPD+',  color: '#c08bff', rarity: 'common', desc: '弹射速度 +5%' },
    heal:     { label: 'HP+',   color: '#5ee6a8', rarity: 'common', desc: '恢复 15 点健康度' },
    max_hp:   { label: 'MAX+',  color: '#ffcc00', rarity: 'common', desc: '生命上限 +10 (并恢复)' },
    move:     { label: 'MOV',   color: '#7aff9a', rarity: 'common', desc: '移动速度 +6%' },   // 新增

    // ===== Rare（蓝）：更强数值 =====
    damage2:  { label: 'DMG++', color: '#7aaaff', rarity: 'rare',   desc: '武器伤害 +12%' },
    lifesteal:{ label: 'LEECH', color: '#ff5a7a', rarity: 'rare',   desc: '击杀恢复 3 HP' },
    move2:    { label: 'MOV+',  color: '#66ccff', rarity: 'rare',   desc: '移动速度 +12%' },  // 新增

    // ===== Epic（紫）：组合效果 =====
    bloodlust:{ label: 'BL+',   color: '#d08bff', rarity: 'epic',   desc: '伤害 +10% 且击杀恢复 5 HP' },
    move3:    { label: 'SWIFT', color: '#d08bff', rarity: 'epic',   desc: '移速 +20% 且抓取范围 +20' },  // 新增

    // ===== 暴击专属芯片 =====
    crit_dmg:  { label: 'CRIT', color: '#ffcc00', rarity: 'common', desc: '暴击伤害 +15%' },
    crit_rate: { label: 'CRIT%', color: '#ffaa00', rarity: 'rare', desc: '暴击率 +5% · 暴伤 +10%' },
    lethal:    { label: 'LETHAL', color: '#ff2a4a', rarity: 'epic', desc: '暴击率 +10% · 暴伤 +30%' }
  };
  
  DB.SMALL_BOSS_TYPES = ['bsod', 'firewall', 'vampire'];
  DB.BIG_BOSS_TYPES = ['manager', 'trojan'];

  DB.clamp = function (v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); };
  DB.circleRectHit = function (cx, cy, cr, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < cr * cr;
  };

})(window.DB);
