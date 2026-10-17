(function (DB) {
  'use strict';

  const CFG = DB.CFG;

  DB.state = {
    t: 0,
    shake: 0,
    hitstop: 0,
    flash: 0,
    damageFlash: 0,
    energy: 0,
    energyMax: 100,
    hp: 100,
    hpMax: 100,
    wave: 1,
    waveBreakT: 0,

    scene: 'title',        // 'title' | 'playing' | 'gameover'
    gameOverLock: 0,       // 死亡后输入冷却，防误触重开

    mods: { damage: 0, grab: 0, launch: 0 }
  };

  DB.player = {
    x: CFG.W * 0.34, y: 400,
    vx: 0, vy: 0,
    r: 16,
    accel: 4600, maxSpeed: 540, friction: 11
  };

  DB.weapons   = [];
  DB.particles = [];

  DB.keys  = new Set();
  DB.mouse = { x: CFG.W * 0.5, y: 400, down: false };
  DB.trail = [];

  DB.heldWeapon = null;

  DB.uid = 0;
  DB.nextUid = function () { return ++DB.uid; };

})(window.DB);