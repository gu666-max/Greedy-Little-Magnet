(() => {
  'use strict';
  const { Game, MODULES, clamp } = window.MagnetCore;
  const $ = id => document.getElementById(id);
  const canvas = $('game-canvas'), ctx = canvas.getContext('2d');
  const dom = Object.fromEntries(['score','timer','cargo','best-score','load-label','load-bar','load-note','hearts','pause-button','start-overlay','pause-overlay','result-overlay','help-overlay','event-toast'].map(id => [id, $(id)]));
  const storage = {
    get(key, fallback) { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    set(key, value) { try { localStorage.setItem(key, String(value)); } catch { /* Private/file browsing can deny storage; the game still works. */ } }
  };
  let selectedMode = storage.get('greedy-magnet-mode-v1', 'assembly') === 'classic' ? 'classic' : 'assembly';
  const bestKey = () => game.mode === 'assembly' ? 'greedy-magnet-best-assembly-v1' : 'greedy-magnet-best-v1';
  let best = 0;
  let sound = storage.get('greedy-magnet-sound-v1', 'on') === 'on';
  let audioContext, lastCollectSound = 0;
  let visualTime = 0, lastFrame = 0, hudClock = 0, toastDeadline = 0;
  let ground, groundW = 0, groundH = 0, helpWasPlaying = false;
  const texts = [], rings = [], keys = new Set(), holds = new Set();

  function unlockAudio() {
    if (!sound) return;
    try { audioContext ||= new (window.AudioContext || window.webkitAudioContext)(); if (audioContext.state === 'suspended') audioContext.resume().catch(() => {}); } catch { sound = false; updateSoundButton(); }
  }
  function tone(frequency, duration = .1, volume = .04, delay = 0, type = 'sine', endFrequency) {
    if (!sound || !audioContext || audioContext.state !== 'running') return;
    const now = audioContext.currentTime + delay;
    const oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
    oscillator.type = type; oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(.0001, now); gain.gain.exponentialRampToValueAtTime(volume, now + .008); gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(gain); gain.connect(audioContext.destination); oscillator.start(now); oscillator.stop(now + duration + .01);
  }
  function toast(message, duration = 2.5) {
    dom['event-toast'].textContent = message;
    dom['event-toast'].classList.add('visible');
    toastDeadline = performance.now() + duration * 1000;
  }
  function onEvent(event) {
    switch (event.type) {
      case 'start': tone(440, .12); tone(660, .15, .035, .09); toast(event.mode === 'assembly' ? '先吸发光部件！组装能力后再去拆木箱' : '开工！把宝贝送回左下角绿色回收站', 3.5); break;
      case 'install': {
        const module = MODULES[event.moduleType];
        tone(660, .12); tone(990, .17, .025, .1);
        toast(`已组装${module.name}！${module.description}`, 3.2);
        rings.push({ x: game.player.x, y: game.player.y, life: .6, color: module.color, radius: 28 }); break;
      }
      case 'duplicate': toast('这个部件装满了，换成一枚大金币！'); break;
      case 'shield': toast('装甲挡住了爆炸！宝贝和生命都保住了'); tone(460, .15, .03); break;
      case 'dash': tone(240, .18, .03, 0, 'triangle', 900); break;
      case 'ramHit': tone(160, .1, .03, 0, 'triangle', 380); toast('撞飞了！别回头，继续冲'); break;
      case 'collect':
        if (performance.now() - lastCollectSound > 65) { tone(event.itemType === 'gold' ? 1046 : 620 + game.cargo.length * 14, .065, .017); lastCollectSound = performance.now(); }
        break;
      case 'throw': tone(280, .16, .025, 0, 'triangle', 90); break;
      case 'bank':
        texts.push({ x: event.x, y: event.y - 40, text: `+${event.value} 已入账`, color: '#397353', life: 1.6 });
        rings.push({ x: event.x, y: event.y, life: .65, color: '#91b78c', radius: 35 });
        [523, 659, 784, 1046].forEach((f, i) => tone(f, .16, .026, i * .075));
        toast(`回收成功！+${event.value} 分，轻装再出发`); break;
      case 'explosion': rings.push({ x: event.x, y: event.y, life: .45, color: '#dc8663', radius: 85 }); tone(110, .24, .045, 0, 'sawtooth', 30); break;
      case 'damage': toast('炸到了！掉落的宝贝还能捡回来', 2.7); tone(210, .18, .045, 0, 'square', 80); break;
      case 'fuse': tone(880, .05, .014); break;
      case 'full': toast('装不下了！先回收，或松手甩出一些'); break;
      case 'crate': tone(160, .09, .025, 0, 'triangle'); break;
      case 'end': showResult(event); break;
    }
  }
  const game = new Game({ onEvent });
  dom['best-score'].textContent = best.toLocaleString('zh-CN');

  function rounded(x, y, w, h, radius = 8, fill, stroke, line = 1) {
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = line; ctx.stroke(); }
  }
  function ellipse(x, y, rx, ry, fill) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); }
  function line(x1, y1, x2, y2, color, width = 2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
  function label(text, x, y, size = 12, color = '#697968', align = 'center', weight = 600) {
    ctx.font = `${weight} ${size}px "Segoe UI","Microsoft YaHei",sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, x, y);
  }
  function shrub(x, y, scale = 1) {
    ellipse(x + 3, y + 6, 19 * scale, 7 * scale, '#4e6b4415');
    ellipse(x - 8 * scale, y, 12 * scale, 11 * scale, '#a6b397');
    ellipse(x + 7 * scale, y - 4 * scale, 13 * scale, 12 * scale, '#b3bf9d');
    ellipse(x, y - 9 * scale, 10 * scale, 10 * scale, '#c0c9a7');
    line(x, y + 9 * scale, x, y - 2 * scale, '#879c78', 2);
  }
  function buildGround() {
    groundW = game.width; groundH = game.height;
    ground = document.createElement('canvas'); ground.width = groundW; ground.height = groundH;
    // Draw static scenery once, then reuse it each frame.
    const g = ground.getContext('2d');
    g.fillStyle = '#e6e6d4'; g.fillRect(0, 0, groundW, groundH);
    const gradient = g.createLinearGradient(0, 0, groundW, groundH);
    gradient.addColorStop(0, '#eef0de'); gradient.addColorStop(1, '#dddfca');
    g.fillStyle = gradient; g.fillRect(18, 24, groundW - 36, groundH - 42);
    let seed = 9238;
    const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let i = 0; i < 950; i++) {
      const x = 25 + random() * (groundW - 50), y = 40 + random() * (groundH - 65), r = random() * 1.3 + .25;
      g.fillStyle = i % 3 === 0 ? '#c2c7ad45' : '#faf9e640'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    for (let i = 0; i < 17; i++) {
      g.fillStyle = '#c5ceaf22'; g.beginPath(); g.ellipse(80 + random() * (groundW - 160), 85 + random() * (groundH - 150), 30 + random() * 60, 20 + random() * 20, random() * 3, 0, Math.PI * 2); g.fill();
    }
    g.strokeStyle = '#cbd0b780'; g.lineWidth = 18; g.setLineDash([8, 14]);
    g.beginPath(); g.moveTo(210, groundH - 160); g.bezierCurveTo(groundW * .5, groundH * .63, groundW * .28, groundH * .44, groundW * .63, groundH * .48); g.stroke(); g.setLineDash([]);
    // Low timber fence around the yard, with broad, readable boundaries.
    g.fillStyle = '#afbaa040'; g.fillRect(15, 16, groundW - 30, 21); g.fillRect(15, groundH - 24, groundW - 30, 14);
    g.fillStyle = '#93a38b'; g.fillRect(13, 16, groundW - 26, 8); g.fillRect(13, groundH - 20, groundW - 26, 7);
    g.fillStyle = '#b5bea4'; g.fillRect(13, 12, groundW - 26, 5); g.fillRect(13, groundH - 24, groundW - 26, 4);
    for (let x = 24; x < groundW - 20; x += 65) {
      g.fillStyle = '#83977e'; g.fillRect(x, 8, 9, 28); g.fillRect(x, groundH - 31, 9, 24);
      g.fillStyle = '#b4bda0'; g.fillRect(x + 1, 8, 7, 4); g.fillRect(x + 1, groundH - 31, 7, 4);
    }
    for (const x of [13, groundW - 22]) {
      g.fillStyle = '#94a58a'; g.fillRect(x, 25, 8, groundH - 51); g.fillStyle = '#bcc4a7'; g.fillRect(x, 25, 3, groundH - 51);
      for (let y = 53; y < groundH - 40; y += 66) { g.fillStyle = '#83977e'; g.fillRect(x - 5, y, 17, 9); }
    }
    // Ground markings near the dock.
    const b = game.base;
    g.fillStyle = '#b9d0ac85'; g.beginPath(); g.roundRect(b.x - 7, b.y - 11, b.w + 14, b.h + 21, 17); g.fill();
    g.strokeStyle = '#87ab8590'; g.lineWidth = 2; g.setLineDash([8, 6]); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#97b69440'; g.fillRect(b.x + b.w - 30, b.y + 15, 24, b.h - 29);
    for (let y = b.y + 23; y < b.y + b.h - 15; y += 22) { g.strokeStyle = '#72996e55'; g.lineWidth = 3; g.beginPath(); g.moveTo(b.x + b.w - 24, y); g.lineTo(b.x + b.w - 11, y + 9); g.lineTo(b.x + b.w - 24, y + 18); g.stroke(); }
  }
  function drawBase(t) {
    const b = game.base, x = b.x + 17, y = b.y + 7;
    ellipse(x + 70, y + 70, 76, 19, '#536b441b');
    rounded(x, y, 136, 72, 8, '#8caf98', '#779982', 2);
    rounded(x + 14, y + 18, 108, 38, 4, '#567b62');
    rounded(x + 18, y + 23, 100, 32, 3, '#698b6e');
    line(x + 48, y + 23, x + 48, y + 53, '#78947b', 2); line(x + 82, y + 23, x + 82, y + 53, '#78947b', 2);
    ctx.beginPath(); ctx.moveTo(x - 9, y + 9); ctx.lineTo(x + 68, y - 24); ctx.lineTo(x + 145, y + 9); ctx.closePath(); ctx.fillStyle = '#739d80'; ctx.fill();
    line(x - 9, y + 9, x + 145, y + 9, '#5e866e', 4);
    rounded(x + 35, y - 6, 67, 24, 5, '#f5f2df', '#719476'); label('回收站', x + 68, y + 6, 12, '#54816a');
    rounded(x + 3, y + 68, 131, 9, 3, '#b8c9a3');
    label('↓ 进入绿区自动入账', b.x + b.w / 2, b.y + b.h - 19, 12, '#659365');
    label('SAFE ZONE', b.x + b.w / 2, b.y + b.h + 24, 8, '#90a184', 'center', 700);
    // Sign with an animated, subtle green status light.
    ellipse(x + 123, y + 10, 3.5, 3.5, `rgba(218,236,159,${.65 + Math.sin(t * 2) * .2})`);
  }
  function drawObstacle(o) {
    ctx.save(); ctx.translate(o.x, o.y);
    ellipse(o.w / 2 + 5, o.h - 1, o.w * .54, 13, '#53674724');
    if (o.kind === 'crate') {
      rounded(0, 0, o.w, o.h - 5, 5, '#b9946c', '#9f805e', 2);
      rounded(3, 0, o.w - 6, o.h - 13, 3, '#cfac7c');
      for (let y = 12; y < o.h - 12; y += 15) line(5, y, o.w - 5, y, '#b49268', 2);
      line(10, 4, o.w - 10, o.h - 17, '#e0bf8e', 9); line(o.w - 10, 4, 10, o.h - 17, '#e0bf8e', 9);
      rounded(0, 0, o.w, o.h - 12, 4, null, '#a98b63', 3);
      for (const x of [7, o.w - 7]) for (const y of [6, o.h - 19]) ellipse(x, y, 1.7, 1.7, '#87775e');
      if (o.hp === 1) { line(o.w * .5, 4, o.w * .35, 24, '#997957', 2); line(o.w * .35, 24, o.w * .52, 34, '#997957', 2); }
    } else if (o.kind === 'tires') {
      for (const [x, y, r] of [[22, 28, 23], [44, 34, 23], [33, 14, 24]]) {
        ellipse(x, y + 8, r, r * .57, '#5e716a'); ellipse(x, y, r, r * .57, '#75857b'); ellipse(x, y - 1, r * .56, r * .33, '#52665d'); ellipse(x, y - 2, r * .36, r * .22, '#a7b298');
        ctx.strokeStyle = '#88968a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(x, y, r - 3, r * .48, 0, Math.PI, Math.PI * 2); ctx.stroke();
      }
    } else {
      rounded(0, 5, o.w, o.h - 10, 10, '#8eaaa2', '#6e8e83', 2); rounded(8, -1, o.w - 16, 25, 6, '#b0c1ae', '#8da995', 2);
      rounded(12, 7, 24, 12, 3, '#687f70'); line(17, 9, 17, 15, '#ccce9a', 2); line(24, 9, 24, 15, '#ccce9a', 2); line(31, 9, 31, 15, '#ccce9a', 2);
      ellipse(o.w - 21, 11, 7, 7, '#d0b881'); ellipse(o.w - 21, 11, 3.5, 3.5, '#927e61');
      line(10, 31, o.w - 10, 31, '#779589', 2); rounded(10, o.h - 13, 12, 10, 3, '#6f8577'); rounded(o.w - 22, o.h - 13, 12, 10, 3, '#6f8577');
    }
    ctx.restore();
  }
  function drawItem(item, carried = false) {
    ctx.save(); ctx.translate(item.x, item.y); ctx.rotate(item.angle);
    if (!carried) ellipse(2, 5, item.radius * .9, item.radius * .43, '#53644717');
    if (item.module) {
      ctx.rotate(-item.angle);
      const module = MODULES[item.type];
      ellipse(0, 0, 24 + Math.sin(visualTime * 3) * 2, 24 + Math.sin(visualTime * 3) * 2, module.color + '24');
      ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2); ctx.strokeStyle = module.color + '99'; ctx.lineWidth = 1.5; ctx.stroke();
      drawModule(item.type, 0, 0, .8, visualTime);
    } else if (item.type === 'coin' || item.type === 'gold') {
      const r = item.radius;
      ellipse(0, 2, r, r * .83, '#bf9648'); ellipse(0, 0, r, r * .83, '#e8c568');
      ctx.beginPath(); ctx.ellipse(0, 0, r - 3, (r - 3) * .82, 0, 0, Math.PI * 2); ctx.strokeStyle = '#f7df94'; ctx.lineWidth = 1.5; ctx.stroke();
      if (item.type === 'gold') label('★', 0, 0, 14, '#c39944'); else line(0, -4, 0, 4, '#c59e4b', 2);
    } else if (item.type === 'gear') {
      ctx.beginPath();
      for (let i = 0; i < 32; i++) { const a = i / 32 * Math.PI * 2, r = i % 4 < 2 ? 13 : 9.5; if (!i) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fillStyle = '#8ba0a0'; ctx.fill(); ctx.strokeStyle = '#738d8c'; ctx.lineWidth = 1; ctx.stroke();
      ellipse(-1, -1, 6, 6, '#b8c4b3'); ellipse(0, 0, 3.5, 3.5, '#7e9892');
    } else if (item.type === 'can') {
      rounded(-8, -11, 16, 24, 3, '#c19b74', '#a88968'); rounded(-6, -8, 12, 18, 2, '#d5b28b');
      line(-4, -2, 4, -2, '#b69576', 1); line(-4, 3, 4, 3, '#b69576', 1); ellipse(0, -10, 7, 3, '#e0c19d'); ellipse(0, -10, 4, 1.5, '#b19472');
    } else {
      rounded(-3, -9, 6, 20, 1, '#a0b1ac', '#829992', 1);
      for (let y = -4; y < 10; y += 4) line(-3, y + 2, 3, y, '#7e9690', 1);
      rounded(-7, -11, 14, 7, 2, '#bbc6bb', '#8b9e94'); line(-4, -8, 4, -8, '#82978e', 1.5);
    }
    ctx.restore();
  }
  function drawModule(type, x, y, scale = 1, t = 0) {
    ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
    if (type === 'saw') {
      ctx.rotate(t * 5); ctx.beginPath();
      for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2, r = i % 2 ? 14 : 22; if (!i) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.closePath(); ctx.fillStyle = '#8aaeb9'; ctx.fill(); ctx.strokeStyle = '#587f8c'; ctx.lineWidth = 1.5; ctx.stroke(); ellipse(0, 0, 9, 9, '#d6c28e'); ellipse(0, 0, 4, 4, '#657c7c');
    } else if (type === 'armor') {
      ctx.beginPath(); ctx.moveTo(-18,-18); ctx.lineTo(18,-18); ctx.lineTo(16,4); ctx.quadraticCurveTo(0,25,-16,4); ctx.closePath(); ctx.fillStyle = '#9fbb8e'; ctx.fill(); ctx.strokeStyle = '#62856b'; ctx.lineWidth = 2; ctx.stroke();
      line(-10,-12,10,-12,'#d4ddad',2); line(0,-9,0,11,'#719478',3); ellipse(-12,-13,2,2,'#617e6b'); ellipse(12,-13,2,2,'#617e6b');
    } else if (type === 'spring') {
      rounded(-20, -16, 9, 32, 3, '#a190b4'); rounded(11,-16,9,32,3,'#a190b4');
      ctx.beginPath(); ctx.moveTo(-13,0); for (let i=0;i<6;i++) ctx.lineTo(-10+i*4,i%2?-10:10); ctx.lineTo(14,0); ctx.strokeStyle = '#78658e'; ctx.lineWidth = 3; ctx.stroke();
      line(-19,-12,-14,-12,'#d8cbe6',2); line(13,-12,18,-12,'#d8cbe6',2);
    } else if (type === 'ram') {
      rounded(-13, 4, 26, 9, 3, '#71857d', '#5d7369', 1.5);
      ctx.beginPath(); ctx.moveTo(-24,6); ctx.lineTo(-22,-11); ctx.lineTo(-13,-20); ctx.lineTo(13,-20); ctx.lineTo(22,-11); ctx.lineTo(24,6); ctx.closePath();
      ctx.fillStyle = '#9da99b'; ctx.fill(); ctx.strokeStyle = '#60796b'; ctx.lineWidth = 2; ctx.stroke();
      line(-18,-10,18,-10,'#d0d3bc',3);
      line(-11,-15,-6,-10,'#d5b372',4); line(1,-15,6,-10,'#d5b372',4); line(12,-15,17,-10,'#d5b372',4);
      rounded(-22,1,44,6,2,'#778d7e');
      ellipse(-17,-3,2,2,'#4e695d'); ellipse(17,-3,2,2,'#4e695d');
    }
    ctx.restore();
  }
  function drawEquipment(t) {
    const p = game.player;
    if (game.equipment.armor) {
      ctx.beginPath(); ctx.arc(p.x,p.y,game.radius+15,0,Math.PI*2); ctx.strokeStyle='#8fae8660'; ctx.lineWidth=7; ctx.stroke();
      for (let i=0;i<game.equipment.armor;i++) { const a=-Math.PI/2+i*2.1; drawModule('armor',p.x+Math.cos(a)*(game.radius+9),p.y+Math.sin(a)*(game.radius+9),.6,t); }
    }
    if (game.equipment.spring) drawModule('spring',p.x,p.y+35,.7,t);
    for (let i=0;i<game.equipment.saw;i++) {
      const a=game.elapsed*3.5+i*Math.PI;
      drawModule('saw',p.x+Math.cos(a)*(game.radius+25),p.y+Math.sin(a)*(game.radius+25),1,t);
    }
    if (game.dashTime > 0) {
      for (let i=1;i<=3;i++) { ctx.globalAlpha=.2/i; ellipse(p.x-game.dashDirection.x*i*22,p.y-game.dashDirection.y*i*22,24,24,'#a597c9'); } ctx.globalAlpha=1;
    }
  }
  function drawBomb(bomb, t) {
    ctx.save(); ctx.translate(bomb.x, bomb.y); ctx.rotate(bomb.angle);
    if (bomb.born > 0) ctx.globalAlpha = .5 + Math.sin(t * 20) * .25;
    const active = bomb.fuse >= 0;
    if (active) {
      ctx.beginPath(); ctx.arc(0, 0, 27 + Math.sin(t * 12) * 3, 0, Math.PI * 2); ctx.strokeStyle = '#d8776266'; ctx.lineWidth = 2; ctx.stroke();
    }
    ellipse(3, 14, 21, 8, '#4e635326');
    rounded(-5, -23, 10, 9, 2, '#6b7e76');
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.quadraticCurveTo(4, -34, 13, -27); ctx.strokeStyle = '#9b9471'; ctx.lineWidth = 3; ctx.stroke();
    ellipse(0, 0, 19, 19, '#536964'); ellipse(-3, -3, 15, 15, '#697d76'); ellipse(-6, -8, 5, 3, '#849487');
    rounded(-10, 0, 20, 10, 3, '#495f58'); ellipse(0, 5, 3.5, 3.5, active && Math.sin(t * 17) > 0 ? '#ffe19b' : '#dc8d71');
    if (active) { ctx.rotate(-bomb.angle); label('!', 0, -43, 16, '#c2785b', 'center', 800); }
    ctx.restore();
  }
  function drawMagnet(t) {
    const p = game.player, carrying = game.cargo.length;
    ctx.save(); ctx.translate(p.x, p.y);
    if (game.sucking) {
      const r = game.range;
      const glow = ctx.createRadialGradient(0, 0, 30, 0, 0, r); glow.addColorStop(0, '#b2dfd032'); glow.addColorStop(1, '#74b6aa08');
      ellipse(0, 0, r, r, glow);
      ctx.strokeStyle = '#70afa669'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 9]); ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      for (let i = 0; i < 3; i++) {
        const progress = (t * .8 + i / 3) % 1, radius = 35 + (r - 35) * (1 - progress);
        ctx.globalAlpha = Math.sin(progress * Math.PI) * .24; ctx.strokeStyle = '#4e9f97'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ellipse(4, 16, game.radius + 9, (game.radius + 9) * .42, '#486a4a28');
    for (let i = 0; i < carrying; i++) {
      const item = game.cargo[i], a = item.attachment + Math.sin(t * 3 + i) * .025;
      const r = 33 + Math.floor(i / 13) * 10 + (i % 3) * 3;
      drawItem({ ...item, x: Math.cos(a) * r, y: Math.sin(a) * r, angle: item.angle + p.angle }, true);
    }
    if (game.invincible > 0 && Math.floor(t * 14) % 2 === 0) ctx.globalAlpha = .55;
    ctx.rotate(p.angle);
    ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(-18, -25); ctx.lineTo(-18, 6); ctx.arc(0, 6, 18, Math.PI, 0, true); ctx.lineTo(18, -25); ctx.strokeStyle = '#df806b'; ctx.lineWidth = 15; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 24); ctx.arc(0, 6, 18, Math.PI / 2, 0, true); ctx.lineTo(18, -25); ctx.strokeStyle = '#678fb2'; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-20, -20); ctx.lineTo(-20, 4); ctx.strokeStyle = '#ed9b80'; ctx.lineWidth = 3; ctx.stroke();
    line(21, -20, 21, 3, '#85a7c3', 3);
    rounded(-25.5, -26, 15, 11, 2, '#faf2d9', '#e2d9bd'); rounded(10.5, -26, 15, 11, 2, '#faf2d9', '#e2d9bd');
    ellipse(-8, 13, 5.5, 6, '#fff6e1'); ellipse(8, 13, 5.5, 6, '#fff6e1');
    const lookX = clamp((game.target.x - p.x) / 80, -1.3, 1.3);
    ellipse(-8 + lookX, 14, 2.6, 3.2, '#324c45'); ellipse(8 + lookX, 14, 2.6, 3.2, '#324c45');
    ctx.beginPath(); ctx.moveTo(-4, 22); ctx.quadraticCurveTo(0, 26, 4, 22); ctx.strokeStyle = '#344e47'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.restore();
    if (game.state === 'playing' && carrying) {
      const value = game.cargoValue.toLocaleString('zh-CN'), width = 93 + value.length * 3;
      rounded(p.x - width / 2, p.y - game.radius - 36, width, 23, 11, '#fffbeded', '#d6dfc0');
      label(`携带 ${value} 分`, p.x, p.y - game.radius - 24, 10, '#987d42');
    }
  }
  function draw(t) {
    if (!ground || groundW !== game.width || groundH !== game.height) buildGround();
    ctx.clearRect(0, 0, game.width, game.height);
    ctx.save();
    if (game.shake > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches) ctx.translate(Math.sin(t * 107) * game.shake * 22, Math.cos(t * 113) * game.shake * 19);
    ctx.drawImage(ground, 0, 0);
    shrub(46, 53, .8); shrub(game.width - 53, 58, 1); shrub(game.width - 52, game.height - 50, .8); shrub(40, game.height * .43, .7);
    label('拾取区', game.width * .69, game.height * .51, 31, '#b1bba044', 'center', 800);
    label('ONE MORE?', game.width * .69, game.height * .51 + 31, 9, '#aab59b60', 'center', 700);
    drawBase(t);
    for (const item of game.items) {
      drawItem(item);
      if (item.module) label(MODULES[item.type].name, item.x, item.y + 35, 10, MODULES[item.type].color, 'center', 800);
      if (item.type === 'gold' && Math.sin(t * 2 + item.id) > .85) { line(item.x + 19, item.y - 15, item.x + 19, item.y - 6, '#ecd38b', 1.5); line(item.x + 14, item.y - 10.5, item.x + 24, item.y - 10.5, '#ecd38b', 1.5); }
    }
    for (const o of game.obstacles) drawObstacle(o);
    for (const b of game.bombs) if (!b.dead) drawBomb(b, t);
    for (const shot of game.projectiles) {
      line(shot.x - shot.vx * .023, shot.y - shot.vy * .023, shot.x, shot.y, '#f6edc2a0', 4); drawItem(shot);
    }
    drawEquipment(t); drawMagnet(t);
    const ram = game.ramHead;
    if (ram) {
      ctx.save(); ctx.translate(ram.x, ram.y); ctx.rotate(Math.atan2(game.facing.y,game.facing.x)+Math.PI/2);
      if (game.dashTime > 0) { rounded(-27,-23,54,35,9,'#e8ba5b50'); line(-21,-23,21,-23,'#f7d98c',4); }
      drawModule('ram',0,0,1,t); ctx.restore();
    }
    for (const ring of rings) {
      ctx.globalAlpha = ring.life * 1.2; ctx.beginPath(); ctx.arc(ring.x, ring.y, ring.radius + (1 - ring.life) * 50, 0, Math.PI * 2); ctx.strokeStyle = ring.color; ctx.lineWidth = 3; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const fx of game.effects) { ctx.globalAlpha = Math.min(1, fx.life / .25); rounded(fx.x, fx.y, fx.size, fx.size, 1, fx.color); }
    ctx.globalAlpha = 1;
    for (const text of texts) { ctx.globalAlpha = Math.min(1, text.life); label(text.text, text.x, text.y, 17, text.color, 'center', 800); }
    ctx.restore();
  }
  function updateHud() {
    dom.score.innerHTML = `${game.score.toLocaleString('zh-CN')}<span>分</span>`;
    dom.cargo.innerHTML = `${game.cargoValue.toLocaleString('zh-CN')}<span>分</span>`;
    const seconds = Math.ceil(game.time);
    dom.timer.textContent = `${String(Math.floor(seconds / 60)).padStart(2,'0')}:${String(seconds % 60).padStart(2,'0')}`;
    dom.timer.classList.toggle('timer-danger', seconds <= 10 && game.state === 'playing');
    const heavy = game.load > .66, mid = game.load > .3;
    dom['load-label'].textContent = heavy ? '贪心超载' : mid ? '有点沉了' : '轻装上阵';
    dom['load-note'].textContent = heavy ? '快去回收，转弯越来越难！' : mid ? '赚得不错，记得回去存钱' : '还很灵活，去捡点宝贝吧';
    dom['load-bar'].style.width = `${game.load * 100}%`;
    dom['load-bar'].style.background = heavy ? '#d38665' : mid ? '#c4ac61' : '#75a78b';
    dom.hearts.innerHTML = Array.from({length:3}, (_, i) => `<span${i >= game.health ? ' class="lost"' : ''}>♥</span>`).join(' ');
    dom.hearts.setAttribute('aria-label', `${game.health}格生命`);
    dom['pause-button'].disabled = game.state !== 'playing' && game.state !== 'paused';
    const assembly = game.mode === 'assembly';
    $('assembly-strip').classList.toggle('hidden', !assembly);
    if (assembly) {
      for (const [type, module] of Object.entries(MODULES)) {
        const count = game.equipment[type], slot = $(`slot-${type}`);
        slot.classList.toggle('installed', count > 0);
        slot.querySelector('small').textContent = count ? type === 'armor' ? `可挡 ${count} 次爆炸` : type === 'saw' ? `${count} 片 · 自动切箱` : type === 'ram' ? '顶碎木箱 · +4 重量' : '冲刺已解锁' : '未组装';
      }
      $('dash-button').disabled = !game.equipment.spring || game.dashCooldown > 0 || game.state !== 'playing';
      $('dash-button').innerHTML = game.dashCooldown > 0 ? `冷却 ${game.dashCooldown.toFixed(1)} 秒` : `弹簧冲刺 <kbd>Q</kbd>`;
      $('touch-dash').disabled = $('dash-button').disabled;
      $('touch-dash').textContent = game.dashCooldown > 0 ? `${game.dashCooldown.toFixed(1)}s` : game.equipment.spring ? 'ϟ 冲刺' : 'ϟ 找弹簧';
      $('mission-list').innerHTML = game.objectives.map(goal => `<span class="${goal.current >= goal.target ? 'done' : ''}">${goal.current >= goal.target ? '✓' : '○'} ${goal.label} <b>${Math.min(goal.current,goal.target)}/${goal.target}</b></span>`).join('');
    }
    $('touch-dash').classList.toggle('hidden',!assembly);
  }
  function hideOverlays() { for (const key of ['start-overlay','pause-overlay','result-overlay','help-overlay']) dom[key].classList.add('hidden'); }
  function clearInput() { keys.clear(); holds.clear(); mainPointer = null; $('touch-magnet').textContent = '按住吸取'; game.sucking = false; game.target = { x: game.player.x, y: game.player.y }; }
  function startGame() { unlockAudio(); clearInput(); texts.length = rings.length = 0; hideOverlays(); game.start(selectedMode); ground = null; updateHud(); canvas.focus({preventScroll:true}); }
  function selectMode(mode) {
    if (game.state !== 'ready') return;
    selectedMode = mode; game.mode = mode; game.reset(); ground = null;
    storage.set('greedy-magnet-mode-v1', mode);
    const assembly = mode === 'assembly';
    for (const option of ['assembly','classic']) { $(`mode-${option}`).classList.toggle('active',option===mode); $(`mode-${option}`).setAttribute('aria-pressed',String(option===mode)); }
    $('mode-edition').textContent = assembly ? '组装挑战 · 90 秒' : '经典回收 · 60 秒';
    $('field-mode').textContent = assembly ? 'ASSEMBLY / 01' : 'SCRAPYARD / 01';
    $('start-title').innerHTML = assembly ? '吸成一台战车。<br>还能开得回来吗？' : '宝贝都归你。<br>前提是，带得回来。';
    $('start-description').innerHTML = assembly ? '吸锯片、装甲、弹簧和撞击头，边捡边组装。<br>完成三项挑战，再把宝贝送回回收站！' : '吸走零件和金币，送回绿色回收站。<br>贪得越多，身体越笨重。小心炸弹也会被吸来！';
    $('start-duration').textContent = assembly ? '90 秒一局' : '60 秒一局';
    best = Math.max(0,Number(storage.get(bestKey(),'0')) || 0); dom['best-score'].textContent=best.toLocaleString('zh-CN');
    updateHud();
  }
  function pauseGame() {
    if (game.state === 'playing') { game.pause(); clearInput(); dom['pause-overlay'].classList.remove('hidden'); updateHud(); }
  }
  function resumeGame() { if (game.state !== 'paused' || !dom['help-overlay'].classList.contains('hidden')) return; clearInput(); game.resume(); dom['pause-overlay'].classList.add('hidden'); canvas.focus({preventScroll:true}); updateHud(); }
  function showResult(result) {
    clearInput();
    const newBest = result.score > best;
    if (newBest) { best = result.score; storage.set(bestKey(), best); dom['best-score'].textContent = best.toLocaleString('zh-CN'); }
    $('result-kicker').textContent = newBest ? 'NEW PERSONAL BEST · 新纪录' : '今日收工 · SHIFT COMPLETE';
    $('result-title').textContent = result.reason === 'health' ? '贪心，也要有分寸。' : result.score >= 2500 ? '废品场大富翁！' : result.score > 0 ? '这一袋，值了！' : '宝贝要送回来才算哦。';
    $('result-score').textContent = result.score.toLocaleString('zh-CN');
    $('result-banks').textContent = result.banks; $('result-items').textContent = result.items; $('result-lost').textContent = result.lost;
    $('result-comment').textContent = result.lost > 0 ? `还有 ${result.lost} 分没来得及回收。下次早点回来！` : result.reason === 'health' ? '远远甩出零件，可以提前引爆炸弹。' : '这次存得很及时。下一把，再多吸一点？';
    if (result.mode === 'assembly') {
      $('result-title').textContent = result.goals === 3 ? '战车大师，挑战全达成！' : result.reason === 'health' ? '这台战车，下次再升级。' : '废品战车，收工！';
      $('result-comment').textContent = `挑战完成 ${result.goals}/3 · 拆箱 ${game.cratesBroken} 个 · 组装 ${game.installedKinds.size} 种。${result.lost ? `还有 ${result.lost} 分没回收。` : '继续尝试不同组合吧！'}`;
    }
    hideOverlays(); dom['result-overlay'].classList.remove('hidden'); updateHud(); $('again-button').focus({preventScroll:true});
    tone(523, .2, .025); tone(newBest ? 1046 : 784, .3, .03, .17);
  }
  function updateSoundButton() { $('sound-button').classList.toggle('sound-enabled', sound); $('sound-button').setAttribute('aria-pressed', String(sound)); $('sound-button').setAttribute('aria-label', sound ? '关闭音效' : '开启音效'); $('sound-button').title = sound ? '关闭音效' : '开启音效'; }
  function setHold(source, active, release = true) {
    if (active) holds.add(source); else holds.delete(source);
    game.setSucking(holds.size > 0, release);
  }
  function pointerPosition(event) { const rect = canvas.getBoundingClientRect(); return { x: clamp((event.clientX - rect.left) / rect.width * game.width, 40, game.width - 40), y: clamp((event.clientY - rect.top) / rect.height * game.height, 55, game.height - 40) }; }
  let mainPointer = null;
  canvas.addEventListener('pointerdown', event => {
    if (game.state !== 'playing' || event.button !== 0 || mainPointer !== null) return;
    event.preventDefault(); unlockAudio(); canvas.focus({preventScroll:true}); mainPointer = event.pointerId;
    canvas.setPointerCapture(event.pointerId); game.target = pointerPosition(event); setHold('pointer', true);
  });
  canvas.addEventListener('pointermove', event => {
    if (game.state !== 'playing') return;
    if (event.pointerType === 'mouse' || event.pointerId === mainPointer) game.target = pointerPosition(event);
  });
  function releasePointer(event, shouldThrow) { if (event.pointerId !== mainPointer) return; mainPointer = null; setHold('pointer', false, shouldThrow); }
  canvas.addEventListener('pointerup', event => releasePointer(event, true));
  canvas.addEventListener('pointercancel', event => releasePointer(event, false));
  canvas.addEventListener('lostpointercapture', event => releasePointer(event, false));
  canvas.addEventListener('contextmenu', event => event.preventDefault());
  const touchButton = $('touch-magnet');
  touchButton.addEventListener('pointerdown', event => { if (game.state !== 'playing') return; event.preventDefault(); unlockAudio(); touchButton.setPointerCapture(event.pointerId); setHold('touch-button', true); touchButton.textContent = '松开甩出'; });
  touchButton.addEventListener('pointerup', () => { setHold('touch-button', false); touchButton.textContent = '按住吸取'; });
  touchButton.addEventListener('pointercancel', () => { setHold('touch-button', false, false); touchButton.textContent = '按住吸取'; });
  window.addEventListener('keydown', event => {
    if (event.code === 'Escape') {
      if (!dom['help-overlay'].classList.contains('hidden')) closeHelp();
      else if (game.state === 'playing') pauseGame(); else if (game.state === 'paused') resumeGame();
      return;
    }
    if (game.state !== 'playing' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (['KeyQ','ShiftLeft','ShiftRight'].includes(event.code)) { event.preventDefault(); if (!event.repeat) game.dash(keyboardInput()); return; }
    if (['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(event.code)) {
      event.preventDefault(); keys.add(event.code); if (event.code === 'Space' && !event.repeat) { unlockAudio(); setHold('space', true); }
    }
  });
  window.addEventListener('keyup', event => { keys.delete(event.code); if (event.code === 'Space') { if (game.state === 'playing') event.preventDefault(); setHold('space', false); } });
  document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); });
  window.addEventListener('blur', pauseGame);
  function openHelp() { helpWasPlaying = game.state === 'playing'; if (helpWasPlaying) { game.pause(); clearInput(); } $('assembly-help').classList.toggle('hidden',game.mode!=='assembly'); dom['help-overlay'].classList.remove('hidden'); $('close-help-button').focus({preventScroll:true}); updateHud(); }
  function closeHelp() { dom['help-overlay'].classList.add('hidden'); if (helpWasPlaying) { game.resume(); canvas.focus({preventScroll:true}); } helpWasPlaying = false; updateHud(); }
  $('start-button').addEventListener('click', startGame); $('again-button').addEventListener('click', startGame); $('restart-button').addEventListener('click', startGame);
  $('resume-button').addEventListener('click', resumeGame);
  $('pause-button').addEventListener('click', () => game.state === 'paused' ? resumeGame() : pauseGame());
  $('home-button').addEventListener('click', () => { hideOverlays(); game.home(); dom['start-overlay'].classList.remove('hidden'); texts.length = rings.length = 0; updateHud(); });
  $('sound-button').addEventListener('click', () => { sound = !sound; storage.set('greedy-magnet-sound-v1', sound ? 'on' : 'off'); updateSoundButton(); if (sound) { unlockAudio(); tone(659, .08); } });
  $('help-button').addEventListener('click', openHelp); $('close-help-button').addEventListener('click', closeHelp);
  $('mode-assembly').addEventListener('click', () => selectMode('assembly')); $('mode-classic').addEventListener('click', () => selectMode('classic'));
  $('dash-button').addEventListener('click', () => { unlockAudio(); game.dash(keyboardInput()); canvas.focus({preventScroll:true}); });
  $('touch-dash').addEventListener('click', () => { unlockAudio(); game.dash(keyboardInput()); });
  function keyboardInput() { return { x: Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft')), y: Number(keys.has('KeyS') || keys.has('ArrowDown')) - Number(keys.has('KeyW') || keys.has('ArrowUp')) }; }
  function resize() {
    const mobile = matchMedia('(max-width:600px)').matches;
    const rect = canvas.getBoundingClientRect();
    const w = mobile ? 760 : 1200, h = mobile ? 950 : Math.round(w * rect.height / rect.width);
    game.resize(w, h);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(rect.width * dpr); canvas.height = Math.round(rect.height * dpr);
    ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0);
    ground = null;
  }
  new ResizeObserver(resize).observe($('playfield'));
  function frame(now) {
    const dt = Math.min(.05, Math.max(0, (now - (lastFrame || now)) / 1000)); lastFrame = now;
    if (game.state !== 'paused') visualTime += dt;
    game.step(dt, keyboardInput());
    if (game.state === 'playing') {
      for (let i = texts.length - 1; i >= 0; i--) { texts[i].life -= dt; texts[i].y -= dt * 27; if (texts[i].life <= 0) texts.splice(i, 1); }
      for (let i = rings.length - 1; i >= 0; i--) { rings[i].life -= dt; if (rings[i].life <= 0) rings.splice(i, 1); }
    }
    draw(visualTime);
    hudClock += dt; if (hudClock >= .1) { updateHud(); hudClock = 0; }
    if (toastDeadline && now > toastDeadline) { dom['event-toast'].classList.remove('visible'); toastDeadline = 0; }
    requestAnimationFrame(frame);
  }
  const assemblyHelp = document.createElement('p'); assemblyHelp.id='assembly-help'; assemblyHelp.textContent='战车部件自动安装，回收和甩出不会卸掉：锯片切箱、装甲挡一次爆炸、前置撞击头顶碎木箱；装上弹簧后，用 Q / Shift 或按钮冲刺，撞击头可击飞炸弹。冲刺冷却5秒，普通移动仍需躲炸弹。本局完成三项目标获得满挑战评价。'; $('close-help-button').before(assemblyHelp);
  updateSoundButton(); selectMode(selectedMode); resize(); updateHud(); requestAnimationFrame(frame);
})();
