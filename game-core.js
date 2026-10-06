(function (root) {
  'use strict';
  const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
  const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const MODULES = {
    saw: { name: '旋转锯片', weight: 6, cap: 2, color: '#739aab', description: '自动切碎身边的木箱' },
    armor: { name: '装甲板', weight: 6, cap: 3, color: '#8aab80', description: '每块抵挡一次爆炸' },
    spring: { name: '弹簧推进器', weight: 4, cap: 1, color: '#b399c4', description: '按 Q / Shift 冲刺，冷却 5 秒' },
    ram: { name: '前置撞击头', weight: 4, cap: 1, color: '#ba9475', description: '顶碎木箱，冲刺击飞炸弹' }
  };
  const TYPES = {
    screw: { value: 10, weight: 1, radius: 9, color: '#8fa6a5' },
    gear: { value: 25, weight: 2, radius: 13, color: '#86979b' },
    can: { value: 40, weight: 3, radius: 12, color: '#d3a87d' },
    coin: { value: 60, weight: 1, radius: 10, color: '#e7bd55' },
    gold: { value: 120, weight: 2, radius: 14, color: '#dfb14a' }
  };
  for (const [type, config] of Object.entries(MODULES)) TYPES[type] = { value: 0, weight: 0, radius: 19, color: config.color, module: true };

  class Game {
    constructor(options = {}) {
      this.random = options.random || Math.random;
      this.onEvent = options.onEvent || (() => {});
      this.width = options.width || 1200;
      this.height = options.height || 760;
      this.sequence = 0;
      this.state = 'ready';
      this.mode = 'classic';
      this.reset();
    }
    get cargoValue() { return this.cargo.reduce((sum, item) => sum + item.value, 0); }
    get weight() { return this.cargo.reduce((sum, item) => sum + item.weight, 0) + Object.entries(this.equipment || {}).reduce((sum, [type, count]) => sum + MODULES[type].weight * count, 0); }
    get radius() { return 25 + Math.sqrt(this.cargo.length) * 3.2; }
    get range() { return 180 + Math.min(90, this.weight * 1.5); }
    get load() { return clamp(this.weight / 60, 0, 1); }
    get ramHead() {
      if (!this.equipment.ram) return null;
      return { x: this.player.x + this.facing.x * (this.radius + 10), y: this.player.y + this.facing.y * (this.radius + 10), radius: 23 };
    }
    get objectives() {
      return [
        { label: '组装 3 种部件', current: this.installedKinds.size, target: 3 },
        { label: '拆掉 3 个木箱', current: this.cratesBroken, target: 3 },
        { label: '回收 1500 分', current: this.score, target: 1500 }
      ];
    }
    rand(low, high) { return low + this.random() * (high - low); }
    emit(type, data = {}) { this.onEvent({ type, ...data }); }
    reset() {
      this.duration = this.mode === 'assembly' ? 90 : 60;
      this.time = this.duration;
      this.elapsed = 0;
      this.score = 0;
      this.health = 3;
      this.banks = 0;
      this.collected = 0;
      this.equipment = { saw: 0, armor: 0, spring: 0, ram: 0 };
      this.installedKinds = new Set();
      this.cratesBroken = 0;
      this.moduleClock = 0;
      this.dashTime = 0;
      this.dashCooldown = 0;
      this.dashDirection = { x: 0, y: -1 };
      this.facing = { x: 0, y: -1 };
      this.lastDirection = { x: 0, y: -1 };
      this.cargo = [];
      this.items = [];
      this.bombs = [];
      this.projectiles = [];
      this.effects = [];
      this.shake = 0;
      this.sucking = false;
      this.spawnClock = 0;
      this.bombClock = 0;
      this.bankCooldown = 0;
      this.invincible = 0;
      this.fullNotice = 0;
      this.base = { x: 46, y: this.height - 225, w: 216, h: 168 };
      this.player = { x: this.width * .4, y: this.height * .55, vx: 0, vy: 0, angle: -.2 };
      this.target = { x: this.player.x, y: this.player.y };
      this.obstacles = [
        { x: this.width * .18, y: this.height * .26, w: 78, h: 64, kind: 'crate', hp: 2 },
        { x: this.width * .63, y: this.height * .25, w: 86, h: 66, kind: 'crate', hp: 2 },
        { x: this.width * .76, y: this.height * .67, w: 74, h: 67, kind: 'crate', hp: 2 },
        { x: this.width * .43, y: this.height * .79, w: 65, h: 60, kind: 'tires', hp: Infinity },
        { x: this.width * .79, y: this.height * .38, w: 77, h: 54, kind: 'machine', hp: Infinity },
        { x: this.width * .34, y: this.height * .14, w: 65, h: 54, kind: 'tires', hp: Infinity }
      ];
      for (let i = 0; i < 78; i++) this.spawnItem();
      // A small, reachable first reward teaches collection before danger appears.
      for (let i = 0; i < 7; i++) this.makeItem('coin', this.player.x + 50 + (i % 3) * 28, this.player.y - 50 + Math.floor(i / 3) * 30);
      for (let i = 0; i < 3; i++) this.spawnBomb();
      if (this.mode === 'assembly') {
        for (const [rx, ry] of [[.5, .34], [.57, .7], [.85, .17]]) this.obstacles.push({ x: this.width * rx, y: this.height * ry, w: 65, h: 56, kind: 'crate', hp: 2 });
        this.makeItem('saw', this.player.x + 65, this.player.y - 65);
        this.makeItem('spring', this.player.x - 85, this.player.y + 45);
        this.spawnModule('armor');
        this.makeItem('ram', this.player.x + 90, this.player.y + 40);
      }
    }
    start(mode = this.mode) { this.mode = mode === 'assembly' ? 'assembly' : 'classic'; this.reset(); this.state = 'playing'; this.emit('start', { mode: this.mode }); }
    pause() { if (this.state === 'playing') { this.state = 'paused'; this.sucking = false; } }
    resume() { if (this.state === 'paused') this.state = 'playing'; }
    home() { this.state = 'ready'; this.reset(); }
    resize(width, height) {
      if (width === this.width && height === this.height) return;
      const sx = width / this.width, sy = height / this.height;
      for (const entity of [...this.items, ...this.bombs, ...this.projectiles, this.player, this.target]) {
        entity.x *= sx; entity.y *= sy;
      }
      for (const obstacle of this.obstacles) { obstacle.x *= sx; obstacle.y *= sy; }
      this.width = width; this.height = height;
      this.base = { x: 46, y: height - 225, w: 216, h: 168 };
      this.player.x = clamp(this.player.x, 45, width - 45);
      this.player.y = clamp(this.player.y, 45, height - 45);
    }
    inBase(p) { const b = this.base; return p.x > b.x && p.x < b.x + b.w && p.y > b.y && p.y < b.y + b.h; }
    intersects(p, radius, box) {
      return Math.hypot(p.x - clamp(p.x, box.x, box.x + box.w), p.y - clamp(p.y, box.y, box.y + box.h)) < radius;
    }
    freePosition(radius = 15) {
      for (let i = 0; i < 80; i++) {
        const p = { x: this.rand(55, this.width - 55), y: this.rand(70, this.height - 55) };
        if (!this.inBase(p) && !this.obstacles.some(o => this.intersects(p, radius + 10, o)) && distance(p, { x: this.base.x + 100, y: this.base.y + 80 }) > 185) return p;
      }
      return { x: this.width * .55, y: this.height * .5 };
    }
    makeItem(type, x, y, extra = {}) {
      const item = { id: ++this.sequence, type, ...TYPES[type], x, y, vx: 0, vy: 0, angle: this.rand(0, Math.PI * 2), spin: this.rand(-2, 2), cooldown: 0, ...extra };
      this.items.push(item);
      return item;
    }
    spawnItem() {
      const roll = this.random();
      const type = roll < .37 ? 'screw' : roll < .63 ? 'gear' : roll < .78 ? 'can' : roll < .97 ? 'coin' : 'gold';
      const p = this.freePosition(TYPES[type].radius);
      this.makeItem(type, p.x, p.y);
    }
    spawnModule(type) {
      if (this.mode !== 'assembly') return;
      const p = this.freePosition(25); this.makeItem(type, p.x, p.y);
    }
    install(type) {
      if (this.mode !== 'assembly' || !MODULES[type]) return false;
      const config = MODULES[type];
      if (this.equipment[type] >= config.cap) {
        this.makeItem('gold', this.player.x, this.player.y);
        this.emit('duplicate', { moduleType: type });
        return false;
      }
      this.equipment[type]++;
      this.installedKinds.add(type);
      this.effect(this.player.x, this.player.y, config.color, 20);
      this.emit('install', { moduleType: type, count: this.equipment[type] });
      return true;
    }
    dash(input = {}) {
      if (this.state !== 'playing' || !this.equipment.spring || this.dashCooldown > 0) return false;
      let dx = input.x || 0, dy = input.y || 0;
      if (!dx && !dy) { dx = this.target.x - this.player.x; dy = this.target.y - this.player.y; }
      const length = Math.hypot(dx, dy);
      this.dashDirection = length > 5 || input.x || input.y ? { x: dx / length, y: dy / length } : { ...this.lastDirection };
      this.facing = { ...this.dashDirection };
      this.dashTime = .28;
      this.dashCooldown = 5;
      this.invincible = Math.max(this.invincible, .4);
      this.emit('dash');
      return true;
    }
    updateEquipment(dt) {
      const p = this.player;
      if (this.equipment.saw) {
        for (let i = 0; i < this.equipment.saw; i++) {
          const angle = this.elapsed * 3.5 + i * Math.PI;
          const blade = { x: p.x + Math.cos(angle) * (this.radius + 25), y: p.y + Math.sin(angle) * (this.radius + 25) };
          for (const o of [...this.obstacles]) if (o.kind === 'crate' && this.intersects(blade, 20, o)) this.breakCrate(o);
        }
      }
      const ram = this.ramHead;
      if (ram) {
        for (const o of [...this.obstacles]) if (o.kind === 'crate' && this.intersects(ram, ram.radius, o)) this.breakCrate(o);
        if (this.dashTime > 0) for (const bomb of this.bombs) {
          if (!bomb.dead && !bomb.knockback && distance(ram, bomb) < ram.radius + bomb.radius) {
            bomb.vx = this.dashDirection.x * 1100;
            bomb.vy = this.dashDirection.y * 1100;
            bomb.knockback = .65;
            if (bomb.fuse < 0) bomb.fuse = 2.6;
            this.effect(bomb.x, bomb.y, '#e0ba78', 8);
            this.emit('ramHit');
          }
        }
      }
      this.moduleClock += dt;
      if (this.mode === 'assembly' && this.moduleClock >= 12) {
        this.moduleClock = 0;
        const available = Object.keys(MODULES).filter(type => this.equipment[type] < MODULES[type].cap && !this.items.some(item => item.type === type));
        if (available.length) this.spawnModule(available[Math.floor(this.random() * available.length)]);
      }
    }
    spawnBomb() {
      let p;
      for (let i = 0; i < 80; i++) { p = this.freePosition(23); if (distance(p, this.player) > 270 && !this.bombs.some(b => distance(b, p) < 100)) break; }
      if (distance(p, this.player) < 150) return;
      this.bombs.push({ id: ++this.sequence, ...p, vx: this.rand(-9, 9), vy: this.rand(-9, 9), radius: 19, angle: this.rand(-.3, .3), fuse: -1, dead: false, born: .8 });
      if (this.state === 'playing') this.emit('bombSpawn');
    }
    setSucking(value, release = true) {
      if (this.state !== 'playing') { this.sucking = false; return; }
      const was = this.sucking;
      this.sucking = value;
      if (was && !value && release) this.throwCargo();
    }
    throwCargo() {
      if (!this.cargo.length) return;
      const count = Math.min(12, Math.max(1, Math.ceil(this.cargo.length * .35)));
      const speed = Math.hypot(this.player.vx, this.player.vy);
      let angle = speed > 20 ? Math.atan2(this.player.vy, this.player.vx) : Math.atan2(this.target.y - this.player.y, this.target.x - this.player.x);
      if (distance(this.target, this.player) < 5 && speed <= 20) angle = this.player.angle - Math.PI / 2;
      for (let i = 0; i < count; i++) {
        const item = this.cargo.pop();
        const spread = angle + (i - (count - 1) / 2) * .11;
        this.projectiles.push({ ...item, x: this.player.x + Math.cos(spread) * (this.radius + 15), y: this.player.y + Math.sin(spread) * (this.radius + 15), vx: Math.cos(spread) * 640, vy: Math.sin(spread) * 640, life: .8 });
      }
      this.emit('throw', { count });
    }
    bank() {
      if (!this.cargo.length || this.bankCooldown > 0) return;
      const value = this.cargoValue;
      this.score += value;
      this.banks++;
      this.cargo.length = 0;
      this.bankCooldown = .6;
      this.invincible = Math.max(this.invincible, .7);
      this.effect(this.player.x, this.player.y, '#9abb77', 28);
      this.emit('bank', { value, x: this.player.x, y: this.player.y });
    }
    effect(x, y, color, count = 12) {
      for (let i = 0; i < count; i++) {
        const angle = this.rand(0, Math.PI * 2), speed = this.rand(35, 210);
        this.effects.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: this.rand(.3, .8), maxLife: .8, color, size: this.rand(2, 6) });
      }
      if (this.effects.length > 220) this.effects.splice(0, this.effects.length - 220);
    }
    explode(bomb) {
      if (bomb.dead) return;
      bomb.dead = true;
      this.effect(bomb.x, bomb.y, '#e48a60', 25);
      this.effect(bomb.x, bomb.y, '#e9c375', 12);
      this.shake = Math.max(this.shake, .24);
      this.emit('explosion', { x: bomb.x, y: bomb.y });
      if (distance(this.player, bomb) < 90 + this.radius && this.invincible <= 0 && !this.inBase(this.player)) {
        if (this.equipment.armor > 0) {
          this.equipment.armor--;
          this.invincible = 1.2;
          this.effect(this.player.x, this.player.y, MODULES.armor.color, 18);
          this.emit('shield');
        } else {
          this.health--;
          this.invincible = 2;
          const count = Math.ceil(this.cargo.length * .45);
          for (let i = 0; i < count; i++) {
            const item = this.cargo.pop(), angle = this.rand(0, Math.PI * 2);
            this.makeItem(item.type, clamp(this.player.x + Math.cos(angle) * 60, 40, this.width - 40), clamp(this.player.y + Math.sin(angle) * 60, 40, this.height - 40), { vx: Math.cos(angle) * 170, vy: Math.sin(angle) * 170, cooldown: 1.1 });
          }
          this.emit('damage', { health: this.health });
        }
      }
      for (const obstacle of [...this.obstacles]) {
        if (obstacle.kind === 'crate' && this.intersects(bomb, 95, obstacle)) this.breakCrate(obstacle);
      }
      if (this.health <= 0) this.end('health');
    }
    breakCrate(obstacle) {
      const i = this.obstacles.indexOf(obstacle);
      if (i < 0) return;
      this.obstacles.splice(i, 1);
      this.cratesBroken++;
      this.effect(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2, '#bd9367', 18);
      for (let j = 0; j < 7; j++) this.makeItem(j < 3 ? 'coin' : 'gear', obstacle.x + this.rand(5, obstacle.w - 5), obstacle.y + this.rand(5, obstacle.h - 5));
      if (this.mode === 'assembly' && this.cratesBroken % 2 === 0) {
        const missing = Object.keys(MODULES).filter(type => this.equipment[type] < MODULES[type].cap);
        if (missing.length) this.makeItem(missing[Math.floor(this.random() * missing.length)], obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2);
      }
      this.emit('crate');
    }
    end(reason) {
      if (this.state !== 'playing') return;
      this.state = 'ended';
      this.sucking = false;
      this.emit('end', { reason, score: this.score, banks: this.banks, items: this.collected, lost: this.cargoValue, mode: this.mode, goals: this.objectives.filter(goal => goal.current >= goal.target).length });
    }
    collidePlayer() {
      const p = this.player, r = this.radius;
      p.x = clamp(p.x, 30 + r, this.width - 30 - r);
      p.y = clamp(p.y, 42 + r, this.height - 30 - r);
      for (const o of this.obstacles) {
        const cx = clamp(p.x, o.x, o.x + o.w), cy = clamp(p.y, o.y, o.y + o.h);
        let dx = p.x - cx, dy = p.y - cy, d = Math.hypot(dx, dy);
        if (d >= r) continue;
        if (d === 0) {
          const sides = [ { d: p.x - o.x, x: -1, y: 0 }, { d: o.x + o.w - p.x, x: 1, y: 0 }, { d: p.y - o.y, x: 0, y: -1 }, { d: o.y + o.h - p.y, x: 0, y: 1 } ];
          sides.sort((a, b) => a.d - b.d);
          p.x += sides[0].x * (sides[0].d + r); p.y += sides[0].y * (sides[0].d + r);
          p.vx *= .25; p.vy *= .25;
        } else {
          dx /= d; dy /= d;
          p.x += dx * (r - d); p.y += dy * (r - d);
          const dot = p.vx * dx + p.vy * dy;
          if (dot < 0) { p.vx -= dot * dx; p.vy -= dot * dy; }
        }
      }
    }
    step(dt, input = {}) {
      if (this.state !== 'playing') return;
      dt = clamp(dt, 0, .05);
      this.elapsed += dt;
      this.time = Math.max(0, this.duration - this.elapsed);
      this.bankCooldown = Math.max(0, this.bankCooldown - dt);
      this.invincible = Math.max(0, this.invincible - dt);
      this.fullNotice = Math.max(0, this.fullNotice - dt);
      this.shake = Math.max(0, this.shake - dt);
      this.dashTime = Math.max(0, this.dashTime - dt);
      this.dashCooldown = Math.max(0, this.dashCooldown - dt);
      const p = this.player;
      const speed = 300 / (1 + this.weight / 48);
      let dx = input.x || 0, dy = input.y || 0;
      if (!dx && !dy) {
        dx = this.target.x - p.x; dy = this.target.y - p.y;
        const len = Math.hypot(dx, dy);
        const slow = Math.min(1, len / 45);
        if (len > 2) { dx = dx / len * slow; dy = dy / len * slow; } else { dx = 0; dy = 0; }
      } else {
        const len = Math.hypot(dx, dy); dx /= len; dy /= len;
        this.target.x = p.x; this.target.y = p.y;
      }
      const turn = 1 - Math.exp(-dt * (9 / (1 + this.weight / 22)));
      if (dx || dy) { const len = Math.hypot(dx, dy); this.lastDirection = { x: dx / len, y: dy / len }; }
      if (this.dashTime > 0) { p.vx = this.dashDirection.x * 850; p.vy = this.dashDirection.y * 850; }
      else { p.vx += (dx * speed - p.vx) * turn; p.vy += (dy * speed - p.vy) * turn; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      this.collidePlayer();
      if (this.dashTime <= 0 && Math.hypot(p.vx, p.vy) > 15) {
        const angle = Math.atan2(p.vy, p.vx);
        const current = Math.atan2(this.facing.y, this.facing.x);
        const delta = Math.atan2(Math.sin(angle - current), Math.cos(angle - current));
        const next = current + delta * (1 - Math.exp(-dt * 14));
        this.facing = { x: Math.cos(next), y: Math.sin(next) };
      }
      const desired = clamp(p.vx / 900, -.35, .35);
      p.angle += (desired - p.angle) * Math.min(1, dt * 5);

      for (let i = this.items.length - 1; i >= 0; i--) {
        const item = this.items[i];
        item.cooldown = Math.max(0, item.cooldown - dt);
        const dist = distance(item, p);
        if (this.sucking && item.cooldown <= 0 && dist < this.range && (item.module || this.cargo.length < 42)) {
          const force = 550 + (1 - dist / this.range) * 1500;
          item.vx += (p.x - item.x) / Math.max(1, dist) * force * dt;
          item.vy += (p.y - item.y) / Math.max(1, dist) * force * dt;
        }
        item.vx *= Math.exp(-dt * 3); item.vy *= Math.exp(-dt * 3);
        item.x = clamp(item.x + item.vx * dt, 40, this.width - 40);
        item.y = clamp(item.y + item.vy * dt, 50, this.height - 40);
        item.angle += item.spin * dt * Math.min(1, Math.hypot(item.vx, item.vy) / 80);
        if (this.sucking && item.cooldown <= 0 && distance(item, p) < this.radius + item.radius && (item.module || this.cargo.length < 42)) {
          this.items.splice(i, 1);
          if (item.module) this.install(item.type);
          else this.cargo.push({ ...item, attachment: this.rand(0, Math.PI * 2) });
          this.collected++;
          this.emit('collect', { value: item.value, itemType: item.type });
        }
      }
      if (this.cargo.length >= 42 && this.sucking && this.fullNotice <= 0) { this.emit('full'); this.fullNotice = 5; }
      this.updateEquipment(dt);
      if (this.state !== 'playing') return;

      for (const bomb of this.bombs) {
        if (bomb.dead) continue;
        bomb.born = Math.max(0, bomb.born - dt);
        bomb.knockback = Math.max(0, (bomb.knockback || 0) - dt);
        const dist = distance(bomb, p);
        if (this.sucking && bomb.knockback <= 0 && dist < this.range + 8 && !this.inBase(p)) {
          if (bomb.fuse < 0) { bomb.fuse = 2.6; this.emit('fuse'); }
          const force = 280 + (1 - dist / this.range) * 530;
          bomb.vx += (p.x - bomb.x) / Math.max(1, dist) * force * dt;
          bomb.vy += (p.y - bomb.y) / Math.max(1, dist) * force * dt;
        }
        bomb.vx *= Math.exp(-dt * (bomb.knockback > 0 ? .7 : 1.8)); bomb.vy *= Math.exp(-dt * (bomb.knockback > 0 ? .7 : 1.8));
        bomb.x = clamp(bomb.x + bomb.vx * dt, 50, this.width - 50);
        bomb.y = clamp(bomb.y + bomb.vy * dt, 65, this.height - 45);
        // No attraction through scenery: a bomb can be blocked by a crate or machine.
        for (const o of this.obstacles) {
          if (!this.intersects(bomb, bomb.radius, o)) continue;
          const cx = clamp(bomb.x, o.x, o.x + o.w), cy = clamp(bomb.y, o.y, o.y + o.h);
          const d = Math.max(.001, Math.hypot(bomb.x - cx, bomb.y - cy));
          bomb.x += (bomb.x - cx) / d * (bomb.radius - d);
          bomb.y += (bomb.y - cy) / d * (bomb.radius - d);
          bomb.vx *= .15; bomb.vy *= .15;
        }
        if (bomb.fuse >= 0) bomb.fuse -= dt;
        if (bomb.born <= 0 && ((bomb.knockback <= 0 && distance(bomb, p) < this.radius + 18) || (bomb.fuse < .001 && bomb.fuse > -.1))) this.explode(bomb);
        if (this.state !== 'playing') break;
      }
      this.bombs = this.bombs.filter(b => !b.dead);
      if (this.state !== 'playing') return;

      for (let i = this.projectiles.length - 1; i >= 0; i--) {
        const shot = this.projectiles[i];
        shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt; shot.angle += dt * 9;
        let hit = false;
        for (const bomb of this.bombs) {
          if (!bomb.dead && distance(shot, bomb) < shot.radius + bomb.radius) { this.explode(bomb); hit = true; break; }
        }
        if (!hit) for (const o of [...this.obstacles]) {
          if (this.intersects(shot, shot.radius, o)) { if (o.kind === 'crate' && --o.hp <= 0) this.breakCrate(o); hit = true; break; }
        }
        if (hit || shot.life <= 0 || shot.x < 35 || shot.x > this.width - 35 || shot.y < 45 || shot.y > this.height - 35) {
          this.projectiles.splice(i, 1);
          if (!hit) this.makeItem(shot.type, clamp(shot.x, 45, this.width - 45), clamp(shot.y, 55, this.height - 45), { cooldown: .7 });
          else this.effect(shot.x, shot.y, shot.color, 4);
        }
        if (this.state !== 'playing') return;
      }
      this.bombs = this.bombs.filter(b => !b.dead);
      for (let i = this.effects.length - 1; i >= 0; i--) {
        const fx = this.effects[i]; fx.life -= dt;
        fx.x += fx.vx * dt; fx.y += fx.vy * dt; fx.vx *= Math.exp(-dt * 3); fx.vy *= Math.exp(-dt * 3);
        if (fx.life <= 0) this.effects.splice(i, 1);
      }
      if (this.inBase(p)) this.bank();
      this.spawnClock += dt;
      if (this.spawnClock >= 1.6) { this.spawnClock = 0; for (let i = 0; i < 3 && this.items.length < 110; i++) this.spawnItem(); }
      this.bombClock += dt;
      const interval = 8 - Math.min(3, this.elapsed / 15);
      if (this.bombClock >= interval) { this.bombClock = 0; if (this.bombs.length < 5 + Math.floor(this.elapsed / 25)) this.spawnBomb(); }
      if (this.time <= 0) this.end('time');
    }
  }

  const api = { Game, TYPES, MODULES, clamp, distance };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MagnetCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
