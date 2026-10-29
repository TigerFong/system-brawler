(function (DB) {
  'use strict';

  const CFG   = DB.CFG;
  const state = DB.state;
  const dom   = DB.dom;
  const W     = CFG.W;
  const H     = CFG.H;
  const VW    = CFG.VIEW_W;
  const VH    = CFG.VIEW_H;

  let highestScore = 0;
  let sysPoints = 0;
  let cloudToken = localStorage.getItem('sys_auth_token');
  let currentUsername = localStorage.getItem('sys_auth_username') || ''; // 新增
  
  
  const API_BASE = 'https://system-brawler-api.onrender.com/api';

  const defaultUpgrades = { hp:0, energy:0, chip:0, weapon:0, duration:0, damage:0, crit:0 };
  DB.upgrades = { ...defaultUpgrades };

  async function syncDataFromCloud() {
    if (!cloudToken) return;
    try {
      const res = await fetch(`${API_BASE}/save`, { headers: { 'Authorization': `Bearer ${cloudToken}` } });
      if (!res.ok) throw new Error('Token invalid');
      const data = await res.json();
      sysPoints = data.points;
      highestScore = data.highscore;
      DB.upgrades = data.upgrades;
      localStorage.setItem('sys_auth_token', cloudToken);
    } catch(e) {
      console.log('登录失效', e);
      cloudToken = null;
      localStorage.removeItem('sys_auth_token');
    }
  }

  async function saveDataToCloud() {
    if (!cloudToken) return;
    try {
      await fetch(`${API_BASE}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${cloudToken}` },
        body: JSON.stringify({ points: sysPoints, upgrades: DB.upgrades, highscore: highestScore })
      });
    } catch(e) { console.error('云端保存失败', e); }
  }

  /* ==================== 音效 ==================== */
  DB.sfx = (function () {
    let ctx = null;
    function getCtx() { if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } } return ctx; }
    function tone(freq, dur, type, vol, slide) {
      const ac = getCtx(); if (!ac) return;
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, ac.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), ac.currentTime + dur);
      g.gain.setValueAtTime(vol || 0.06, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + dur);
    }
    function noise(dur, vol) {
      const ac = getCtx(); if (!ac) return;
      const len = Math.floor(ac.sampleRate * dur);
      const buf = ac.createBuffer(1, len, ac.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource(), g = ac.createGain();
      src.buffer = buf; g.gain.setValueAtTime(vol || 0.05, ac.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
      src.connect(g); g.connect(ac.destination); src.start();
    }
    return {
      grab:  () => tone(520, 0.08, 'sine', 0.04, 260), throw: () => { tone(180, 0.12, 'sawtooth', 0.05, -120); noise(0.06, 0.03); },
      hit:   () => { noise(0.08, 0.06); tone(880, 0.05, 'square', 0.03, -400); }, hurt:  () => { tone(220, 0.2, 'sawtooth', 0.06, -140); noise(0.1, 0.04); },
      chip:  () => tone(1200, 0.06, 'sine', 0.035, 400), clear: () => { tone(440, 0.12, 'sine', 0.05, 220); tone(660, 0.18, 'sine', 0.04, 220); },
      start: () => { tone(330, 0.08, 'sine', 0.05, 220); tone(660, 0.14, 'sine', 0.045, 300); }, error: () => { tone(150, 0.15, 'sawtooth', 0.05, -50); noise(0.1, 0.05); },
      tension:     () => { tone(440, 0.08, 'triangle', 0.045, 110); }, fullTension: () => { tone(880, 0.07, 'sine', 0.05, 220); tone(1320, 0.11, 'sine', 0.035, 100); }
    };
  })();

  /* ==================== 背景网格 ==================== */
  const gridCanvas = document.createElement('canvas');
  gridCanvas.width  = W; gridCanvas.height = H;
  function initBackground() {
    const g = gridCanvas.getContext('2d');
    const GRID = 64;
    g.clearRect(0, 0, W, H);
    g.lineWidth = 1; g.strokeStyle = 'rgba(120, 90, 255, 0.085)';
    g.beginPath();
    for (let x = 0; x <= W; x += GRID) { g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, H); }
    for (let y = 0; y <= H; y += GRID) { g.moveTo(0, y + 0.5); g.lineTo(W, y + 0.5); }
    g.stroke();
    g.fillStyle = 'rgba(140, 110, 255, 0.20)';
    for (let x = 0; x <= W; x += GRID) for (let y = 0; y <= H; y += GRID) g.fillRect(x - 1, y - 1, 2, 2);
    const grad = g.createLinearGradient(0, CFG.GROUND_Y - 26, 0, CFG.GROUND_Y + 8);
    grad.addColorStop(0, 'rgba(90, 240, 255, 0)'); grad.addColorStop(0.7, 'rgba(90, 240, 255, 0.14)'); grad.addColorStop(1, 'rgba(90, 240, 255, 0)');
    g.fillStyle = grad; g.fillRect(0, CFG.GROUND_Y - 26, W, 34);
    g.strokeStyle = 'rgba(90, 240, 255, 0.30)'; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(0, CFG.GROUND_Y + 0.5); g.lineTo(W, CFG.GROUND_Y + 0.5); g.stroke();
  }

  /* ==================== 拉弓张力 vignette ==================== */
  let vignetteEl = null;
  function initVignette() {
    vignetteEl = document.createElement('div');
    vignetteEl.style.cssText = 'position:absolute;inset:0;z-index:19;pointer-events:none;opacity:0;transition:opacity 0.12s ease-out;';
    vignetteEl.style.boxShadow = 'inset 0 0 140px rgba(255, 80, 80, 0.78)';
    dom.stage.appendChild(vignetteEl);
  }

  /* ==================== 标题画面 ==================== */
  let currentMode = 'defender';
  const RULES_DEFENDER = `
    <div style="color:#5ae8ff; font-weight:bold; margin-bottom:16px; border-bottom:1px dashed rgba(90,240,255,0.3); padding-bottom:8px; font-size:16px; letter-spacing:1px;">🛡️ 安全卫士 · 完整指南</div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px;">
      <!-- 左列 -->
      <div>
        <div style="color:#5ae8ff; font-size:12px; letter-spacing:2px; font-weight:bold; margin-bottom:10px; opacity:.85;">// 操作</div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">WASD</span><span class="txt">移动走位，躲避弹幕</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">鼠标</span><span class="txt">抓取武器，按住向后拉弓，松手弹射。拉得越满弹得越快</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">SHIFT</span><span class="txt">全息反射盾：1.5 秒内减伤 80%，反伤周围敌人（冷却 5 秒）</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">1-4</span><span class="txt">能量满时释放大招；Boss 瘫痪时输入覆盖码处决</span></div>
        
        <div style="color:#5ae8ff; font-size:12px; letter-spacing:2px; font-weight:bold; margin-top:20px; margin-bottom:10px; opacity:.85;">// 核心循环</div>
        <div class="rule-row"><span class="key" style="flex:0 0 64px;">流程</span><span class="txt">终端打字产出 → 抓取武器 → 拉弓 → 命中敌人 → 击杀掉芯片 → 拾取变强 → 守住波次</span></div>

        <div style="color:#5ae8ff; font-size:12px; letter-spacing:2px; font-weight:bold; margin-top:20px; margin-bottom:10px; opacity:.85;">// 敌人 & Boss</div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">种类</span><span class="txt">无人机 / 蠕虫 / 护盾兵 / 炮塔 / 冲锋者 / 裂变体，各有不同攻击模式</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">Boss</span><span class="txt">第 5 / 15 波小 Boss，第 10 / 20 波大 Boss；血量降到 <b>25%</b> 会狂暴</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">QTE</span><span class="txt">打空 Boss 血条触发覆盖码，输入 <b>6 / 8</b> 位即可处决（满血满能量 + 爆芯片）</span></div>
      </div>

      <!-- 右列 -->
      <div>
        <div style="color:#5ae8ff; font-size:12px; letter-spacing:2px; font-weight:bold; margin-bottom:10px; opacity:.85;">// 武器 · 8 种</div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">⚡ 探针</span><span class="txt">直线穿透，最多穿 <b>3</b> 个敌人，每个都掉血</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">🛑 阻断</span><span class="txt">命中后目标瘫痪 <b>1.5 秒</b>（禁动 + 禁火）</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">🛡️ 火墙</span><span class="txt">落地生成矩形火墙（200×70），持续 3 秒，触碰掉血</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">🔗 牵引</span><span class="txt">命中后把 <b>250</b> 范围内的敌人吸向命中点聚拢</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">🌐 重力</span><span class="txt">落地生成重力井（半径 280，持续 4 秒），吸附 + 掉血</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">🌀 黑洞</span><span class="txt">落地生成黑洞（半径 260，持续 3 秒），强吸 + 掉血</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">⚡ 闪电</span><span class="txt">命中后闪电跳 <b>5</b> 次，每次伤害递减 15%</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">&gt; 光刃</span><span class="txt">回旋镖：飞出 1.2 秒后飞回玩家，去程 + 回程都造成伤害</span></div>

        <div style="color:#5ae8ff; font-size:12px; letter-spacing:2px; font-weight:bold; margin-top:20px; margin-bottom:10px; opacity:.85;">// 大招 · 4 种</div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">[1]</span><span class="txt"><b>代码暴雨</b> —— 全屏下落弹幕，大量伤害</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">[2]</span><span class="txt"><b>时间凝滞</b> —— 清空子弹，冻结所有敌人 3 秒</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">[3]</span><span class="txt"><b>系统重载</b> —— 恢复 50% 最大生命</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">[4]</span><span class="txt"><b>核心熔毁</b> —— 献祭所有武器原地专属爆炸，最后中心核爆</span></div>
      </div>
    </div>

    <div style="margin-top: 24px; border-top: 1px dashed rgba(90,240,255,0.3); padding-top: 16px;">
      <div style="color:#5ae8ff; font-size:12px; letter-spacing:2px; font-weight:bold; margin-bottom:10px; opacity:.85;">// 芯片 · 3 档</div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
        <div class="rule-row"><span class="key" style="flex:0 0 64px; color:#dff3ff; border-color:rgba(220,240,255,.35);">白·常见</span><span class="txt" style="font-size:11px;">伤害 +5% / 抓取 +15 / 弹射 +5% / 恢复 15HP / 上限 +10 / 移速 +6% / 暴伤 +15%</span></div>
        <div class="rule-row"><span class="key" style="flex:0 0 64px; color:#7aaaff; border-color:rgba(122,170,255,.5);">蓝·稀有</span><span class="txt" style="font-size:11px;">伤害 +12% / 击杀吸血 +3 / 移速 +12% / 暴击率 +5% + 暴伤 +10%</span></div>
        <div class="rule-row"><span class="key" style="flex:0 0 64px; color:#d08bff; border-color:rgba(208,139,255,.5);">紫·史诗</span><span class="txt" style="font-size:11px;">伤害 +10% + 吸血 +5 / 移速 +20% + 抓取 +20 / 暴击率 +10% + 暴伤 +30%</span></div>
      </div>
    </div>
  `;
  const RULES_HACKER = `
    <div style="color:#ff5a7a; font-weight:bold; margin-bottom:16px; border-bottom:1px dashed rgba(255,90,122,0.3); padding-bottom:8px; font-size:16px; letter-spacing:1px;">😈 黑客入侵 · 完整指南</div>

    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 24px;">
      <!-- 左列 -->
      <div>
        <div style="color:#ff5a7a; font-size:12px; letter-spacing:2px; font-weight:bold; margin-bottom:10px; opacity:.85;">// 操作</div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">WASD</span><span class="txt">移动走位，躲避杀毒软件</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">鼠标</span><span class="txt">抓取病毒，按住瞄准，松手瞬发狙击（命中第一个敌人）</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">SHIFT</span><span class="txt">病毒引爆：清空全屏子弹，感染所有敌人连环爆炸（冷却 6 秒）</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">1-4</span><span class="txt">能量满时释放大招；Boss 瘫痪时输入覆盖码处决</span></div>
        
        <div style="color:#ff5a7a; font-size:12px; letter-spacing:2px; font-weight:bold; margin-top:20px; margin-bottom:10px; opacity:.85;">// 核心循环</div>
        <div class="rule-row"><span class="key" style="flex:0 0 64px;">流程</span><span class="txt">终端打字产出 → 抓取病毒 → 瞄准狙击（瞬时命中）→ 击杀掉芯片 → 拾取变强 → 守住波次</span></div>

        <div style="color:#ff5a7a; font-size:12px; letter-spacing:2px; font-weight:bold; margin-top:20px; margin-bottom:10px; opacity:.85;">// 敌人 & Boss</div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">种类</span><span class="txt">无人机 / 蠕虫 / 护盾兵 / 炮塔 / 冲锋者 / 裂变体，各有不同攻击模式</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">Boss</span><span class="txt">第 5 / 15 波小 Boss，第 10 / 20 波大 Boss；血量降到 <b>25%</b> 会狂暴</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">QTE</span><span class="txt">打空 Boss 血条触发覆盖码，输入 <b>6 / 8</b> 位即可处决（满血满能量 + 爆芯片）</span></div>
      </div>

      <!-- 右列 -->
      <div>
        <div style="color:#ff5a7a; font-size:12px; letter-spacing:2px; font-weight:bold; margin-bottom:10px; opacity:.85;">// 武器 · 8 种</div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">💀 飞刀</span><span class="txt">一次射出 <b>3</b> 道平行激光，每道独立命中</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">🧬 宏病毒</span><span class="txt">弹射激光：命中后自动跳向最近敌人，最多弹 <b>3</b> 次</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">☣️ 勒索</span><span class="txt">无需瞄准敌人，直接在鼠标位置范围爆炸（180×180）</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">🕸️ 蠕虫</span><span class="txt">射出持续 <b>1.2 秒</b> 激光柱，路径上的敌人持续受伤 + 减速</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">☠️ 零日</span><span class="txt">命中后标记敌人（易伤 + 减速），1 秒后从玩家位置发射追踪弹</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">🕳️ 断网</span><span class="txt"><b>5</b> 道扇形激光同时射出，命中的敌人禁火 2 秒</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">🦠 传染</span><span class="txt">命中后闪电链向 <b>5</b> 个敌人跳跃，被感染目标死亡时爆发</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">&gt; 碎片</span><span class="txt">从玩家身体 <b>8</b> 方向发射短程激光（近距清屏）</span></div>

        <div style="color:#ff5a7a; font-size:12px; letter-spacing:2px; font-weight:bold; margin-top:20px; margin-bottom:10px; opacity:.85;">// 大招 · 4 种</div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">[1]</span><span class="txt"><b>逻辑炸弹</b> —— 全屏敌人受击并附加易伤 6 秒</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">[2]</span><span class="txt"><b>冻结协议</b> —— 清空子弹，所有敌人减速 4 秒</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">[3]</span><span class="txt"><b>紧急重启</b> —— 恢复 40% 最大生命 + 补 3 把武器</span></div>
        <div class="rule-row" style="margin-bottom:8px;"><span class="key" style="flex:0 0 64px;">[4]</span><span class="txt"><b>万剑归宗</b> —— 未部署武器变追踪导弹；已部署阵地核爆</span></div>
      </div>
    </div>

    <div style="margin-top: 24px; border-top: 1px dashed rgba(255,90,122,0.3); padding-top: 16px;">
      <div style="color:#ff5a7a; font-size:12px; letter-spacing:2px; font-weight:bold; margin-bottom:10px; opacity:.85;">// 芯片 · 3 档</div>
      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
        <div class="rule-row"><span class="key" style="flex:0 0 64px; color:#ffd8e2; border-color:rgba(255,216,226,.35);">白·常见</span><span class="txt" style="font-size:11px;">伤害 +5% / 抓取 +15 / 弹射 +5% / 恢复 15HP / 上限 +10 / 移速 +6% / 暴伤 +15%</span></div>
        <div class="rule-row"><span class="key" style="flex:0 0 64px; color:#7aaaff; border-color:rgba(122,170,255,.5);">蓝·稀有</span><span class="txt" style="font-size:11px;">伤害 +12% / 击杀吸血 +3 / 移速 +12% / 暴击率 +5% + 暴伤 +10%</span></div>
        <div class="rule-row"><span class="key" style="flex:0 0 64px; color:#d08bff; border-color:rgba(208,139,255,.5);">紫·史诗</span><span class="txt" style="font-size:11px;">伤害 +10% + 吸血 +5 / 移速 +20% + 抓取 +20 / 暴击率 +10% + 暴伤 +30%</span></div>
      </div>
    </div>
  `;

  function showTitle() { dom.titleEl.classList.remove('hidden'); }
  function hideTitle() { dom.titleEl.classList.add('hidden'); }

  function bindTitleEvents() {
    const cardDef = document.getElementById('mode-defender');
    const cardHack = document.getElementById('mode-hacker');
    const rulesPanel = document.getElementById('rules-panel');
    const btnStart = document.getElementById('btn-start');

    const modalLayer = document.getElementById('modal-layer');
    const modalClose = document.getElementById('modal-close');
    const upPanel = document.getElementById('upgrade-panel');
    const btnOpenRules = document.getElementById('btn-open-rules');
    const btnOpenUpgrades = document.getElementById('btn-open-upgrades');

    function selectMode(mode) {
      if (currentMode === mode) return;
      currentMode = mode;
      if (mode === 'defender') {
        cardDef.classList.add('active'); cardHack.classList.remove('active');
        dom.titleEl.classList.remove('hacker-theme'); rulesPanel.innerHTML = RULES_DEFENDER;
        btnStart.textContent = '点击 / 按任意键 开始编译';
      } else {
        cardHack.classList.add('active'); cardDef.classList.remove('active');
        dom.titleEl.classList.add('hacker-theme'); rulesPanel.innerHTML = RULES_HACKER;
        btnStart.textContent = '点击 / 按任意键 执行入侵';
      }
    }
    cardDef.addEventListener('click', (e) => { e.stopPropagation(); selectMode('defender'); });
    cardHack.addEventListener('click', (e) => { e.stopPropagation(); selectMode('hacker'); });
    rulesPanel.innerHTML = RULES_DEFENDER;

    const btnTutDef = document.getElementById('btn-tut-def');
    const btnTutHack = document.getElementById('btn-tut-hack');
    if (btnTutDef) btnTutDef.addEventListener('click', (e) => { e.stopPropagation(); startTutorial('defender'); });
    if (btnTutHack) btnTutHack.addEventListener('click', (e) => { e.stopPropagation(); startTutorial('hacker'); });

    modalClose.addEventListener('click', () => { modalLayer.style.display = 'none'; });
    modalLayer.addEventListener('click', (e) => { if (e.target === modalLayer) modalLayer.style.display = 'none'; });
    btnOpenRules.addEventListener('click', (e) => { e.stopPropagation(); modalLayer.style.display = 'flex'; rulesPanel.style.display = 'block'; upPanel.style.display = 'none'; });
    btnOpenUpgrades.addEventListener('click', (e) => { e.stopPropagation(); modalLayer.style.display = 'flex'; rulesPanel.style.display = 'none'; upPanel.style.display = 'block'; updateUpgradeUI(); });

    const pointsText = document.getElementById('sys-points-text');
    const btnHp = document.getElementById('up-hp'), btnEnergy = document.getElementById('up-energy'), btnChip = document.getElementById('up-chip');
    const btnWeapon = document.getElementById('up-weapon'), btnDuration = document.getElementById('up-duration'), btnDamage = document.getElementById('up-damage'), btnCrit = document.getElementById('up-crit');

    const HP_COST_CAP = 100000;
    function getCost(type, level) {
      level = level || 0;
      if (type === 'hp') return Math.min(HP_COST_CAP, Math.floor(50 * (1.3 ** level)));
      if (type === 'energy') return Math.floor(80 * (1.5 ** level));
      if (type === 'chip') return Math.floor(100 * (1.4 ** level));
      if (type === 'weapon') return Math.floor(150 * (1.6 ** level));
      if (type === 'duration') return Math.floor(120 * (1.5 ** level));
      if (type === 'damage') return Math.floor(200 * (1.4 ** level));
      if (type === 'crit') return Math.floor(150 * (1.4 ** level));
      return 9999;
    }

    function updateUpgradeUI() {
      pointsText.textContent = sysPoints;
      const makeHTML = (label, lv, maxLv, cost) => {
        lv = lv || 0;
        return `${label} (Lv.${lv}/${maxLv})<br><span class="up-cost" style="color:${lv>=maxLv?'#ff5a7a':'#aaa'};">${lv>=maxLv ? 'MAX' : 'Cost: '+cost}</span>`;
      };
      btnHp.disabled = sysPoints < getCost('hp', DB.upgrades.hp) || DB.upgrades.hp >= 99; btnHp.innerHTML = makeHTML('生命上限 +20', DB.upgrades.hp, 99, getCost('hp', DB.upgrades.hp));
      btnEnergy.disabled = sysPoints < getCost('energy', DB.upgrades.energy) || DB.upgrades.energy >= 10; btnEnergy.innerHTML = makeHTML('初始能量 +10', DB.upgrades.energy, 10, getCost('energy', DB.upgrades.energy));
      btnChip.disabled = sysPoints < getCost('chip', DB.upgrades.chip) || DB.upgrades.chip >= 30; btnChip.innerHTML = makeHTML('芯片掉率 +10%', DB.upgrades.chip, 30, getCost('chip', DB.upgrades.chip));
      btnWeapon.disabled = sysPoints < getCost('weapon', DB.upgrades.weapon) || DB.upgrades.weapon >= 10; btnWeapon.innerHTML = makeHTML('武器上限 +1', DB.upgrades.weapon, 10, getCost('weapon', DB.upgrades.weapon));
      btnDuration.disabled = sysPoints < getCost('duration', DB.upgrades.duration) || DB.upgrades.duration >= 10; btnDuration.innerHTML = makeHTML('武器存活 +2s', DB.upgrades.duration, 10, getCost('duration', DB.upgrades.duration));
      btnDamage.disabled = sysPoints < getCost('damage', DB.upgrades.damage) || DB.upgrades.damage >= 20; btnDamage.innerHTML = makeHTML('初始伤害 +10%', DB.upgrades.damage, 20, getCost('damage', DB.upgrades.damage));
      btnCrit.disabled = sysPoints < getCost('crit', DB.upgrades.crit) || DB.upgrades.crit >= 20;
      if(btnCrit) btnCrit.innerHTML = makeHTML('暴击伤害 +10%', DB.upgrades.crit, 20, getCost('crit', DB.upgrades.crit));
    }

    function buyUpgrade(type, maxLv) {
      const cost = getCost(type, DB.upgrades[type]);
      if (sysPoints >= cost && DB.upgrades[type] < maxLv) {
        sysPoints -= cost; DB.upgrades[type]++;
        saveDataToCloud(); // 保存到云端
        DB.sfx.chip(); updateUpgradeUI();
      }
    }

    btnHp.onclick = () => buyUpgrade('hp', 99); btnEnergy.onclick = () => buyUpgrade('energy', 10); btnChip.onclick = () => buyUpgrade('chip', 30);
    btnWeapon.onclick = () => buyUpgrade('weapon', 10); btnDuration.onclick = () => buyUpgrade('duration', 10); btnDamage.onclick = () => buyUpgrade('damage', 20);
    btnCrit.onclick = () => buyUpgrade('crit', 20);

    // ===== 账号登录逻辑 =====
    const authModal = document.getElementById('auth-modal');
    const authErr = document.getElementById('auth-error');
    const btnLogin = document.getElementById('btn-login');
    
    if (btnLogin) {
      // 每次刷新 UI 时，检查是否已登录
      const updateLoginUI = () => {
        if (currentUsername) {
          btnLogin.textContent = `👤 ${currentUsername} (点击退出)`;
          btnLogin.style.color = '#5ee6a8';
          btnLogin.style.borderColor = 'rgba(94,230,168,0.8)';
        } else {
          btnLogin.textContent = `👤 账号登录`;
          btnLogin.style.color = '#5ee6a8';
          btnLogin.style.borderColor = 'rgba(94,230,168,0.4)';
        }
      };
      updateLoginUI(); // 初始化时调用

      btnLogin.onclick = () => {
        if (currentUsername) {
          // 如果已登录，点击则执行退出
          if (confirm('确定要退出当前账号吗？(云端存档不受影响)')) {
            cloudToken = null;
            currentUsername = '';
            localStorage.removeItem('sys_auth_token');
            localStorage.removeItem('sys_auth_username');
            // 重置本地数据和UI
            sysPoints = 0;
            highestScore = 0;
            DB.upgrades = { ...defaultUpgrades };
            updateUpgradeUI();
            updateLoginUI();
          }
          return;
        }

        // 未登录，打开弹窗
        authErr.textContent = '';
        document.getElementById('auth-user').value = '';
        document.getElementById('auth-pass').value = '';
        authModal.style.display = 'flex';
      };
      document.getElementById('btn-close-auth').onclick = () => authModal.style.display = 'none';

      async function doAuth(type) {
        const u = document.getElementById('auth-user').value.trim();
        const p = document.getElementById('auth-pass').value.trim();
        if (!u || !p) { authErr.textContent = "账号密码不能为空"; authErr.style.color='#ff5a7a'; return; }
        
        authErr.textContent = "连接中...";
        authErr.style.color = '#aaa';
        try {
          const res = await fetch(`${API_BASE}/${type}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: u, password: p })
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);

          if (type === 'register') {
            authErr.style.color = '#5ee6a8';
            authErr.textContent = "注册成功，请点击登录";
            return;
          }

          // 登录成功
          cloudToken = data.token;
          currentUsername = u; // 记住用户名
          localStorage.setItem('sys_auth_token', cloudToken);
          localStorage.setItem('sys_auth_username', currentUsername);
          
          await syncDataFromCloud(); // 拉取云端数据
          
          authModal.style.display = 'none';
          updateUpgradeUI();
          updateLoginUI(); // 更新按钮状态！
          DB.sfx.clear();
        } catch (e) {
          authErr.style.color = '#ff5a7a';
          authErr.textContent = e.message;
        }
      }

      document.getElementById('btn-do-login').onclick = () => doAuth('login');
      document.getElementById('btn-do-register').onclick = () => doAuth('register');
    }
  }

  /* ==================== 结算蓝屏 ==================== */
  let gameOverEl = null;
  function showGameOver(isVictory = false) {
    if (gameOverEl) gameOverEl.remove();
    gameOverEl = document.createElement('div');
    gameOverEl.style.cssText = `position:absolute; inset:0; z-index:30; background:rgba(10, 20, 60, 0.95); display:flex; flex-direction:column; align-items:center; justify-content:center; font-family:ui-monospace, monospace; color:#dff3ff; pointer-events:none; opacity:0; transition:opacity .35s ease; backdrop-filter: blur(4px);`;
    const face = document.createElement('div'); face.textContent = ':('; face.style.cssText = 'font-size:64px;font-weight:700;letter-spacing:8px;text-shadow:0 0 30px #7fd0ff; margin-bottom: 10px;';
    const title = document.createElement('div'); 
    title.textContent = isVictory ? 'MISSION COMPLETE' : 'SYSTEM INTEGRITY FAILURE'; 
    title.style.cssText = `font-size:18px;letter-spacing:4px;color:${isVictory?'#ffcc00':'#9fd6ff'}; margin-bottom: 40px;`;
    const statsBox = document.createElement('div'); statsBox.style.cssText = `display: flex; flex-direction: column; gap: 16px; background: rgba(0, 0, 0, 0.4); padding: 24px 40px; border: 1px solid rgba(90, 240, 255, 0.2); border-radius: 8px; margin-bottom: 40px;`;
    const isNewRecord = state.score >= highestScore && state.score > 0;
    statsBox.innerHTML = `<div><span style="color:rgba(150,200,255,0.6);">本局得分</span> <span style="color:#ffcc00; font-size:24px; font-weight:bold; margin-left:40px;">${state.score}</span></div><div><span style="color:rgba(150,200,255,0.6);">最高连击</span> <span style="color:#5ae8ff; font-size:24px; font-weight:bold; margin-left:40px;">${state.maxCombo} <span style="font-size:14px;">HITS</span></span></div><div><span style="color:rgba(150,200,255,0.6);">历史最高</span> <span style="color:${isNewRecord?'#5ee6a8':'#ffffff'}; font-size:24px; font-weight:bold; margin-left:40px;">${highestScore} ${isNewRecord?'★ NEW':''}</span></div>`;
    const hint = document.createElement('div'); hint.textContent = '点击 / 按任意键 返回标题'; hint.style.cssText = 'font-size:13px;letter-spacing:2px;color:rgba(180,220,255,.6); animation: startBlink 1.5s infinite;';
    gameOverEl.appendChild(face); gameOverEl.appendChild(title); gameOverEl.appendChild(statsBox); gameOverEl.appendChild(hint);
    dom.stage.appendChild(gameOverEl); requestAnimationFrame(() => { gameOverEl.style.opacity = '1'; });
  }
  function hideGameOver() { if (gameOverEl) gameOverEl.style.opacity = '0'; }

  /* ==================== 世界重置 ==================== */
  function resetWorld(withWave) {
    for (const w of DB.weapons.slice()) DB.removeWeapon(w);
    DB.enemyBullets.length = 0; DB.enemies.length = 0; DB.chips.length = 0; DB.particles.length = 0;
    DB.boss = null; state.qte.active = false; DB.heldWeapon = null; DB.keys.clear(); DB.mouse.down = false;

    state.hpMax = 100 + (DB.upgrades.hp * 20); state.hp = state.hpMax; state.energy = DB.upgrades.energy * 10;
    state.wave = 1; state.waveBreakT = 0; state.damageFlash = 0; state.shake = 0; state.flash = 0; state.hitstop = 0; state.gameOverLock = 0;
    state.bossEnrageFlash = 0; state.bossEnrageTextT = 0;
    state.mods = { damage: 0, grab: 0, launch: 0, lifesteal: 0, moveSpeed: 0, critRate: 0, critDmg: 0 }; state.combo = 0; state.maxCombo = 0; state.score = 0;
    state.skillCd = 0; state.skillActiveT = 0;
    state.camera.x = W / 2 - VW / 2; state.camera.y = H / 2 - VH / 2;
    state.tutorial.active = false;

    DB.player.x = W * 0.34; DB.player.y = 600; DB.player.vx = 0; DB.player.vy = 0;
    
    if (withWave) {
      for (let i = 0; i < 3; i++) { const w = DB.spawnWeapon('light_dart'); if (w) w.warning = 0.001; }
      DB.spawnWave(1);
    }
    DB.updateHUD();
  }

  function startGame() {
    hideTitle(); resetWorld(true); 
    state.gameMode = 'endless'; // 确保进入无尽模式
    state.mode = currentMode; 
    state.scene = 'playing'; 
    DB.sfx.start();
  }

  window.startLevel = function(lv) {
    hideTitle(); resetWorld(false);
    state.mode = currentMode;
    state.scene = 'playing';
    state.gameMode = 'level';
    state.currentLevel = lv;
    state.levelClearT = 0;
    
    // 初始给 3 把武器，满血
    for (let i = 0; i < 3; i++) { const w = DB.spawnWeapon('light_dart'); if (w) w.warning = 0.001; }
    DB.spawnLevelWave(lv);
    DB.sfx.start();
  };
  function backToTitle() { 
    hideGameOver(); resetWorld(false); showTitle(); state.scene = 'title'; 
    setTimeout(() => { if (gameOverEl) { gameOverEl.remove(); gameOverEl = null; } }, 400);
  }

  /* ==================== 新手教程逻辑 ==================== */
  function startTutorial(mode) {
    hideTitle(); resetWorld(false);
    state.mode = mode;
    state.scene = 'playing';
    state.tutorial.active = true;
    state.tutorial.step = 1;
    state.tutorial.startX = DB.player.x;
    state.tutorial.startY = DB.player.y;
    state.tutorial.hitDummy = false;
    state.tutorial.pullDist = 0;

    state.energy = state.energyMax; // 方便测试大招
    
    for (let i = 0; i < 3; i++) { const w = DB.spawnWeapon('light_dart'); if (w) w.warning = 0.001; }
    if (mode === 'defender') {
      DB.spawnTutorialDummy(DB.player.x + 400, DB.player.y);
    } else {
      DB.spawnTutorialDummy(DB.player.x + 500, DB.player.y);
    }
    DB.sfx.start();
  }

  function updateTutorial(dt) {
    const tut = state.tutorial;
    const p = DB.player;

    // 1. 移动
    if (tut.step === 1) {
      const moved = Math.hypot(p.x - tut.startX, p.y - tut.startY);
      if (moved > 100) tut.step = 2;
    }
    // 2. 抓取
    else if (tut.step === 2) {
      if (DB.heldWeapon) tut.step = 3;
    }
    // 3. 瞄准/拉弓
    else if (tut.step === 3) {
      if (state.mode === 'defender') {
        if (DB.heldWeapon) {
          const dd = Math.hypot(DB.mouse.x - DB.heldWeapon.anchorX, DB.mouse.y - DB.heldWeapon.anchorY);
          if (dd > 150) tut.step = 4; // 稍微降低拉弓判定距离
        }
      } else {
        const dummy = DB.enemies.find(e => e.type === 'dummy');
        if (dummy) {
          const dist = Math.hypot(DB.mouse.x - dummy.x, DB.mouse.y - dummy.y);
          if (dist < 250) tut.step = 4; // 稍微放宽黑客瞄准判定
        }
      }
    }
    // 4. 开火
    else if (tut.step === 4) {
      const dummy = DB.enemies.find(e => e.type === 'dummy');
      // 只要松开鼠标，或者木桩受到伤害，立刻进下一步
      if ((!DB.mouse.down && !DB.heldWeapon) || (!dummy || dummy.hp < dummy.maxHp)) {
        tut.step = 5;
        // 【保险】强制在玩家身边发一个芯片，防止打空或没掉芯片卡住
        DB.spawnChip(p.x + 60, p.y);
      }
    }
    // 5. 拾取芯片
    else if (tut.step === 5) {
      if (DB.chips.length === 0) {
        tut.step = 6;
        state.energy = state.energyMax; 
        // 刷 3 只弱怪给玩家测试 SHIFT
        for(let i=0; i<3; i++) {
           DB.enemies.push({
             type: 'drone', x: p.x + 250 + Math.random()*150, y: p.y - 100 + Math.random()*200,
             baseX: p.x + 250 + Math.random()*150, baseY: p.y - 100 + Math.random()*200,
             seed: Math.random() * 100, hp: 30, maxHp: 30, r: 20, dmg: 0, fireCd: 999, flashT: 0, frozen: 0
           });
        }
      }
    }
    // 6. SHIFT 技能
    else if (tut.step === 6) {
      if (state.skillCd > 0) {
        tut.step = 7;
        state.energy = state.energyMax; // 【保险】强制补满能量
        DB.enemies.length = 0; // 清场
        // 重新刷 5 只怪，保证大招有东西打
        for(let i=0; i<5; i++) {
           DB.enemies.push({
             type: 'drone', x: p.x + 200 + Math.random()*300, y: p.y - 150 + Math.random()*300,
             baseX: p.x + 200 + Math.random()*300, baseY: p.y - 150 + Math.random()*300,
             seed: Math.random() * 100, hp: 30, maxHp: 30, r: 20, dmg: 0, fireCd: 999, flashT: 0, frozen: 0
           });
        }
      }
    }
    // 7. 大招
    else if (tut.step === 7) {
      // 【修复】只要能量被扣除，就判定大招释放成功（防秒杀回能导致卡死）
      if (state.energy < state.energyMax) {
        tut.step = 8;
        state.flash = 1.0;
        DB.sfx.clear();
        DB.enemies.length = 0;
      }
    }
  }

  /* ==================== 波次 ==================== */
  function updateWaves(dt) {
    if (state.scene !== 'playing') return;
    if (state.tutorial.active) { updateTutorial(dt); return; }

    // ===== 闯关模式逻辑 =====
    if (state.gameMode === 'level') {
      if (state.levelClearT > 0) {
        state.levelClearT -= dt;
        if (state.levelClearT <= 0) {
          if (state.currentLevel >= 10) {
            // 通关
            state.scene = 'gameover';
            showGameOver(true);
          } else {
            // 下一关
            state.hp = Math.min(state.hpMax, state.hp + 30); // 每关回 30 血
            for (let i = 0; i < 2; i++) { const w = DB.spawnWeapon('light_dart'); if (w) w.warning = 0.001; } // 补 2 把武器
            window.startLevel(state.currentLevel + 1);
          }
        }
        return;
      }

      if (DB.enemies.length === 0 && (!DB.boss || DB.boss.hp <= 0)) {
        state.levelClearT = 3.0;
        state.flash = 0.5;
        DB.sfx.clear();
      }
      return;
    }

    // ===== 无尽模式逻辑 =====
    if (state.waveBreakT > 0) {
      state.waveBreakT -= dt;
      if (state.waveBreakT <= 0) {
        state.wave++;
        if (state.wave % 10 === 0) DB.spawnBoss(true);
        else if (state.wave % 5 === 0) DB.spawnBoss(false);
        else DB.spawnWave(state.wave);
      }
      return;
    }
    if (DB.enemies.length === 0 && !DB.boss) {
      state.hp = Math.min(state.hpMax, state.hp + state.hpMax * 0.2);
      state.waveBreakT = 2.0; DB.sfx.clear();
    }
  }

  /* ==================== 渲染 ==================== */
  function render() {
    if (state.qte.active) dom.weaponLayer.style.opacity = '0';
    else dom.weaponLayer.style.opacity = '1';

    let targetX = DB.player.x - VW / 2;
    let targetY = DB.player.y - VH / 2;
    targetX = DB.clamp(targetX, 0, W - VW);
    targetY = DB.clamp(targetY, 0, H - VH);

    state.camera.x += (targetX - state.camera.x) * 0.15;
    state.camera.y += (targetY - state.camera.y) * 0.15;

    const camX = state.camera.x;
    const camY = state.camera.y;

    let sx = 0, sy = 0;
    if (state.shake > 0.15) {
      sx = (Math.random() * 2 - 1) * state.shake;
      sy = (Math.random() * 2 - 1) * state.shake;
    }

    dom.weaponLayer.style.transform = `translate3d(${-(camX - sx).toFixed(2)}px, ${-(camY - sy).toFixed(2)}px, 0)`;

    const bgCtx = dom.bgCtx;
    bgCtx.clearRect(0, 0, W, H);

    bgCtx.save();
    bgCtx.translate(-camX + sx, -camY + sy);
    bgCtx.drawImage(gridCanvas, 0, 0);
    DB.drawDeployedWeapons(bgCtx);
    DB.drawChips(bgCtx); DB.drawEnemyBullets(bgCtx); DB.drawEnemies(bgCtx); DB.drawPlayer(bgCtx); DB.drawSpawnWarnings(bgCtx);
    DB.drawZones(bgCtx);
    DB.drawBeams(bgCtx);
    bgCtx.restore();

    if (state.scene === 'playing') {
      bgCtx.save();

      bgCtx.textAlign = 'center'; bgCtx.font = 'bold 22px ui-monospace, monospace';
      bgCtx.fillStyle = 'rgba(150, 200, 255, 0.55)'; bgCtx.shadowColor = 'rgba(90, 240, 255, 0.6)'; bgCtx.shadowBlur = 16;

      if (!state.tutorial.active) {
        // ===== 关卡 UI =====
        if (state.gameMode === 'level') {
          bgCtx.fillStyle = '#ffcc00';
          bgCtx.font = 'bold 20px ui-monospace, monospace';
          bgCtx.shadowColor = '#ffcc00'; bgCtx.shadowBlur = 10;
          bgCtx.fillText(`LEVEL ${state.currentLevel} / 10`, VW / 2, 46);

          if (state.levelClearT > 0) {
            bgCtx.fillStyle = 'rgba(0, 0, 0, 0.85)';
            bgCtx.fillRect(0, VH/2 - 60, VW, 120);
            bgCtx.strokeStyle = '#5ee6a8'; bgCtx.lineWidth = 2;
            bgCtx.strokeRect(0, VH/2 - 60, VW, 120);
            
            bgCtx.textAlign = 'center';
            bgCtx.fillStyle = '#5ee6a8';
            bgCtx.font = 'bold 36px ui-monospace, monospace';
            bgCtx.shadowColor = '#5ee6a8'; bgCtx.shadowBlur = 20;
            bgCtx.fillText(`LEVEL ${state.currentLevel} CLEARED`, VW/2, VH/2 + 5);
            
            bgCtx.fillStyle = '#ffffff';
            bgCtx.font = '14px ui-monospace, monospace';
            bgCtx.shadowBlur = 0;
            bgCtx.fillText(state.currentLevel >= 10 ? '最终挑战完成，系统已安全！' : '准备进入下一关...', VW/2, VH/2 + 40);
          }
        } else {
          // 只有无尽模式才画 WAVE
          bgCtx.fillText(`WAVE ${String(state.wave).padStart(2, '0')}`, VW / 2, 46);
        }
      }

      // ===== 教程悬浮 UI =====
      if (state.tutorial.active) {
        const tut = state.tutorial;
        const p = DB.player;
        let title = '', desc = '';
        
        if (tut.step === 1) { 
           title = "第一课：移动"; 
           desc = "使用 [W][A][S][D] 移动你的角色。"; 
        }
        else if (tut.step === 2) { 
           title = "第二课：抓取武器"; 
           desc = "将鼠标悬停在任意发光武器上，按住左键抓取。"; 
        }
        else if (tut.step === 3) { 
           if (state.mode === 'defender') {
             title = "第三课：向后拉弓"; 
             desc = "按住左键并向后拉动鼠标，拉得越满力度越大。"; 
           } else {
             title = "第三课：瞄准敌人"; 
             desc = "移动鼠标，将准星对准远处的木桩。"; 
           }
        }
        else if (tut.step === 4) { 
           title = "第四课：开火！"; 
           desc = "松开鼠标，击碎木桩！"; 
        }
        else if (tut.step === 5) { 
           title = "第五课：拾取芯片"; 
           desc = "靠近发光芯片，它会自动吸附并强化你的属性。"; 
        }
        else if (tut.step === 6) { 
           title = "第六课：核心技能"; 
           desc = "按下 [SHIFT] 释放阵营专属技能，清理眼前的敌人。"; 
           // 画 SHIFT 键提示
           bgCtx.save();
           bgCtx.fillStyle = 'rgba(0,0,0,0.8)';
           bgCtx.strokeStyle = state.mode === 'defender' ? '#5ae8ff' : '#ffcc00';
           bgCtx.lineWidth = 2;
           bgCtx.beginPath();
           bgCtx.roundRect(VW/2 - 50, VH/2 + 40, 100, 40, 6);
           bgCtx.fill(); bgCtx.stroke();
           bgCtx.fillStyle = state.mode === 'defender' ? '#5ae8ff' : '#ffcc00';
           bgCtx.font = 'bold 18px monospace';
           bgCtx.textAlign = 'center';
           bgCtx.fillText('SHIFT', VW/2, VH/2 + 66);
           bgCtx.restore();
        }
        else if (tut.step === 7) { 
           title = "第七课：终极绝招"; 
           desc = "按下数字键 [1] 释放终极技能，扫清一切！"; 
           // 画 [1] 键提示
           bgCtx.save();
           bgCtx.fillStyle = 'rgba(0,0,0,0.8)';
           bgCtx.strokeStyle = '#ffcc00';
           bgCtx.lineWidth = 2;
           bgCtx.beginPath();
           bgCtx.roundRect(VW/2 - 30, VH/2 + 40, 60, 60, 6);
           bgCtx.fill(); bgCtx.stroke();
           bgCtx.fillStyle = '#ffcc00';
           bgCtx.font = 'bold 24px monospace';
           bgCtx.textAlign = 'center';
           bgCtx.fillText('1', VW/2, VH/2 + 80);
           bgCtx.restore();
        }
        else if (tut.step === 8) { 
           title = "教程完成！"; 
           desc = "你已掌握所有基础操作，点击屏幕返回主菜单。"; 
        }

        // 绘制顶部提示框
        bgCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
        bgCtx.strokeStyle = state.mode === 'defender' ? '#5ae8ff' : '#ff5a7a';
        bgCtx.lineWidth = 2;
        bgCtx.beginPath(); bgCtx.roundRect(VW/2 - 300, 100, 600, 100, 10); bgCtx.fill(); bgCtx.stroke();
        
        bgCtx.shadowBlur = 0;
        bgCtx.fillStyle = state.mode === 'defender' ? '#5ae8ff' : '#ff5a7a';
        bgCtx.font = 'bold 20px ui-monospace, monospace';
        bgCtx.textAlign = 'center';
        bgCtx.fillText(title, VW / 2, 135);
        
        bgCtx.fillStyle = '#ffffff';
        bgCtx.font = '14px ui-monospace, monospace';
        bgCtx.fillText(desc, VW / 2, 170);
      }

      // ===== 正常战斗的 HUD 逻辑 =====
      if (!state.tutorial.active) {
        const waveY = DB.boss ? 30 : 46;
        if (DB.boss) {
          const barW = 600, barH = 12; const barX = (VW - barW) / 2, barY = 46;
          bgCtx.fillStyle = 'rgba(0, 0, 0, 0.6)'; bgCtx.strokeStyle = 'rgba(255, 90, 122, 0.5)'; bgCtx.lineWidth = 1;
          bgCtx.fillRect(barX, barY, barW, barH); bgCtx.strokeRect(barX, barY, barW, barH);
          const hpRatio = Math.max(0, DB.boss.hp / DB.boss.maxHp);
          let barColor = DB.boss.isBig ? '#ffaa00' : '#ff5a7a';
          if (DB.boss.phase === 'paralyzed') barColor = '#ffcc00';
          else if (DB.boss.enraged) barColor = (Math.sin(state.t * 20) > 0) ? '#ff2a4a' : '#ffcc00';
          bgCtx.fillStyle = barColor; bgCtx.shadowColor = barColor; bgCtx.shadowBlur = 10;
          bgCtx.fillRect(barX, barY, barW * hpRatio, barH); bgCtx.shadowBlur = 0;
          bgCtx.font = 'bold 12px ui-monospace, monospace'; bgCtx.fillStyle = '#ffffff';
          let bossName = 'UNKNOWN';
          if (state.mode === 'hacker') {
            if (DB.boss.bossType === 'bsod') bossName = '防火墙矩阵';
            if (DB.boss.bossType === 'firewall') bossName = '查杀引擎主脑';
            if (DB.boss.bossType === 'vampire') bossName = '隔离沙盒';
            if (DB.boss.bossType === 'manager') bossName = '系统总控 (大Boss)';
            if (DB.boss.bossType === 'trojan') bossName = '根权限守卫 (大Boss)';
          } else {
            if (DB.boss.bossType === 'bsod') bossName = '蓝屏死机核心';
            if (DB.boss.bossType === 'firewall') bossName = '防火墙巨像';
            if (DB.boss.bossType === 'vampire') bossName = '内存吸血鬼';
            if (DB.boss.bossType === 'manager') bossName = '安全管家 (大Boss)';
            if (DB.boss.bossType === 'trojan') bossName = '木马母体 (大Boss)';
          }
          if (DB.boss.phase === 'paralyzed') bossName = 'SYSTEM HALTED';
          if (DB.boss.enraged && DB.boss.phase === 'normal') bossName += ' · 狂暴';
          bgCtx.fillText(bossName, VW / 2, barY + 10);
        }

        if (state.combo > 1) {
          bgCtx.save(); bgCtx.textAlign = 'left'; const scale = 1 + Math.min(0.5, state.combo * 0.02);
          bgCtx.translate(30, 90); bgCtx.scale(scale, scale);
          bgCtx.font = 'bold 32px ui-monospace, monospace'; bgCtx.fillStyle = '#ffcc00'; bgCtx.shadowColor = '#ffcc00'; bgCtx.shadowBlur = 15;
          bgCtx.fillText(`${state.combo} COMBO`, 0, 0); bgCtx.restore();
          bgCtx.save(); bgCtx.textAlign = 'left'; bgCtx.font = '14px ui-monospace, monospace'; bgCtx.fillStyle = '#ffffff';
          bgCtx.fillText(`SCORE: ${state.score}`, 32, 115); bgCtx.restore();
        }

        if (state.waveBreakT > 0) {
          bgCtx.textAlign = 'center'; bgCtx.font = '13px ui-monospace, monospace'; bgCtx.fillStyle = 'rgba(150, 200, 255, 0.45)'; bgCtx.shadowBlur = 0;
          bgCtx.fillText(`NEXT WAVE IN ${Math.max(0, state.waveBreakT).toFixed(1)}s`, VW / 2, DB.boss ? 75 : 70);
        }

        if (state.qte.active) {
          bgCtx.fillStyle = 'rgba(0, 0, 0, 0.85)'; bgCtx.fillRect(0, VH / 2 - 100, VW, 200);
          bgCtx.strokeStyle = '#ff5a7a'; bgCtx.lineWidth = 2;
          bgCtx.beginPath(); bgCtx.moveTo(0, VH / 2 - 100); bgCtx.lineTo(VW, VH / 2 - 100); bgCtx.stroke();
          bgCtx.beginPath(); bgCtx.moveTo(0, VH / 2 + 100); bgCtx.lineTo(VW, VH / 2 + 100); bgCtx.stroke();
          bgCtx.textAlign = 'center'; bgCtx.font = 'bold 20px ui-monospace, monospace'; bgCtx.fillStyle = '#ff5a7a'; bgCtx.shadowColor = '#ff5a7a'; bgCtx.shadowBlur = 20;
          bgCtx.fillText('⚠ 核心瘫痪 · 输入覆盖指令 ⚠', VW / 2, VH / 2 - 40);
          bgCtx.font = '14px ui-monospace, monospace'; bgCtx.fillStyle = '#ffffff'; bgCtx.shadowBlur = 0;
          bgCtx.fillText(`剩余时间: ${state.qte.timer.toFixed(1)}s`, VW / 2, VH / 2 + 50);
          bgCtx.font = 'bold 56px ui-monospace, monospace';
          const seq = state.qte.sequence, spacing = 70, totalW = seq.length * spacing, startX = VW / 2 - totalW / 2 + spacing / 2;
          for (let i = 0; i < seq.length; i++) {
            const char = seq[i]; let color = '#5ae8ff';
            if (i < state.qte.inputIndex) color = '#5ee6a8';
            else if (i === state.qte.inputIndex) { color = '#ffcc00'; if (Math.sin(state.t * 30) > 0) color = '#ffffff'; }
            bgCtx.shadowColor = color; bgCtx.shadowBlur = 20; bgCtx.fillStyle = color;
            bgCtx.fillText(char, startX + i * spacing, VH / 2 + 15);
          }
          bgCtx.shadowBlur = 0;
          bgCtx.fillStyle = 'rgba(255, 255, 255, 0.2)'; bgCtx.fillRect(VW / 2 - 150, VH / 2 + 30, 300, 4);
          bgCtx.fillStyle = '#5ae8ff'; bgCtx.fillRect(VW / 2 - 150, VH / 2 + 30, 300 * (state.qte.inputIndex / seq.length), 4);
        }

        if (!state.qte.active) {
          bgCtx.save(); bgCtx.font = '11px ui-monospace, monospace'; bgCtx.textAlign = 'right'; bgCtx.fillStyle = 'rgba(150, 200, 255, 0.6)';
          if (state.mode === 'hacker') {
            bgCtx.fillText('[4] 万剑归宗', VW - 26, VH - 105); bgCtx.fillText('[3] 紧急重启', VW - 26, VH - 120);
            bgCtx.fillText('[2] 冻结协议', VW - 26, VH - 135); bgCtx.fillText('[1] 逻辑炸弹', VW - 26, VH - 150);
          } else {
            bgCtx.fillText('[4] 核心熔毁', VW - 26, VH - 105); bgCtx.fillText('[3] 系统重载', VW - 26, VH - 120);
            bgCtx.fillText('[2] 时间凝滞', VW - 26, VH - 135); bgCtx.fillText('[1] 代码暴雨', VW - 26, VH - 150);
          }
          bgCtx.restore();
        }

        bgCtx.textAlign = 'left';
        bgCtx.font = 'bold 12px ui-monospace, monospace';
        bgCtx.shadowBlur = 0;
        const isDef = state.mode === 'defender';
        const skillName = isDef ? '[SHIFT] 全息反射盾' : '[SHIFT] 病毒引爆';
        const cdText = state.skillCd <= 0 ? 'READY' : state.skillCd.toFixed(1) + 's';
        const cdColor = state.skillCd <= 0 ? (isDef ? '#5ae8ff' : '#ffcc00') : 'rgba(150, 150, 150, 0.6)';
        bgCtx.fillStyle = cdColor;
        bgCtx.fillText(`${skillName}  -  ${cdText}`, 24, VH - 24);

        const mods = state.mods;
        if (mods.damage > 0 || mods.grab > 0 || mods.launch > 0 || mods.moveSpeed > 0 || mods.lifesteal > 0) {
          bgCtx.font = '11px ui-monospace, monospace'; bgCtx.textAlign = 'left'; bgCtx.shadowBlur = 0;
          let yy = 30;
          if (mods.damage > 0)    { bgCtx.fillStyle = '#ff7a9a'; bgCtx.fillText(`DMG +${Math.round(mods.damage * 100)}%`, 24, yy); yy += 16; }
          if (mods.grab > 0)      { bgCtx.fillStyle = '#5ae8ff'; bgCtx.fillText(`RNG +${Math.round(mods.grab)}`, 24, yy); yy += 16; }
          if (mods.launch > 0)    { bgCtx.fillStyle = '#c08bff'; bgCtx.fillText(`SPD +${Math.round(mods.launch * 100)}%`, 24, yy); yy += 16; }
          if (mods.moveSpeed > 0) { bgCtx.fillStyle = '#7aff9a'; bgCtx.fillText(`MOV +${Math.round(Math.min(1, mods.moveSpeed) * 100)}%`, 24, yy); yy += 16; }
          if (mods.lifesteal > 0) { bgCtx.fillStyle = '#ff5a7a'; bgCtx.fillText(`LEECH +${mods.lifesteal}`, 24, yy); yy += 16; }
          const rawCritRate = 15 + Math.round((mods.critRate || 0) * 100);
          const totalCritRate = Math.min(80, rawCritRate);
          const isCritMax = rawCritRate >= 80 ? ' (MAX)' : '';
          const totalCritDmg = 150 + Math.round((mods.critDmg || 0) * 100) + ((DB.upgrades.crit || 0) * 10);
          bgCtx.fillStyle = isCritMax ? '#ff7a9a' : '#ffcc00';
          bgCtx.fillText(`CRIT ${totalCritRate}%${isCritMax} / +${totalCritDmg}%`, 24, yy);
        }

        if (state.bossEnrageTextT > 0) {
          const t = state.bossEnrageTextT;
          const alpha = Math.min(1, t / 0.6);
          const pulse = 1 + Math.sin(state.t * 22) * 0.06;
          bgCtx.save();
          bgCtx.globalAlpha = alpha; bgCtx.textAlign = 'center';
          bgCtx.font = 'bold 46px ui-monospace, monospace';
          bgCtx.fillStyle = '#ff2a4a'; bgCtx.shadowColor = '#ff2a4a'; bgCtx.shadowBlur = 30;
          bgCtx.translate(VW / 2, VH / 2 - 120); bgCtx.scale(pulse, pulse);
          bgCtx.fillText('⚠ BOSS 狂暴化 ⚠', 0, 0);
          bgCtx.restore();
        }
      }

      bgCtx.restore();
    }

    const fxCtx = dom.fxCtx;
    fxCtx.clearRect(0, 0, W, H);

    fxCtx.save();
    fxCtx.translate(-camX + sx, -camY + sy);
    DB.drawGrabBeam(fxCtx); DB.drawParticles(fxCtx);

    fxCtx.textAlign = 'center'; fxCtx.font = 'bold 16px ui-monospace, monospace';
    for (const f of DB.floaters) {
      fxCtx.globalAlpha = Math.min(1, f.life / (f.maxLife * 0.4));
      fxCtx.fillStyle = f.color; fxCtx.shadowColor = f.color; fxCtx.shadowBlur = 10;

      if (f.isCrit) {
        fxCtx.save(); fxCtx.font = 'bold 24px ui-monospace, monospace';
        fxCtx.translate(f.x, f.y); const scale = 1.2 + Math.sin(f.life * 20) * 0.1;
        fxCtx.scale(scale, scale); fxCtx.fillText(f.text, 0, 0); fxCtx.restore();
      } else {
        fxCtx.font = 'bold 16px ui-monospace, monospace'; fxCtx.fillText(f.text, f.x, f.y);
      }
    }
    fxCtx.restore();

    if (vignetteEl) {
      let tensionRatio = 0;
      if (state.mode === 'defender' && DB.heldWeapon && DB.heldWeapon.held) {
        const w = DB.heldWeapon;
        const dd = Math.hypot(DB.mouse.x - w.anchorX, DB.mouse.y - w.anchorY);
        const start = CFG.SLINGSHOT.MAX_PULL * 0.7;
        if (dd > start) tensionRatio = Math.min(1, (dd - start) / (CFG.SLINGSHOT.MAX_PULL * 0.3));
      }
      vignetteEl.style.opacity = String(tensionRatio * 0.85);
    }

    if (state.bossEnrageFlash > 0.001) { dom.flashEl.style.background = '#ff2a4a'; dom.flashEl.style.opacity = String(Math.min(0.7, state.bossEnrageFlash)); }
    else if (state.damageFlash > 0.001) { dom.flashEl.style.background = '#ff2a4a'; dom.flashEl.style.opacity = String(Math.min(0.6, state.damageFlash)); }
    else if (state.flash > 0.001) { dom.flashEl.style.background = '#ffffff'; dom.flashEl.style.opacity = String(Math.min(0.85, state.flash)); }
    else if (dom.flashEl.style.opacity !== '0') { dom.flashEl.style.opacity = '0'; }
  }

  /* ==================== 初始化与缩放 ==================== */
  function resize() {
    const s = Math.min(window.innerWidth / VW, window.innerHeight / VH);
    dom.stage.style.transform = `scale(${s})`;
  }
  window.addEventListener('resize', resize);
  resize();

  /* ==================== 输入 ==================== */
  function toWorld(cx, cy) {
    const r = dom.stage.getBoundingClientRect();
    const screenX = ((cx - r.left) / r.width) * VW;
    const screenY = ((cy - r.top) / r.height) * VH;
    return { x: screenX + state.camera.x, y: screenY + state.camera.y };
  }

  function bindInput() {
    const mouse = DB.mouse, trail = DB.trail, keys = DB.keys;

    dom.stage.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      if (e.target.closest('.mode-card') || e.target.closest('.title-start') || e.target.closest('#modal-layer') || e.target.closest('.title-action-btn') || e.target.closest('.tutorial-btn') || e.target.closest('#auth-modal')) { if (state.scene === 'title') return; }

      if (state.scene === 'title') {
        // 如果是因为鼠标点开了关卡，不要用键盘直接开始无尽模式
        if (e.key === 'Enter' || e.key === ' ') startGame(); 
        return; 
      }
      if (state.scene === 'gameover') { if (state.gameOverLock <= 0) backToTitle(); return; }
      if (state.tutorial.active && state.tutorial.step === 8) { backToTitle(); return; }

      const p = toWorld(e.clientX, e.clientY);
      mouse.x = p.x; mouse.y = p.y; mouse.down = true;
      trail.length = 0; trail.push({ x: p.x, y: p.y, t: performance.now() });
      DB.tryGrab(p.x, p.y);
    });

    window.addEventListener('mousemove', (e) => {
      const p = toWorld(e.clientX, e.clientY);
      mouse.x = p.x; mouse.y = p.y;
      trail.push({ x: p.x, y: p.y, t: performance.now() }); while (trail.length > 14) trail.shift();
    });

    window.addEventListener('mouseup', (e) => { if (e.button !== 0) return; mouse.down = false; DB.releaseThrow(); });
    window.addEventListener('blur', () => { keys.clear(); mouse.down = false; DB.releaseThrow(); });
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => {
      // 如果正在输入框打字，或者在登录弹窗里，不触发全局按键
      if (e.target.tagName === 'INPUT' || (document.getElementById('auth-modal') && document.getElementById('auth-modal').style.display === 'flex')) return;

      if (state.scene === 'title') { startGame(); return; }
      if (state.scene === 'gameover') { if (state.gameOverLock <= 0) backToTitle(); return; }
      if (state.tutorial.active && state.tutorial.step === 8) { backToTitle(); return; }

      const k = e.key.toLowerCase();
      if (k === 'w' || k === 'a' || k === 's' || k === 'd') { keys.add(k); e.preventDefault(); return; }
      if (k === 'shift') { DB.triggerShift(); e.preventDefault(); return; }
      if (k >= '0' && k <= '9') { DB.handleNumberKey(k); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

    const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    if (isMobile) {
      document.getElementById('mobile-ui').style.display = 'block';
      const joyZone = document.getElementById('joy-zone');
      const joyStick = document.getElementById('joy-stick');
      let joyTouchId = null;
      let joyCenterX = 0, joyCenterY = 0;
      let aimTouchId = null;

      function handleJoyMove(cx, cy) {
        let dx = cx - joyCenterX;
        let dy = cy - joyCenterY;
        const dist = Math.hypot(dx, dy);
        const maxDist = 40;
        if (dist > maxDist) { dx = (dx / dist) * maxDist; dy = (dy / dist) * maxDist; }
        joyStick.style.transform = `translate(${dx}px, ${dy}px)`;

        keys.clear();
        if (dx < -10) keys.add('a');
        if (dx > 10) keys.add('d');
        if (dy < -10) keys.add('w');
        if (dy > 10) keys.add('s');
      }

      joyZone.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        joyTouchId = t.identifier;
        const rect = joyZone.getBoundingClientRect();
        joyCenterX = rect.left + rect.width / 2;
        joyCenterY = rect.top + rect.height / 2;
        handleJoyMove(t.clientX, t.clientY);
      });

      window.addEventListener('touchstart', (e) => {
        if (e.target.closest('#action-zone') || e.target.closest('#qte-zone') || e.target.closest('#joy-zone')) return;
        if (e.target.closest('.mode-card') || e.target.closest('.title-start') || e.target.closest('#modal-layer') || e.target.closest('.title-action-btn') || e.target.closest('.tutorial-btn')) return;

        if (state.scene === 'title') { startGame(); return; }
        if (state.scene === 'gameover') { if (state.gameOverLock <= 0) backToTitle(); return; }
        if (state.tutorial.active && state.tutorial.step === 8) { backToTitle(); return; }

        if (aimTouchId === null) {
          const t = e.changedTouches[0];
          aimTouchId = t.identifier;
          const p = toWorld(t.clientX, t.clientY);
          mouse.x = p.x; mouse.y = p.y; mouse.down = true;
          trail.length = 0; trail.push({ x: p.x, y: p.y, t: performance.now() });
          DB.tryGrab(p.x, p.y);
        }
      }, { passive: false });

      window.addEventListener('touchmove', (e) => {
        if (aimTouchId !== null || joyTouchId !== null) {
          e.preventDefault();
        }
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === joyTouchId) {
            handleJoyMove(t.clientX, t.clientY);
          } else if (t.identifier === aimTouchId) {
            const p = toWorld(t.clientX, t.clientY);
            mouse.x = p.x; mouse.y = p.y;
            trail.push({ x: p.x, y: p.y, t: performance.now() }); while (trail.length > 14) trail.shift();
          }
        }
      }, { passive: false });

      window.addEventListener('touchend', (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === joyTouchId) {
            joyTouchId = null; joyStick.style.transform = `translate(0px, 0px)`; keys.clear();
          } else if (t.identifier === aimTouchId) {
            aimTouchId = null; mouse.down = false; DB.releaseThrow();
          }
        }
      });

      setInterval(() => {
        document.getElementById('qte-zone').style.display = state.qte.active ? 'flex' : 'none';
      }, 100);
    }

    DB.triggerShift = function() {
      if (state.skillCd <= 0 && state.scene === 'playing') {
        if (state.mode === 'defender') {
          state.skillActiveT = 1.5; state.skillCd = 5.0; state.flash = Math.max(state.flash, 0.15);
          DB.spawnParticles(DB.player.x, DB.player.y, 30, '#5ae8ff', 300); DB.sfx.chip();
        } else {
          DB.enemyBullets.length = 0;
          for (const en of DB.enemies) {
            const blastDmg = 40 + (state.wave * 5) + (state.combo * 2);
            en.hp -= DB.applyVulnerable(en, blastDmg); en.flashT = 0.2; en.virus = true;
            DB.spawnParticles(en.x, en.y, 15, '#ffcc00', 400);
          }
          if (DB.boss && DB.boss.phase === 'normal') { DB.boss.hp -= DB.applyVulnerable(DB.boss, 40 + state.wave * 5); DB.boss.flashT = 0.2; }
          state.skillCd = 6.0; state.flash = Math.max(state.flash, 0.4); state.shake = 25; state.hitstop = 0.1; DB.sfx.error();
        }
      }
    };

    DB.handleNumberKey = function(k) {
      if (state.qte.active) {
        const targetChar = state.qte.sequence[state.qte.inputIndex];
        if (k === targetChar) {
          state.qte.inputIndex++; DB.sfx.grab(); state.shake = Math.min(state.shake + 2, 10);
          if (state.qte.inputIndex >= state.qte.sequence.length) {
            state.qte.active = false; DB.boss = null;
            state.bossEnrageTextT = 0; state.bossEnrageFlash = 0;
            state.flash = 1.0; state.shake = 40; state.hitstop = 0.2;
            for (let i = 0; i < 120; i++) {
              DB.particles.push({ x: W/2 + (Math.random()-0.5)*600, y: 100 + Math.random()*500, vx: (Math.random()-0.5)*100, vy: 300 + Math.random()*500, life: 1.5, maxLife: 1.5, size: 4 + Math.random()*6, color: '#5ee6a8', spin: 0, rot: 0 });
            }
            state.hp = state.hpMax; state.energy = state.energyMax;
            for (let i = 0; i < 15; i++) {
              const angle = (i / 15) * Math.PI * 2; const dist = 100 + Math.random() * 150;
              DB.spawnChip(DB.player.x + Math.cos(angle) * dist, DB.player.y + Math.sin(angle) * dist);
            }
            for (let i = 0; i < 3; i++) { const w = DB.spawnWeapon('fire_shield'); if (w) w.warning = 0.001; }
            DB.sfx.clear(); state.waveBreakT = 4.0;
          }
        } else {
          state.qte.inputIndex = 0; state.qte.timer -= 1.0; state.damageFlash = 0.4; state.shake = 20; DB.sfx.error();
        }
      } else {
        if (k >= '1' && k <= '4') DB.tryUltimate(k);
      }
    };

    DB.handleMobileKey = function(key) {
      if (state.scene === 'title') { startGame(); return; }
      if (state.scene === 'gameover') { if (state.gameOverLock <= 0) backToTitle(); return; }
      if (key === 'shift') DB.triggerShift();
      else DB.handleNumberKey(key);
    };
  }

  /* ==================== 主循环 ==================== */
  function update(dt) {
    if (dt <= 0) return;
    state.t += dt;
    DB.updatePlayer(dt); DB.updateWeapons(dt); DB.updateEnemies(dt); DB.updateZones(dt); DB.updateBeams(dt); DB.updateChips(dt); DB.updateParticles(dt); DB.updateTerminal(dt); updateWaves(dt);

    if (state.comboTimer > 0) {
      state.comboTimer -= dt; if (state.comboTimer <= 0) state.combo = 0;
    }
    for (let i = DB.floaters.length - 1; i >= 0; i--) {
      const f = DB.floaters[i]; f.y += f.vy * dt; f.life -= dt; if (f.life <= 0) DB.floaters.splice(i, 1);
    }
  }

  let lastTime = performance.now();
  function frame(now) {
    const realDt = Math.min((now - lastTime) / 1000, 0.05); lastTime = now;

    state.shake *= Math.exp(-9 * realDt); if (state.shake < 0.15) state.shake = 0;
    state.flash *= Math.exp(-11 * realDt); if (state.flash < 0.004) state.flash = 0;
    state.damageFlash *= Math.exp(-10 * realDt); if (state.damageFlash < 0.004) state.damageFlash = 0;

    if (state.skillCd > 0) state.skillCd -= realDt;
    if (state.skillActiveT > 0) state.skillActiveT -= realDt;
    state.bossEnrageFlash *= Math.exp(-6 * realDt); if (state.bossEnrageFlash < 0.004) state.bossEnrageFlash = 0;
    if (state.bossEnrageTextT > 0) state.bossEnrageTextT = Math.max(0, state.bossEnrageTextT - realDt);

    if (state.scene === 'title') { state.t += realDt; render(); DB.updateHUD(); requestAnimationFrame(frame); return; }
    if (state.scene === 'gameover') {
      if (state.gameOverLock > 0) state.gameOverLock -= realDt;
      DB.updateParticles(realDt); render(); DB.updateHUD(); requestAnimationFrame(frame); return;
    }

    if (state.hp <= 0 && state.scene === 'playing') {
      state.scene = 'gameover'; state.gameOverLock = 0.6; state.hitstop = 0.12; state.shake = 30; DB.heldWeapon = null;
      state.bossEnrageTextT = 0; state.bossEnrageFlash = 0;
      if (state.score > highestScore) { highestScore = state.score; }
      const earnedPoints = Math.floor(state.score / 10);
      if (earnedPoints > 0) { sysPoints += earnedPoints; }
      
      saveDataToCloud(); // 数据变动，异步保存到云端
      showGameOver();
    }

    let dt = realDt; if (state.hitstop > 0) { state.hitstop -= realDt; dt = 0; }

    update(dt); render(); DB.updateHUD(); requestAnimationFrame(frame);
  }

  function init() {
    initBackground(); initVignette(); DB.buildHUD(); bindTitleEvents(); resetWorld(false); bindInput();
    
    // 尝试静默同步
    if (cloudToken) {
      syncDataFromCloud().then(() => {
        updateUpgradeUI();
        // 如果你是刷新页面，重新绑定一下按钮状态
        const btnLogin = document.getElementById('btn-login');
        if (btnLogin && currentUsername) {
           btnLogin.textContent = `👤 ${currentUsername} (点击退出)`;
           btnLogin.style.borderColor = 'rgba(94,230,168,0.8)';
        }
      });
    }

    state.scene = 'title'; showTitle();
    requestAnimationFrame((t) => { lastTime = t; requestAnimationFrame(frame); });
  } 

  init();

})(window.DB);