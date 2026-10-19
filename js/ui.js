(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const dom   = DB.dom;

  /* ==================== 终端 ==================== */
  const SNIPPETS_DEFENDER = [
    { code: 'sys.extract("AntivirusDart", { dmg: 10 });',   type: 'light_dart' },
    { code: 'link.pull(target, { force: 1.0 });',           type: 'link' },
    { code: 'initStunProtocol("0x7F");',                    type: 'stun_chip'  },
    { code: 'shield.init({ radius: 360, dmg: 19 });',       type: 'fire_shield'    },
    { code: 'triggerEarthquake({ dmg: 25 });',              type: 'gravity' },
    { code: 'createSingularity({ radius: 200 });',          type: 'blackhole' },
    { code: 'arcLightning({ chain: 5 });',                  type: 'chain' },
    { code: 'await sys.compileModule(); // 模块实体化…',    type: 'light_dart' }
  ];

  const SNIPPETS_HACKER = [
    { code: 'inject("Trojan.exe", { payload: 0xDEAD });',   type: 'light_dart' },
    { code: 'worm.propagate(network, { speed: 100 });',     type: 'link' },
    { code: 'macro.execute("AutoRun");',                    type: 'stun_chip'  },
    { code: 'encryptFiles({ ransom: 1.0 });',               type: 'fire_shield'    },
    { code: 'exploitZeroDay({ target: "kernel" });',        type: 'gravity' },
    { code: 'triggerBlackout({ grid: "local" });',          type: 'blackhole' },
    { code: 'spreadVirus({ infection: 0.9 });',             type: 'chain' },
    { code: 'await payload.deploy(); // 病毒植入中…',       type: 'light_dart' }
  ];

  let snippetIdx  = 0;
  let charIdx     = 0;
  let currentLine = null;
  let typeTimer   = 0;

  // ===== 核心逻辑：手撕代码 =====
  function handleCodeGrab(e) {
    if (!e.target.closest) return;
    const line = e.target.closest('.term-line');
    
    if (!line || line === currentLine) return; 
    
    let textContent = line.textContent || '';
    if (textContent.length < 3) return;

    // 【修复】如果场上有旧的代码武器，直接销毁它，给新的腾位置
    const oldCode = DB.weapons.find(w => w.type === 'code_slash' && !w.dead);
    if (oldCode) {
      DB.spawnParticles(oldCode.x, oldCode.y, 15, '#00ffcc', 300);
      DB.removeWeapon(oldCode);
    }
    
    textContent = textContent.replace(/^>\s*/, ''); 
    if (textContent.length > 16) textContent = textContent.substring(0, 14) + '..';

    line.remove(); 
    if (e.stopPropagation) e.stopPropagation(); 
    if (e.preventDefault) e.preventDefault();

    // 【修改】让代码武器也能吃满波次加成
    const waveScale = Math.pow(1.35, state.wave - 1); // 1.35 略低于怪物膨胀，防止秒杀一切
    const dynamicDmg = (20 + textContent.length * 3.5) * waveScale;
    const w = DB.spawnWeapon('code_slash', textContent, dynamicDmg);
    
    if (w) {
      w.x = DB.player.x;
      w.y = DB.player.y;
      w.warning = 0.001; 
      
      w.held = true;
      w.thrown = false;
      w.vx = 0; w.vy = 0; w.rotV = 0;
      
      if (state.mode !== 'hacker') {
        w.anchorX = w.x;
        w.anchorY = w.y;
      }
      
      DB.heldWeapon = w;
      DB.mouse.down = true; 
      
      DB.mouse.x = w.x;
      DB.mouse.y = w.y;
      
      DB.spawnParticles(w.x, w.y, 20, '#00ffcc', 400);
      DB.sfx.chip();
    }
  }

  dom.termLines.addEventListener('mousedown', handleCodeGrab);
  dom.termLines.addEventListener('touchstart', handleCodeGrab, { passive: false });


  /* ==================== 终端打字机逻辑 ==================== */
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

    const snippets = state.mode === 'hacker' ? SNIPPETS_HACKER : SNIPPETS_DEFENDER;
    const text = snippets[snippetIdx].code;
    const step = 1 / CFG.CPS;

    while (typeTimer >= step && charIdx < text.length) {
      typeTimer -= step;
      charIdx++;
      currentLine.textContent = text.slice(0, charIdx);
    }

    if (charIdx >= text.length) {
      DB.spawnWeapon(snippets[snippetIdx].type); 
      snippetIdx = (snippetIdx + 1) % snippets.length;
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

    const energyText = document.getElementById('energy-text');
    const energyBarFill = document.getElementById('energy-bar-fill');
    if (energyText && energyBarFill) {
      const e = Math.floor(state.energy);
      energyText.textContent = `${e} / ${state.energyMax}`;
      energyBarFill.style.width = `${(state.energy / state.energyMax) * 100}%`;
      
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
    
    // ===== 移动端虚拟按钮状态同步 =====
    const mobSkill = document.querySelector('.skill-btn');
    if (mobSkill) {
      const isReady = state.skillCd <= 0;
      mobSkill.style.color = isReady ? '#ffcc00' : '#777';
      mobSkill.style.borderColor = isReady ? '#ffcc00' : '#555';
      mobSkill.style.boxShadow = isReady ? '0 0 15px rgba(255,204,0,0.5)' : 'none';
      mobSkill.textContent = isReady ? '技能' : Math.ceil(state.skillCd) + 's';
    }

    const mobUlts = document.querySelectorAll('.ult-btn');
    if (mobUlts.length > 0) {
      const ultReady = state.energy >= state.energyMax;
      mobUlts.forEach(btn => {
        if (ultReady) {
          btn.style.color = '#dff3ff';
          btn.style.borderColor = '#5ae8ff';
          btn.style.background = 'rgba(90,240,255,0.3)'; 
          btn.style.boxShadow = '0 0 15px rgba(90,240,255,0.8)';
        } else {
          btn.style.color = '#777';
          btn.style.borderColor = '#555';
          btn.style.background = 'rgba(0,0,0,0.6)'; 
          btn.style.boxShadow = 'none';
        }
      });
    }
  };

})(window.DB);