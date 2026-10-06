'use strict';
// Browser verification uses an installed Playwright and Chrome/Edge. No runtime dependencies.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const baseURL = process.env.GAME_URL || 'http://127.0.0.1:4173';
const screenshots = path.join(__dirname, 'artifacts');
fs.mkdirSync(screenshots, { recursive: true });
const executablePath = process.env.BROWSER_EXECUTABLE || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'
].find(file => fs.existsSync(file));

async function instrument(page) {
  await page.addInitScript(() => {
    // Capture the core only in this test, without adding production debug controls.
    let core;
    Object.defineProperty(window, 'MagnetCore', {
      get: () => core,
      set(api) {
        let seed = 387;
        const Original = api.Game;
        api.Game = class extends Original {
          constructor(options) {
            super({ ...options, random: () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; } });
            window.testGame = this;
          }
        };
        core = api;
      }
    });
  });
}
async function point(page, x, y) {
  const box = await page.locator('canvas').boundingBox();
  const dims = await page.evaluate(() => ({ w: testGame.width, h: testGame.height }));
  return { x: box.x + x / dims.w * box.width, y: box.y + y / dims.h * box.height };
}
async function run() {
  const browser = await chromium.launch({ headless: true, executablePath });
  const errors = [], checks = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message)); await instrument(page);
    await page.goto(baseURL); await page.waitForFunction(() => window.testGame && document.querySelector('canvas').width > 0);
    await page.screenshot({ path: path.join(screenshots, 'desktop-start.png'), fullPage: true });
    assert.ok(await page.locator('#start-button').isVisible());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const startBox = await page.locator('#start-button').boundingBox(); assert.ok(startBox.y + startBox.height < 1000);
    checks.push('桌面首页、开始按钮和无横向溢出');

    await page.click('#help-button'); assert.ok(await page.locator('#help-overlay').isVisible()); await page.click('#close-help-button');
    assert.equal(await page.evaluate(() => testGame.state), 'ready');
    assert.equal(await page.evaluate(() => testGame.mode),'assembly');
    await page.click('#start-button');
    const ap=await page.evaluate(()=>({x:testGame.player.x,y:testGame.player.y}));const app=await point(page,ap.x,ap.y);
    await page.mouse.move(app.x,app.y);await page.mouse.down();await page.waitForFunction(()=>testGame.equipment.saw>0&&testGame.equipment.spring>0,{timeout:5000});await page.mouse.up();
    await page.waitForFunction(()=>document.querySelector('#slot-saw').classList.contains('installed'));
    await page.waitForFunction(()=>!document.querySelector('#dash-button').disabled);
    await page.keyboard.press('KeyQ');assert.ok(await page.evaluate(()=>testGame.dashCooldown>0));
    await page.evaluate(()=>{testGame.install('armor');testGame.install('ball');});
    await page.waitForFunction(()=>document.querySelector('#slot-ball').classList.contains('installed'));
    await page.screenshot({path:path.join(screenshots,'assembly-playing.png'),fullPage:true});
    await page.evaluate(()=>{testGame.elapsed=89.95;});await page.waitForSelector('#result-overlay:not(.hidden)');
    assert.ok((await page.locator('#result-comment').innerText()).includes('挑战完成'));await page.click('#home-button');
    await page.click('#mode-classic');assert.equal(await page.evaluate(()=>testGame.mode),'classic');
    checks.push('组装部件真实吸取、装备栏、Q冲刺、90秒结算与经典模式切换');
    await page.click('#start-button');
    const player = await page.evaluate(() => ({ x: testGame.player.x, y: testGame.player.y })); const p = await point(page, player.x, player.y);
    await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.waitForFunction(() => testGame.cargoValue >= 180, { timeout: 5000 });
    await page.screenshot({ path: path.join(screenshots, 'desktop-playing.png'), fullPage: true });
    const base = await page.evaluate(() => ({ x: testGame.base.x + 145, y: testGame.base.y + 106 })); const b = await point(page, base.x, base.y);
    await page.mouse.move(b.x, b.y); await page.waitForFunction(() => testGame.score > 0, { timeout: 9000 }); await page.mouse.up();
    const score = await page.evaluate(() => testGame.score); assert.ok(score >= 180); checks.push('真实鼠标吸取→移动→回收入账');

    await page.keyboard.press('Escape'); assert.ok(await page.locator('#pause-overlay').isVisible());
    const time = await page.evaluate(() => testGame.time); await page.waitForTimeout(350); assert.equal(await page.evaluate(() => testGame.time), time);
    await page.click('#help-button'); await page.click('#close-help-button'); assert.equal(await page.evaluate(() => testGame.state), 'paused');
    await page.click('#resume-button');
    const x = await page.evaluate(() => testGame.player.x); await page.keyboard.down('ArrowRight'); await page.waitForTimeout(500); await page.keyboard.up('ArrowRight');
    assert.ok(await page.evaluate(() => testGame.player.x) > x); checks.push('暂停冻结、帮助返回状态、键盘移动');
    await page.evaluate(() => window.dispatchEvent(new Event('blur'))); assert.equal(await page.evaluate(() => testGame.state), 'paused'); await page.click('#resume-button');
    checks.push('窗口失焦自动暂停');

    await page.evaluate(() => { testGame.elapsed = 59.95; });
    await page.waitForSelector('#result-overlay:not(.hidden)'); assert.equal(await page.locator('#result-score').innerText(), score.toLocaleString('zh-CN'));
    assert.equal(await page.evaluate(() => Number(localStorage.getItem('greedy-magnet-best-v1'))), score);
    await page.screenshot({ path: path.join(screenshots, 'desktop-result.png'), fullPage: true });
    await page.click('#again-button'); assert.equal(await page.evaluate(() => testGame.health), 3); assert.equal(await page.evaluate(() => testGame.score), 0);
    await page.click('#pause-button'); await page.click('#restart-button'); assert.equal(await page.evaluate(() => testGame.state), 'playing');
    checks.push('时间结算、个人最佳存储、再来一局与重开');
    await page.reload(); assert.equal(Number((await page.locator('#best-score').innerText()).replaceAll(',', '')), score);
    await page.click('#sound-button'); assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'false'); await page.reload();
    assert.equal(await page.locator('#sound-button').getAttribute('aria-pressed'), 'false'); checks.push('成绩和音效偏好刷新后保留');

    await page.setViewportSize({ width: 1366, height: 768 }); await page.waitForTimeout(100);
    const laptopButton = await page.locator('#start-button').boundingBox(); const field = await page.locator('#playfield').boundingBox();
    assert.ok(laptopButton.y + laptopButton.height <= field.y + field.height); assert.ok(field.y + field.height < 768);
    await page.screenshot({ path: path.join(screenshots, 'laptop-start.png'), fullPage: true }); checks.push('1366×768笔记本完整场地与可点击开始按钮');
    await page.click('#start-button'); await page.evaluate(() => { testGame.elapsed = testGame.duration-.05; }); await page.waitForSelector('#result-overlay:not(.hidden)');
    const laptopAgain = await page.locator('#again-button').boundingBox(); assert.ok(laptopAgain.y + laptopAgain.height <= field.y + field.height);
    await page.screenshot({ path: path.join(screenshots, 'laptop-result.png'), fullPage: true }); checks.push('笔记本结算按钮完整可见');
    await page.click('#home-button');await page.click('#mode-assembly');await page.screenshot({path:path.join(screenshots,'laptop-assembly-start.png'),fullPage:true});
    await page.click('#start-button');await page.evaluate(()=>{testGame.elapsed=89.95;});await page.waitForSelector('#result-overlay:not(.hidden)');
    const assemblyAgain=await page.locator('#again-button').boundingBox();assert.ok(assemblyAgain.y+assemblyAgain.height<=field.y+field.height);
    checks.push('笔记本组装模式开始与结算可操作');

    const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const mobile = await mobileContext.newPage(); mobile.on('pageerror', error => errors.push(error.message)); await instrument(mobile); await mobile.goto(baseURL);
    await mobile.screenshot({ path: path.join(screenshots, 'mobile-start.png'), fullPage: true });
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await mobile.tap('#start-button'); assert.equal(await mobile.evaluate(() => testGame.width), 760); assert.equal(await mobile.evaluate(() => testGame.height), 950);
    const mp = await mobile.evaluate(() => ({ x: testGame.player.x, y: testGame.player.y })); const mpos = await point(mobile, mp.x, mp.y);
    const cdp = await mobileContext.newCDPSession(mobile);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mpos.x, y: mpos.y, id: 1 }] });
    await mobile.waitForFunction(() => testGame.cargo.length >= 3);
    const target = await point(mobile, mp.x + 40, mp.y - 35);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: target.x, y: target.y, id: 1 }] });
    await mobile.waitForTimeout(200);
    assert.ok(await mobile.evaluate(() => testGame.sucking));
    await mobile.waitForFunction(()=>testGame.equipment.spring>0,{timeout:5000});
    const count = await mobile.evaluate(() => testGame.cargo.length);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await mobile.evaluate(() => testGame.sucking), false); assert.ok(await mobile.evaluate(() => testGame.cargo.length) < count);
    await mobile.screenshot({ path: path.join(screenshots, 'mobile-playing.png'), fullPage: true }); checks.push('手机真实触屏按住吸取、拖动、松手甩出');
    await mobile.tap('#touch-dash'); assert.ok(await mobile.evaluate(()=>testGame.dashCooldown>0)); checks.push('手机组装弹簧并使用场地内触屏冲刺按钮');
    await mobile.tap('#help-button'); assert.equal(await mobile.evaluate(() => testGame.state), 'paused'); await mobile.tap('#close-help-button'); assert.equal(await mobile.evaluate(() => testGame.state), 'playing');
    await mobile.evaluate(() => { testGame.health = 1; testGame.invincible = 0; testGame.equipment.armor=0; testGame.explode({ ...testGame.player, dead: false }); });
    await mobile.waitForSelector('#result-overlay:not(.hidden)'); await mobile.tap('#home-button'); assert.ok(await mobile.locator('#start-overlay').isVisible()); checks.push('手机帮助暂停恢复、生命结算与返回首页');

    const offline = await context.newPage(); offline.on('pageerror', error => errors.push(error.message));
    await offline.goto('file://' + path.resolve(__dirname, '../index.html').replaceAll('\\', '/'));
    await offline.click('#start-button'); await offline.waitForTimeout(150); assert.ok(await offline.locator('#start-overlay').isHidden());
    await offline.waitForFunction(() => document.querySelector('#timer').textContent !== '01:30', { timeout: 3000 }); checks.push('file://双击离线打开并开始游玩');

    assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: checks, browserErrors: errors, screenshots }, null, 2));
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
