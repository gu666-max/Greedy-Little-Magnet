'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Game, TYPES } = require('../game-core.js');

function setup() {
  let seed = 1789;
  const events = [];
  const game = new Game({ random: () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }, onEvent: event => events.push(event) });
  game.start(); game.items = []; game.bombs = []; game.obstacles = [];
  return { game, events };
}
function tick(game, seconds, input) { for (let i = 0; i < Math.round(seconds * 60); i++) game.step(1 / 60, input); }
function cargo(game, types) { for (const type of types) game.cargo.push({ type, ...TYPES[type], attachment: 0, angle: 0 }); }

test('吸取物品增加携带价值，入账前不增加分数，收集事件类型保持正确', () => {
  const { game, events } = setup();
  game.makeItem('coin', game.player.x + 35, game.player.y);
  game.setSucking(true); tick(game, .4);
  assert.equal(game.cargoValue, 60); assert.equal(game.score, 0); assert.equal(game.collected, 1);
  assert.ok(events.some(e => e.type === 'collect' && e.itemType === 'coin'));
});
test('进入回收站自动入账，清空负重，不重复计分', () => {
  const { game } = setup(); cargo(game, ['coin','gear','gold']);
  game.player.x = game.base.x + 130; game.player.y = game.base.y + 100; game.target = { ...game.player };
  tick(game, .1); assert.equal(game.score, 205); assert.equal(game.cargo.length, 0); assert.equal(game.banks, 1);
  tick(game, 1); assert.equal(game.score, 205); assert.equal(game.banks, 1);
});
test('释放吸力甩出35%的零件，已入账分数不受影响', () => {
  const { game } = setup(); cargo(game, Array(10).fill('screw')); game.score = 300;
  game.player.vx = 100; game.setSucking(true); game.setSucking(false);
  assert.equal(game.projectiles.length, 4); assert.equal(game.cargo.length, 6); assert.equal(game.score, 300);
  assert.ok(game.projectiles.every(p => p.vx > 0));
  tick(game, 1); assert.equal(game.projectiles.length, 0); assert.ok(game.items.length >= 4);
});
test('负重降低速度并增大半径与磁力范围', () => {
  const { game: light } = setup(), { game: heavy } = setup(); cargo(heavy, Array(25).fill('gear'));
  tick(light, 1, { x: 1 }); tick(heavy, 1, { x: 1 });
  assert.ok(light.player.vx > heavy.player.vx); assert.ok(heavy.radius > light.radius); assert.ok(heavy.range > light.range);
});
test('满载42件时不继续收集，给出满载事件', () => {
  const { game, events } = setup(); cargo(game, Array(42).fill('screw')); game.makeItem('coin', game.player.x, game.player.y);
  game.setSucking(true); tick(game, .1); assert.equal(game.cargo.length, 42); assert.equal(game.items.length, 1); assert.ok(events.some(e => e.type === 'full'));
});
test('爆炸扣生命并震落物品，保护期间不会连续掉血', () => {
  const { game } = setup(); cargo(game, Array(10).fill('coin'));
  const bomb = { ...game.player, dead: false }; game.explode(bomb);
  assert.equal(game.health, 2); assert.equal(game.cargo.length, 5); assert.equal(game.items.length, 5);
  game.explode({ ...game.player, dead: false }); assert.equal(game.health, 2);
});
test('回收区免受炸弹伤害', () => {
  const { game } = setup(); game.player.x = game.base.x + 130; game.player.y = game.base.y + 100;
  game.explode({ ...game.player, dead: false }); assert.equal(game.health, 3);
});
test('吸动炸弹会点燃引线，离开吸取范围后仍会爆炸', () => {
  const { game, events } = setup();
  game.bombs.push({ x: game.player.x + 150, y: game.player.y, vx: 0, vy: 0, fuse: -1, born: 0, radius: 19, dead: false });
  game.setSucking(true); game.step(1 / 60); assert.ok(game.bombs[0].fuse > 0);
  game.setSucking(false); game.bombs[0].x = game.width - 60; game.bombs[0].vx = 0;
  tick(game, 3); assert.ok(events.some(e => e.type === 'explosion')); assert.equal(game.bombs.length, 0);
});
test('甩出的零件可以引爆远处炸弹', () => {
  const { game, events } = setup(); cargo(game, ['gear']);
  game.player.vx = 100; game.bombs.push({ x: game.player.x + 125, y: game.player.y, vx: 0, vy: 0, fuse: -1, born: 0, radius: 19, dead: false });
  game.setSucking(true); game.setSucking(false); tick(game, .15);
  assert.ok(events.some(e => e.type === 'explosion')); assert.equal(game.bombs.length, 0);
});
test('木箱破碎掉落奖励，重复破坏不产生重复奖励', () => {
  const { game } = setup(); const crate = { x: 600, y: 200, w: 70, h: 60, kind: 'crate', hp: 2 }; game.obstacles.push(crate);
  game.breakCrate(crate); assert.equal(game.obstacles.length, 0); assert.equal(game.items.length, 7);
  game.breakCrate(crate); assert.equal(game.items.length, 7);
});
test('暂停冻结时间、位置和引线，继续后恢复', () => {
  const { game } = setup(); tick(game, 1); game.pause();
  const before = { time: game.time, x: game.player.x }; tick(game, 5, { x: 1 });
  assert.equal(game.time, before.time); assert.equal(game.player.x, before.x);
  game.resume(); tick(game, 1, { x: 1 }); assert.ok(game.time < before.time); assert.ok(game.player.x > before.x);
});
test('60秒结束只结算回收分数，结束事件只发送一次', () => {
  const { game, events } = setup(); game.score = 900; cargo(game, ['gold']); game.bombs = [];
  tick(game, 60.1); assert.equal(game.state, 'ended'); assert.equal(game.score, 900);
  const end = events.filter(e => e.type === 'end'); assert.equal(end.length, 1); assert.equal(end[0].lost, 120); assert.equal(end[0].reason, 'time');
  tick(game, 2); assert.equal(events.filter(e => e.type === 'end').length, 1);
});
test('生命归零结算，再来一局恢复初始状态', () => {
  const { game, events } = setup(); game.health = 1; game.score = 90; game.explode({ ...game.player, dead: false });
  assert.equal(game.state, 'ended'); assert.equal(events.at(-1).reason, 'health');
  game.start(); assert.equal(game.state, 'playing'); assert.equal(game.health, 3); assert.equal(game.time, 60); assert.equal(game.score, 0);
});
test('玩家无法穿过障碍，窗口缩放保留分数与时间', () => {
  const { game } = setup(); game.obstacles.push({ x: game.player.x + 50, y: game.player.y - 100, w: 80, h: 200, kind: 'machine' });
  tick(game, 1, { x: 1 }); assert.ok(game.player.x + game.radius <= game.obstacles[0].x + .01);
  const time = game.time; game.score = 100; game.resize(760, 950);
  assert.equal(game.time, time); assert.equal(game.score, 100); assert.ok(game.player.x < 760); assert.equal(game.base.y, 725);
});
