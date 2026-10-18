(function (DB) {
  'use strict';

  const CFG = DB.CFG;

  DB.state = {
    t: 0, shake: 0, hitstop: 0, flash: 0, damageFlash: 0,
    energy: 0, energyMax: 100, hp: 100, hpMax: 100,
    wave: 1, waveBreakT: 0, gameOverLock: 0, scene: 'title', mode: 'defender',
    mods: { damage: 0, grab: 0, launch: 0, lifesteal: 0, moveSpeed: 0, critRate: 0, critDmg: 0 },
    qte: { active: false, timer: 0, sequence: "", inputIndex: 0 },
    combo: 0, comboTimer: 0, maxCombo: 0, score: 0,
    
    camera: { x: 0, y: 0 },

    // ===== Boss 狂暴化特效计时器 =====
    bossEnrageFlash: 0,   
    bossEnrageTextT: 0,   
    
    // ===== 阵营专属技能状态 =====
    skillCd: 0,       // 技能冷却
    skillActiveT: 0   // 技能持续时间
  };

  DB.player = {
    x: CFG.W * 0.34,
    y: 400,
    vx: 0,
    vy: 0,
    r: 16,
    accel: 4600,
    maxSpeed: 540,
    friction: 11
  };

  DB.weapons   = [];
  DB.particles = [];
  DB.boss      = null;

  DB.keys  = new Set();
  DB.mouse = { x: CFG.W * 0.5, y: 400, down: false };
  DB.trail = [];

  DB.floaters  = []; 
  DB.heldWeapon = null;

  DB.uid = 0;
  DB.nextUid = function () { return ++DB.uid; };

})(window.DB);