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
    chain:       { label: '⚡ 连锁闪电',   w: 100, h: 34, r: 24, damage: 12, effect: 'chain' }, // 新增
    code_slash: { label: '> 数据光刃', w: 160, h: 28, r: 24, damage: 20, effect: 'glitch' },
  };

  DB.HACKER_WEAPON_TYPES = {
    light_dart:  { label: '💀 木马飞刀', w: 100, h: 34, r: 24, damage: 10 },
    stun_chip:   { label: '🧬 宏病毒',   w: 100, h: 34, r: 26, damage: 13 },
    fire_shield: { label: '☣️ 勒索炸弹', w: 116, h: 38, r: 28, damage: 19 },
    link:        { label: '🕸️ 蠕虫牵引', w: 100, h: 34, r: 24, damage: 12,  effect: 'pull' },
    gravity:     { label: '☠️ 零日漏洞', w: 126, h: 42, r: 32, damage: 25, effect: 'earthquake' },
    blackhole:   { label: '🕳️ 断网协议', w: 116, h: 38, r: 28, damage: 15, effect: 'blackhole' }, // 新增
    chain:       { label: '🦠 病毒传染', w: 100, h: 34, r: 24, damage: 12, effect: 'chain' }, // 新增
    code_slash: { label: '> 代码碎片', w: 160, h: 28, r: 24, damage: 20, effect: 'glitch' },
  };

DB.ENEMY_CFG = {
  droneHp: 80,     // 前期大概需要砸 3 下
  wormHp: 120,      
  shieldHp: 200,    
  wormSpeed: 250,
  chargerHp: 160,  
  turretHp: 240,    
  splitterHp: 160  
};

DB.BOSS_CFG = {
  smallHp: 800,    // 第 5 波 Boss 大概 10 秒左右能打死
  bigHp: 2400,      // 第 10 波 Boss
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

    armor:    { label: 'DEF',   color: '#aaaaff', rarity: 'common', desc: '受到伤害减少 5%' },
    armor2:   { label: 'DEF++', color: '#ffaa00', rarity: 'rare',   desc: '受到伤害减少 12%' },

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

  // ==================== 关卡永久奖励系统 ====================
  // 通过第 N 关 → 永久解锁该关奖励（跨局保留、云端同步）
  DB.getLevelReward = function (level) {
    const cycle = Math.floor((level - 1) / 10); // 第几个 10 关周期
    const pos = ((level - 1) % 10) + 1;          // 本周期内第几关
    const tier = 1 + cycle * 0.5;                // 每周期数值 ×1.5

    switch (pos) {
      case 1:  return { type: 'grab',       value: 40 * tier,    icon: '🎯', label: '抓取范围', display: `+${Math.round(40 * tier)}` };
      case 2:  return { type: 'damage',     value: 0.10 * tier,  icon: '⚔️', label: '初始伤害', display: `+${Math.round(10 * tier)}%` };
      case 3:  return { type: 'initEnergy', value: 15 * tier,    icon: '⚡', label: '初始能量', display: `+${Math.round(15 * tier)}` };
      case 4:  return { type: 'moveSpeed',  value: 0.10 * tier,  icon: '🏃', label: '移动速度', display: `+${Math.round(10 * tier)}%` };
      case 5:  return { type: 'maxWeapons', value: 1,            icon: '🗡️', label: '武器上限', display: `+1` };
      case 6:  return { type: 'critRate',   value: 0.03 * tier,  icon: '💥', label: '暴击率',   display: `+${Math.round(3 * tier)}%`, extra: { critDmg: 0.10 * tier } };
      case 7:  return { type: 'chipRate',   value: 0.15 * tier,  icon: '💎', label: '芯片掉率', display: `+${Math.round(15 * tier)}%` };
      case 8:  return { type: 'critDmg',    value: 0.25 * tier,  icon: '🔥', label: '暴击伤害', display: `+${Math.round(25 * tier)}%` };
      case 9:  return { type: 'lifesteal',  value: 2 * tier,     icon: '🩸', label: '击杀吸血', display: `+${Math.round(2 * tier)}` };
      case 10: return { type: 'initEnergy', value: 30 * tier,    icon: '⚡', label: '初始能量', display: `+${Math.round(30 * tier)}`, extra: { damage: 0.05 * tier } };
    }
    return null;
  };

  DB.getTotalLevelRewards = function (maxLevelCleared) {
    const total = {
      grab: 0, damage: 0, initEnergy: 0, moveSpeed: 0,
      maxWeapons: 0, critRate: 0, chipRate: 0, critDmg: 0, lifesteal: 0
    };
    for (let lv = 1; lv <= maxLevelCleared; lv++) {
      const r = DB.getLevelReward(lv);
      if (!r) continue;
      total[r.type] = (total[r.type] || 0) + r.value;
      if (r.extra) {
        for (const k in r.extra) total[k] = (total[k] || 0) + r.extra[k];
      }
    }
    return total;
  };

  // 将"从已应用到新通关"的差额注入 state（切关时补新解锁的奖励）
  DB.applyLevelRewards = function (state, newCleared) {
    if (!state || !state.mods) return;
    const oldCleared = state.appliedLevelCleared || 0;
    const oldT = DB.getTotalLevelRewards(oldCleared);
    const newT = DB.getTotalLevelRewards(newCleared);

    state.mods.grab       = (state.mods.grab       || 0) + (newT.grab       - oldT.grab);
    state.mods.damage     = (state.mods.damage     || 0) + (newT.damage     - oldT.damage);
    state.mods.moveSpeed  = (state.mods.moveSpeed  || 0) + (newT.moveSpeed  - oldT.moveSpeed);
    state.mods.critRate   = (state.mods.critRate   || 0) + (newT.critRate   - oldT.critRate);
    state.mods.critDmg    = (state.mods.critDmg    || 0) + (newT.critDmg    - oldT.critDmg);
    state.mods.lifesteal  = (state.mods.lifesteal  || 0) + (newT.lifesteal  - oldT.lifesteal);

    // 绝对上限/掉率直接覆盖
    state.levelBonusWeapons = newT.maxWeapons;
    state.levelChipRate     = newT.chipRate;

    if (newT.initEnergy > oldT.initEnergy) {
      state.energy = Math.min(state.energyMax, (state.energy || 0) + (newT.initEnergy - oldT.initEnergy));
    }

    state.appliedLevelCleared = newCleared;
  };

})(window.DB);
