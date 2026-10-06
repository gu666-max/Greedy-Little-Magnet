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

    await page.click('#mode-assembly');
    await page.click('#help-button'); assert.ok(await page.locator('#help-overlay').isVisible()); await page.click('#close-help-button');
    assert.equal(await page.evaluate(() => testGame.state), 'ready');
    assert.equal(await page.evaluate(() => testGame.mode),'assembly');
    await page.click('#start-button');
    const ap=await page.evaluate(()=>({x:testGame.player.x,y:testGame.player.y}));const app=await point(page,ap.x,ap.y);
    await page.mouse.move(app.x,app.y);await page.mouse.down();await page.waitForFunction(()=>testGame.equipment.saw>0&&testGame.equipment.spring>0,{timeout:5000});await page.mouse.up();
    await page.waitForFunction(()=>document.querySelector('#slot-saw').classList.contains('installed'));
    await page.waitForFunction(()=>!document.querySelector('#dash-button').disabled);
    await page.keyboard.press('KeyQ');assert.ok(await page.evaluate(()=>testGame.dashCooldown>0));
    await page.evaluate(()=>{testGame.install('armor');testGame.install('ram');});
    await page.waitForFunction(()=>document.querySelector('#slot-ram').classList.contains('installed'));
    await page.screenshot({path:path.join(screenshots,'assembly-playing.png'),fullPage:true});
    await page.evaluate(()=>{
      testGame.player={x:400,y:220,vx:0,vy:0,angle:0};testGame.target={x:400,y:220};testGame.facing={x:1,y:0};
      testGame.items=[];testGame.cargo=[];testGame.obstacles=[{x:445,y:205,w:26,h:30,kind:'crate',hp:2}];
      testGame.equipment={ram:1,spring:1,saw:0,armor:0};testGame.dashCooldown=0;testGame.dashTime=0;
      testGame.bombs=[{x:510,y:220,vx:0,vy:0,radius:19,born:0,fuse:-1,dead:false}];
    });
    await page.keyboard.down('ArrowRight');await page.keyboard.press('KeyQ');
    await page.waitForFunction(()=>testGame.cratesBroken>0&&testGame.bombs.some(b=>b.knockback>0));await page.keyboard.up('ArrowRight');
    assert.equal(await page.evaluate(()=>testGame.health),3);
    assert.ok((await page.locator('#slot-ram').innerText()).includes('前置撞击头'));
    await page.screenshot({path:path.join(screenshots,'ram-head-playing.png'),fullPage:true});
    checks.push('前置撞击头外观、键盘冲刺拆箱并击飞炸弹');
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
    await mobile.tap('#mode-assembly');
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

    const modesContext = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    const modePage = await modesContext.newPage(); modePage.on('pageerror', error => errors.push(error.message)); await instrument(modePage); await modePage.goto(baseURL);
    assert.equal(await modePage.evaluate(() => testGame.mode), 'campaign');
    assert.equal(await modePage.locator('[data-level="1"]').isDisabled(), true);
    assert.equal(await modePage.locator('[data-level="2"]').isDisabled(), true);
    await modePage.locator('[data-level="1"]').dispatchEvent('click');
    assert.equal(await modePage.evaluate(() => testGame.levelIndex), 0);
    const campaignStart = await modePage.locator('#start-button').boundingBox();
    const campaignPanel = await modePage.locator('.start-panel').boundingBox();
    assert.ok(campaignStart.y + campaignStart.height <= campaignPanel.y + campaignPanel.height, '闯关开始按钮首次显示完整');
    await modePage.screenshot({path:path.join(screenshots,'modes-campaign-menu.png'),fullPage:true});
    await modePage.click('#start-button');
    assert.equal(await modePage.evaluate(() => testGame.duration), 90);
    await modePage.waitForFunction(() => document.querySelector('#mode-progress').textContent.includes('回收 600 分'));
    await modePage.evaluate(() => { testGame.elapsed = 89.99; testGame.bombs = []; });
    await modePage.waitForSelector('#result-overlay:not(.hidden)');
    assert.ok((await modePage.locator('#result-title').innerText()).includes('任务还差一点'));
    assert.ok(await modePage.locator('#next-level-button').isHidden());
    await modePage.click('#home-button'); assert.ok(await modePage.locator('[data-level="1"]').isDisabled());
    checks.push('闯关默认入口、锁定关不可选、时间失败不解锁');

    await modePage.click('#start-button');
    const finishLevel = async () => {
      await modePage.evaluate(() => {
        testGame.bombs = []; testGame.invincible = 100;
        for (const goal of testGame.level.goals) {
          if (goal.stat === 'installedKinds') for (const type of ['saw', 'spring', 'ram']) testGame.install(type);
          else testGame[goal.stat] = goal.target;
        }
      });
      await modePage.waitForSelector('#result-overlay:not(.hidden)');
    };
    await finishLevel();
    assert.equal(await modePage.evaluate(() => localStorage.getItem('greedy-magnet-campaign-cleared-v1')), '1');
    assert.ok(await modePage.locator('#next-level-button').isVisible());
    await modePage.screenshot({path:path.join(screenshots,'campaign-cleared.png'),fullPage:true});
    const map1 = await modePage.evaluate(() => JSON.stringify(testGame.level.layout));
    await modePage.click('#next-level-button');
    assert.equal(await modePage.evaluate(() => testGame.levelIndex), 1);
    assert.notEqual(await modePage.evaluate(() => JSON.stringify(testGame.level.layout)), map1);
    assert.equal(await modePage.evaluate(() => testGame.score), 0);
    await modePage.waitForFunction(() => document.querySelector('#mode-progress').textContent.includes('拆掉 3 个木箱'));
    await modePage.screenshot({path:path.join(screenshots,'campaign-map-2.png'),fullPage:true});
    checks.push('完成任务立即通关、下一关地图和目标切换、成绩与装备清空');

    await modePage.evaluate(() => { testGame.health = 1; testGame.equipment.armor = 0; testGame.invincible = 0; testGame.explode({ ...testGame.player, dead: false }); });
    await modePage.waitForSelector('#result-overlay:not(.hidden)'); assert.ok(await modePage.locator('#next-level-button').isHidden());
    await modePage.click('#again-button'); assert.equal(await modePage.evaluate(() => testGame.levelIndex), 1); assert.equal(await modePage.evaluate(() => testGame.health), 3);
    await finishLevel(); await modePage.click('#next-level-button'); assert.equal(await modePage.evaluate(() => testGame.levelIndex), 2);
    await finishLevel(); assert.ok((await modePage.locator('#result-title').innerText()).includes('三关全通')); assert.ok(await modePage.locator('#next-level-button').isHidden());
    await modePage.click('#home-button'); await modePage.reload();
    assert.equal(await modePage.evaluate(() => testGame.levelIndex), 2); assert.equal(await modePage.locator('[data-level="2"]').isDisabled(), false);
    await modePage.click('[data-level="0"]'); assert.equal(await modePage.evaluate(() => testGame.levelIndex), 0);
    assert.equal(Number((await modePage.locator('#best-score').innerText()).replaceAll(',', '')), 600);
    checks.push('生命失败重试原关、最后关结算、刷新保存解锁、旧关可重玩与分关成绩');

    await modePage.click('#mode-survival'); assert.equal(await modePage.locator('#timer').innerText(), '00:00');
    assert.equal(await modePage.locator('#timer-label').innerText(), '存活时间');
    assert.equal(await modePage.locator('#best-score').innerText(), '0');
    await modePage.click('#start-button');
    await modePage.evaluate(() => { testGame.elapsed = 120; testGame.bombs = []; testGame.invincible = 100; });
    await modePage.waitForFunction(() => document.querySelector('#mode-progress').textContent.includes('危险阶段 5'));
    assert.equal(await modePage.evaluate(() => testGame.state), 'playing');
    assert.equal(await modePage.locator('#timer').innerText(), '02:00');
    assert.ok(!(await modePage.locator('#timer').innerText()).includes('NaN'));
    await modePage.click('#pause-button'); const elapsed = await modePage.evaluate(() => testGame.elapsed); await modePage.waitForTimeout(250);
    assert.equal(await modePage.evaluate(() => testGame.elapsed), elapsed); await modePage.click('#resume-button');
    await modePage.screenshot({path:path.join(screenshots,'survival-playing.png'),fullPage:true});
    await modePage.evaluate(() => { testGame.score = 987; testGame.health = 1; testGame.equipment.armor = 0; testGame.invincible = 0; testGame.explode({ ...testGame.player, dead: false }); });
    await modePage.waitForSelector('#result-overlay:not(.hidden)');
    assert.ok((await modePage.locator('#result-title').innerText()).includes('02:00'));
    assert.ok(await modePage.evaluate(() => Number(localStorage.getItem('greedy-magnet-survival-time-v1')) >= 120));
    assert.equal(await modePage.evaluate(() => localStorage.getItem('greedy-magnet-best-survival-v1')), '987');
    await modePage.screenshot({path:path.join(screenshots,'survival-result.png'),fullPage:true});
    await modePage.click('#again-button'); assert.ok(await modePage.evaluate(() => testGame.elapsed < 1)); assert.equal(await modePage.evaluate(() => testGame.score), 0);
    checks.push('生存跨越90秒、存活计时与升难、暂停冻结、生命结算与独立时间/分数纪录');

    await modePage.click('#pause-button'); await modePage.click('#pause-home-button');
    assert.equal(await modePage.evaluate(() => testGame.state), 'ready'); assert.ok(await modePage.locator('#start-overlay').isVisible());
    assert.equal(await modePage.evaluate(() => localStorage.getItem('greedy-magnet-best-survival-v1')), '987');
    checks.push('生存暂停菜单放弃本局返回模式选择，已有纪录保留');

    await modePage.reload(); assert.equal(await modePage.evaluate(() => testGame.mode), 'survival');
    assert.equal(await modePage.locator('#best-score').innerText(), '987');
    await modePage.click('#mode-classic'); assert.equal(await modePage.locator('#best-score').innerText(), '0'); assert.equal(await modePage.locator('#timer').innerText(), '01:00');
    await modePage.click('#mode-assembly'); assert.equal(await modePage.locator('#best-score').innerText(), '0');
    checks.push('模式选择记忆、三模式和附加玩法的纪录互不覆盖');

    await mobile.tap('#mode-survival'); await mobile.tap('#start-button');
    await mobile.evaluate(() => { testGame.elapsed = 91; testGame.bombs = []; testGame.equipment.spring = 1; testGame.invincible = 100; });
    await mobile.waitForFunction(() => !document.querySelector('#touch-dash').disabled);
    await mobile.tap('#touch-dash'); assert.ok(await mobile.evaluate(() => testGame.dashCooldown > 0));
    await mobile.screenshot({path:path.join(screenshots,'mobile-survival.png'),fullPage:true});
    await mobile.evaluate(() => { testGame.health = 1; testGame.invincible = 0; testGame.equipment.armor = 0; testGame.explode({ ...testGame.player, dead: false }); });
    await mobile.waitForSelector('#result-overlay:not(.hidden)'); await mobile.tap('#home-button'); await mobile.tap('#mode-campaign');
    await mobile.tap('#start-button'); await mobile.evaluate(() => { testGame.score = 600; testGame.banks = 2; testGame.bombs = []; testGame.invincible = 100; });
    await mobile.waitForSelector('#result-overlay:not(.hidden)'); await mobile.tap('#next-level-button'); assert.equal(await mobile.evaluate(() => testGame.levelIndex), 1);
    assert.equal(await mobile.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    checks.push('手机生存冲刺、闯关成功下一关与无横向溢出');

    const restrictedContext = await browser.newContext(); const restricted = await restrictedContext.newPage(); restricted.on('pageerror', error => errors.push(error.message)); await instrument(restricted);
    await restricted.addInitScript(() => { Storage.prototype.getItem = () => { throw new Error('Storage denied'); }; Storage.prototype.setItem = () => { throw new Error('Storage denied'); }; });
    await restricted.goto(baseURL); await restricted.click('#mode-survival'); await restricted.click('#start-button'); assert.equal(await restricted.evaluate(() => testGame.state), 'playing');
    checks.push('禁用本机存储时仍可选择模式和游玩');

    const offline = await context.newPage(); offline.on('pageerror', error => errors.push(error.message));
    await offline.goto('file://' + path.resolve(__dirname, '../index.html').replaceAll('\\', '/'));
    await offline.click('#start-button'); await offline.waitForTimeout(150); assert.ok(await offline.locator('#start-overlay').isHidden());
    await offline.waitForFunction(() => document.querySelector('#timer').textContent !== '01:30', { timeout: 3000 }); checks.push('file://双击离线打开并开始游玩');

    assert.deepEqual(errors, []); console.log(JSON.stringify({ passed: checks, browserErrors: errors, screenshots }, null, 2));
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
