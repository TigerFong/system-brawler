(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const dom   = DB.dom;

  /* ==================== 终端 ==================== */
  const SNIPPETS = [
    { code: 'sys.extract("AntivirusDart", { dmg: 10 });',   type: 'light_dart' },
    { code: 'link.pull(target, { force: 1.0 });',           type: 'link' },
    { code: 'initStunProtocol("0x7F");',                    type: 'stun_chip'  },
    { code: 'shield.init({ radius: 360, dmg: 19 });',       type: 'fire_shield'    },
    { code: 'triggerEarthquake({ dmg: 25 });',              type: 'gravity' },
    { code: 'if (virus.hp <= 0) system.purge();',           type: 'light_dart'    },
    { code: 'await sys.compileModule(); // 模块实体化…',    type: 'light_dart' }
  ];

  let snippetIdx  = 0;
  let charIdx     = 0;
  let currentLine = null;
  let typeTimer   = 0;

  DB.updateTerminal = function (dt) {
    typeTimer += dt;

    if (!currentLine) {
      if (typeTimer < 0) return;

      currentLine = document.createElement('div');
      currentLine.className = 'term-line';
      dom.termLines.appendChild(currentLine);
      charIdx = 0;

      while (dom.termLines.children.length > 6) {
        dom.termLines.removeChild(dom.termLines.firstChild);
      }
    }

    const text = SNIPPETS[snippetIdx].code;
    const step = 1 / CFG.CPS;

    while (typeTimer >= step && charIdx < text.length) {
      typeTimer -= step;
      charIdx++;
      currentLine.textContent = text.slice(0, charIdx);
    }

    if (charIdx >= text.length) {
      DB.spawnWeapon(SNIPPETS[snippetIdx].type); // 编译完成 → 产出对应类型武器
      snippetIdx = (snippetIdx + 1) % SNIPPETS.length;
      currentLine = null;
      typeTimer = -0.34;
    }
  };

  /* ==================== HUD ==================== */
  let pipEls   = [];
  let eslotEls = [];

  DB.buildHUD = function () {
    pipEls = [];
    for (let i = 0; i < CFG.HP_PIPS; i++) {
      const d = document.createElement('div');
      d.className = 'pip';
      dom.hpPipsEl.appendChild(d);
      pipEls.push(d);
    }

    eslotEls = [];
    for (let i = 1; i <= 4; i++) {
      const d = document.createElement('div');
      d.className = 'eslot';
      d.textContent = String(i);
      dom.energySlotsEl.appendChild(d);
      eslotEls.push(d);
    }
  };

  DB.updateHUD = function () {
    const ratio  = state.hp / state.hpMax;
    const filled = Math.ceil(ratio * CFG.HP_PIPS);
    for (let i = 0; i < pipEls.length; i++) {
      pipEls[i].classList.toggle('on', i < filled);
    }

    const hpTextEl = document.getElementById('hp-text');
    if (hpTextEl) {
      hpTextEl.textContent = `${Math.ceil(state.hp)} / ${state.hpMax}`;
      hpTextEl.style.color = state.hpMax > 100 ? '#ffcc00' : '#5ae8ff';
    }

    const ready = state.energy >= state.energyMax;
    for (const el of eslotEls) {
      el.classList.toggle('ready', ready);
    }

    // ===== 新增：更新能量进度条 =====
    const energyText = document.getElementById('energy-text');
    const energyBarFill = document.getElementById('energy-bar-fill');
    if (energyText && energyBarFill) {
      const e = Math.floor(state.energy);
      energyText.textContent = `${e} / ${state.energyMax}`;
      energyBarFill.style.width = `${(state.energy / state.energyMax) * 100}%`;
      
      // 满了的时候进度条变金色闪烁
      if (ready) {
        energyBarFill.style.background = '#ffcc00';
        energyBarFill.style.boxShadow = '0 0 15px #ffcc00';
        energyText.style.color = '#ffcc00';
      } else {
        energyBarFill.style.background = '#c08bff';
        energyBarFill.style.boxShadow = '0 0 10px #c08bff';
        energyText.style.color = '#c08bff';
      }
    }
  };

})(window.DB);