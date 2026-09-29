// Uçtan uca test: telefon boyutunda oyuncu + DM, gerçek tarayıcıda. Çalıştır: npm run e2e (playwright gerekir)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const assert = require('assert');
const os = require('os'), path = require('path');
const SP = process.env.SHOTS || os.tmpdir();
const SERVER = path.join(__dirname, '..', 'server.js');
const shot = (p, n) => p.screenshot({ path: `${SP}/${n}.png` });

async function withServer(port, dice, fn) {
  const fs = require('fs'); const df = `${SP}/data-${port}.json`; try { fs.unlinkSync(df); } catch {}
  const s = spawn('node', [SERVER], { env: { ...process.env, PORT: port, DM_PIN: '4321', DATA_FILE: df, DICE_FIXED: dice }, stdio: 'pipe' });
  await new Promise((r) => s.stdout.on('data', r));
  try { await fn(`http://localhost:${port}`); } finally { s.kill(); }
}

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  // 1) Kritik zar: canlı akış, DM etkileşimi, satın alma, Hard Gamble
  await withServer(3111, '20', async (url) => {
    const pc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const dc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const p = await pc.newPage(), d = await dc.newPage();
    const errs = []; for (const pg of [p, d]) { pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text())); }
    d.on('dialog', (x) => x.accept(x.message().includes('Satıcı ne desin') ? 'Tamam, sen kazandın.' : undefined));
    p.on('dialog', (x) => x.accept());

    await p.goto(url); await shot(p, '01-join');
    await p.click('[data-pick=ozan]'); await p.fill('#name', 'Ayşe'); await p.click('#go');
    await p.waitForSelector('[data-mid=m1]'); await shot(p, '02-market');

    await d.goto(url); await d.click('#dm'); await d.fill('#pin', '4321'); await d.click('#dmgo');
    await d.waitForSelector('[data-dtab=live]');

    await p.click('[data-mid=m1]'); await shot(p, '03-items');
    await p.click('text=İyileştirme İksiri'); await shot(p, '04-negotiate');
    await p.click('[data-act=offer]');
    await p.waitForSelector('.result.crit'); await shot(p, '05-result');
    assert.match(await p.textContent('.bigprice'), /35 gp$/);      // X=50, Y=35 → kritik Y
    // DM canlı görür ve satıcıya replik yazdırır
    await d.waitForSelector('.dm-neg'); await shot(d, '06-dm-live');
    await d.click('[data-lineask]');
    await p.waitForFunction(() => document.querySelector('.bubble')?.textContent.includes('Tamam, sen kazandın.'));
    // satın al
    await p.click('[data-act=accept]');
    await p.click('[data-tab=bag]'); await p.waitForSelector('text=İyileştirme İksiri'); await shot(p, '07-bag');
    // Hard Gamble
    await p.click('[data-tab=market]'); await p.click('[data-mid=m2]'); await p.click('text=Uzun Kılıç'); await p.click('[data-act=gamble]');
    await p.click('[data-tab=bag]'); await p.waitForSelector('text=Kusurlu');
    // büyülü eşyada Hard Gamble yok
    await p.click('[data-tab=market]'); await p.click('[data-mid=m3]'); await p.click('text=Uçuş İksiri');
    assert.equal(await p.locator('[data-act=gamble]').count(), 0);
    // DM: oyuncu altını ve akış
    await d.click('[data-dtab=players]'); await d.waitForSelector('text=Ayşe'); await shot(d, '08-dm-players');
    assert.deepEqual(errs, []);
    await pc.close(); await dc.close();
  });

  // 2) Hep 1 atılır: açgözlü satıcı sinirlenir, gün yasağı, DM yeni gün açar
  await withServer(3112, '1', async (url) => {
    const pc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const dc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const p = await pc.newPage(), d = await dc.newPage();
    d.on('dialog', (x) => x.accept(x.defaultValue())); p.on('dialog', (x) => x.accept(x.defaultValue()));
    await p.goto(url); await p.click('[data-pick=barbar]'); await p.fill('#name', 'Bora'); await p.click('#go');
    await d.goto(url); await d.click('#dm'); await d.fill('#pin', '4321'); await d.click('#dmgo');
    await p.click('[data-mid=m3]'); await p.click('text=Ejder Pulu');
    await p.click('[data-act=offer]'); await p.waitForSelector('.result.fail');
    await p.click('[data-act=offer]'); await p.waitForSelector('.result.angered'); await shot(p, '09-angered');
    assert.match(await p.textContent('.bigprice'), /132 gp/);              // 1.1 × 120
    assert.equal(await p.locator('[data-act=offer]').count(), 0);
    await p.click('[data-act=up]'); await p.click('[data-act=up]').catch(() => {});
    await p.waitForSelector('text=Bugün kapalı');
    await d.click('[data-act=newday]');
    await p.waitForFunction(() => !document.body.textContent.includes('Bugün kapalı'));
    await pc.close(); await dc.close();
  });

  // 3) CRM: teklif bırak → DM karşı teklif → oyuncu kabul → Haftalık Pazar teslim
  await withServer(3113, '10', async (url) => {
    const pc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
    const dc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const p = await pc.newPage(), d = await dc.newPage();
    const errs = []; for (const pg of [p, d]) pg.on('pageerror', (e) => errs.push(e.message));
    d.on('dialog', (x) => x.accept(x.defaultValue())); p.on('dialog', (x) => x.accept(x.defaultValue()));
    await p.goto(url); await p.click('[data-pick=ozan]'); await p.fill('#name', 'Cem'); await p.click('#go');
    await d.goto(url); await d.click('#dm'); await d.fill('#pin', '4321'); await d.click('#dmgo');
    await p.click('[data-tab=bids]'); await p.click('[data-act=bidnew]');
    await p.selectOption('#f-m', 'm2'); await p.selectOption('#f-i', { label: 'Uzun Kılıç · 15 gp' });
    await p.fill('#f-price', '9'); await p.fill('#f-note', 'Pazar günü alırım'); await shot(p, '10-bid-form');
    await p.click('[data-act=bidsend]'); await p.waitForSelector('text=DM bekleniyor');
    await d.click('[data-dtab=bids]'); await d.waitForSelector('text=Pazar günü alırım'); await shot(d, '11-dm-bids');
    await d.click('[data-dcnt]');                                   // kural önerisi 10.5 ile karşı teklif
    await p.waitForSelector('text=Cevap sende'); await shot(p, '12-counter');
    await p.click('[data-bacc]'); await p.waitForSelector('text=Pazar gününde teslim');
    await d.click('[data-bf=accepted]'); await d.click('[data-act=weekly]');
    await p.waitForSelector('text=Teslim edildi');
    await p.click('[data-tab=bag]'); await p.waitForSelector('text=Uzun Kılıç');
    assert.match(await p.textContent('.pill.gold'), /69\.5/);
    assert.deepEqual(errs, []);
    await pc.close(); await dc.close();
  });
  await b.close();
  console.log('E2E OK');
})().catch((e) => { console.error(e); process.exit(1); });
