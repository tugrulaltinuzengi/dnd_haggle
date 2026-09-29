// End-to-end test: a phone-sized player + DM in a real browser. Run: npm run e2e (needs playwright)
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const assert = require('assert');
const os = require('os'), path = require('path');
const SP = process.env.SHOTS || os.tmpdir();
const SERVER = path.join(__dirname, '..', 'server.js');
const shot = (p, n) => p.screenshot({ path: `${SP}/${n}.png` });


// Builds a small valid PNG (the source image handed to the file chooser).
function makePng(w, h) {
  const zlib = require('zlib');
  const table = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const x of buf) c = table[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const t = Buffer.from(type), l = Buffer.alloc(4), r = Buffer.alloc(4); l.writeUInt32BE(data.length); r.writeUInt32BE(crc(Buffer.concat([t, data]))); return Buffer.concat([l, t, data, r]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const o = y * (w * 3 + 1) + 1 + x * 3; raw[o] = (x * 255 / w) | 0; raw[o + 1] = (y * 255 / h) | 0; raw[o + 2] = 90; } }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

async function withServer(port, dice, fn) {
  const fs = require('fs'); const df = `${SP}/data-${port}.json`; try { fs.unlinkSync(df); } catch {}
  const s = spawn('node', [SERVER], { env: { ...process.env, PORT: port, DM_PIN: '4321', DATA_FILE: df, DICE_FIXED: dice, MEDIA_DIR: path.join(os.tmpdir(), `pazar-e2e-media-${port}`) }, stdio: 'pipe' });
  await new Promise((r) => s.stdout.on('data', r));
  try { await fn(`http://localhost:${port}`); } finally { s.kill(); }
}

(async () => {
  const b = await chromium.launch({ args: ['--no-sandbox'] });

  // 1) Critical die: live feed, DM interaction, purchase
  await withServer(3111, '20', async (url) => {
    const pc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const dc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const p = await pc.newPage(), d = await dc.newPage();
    const errs = []; for (const pg of [p, d]) { pg.on('pageerror', (e) => errs.push(e.message)); pg.on('console', (m) => m.type() === 'error' && errs.push(m.text())); }
    d.on('dialog', (x) => x.accept(x.message().includes('What should the merchant say') ? 'Fine, fine, you win.' : undefined));
    p.on('dialog', (x) => x.accept());

    await p.goto(url); await shot(p, '01-join');
    await p.click('[data-pick=bard]'); await p.fill('#name', 'Alice'); await p.click('#go');
    await p.waitForSelector('[data-mid=m1]'); await shot(p, '02-market');

    await d.goto(url); await d.click('#dm'); await d.fill('#pin', '4321'); await d.click('#dmgo');
    await d.waitForSelector('[data-dtab=live]');

    await p.click('[data-mid=m1]'); await shot(p, '03-items');
    await p.click('text=Potion of Healing'); await shot(p, '04-negotiate');
    await p.click('[data-act=offer]');
    await p.waitForSelector('.result.crit'); await shot(p, '05-result');
    assert.match(await p.textContent('.bigprice'), /35 gp$/);      // X=50, Y=35 → the crit Y
    // the DM sees it live and has the merchant say a line
    await d.waitForSelector('.dm-neg'); await shot(d, '06-dm-live');
    await d.click('[data-lineask]');
    await p.waitForFunction(() => document.querySelector('.bubble')?.textContent.includes('Fine, fine, you win.'));
    // buy
    await p.click('[data-act=accept]');
    await p.click('[data-tab=bag]'); await p.waitForSelector('text=Potion of Healing'); await shot(p, '07-bag');
    // there is no Hard Gamble button anywhere
    await p.click('[data-tab=market]'); await p.click('[data-mid=m2]'); await p.click('text=Longsword');
    assert.equal(await p.locator('[data-act=gamble]').count(), 0);
    // DM: player gold and the feed
    await d.click('[data-dtab=players]'); await d.waitForSelector('text=Alice'); await shot(d, '08-dm-players');
    assert.deepEqual(errs, []);
    await pc.close(); await dc.close();
  });

  // 2) Always rolls 1: the greedy merchant gets angry, day ban, the DM opens a new day
  await withServer(3112, '1', async (url) => {
    const pc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const dc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const p = await pc.newPage(), d = await dc.newPage();
    d.on('dialog', (x) => x.accept(x.defaultValue())); p.on('dialog', (x) => x.accept(x.defaultValue()));
    await p.goto(url); await p.click('[data-pick=barbarian]'); await p.fill('#name', 'Bora'); await p.click('#go');
    await d.goto(url); await d.click('#dm'); await d.fill('#pin', '4321'); await d.click('#dmgo');
    await p.click('[data-mid=m3]'); await p.click('text=Dragon Scale');
    await p.click('[data-act=offer]'); await p.waitForSelector('.result.fail');
    await p.click('[data-act=offer]'); await p.waitForSelector('.result.angered'); await shot(p, '09-angered');
    assert.match(await p.textContent('.bigprice'), /132 gp/);              // 1.1 × 120
    assert.equal(await p.locator('[data-act=offer]').count(), 0);
    await p.click('[data-act=up]'); await p.click('[data-act=up]').catch(() => {});
    await p.waitForSelector('text=Closed today');
    await d.click('[data-act=newday]');
    await p.waitForFunction(() => !document.body.textContent.includes('Closed today'));
    await pc.close(); await dc.close();
  });

  // 3) CRM: leave an offer → DM counter-offer → player accepts → Weekly Market delivery
  await withServer(3113, '10', async (url) => {
    const pc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true });
    const dc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const p = await pc.newPage(), d = await dc.newPage();
    const errs = []; for (const pg of [p, d]) pg.on('pageerror', (e) => errs.push(e.message));
    d.on('dialog', (x) => x.accept(x.defaultValue())); p.on('dialog', (x) => x.accept(x.defaultValue()));
    await p.goto(url); await p.click('[data-pick=bard]'); await p.fill('#name', 'Cem'); await p.click('#go');
    await d.goto(url); await d.click('#dm'); await d.fill('#pin', '4321'); await d.click('#dmgo');
    await p.click('[data-tab=bids]'); await p.click('[data-act=bidnew]');
    await p.selectOption('#f-m', 'm2'); await p.selectOption('#f-i', { label: 'Longsword · 15 gp' });
    await p.fill('#f-price', '9'); await p.fill('#f-note', 'I will buy on Market Day'); await shot(p, '10-bid-form');
    await p.click('[data-act=bidsend]'); await p.waitForSelector('text=DM bekleniyor');
    await d.click('[data-dtab=bids]'); await d.waitForSelector('text=I will buy on Market Day'); await shot(d, '11-dm-bids');
    await d.click('[data-dcnt]');                                   // counter-offer with the rule suggestion 10.5
    await p.waitForSelector('text=Cevap sende'); await shot(p, '12-counter');
    await p.click('[data-bacc]'); await p.waitForSelector('text=Delivered on Market Day');
    await d.click('[data-bf=accepted]'); await d.click('[data-act=weekly]');
    await p.waitForSelector('text=Teslim edildi');
    await p.click('[data-tab=bag]'); await p.waitForSelector('text=Longsword');
    assert.match(await p.textContent('.pill.gold'), /69\.5/);
    assert.deepEqual(errs, []);
    await pc.close(); await dc.close();
  });

  // 4) Layout and bars: no overflow at 4 widths, two columns on desktop, two bars, keyboard, DM tabs
  await withServer(3114, '20', async (url) => {
    const noOverflow = (pg) => pg.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    for (const w of [360, 768, 1280, 1920]) {
      const ctx = await b.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 500 });
      const p = await ctx.newPage(); p.on('dialog', (x) => x.accept(x.defaultValue()));
      const errs = []; p.on('pageerror', (e) => errs.push(e.message));
      await p.goto(url);
      assert.ok(await noOverflow(p), `the join screen overflows (${w})`);
      await p.click('[data-pick=bard]'); await p.fill('#name', `W${w}`); await p.click('#go');
      await p.waitForSelector('[data-mid=m2]');
      assert.ok(await noOverflow(p), `the market overflows (${w})`);
      assert.ok((await p.textContent('[data-mid=m2]')).includes('Affinity'), 'affinity bar on the market row');
      await p.click('[data-mid=m2]'); await p.waitForSelector('.shelfitem');
      assert.ok(await noOverflow(p), `the shelf overflows (${w})`);
      assert.ok(await p.locator('.portrait .affbar').count() === 1, 'affinity bar on the portrait');
      await p.click('text=Longsword');
      await p.waitForSelector('.neg');
      assert.ok(await noOverflow(p), `the negotiation overflows (${w})`);
      // two separate bars: the momentary Mood and the long-term Affinity
      assert.equal(await p.locator('.repwrap .repbar').count(), 1);
      assert.equal(await p.locator('.repwrap .affbar').count(), 1);
      assert.match(await p.textContent('.repwrap .repbar .rl'), /Pazar/);
      assert.match(await p.textContent('.repwrap .affbar .rl'), /Affinity/);
      const nl = await p.locator('.nl').boundingBox(), nr = await p.locator('.nr').boundingBox();
      if (w >= 900) assert.ok(nr.x >= nl.x + nl.width - 1, `two columns expected on desktop (${w})`);
      else assert.ok(nr.y >= nl.y + nl.height - 1, `stacked expected on mobile (${w})`);
      if (w >= 900) { await p.keyboard.press('Enter'); await p.waitForSelector('.result.crit'); } // haggle with the keyboard
      await p.click('[data-act=up]'); await p.click('[data-act=up]');
      await p.click('[data-tab=bag]'); await p.waitForSelector('.bag');
      assert.ok(await noOverflow(p), `the bag overflows (${w})`);
      await p.click('[data-tab=bids]');
      assert.ok(await noOverflow(p), `the offers tab overflows (${w})`);
      assert.deepEqual(errs, []);
      await ctx.close();
    }
    const dc = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const d = await dc.newPage(); d.on('dialog', (x) => x.accept(x.defaultValue()));
    await d.goto(url); await d.click('#dm'); await d.fill('#pin', '4321'); await d.click('#dmgo');
    for (const tab of ['live', 'bids', 'market', 'players', 'ledger']) {
      await d.click(`[data-dtab=${tab}]`);
      assert.ok(await noOverflow(d), `the DM ${tab} tab overflows`);
    }
    await d.click('[data-dtab=players]');
    await d.waitForSelector('.affrow');
    assert.ok(await d.locator('.affrow .affbar').count() >= 3, 'the DM sees merchant affinity per player');
    await d.click('[data-dtab=ledger]');
    await d.selectOption('#lf-k', 'buy');
    await dc.close();
  });

  // 5) Image upload: the DM uploads an item and a portrait, the player sees them, files are served at the right size
  await withServer(3115, '20', async (url) => {
    const dc = await b.newContext({ viewport: { width: 1280, height: 900 } });
    const pc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
    const d = await dc.newPage(), p = await pc.newPage();
    const errs = []; for (const pg of [d, p]) pg.on('pageerror', (e) => errs.push(e.message));
    d.on('dialog', (x) => x.accept(x.defaultValue())); p.on('dialog', (x) => x.accept(x.defaultValue()));
    await d.goto(url); await d.click('#dm'); await d.fill('#pin', '4321'); await d.click('#dmgo');
    await p.goto(url); await p.click('[data-pick=bard]'); await p.fill('#name', 'Gorsel'); await p.click('#go');
    await p.waitForSelector('[data-mid=m2]');
    await d.click('[data-dtab=market]');
    const [fc] = await Promise.all([d.waitForEvent('filechooser'), d.locator('.row:has-text("Longsword") [data-img]').click()]);
    await fc.setFiles({ name: 'kilic.png', mimeType: 'image/png', buffer: makePng(300, 200) });
    await d.waitForSelector('.row:has-text("Longsword") .mini');
    const [fc2] = await Promise.all([d.waitForEvent('filechooser'), d.locator('[data-img="portrait|m2"]').click()]);
    await fc2.setFiles({ name: 'marla.png', mimeType: 'image/png', buffer: makePng(400, 300) });
    await d.waitForSelector('[data-imgdel="portrait|m2"]');
    // player: the portrait and item image are visible, an image instead of the name text
    await p.click('[data-mid=m2]');
    await p.waitForSelector('.portrait[style*="background-image"]');
    await p.waitForSelector('.shelf .art[style*="background-image"]');
    assert.equal(await p.locator('.shelf .art[style*="background-image"] .artname').count(), 0);
    const size = (sel) => p.evaluate(async (q) => {
      const el = document.querySelector(q); const u = getComputedStyle(el).backgroundImage.slice(5, -2);
      return new Promise((r) => { const i = new Image(); i.onload = () => r([i.naturalWidth, i.naturalHeight]); i.onerror = () => r(null); i.src = u; });
    }, sel);
    assert.deepEqual(await size('.shelf .art[style*="background-image"]'), [512, 512]); // kaynak 300x200, sunucuda 512 kare
    assert.deepEqual(await size('.portrait[style*="background-image"]'), [768, 512]);
    // buy: the thumbnail (128) shows in the bag
    await p.locator('.shelfitem').first().click();
    await p.click('[data-act=accept]');
    await p.click('[data-tab=bag]'); await p.waitForSelector('.bslot .art[style*="background-image"]');
    assert.deepEqual(await size('.bslot .art[style*="background-image"]'), [128, 128]);
    // remove
    await d.locator('.row:has-text("Longsword") [data-imgdel]').click();
    await d.waitForSelector('.row:has-text("Longsword") [data-img]:not([data-imgdel]) >> nth=0');
    await p.click('[data-tab=market]'); await p.click('[data-mid=m2]');
    await p.waitForSelector('.shelf .artname');
    assert.deepEqual(errs, []);
    await dc.close(); await pc.close();
  });

  // 6) DM editor, Affinity settings, QR, and live updates not breaking focus while typing
  await withServer(3116, '20', async (url) => {
    const QR = require('../public/qr.js');
    const addrFile = path.join(SP, 'address.json');
    const inviteUrl = 'https://pazar.tail1234.ts.net';
    require('fs').writeFileSync(addrFile, JSON.stringify({ url: inviteUrl, funnel: false }));
    try {
      const dc = await b.newContext({ viewport: { width: 1280, height: 900 } });
      const pc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
      const d = await dc.newPage(), p = await pc.newPage();
      const errs = []; for (const pg of [d, p]) pg.on('pageerror', (e) => errs.push(e.message));
      d.on('dialog', (x) => x.accept(x.defaultValue())); p.on('dialog', (x) => x.accept(x.defaultValue()));
      await d.goto(url); await d.click('#dm'); await d.fill('#pin', '4321'); await d.click('#dmgo');
      await p.goto(url); await p.click('[data-pick=bard]'); await p.fill('#name', 'Edit'); await p.click('#go');
      await p.waitForSelector('[data-mid=m1]');

      // QR: the markup generated in the browser matches the Node generator exactly
      await d.click('[data-dtab=players]'); await d.waitForSelector('.qr svg');
      const expectedPath = /<path d="([^"]+)"/.exec(QR.svg(inviteUrl, { ecl: 'M' }))[1];
      assert.ok((await d.locator('.qr path').getAttribute('d')) === expectedPath, 'the browser QR must match the Node generator');

      // item editor
      await d.click('[data-dtab=market]');
      await d.click('[data-addi="m1"]'); await d.waitForSelector('.modal');
      await d.fill('#ed-name', 'Silver Talisman'); await d.fill('#ed-desc', 'A cold talisman.');
      await d.selectOption('#ed-type', 'gem'); await d.selectOption('#ed-rarity', 'rare');
      await d.fill('#ed-price', '77');
      const [fc] = await Promise.all([d.waitForEvent('filechooser'), d.click('[data-act=edpick]')]);
      await fc.setFiles({ name: 'tilsim.png', mimeType: 'image/png', buffer: makePng(200, 200) });
      await d.waitForSelector('[data-act=edpick]:has-text("tilsim.png")');
      await d.click('[data-act=edsave]'); await d.waitForSelector('.modal', { state: 'detached' });
      await p.click('[data-mid=m1]');
      await p.waitForSelector('.shelf .art.r-rare[style*="background-image"]');
      assert.match(await p.textContent('.shelfitem:has(.art.r-rare) .pr'), /77/);
      await p.locator('.shelfitem:has(.art.r-rare)').click();
      assert.match(await p.textContent('.idesc'), /A cold talisman/);
      await p.click('[data-act=up]'); await p.click('[data-act=up]');

      // variant: the copy carries its own record
      await d.locator('.row:has-text("Silver Talisman") [data-editi]').click(); await d.waitForSelector('.modal');
      await d.click('[data-act=edcopy]'); await d.waitForSelector('#ed-name:has-text("")');
      await d.waitForFunction(() => document.querySelector('#ed-name') && document.querySelector('#ed-name').value.includes('(kopya)'));
      await d.click('[data-act=edcancel]');
      assert.equal(await d.locator('.row:has-text("Silver Talisman")').count(), 2);

      // even if another player's action pushes a live update while typing, focus and text are kept
      await d.click('[data-addi="m1"]'); await d.waitForSelector('#ed-name');
      const typing = d.locator('#ed-name').pressSequentially('Abcdef', { delay: 120 });
      await p.click('[data-tab=bids]'); await p.click('[data-act=bidnew]'); await p.fill('#f-price', '1'); await p.fill('#f-name', 'X'); await p.click('[data-act=bidsend]'); // an event that broadcasts to the DM
      await typing;
      assert.equal(await d.inputValue('#ed-name'), 'Abcdef');
      assert.equal(await d.evaluate(() => document.activeElement && document.activeElement.id), 'ed-name');
      await d.click('[data-act=edcancel]');

      // Affinity settings belong to the DM: start 40 => a new player sees 'Customer', the bar disappears when off
      await d.click('[data-dtab=settings]'); await d.waitForSelector('#cfg-start');
      await d.fill('#cfg-start', '40'); await d.click('[data-act=cfgsave]');
      const pc2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
      const p2 = await pc2.newPage();
      await p2.goto(url); await p2.click('[data-pick=druid]'); await p2.fill('#name', 'Sonra'); await p2.click('#go');
      await p2.waitForSelector('[data-mid=m1] .affbar');
      assert.match(await p2.textContent('[data-mid=m1] .affbar .rw'), /Customer/);
      await d.click('[data-dtab=settings]'); await d.click('[data-cfgtoggle="0"]'); await d.click('[data-act=cfgsave]');
      await p2.waitForFunction(() => document.querySelectorAll('.affbar').length === 0);
      await d.click('[data-cfgtoggle="1"]'); await d.click('[data-act=cfgsave]');
      await p2.waitForSelector('[data-mid=m1] .affbar');
      // reset to defaults
      await d.click('[data-act=cfgreset]');
      await p2.waitForFunction(() => /Acquaintance/.test((document.querySelector('[data-mid=m1] .affbar .rw') || {}).textContent || ''));
      assert.deepEqual(errs, []);
      await dc.close(); await pc.close(); await pc2.close();
    } finally { try { require('fs').unlinkSync(addrFile); } catch {} }
  });
  await b.close();
  console.log('E2E OK');
})().catch((e) => { console.error(e); process.exit(1); });
