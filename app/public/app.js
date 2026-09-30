'use strict';
const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (+n).toFixed(2).replace(/\.?0+$/, '');
const store = { get() { try { return JSON.parse(localStorage.getItem('auth')); } catch { return null; } }, set(v) { try { v ? localStorage.setItem('auth', JSON.stringify(v)) : localStorage.removeItem('auth'); } catch {} } };

const KIND = { buy: 'Purchase', offer: 'Agreed offer', dm: 'DM' };

let CH = [], S = null, auth = store.get(), es = null;
const freshView = () => ({ tab: 'market', mid: null, iid: null, ib: { price: '', note: '' }, flt: 'all', form: false, f: { mid: null, iid: '', name: '', price: '', note: '' } });
let view = freshView();
let pick = null, dmTab = 'live', toastT, dmFilter = 'new';
let addr = null, addrTried = false, lf = { pid: '', kind: '' };
let edit = null; // DM: item editor state

function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2500); }
async function api(path, body) {
  const r = await fetch('/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': (auth && auth.token) || '', 'x-now': String(Date.now()) }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { toast(j.error || 'Error'); throw new Error(j.error); }
  return j;
}
const act = (path, body) => api(path, body).catch(() => {});

function connect() {
  if (es) es.close();
  es = new EventSource('/api/events?token=' + encodeURIComponent(auth.token));
  es.onmessage = (e) => { S = JSON.parse(e.data); if (S.role === 'dm' && !addrTried) { addrTried = true; loadAddr(); } render(); };
  es.onerror = async () => {
    if (es.readyState !== 2) return;            // the browser reconnects by itself
    const r = await fetch('/api/chars').catch(() => null);
    if (r) { auth = null; store.set(null); S = null; render(); } // server is up but the token is invalid
  };
}
function logout() { addr = null; addrTried = false; edit = null; pw = { cur: '', nw: '', nw2: '' }; if (es) es.close(); auth = null; S = null; store.set(null); view = freshView(); render(); }

// ---- image upload: crop + resize + re-encode in the browser (EXIF is dropped), the server verifies again ----
async function fitBlob(file, w, h, type, q) {
  const bmp = await createImageBitmap(file);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const k = Math.min(bmp.width / w, bmp.height / h), sw = w * k, sh = h * k; // center crop (closer to the top for portraits)
  c.getContext('2d').drawImage(bmp, (bmp.width - sw) / 2, type === 'image/jpeg' ? Math.min((bmp.height - sh) / 4, bmp.height - sh) : (bmp.height - sh) / 2, sw, sh, 0, 0, w, h);
  return new Promise((r) => c.toBlob(r, type, q));
}
async function putMedia(kind, id, variant, blob) {
  const r = await fetch(`/api/media?kind=${kind}&id=${encodeURIComponent(id)}&variant=${variant}`, { method: 'POST', headers: { 'x-token': auth.token, 'content-type': blob.type }, body: blob });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { toast(j.error || 'Upload failed'); const e = new Error(j.error || 'Upload failed'); e.shown = true; throw e; }
}
async function uploadImage(kind, id, file) {
  toast('Preparing image');
  try {
    // sizes the server accepts (small on the ESP, large on a PC); old defaults if unknown
    const lim = await fetch('/api/limits').then((r) => r.json()).catch(() => ({ item: 700 * 1024, thumb: 60 * 1024, portrait: 400 * 1024 }));
    if (kind === 'item') {
      let blob;
      for (const sz of [512, 384, 256, 192, 128]) { blob = await fitBlob(file, sz, sz, 'image/png'); if (blob.size <= lim.item) break; } // shrink if the PNG is too large
      await putMedia('item', id, 'main', blob);
      let th;
      for (const sz of [128, 96, 64]) { th = await fitBlob(file, sz, sz, 'image/png'); if (th.size <= lim.thumb) break; }
      await putMedia('item', id, 'thumb', th);
    } else {
      let blob;
      for (const [w, h, q] of [[768, 512, 0.85], [576, 384, 0.8], [384, 256, 0.75], [288, 192, 0.7]]) { blob = await fitBlob(file, w, h, 'image/jpeg', q); if (blob.size <= lim.portrait) break; }
      await putMedia('portrait', id, 'main', blob);
    }
    toast('Image uploaded');
  } catch (e) { if (!e || !e.shown) toast('Image upload failed'); }
}
function pickImage(kind, id) {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => { if (inp.files && inp.files[0]) uploadImage(kind, id, inp.files[0]); };
  inp.click();
}

// DM password form: kept in a draft so typed text survives a redraw.
let pw = { cur: '', nw: '', nw2: '' };
function passwordView() {
  const f = (id, k, label, ac) => `<label class="fld"><span>${label}</span><input type="password" id="${id}" data-pw="${k}" maxlength="64" autocomplete="${ac}" value="${esc(pw[k])}"></label>`;
  return `<h2>DM password</h2>
    <div class="card" style="text-align:left">
      <p class="hint" style="text-align:left;margin-top:0">At least 6 characters. Changing it signs out every DM session except this device.</p>
      ${f('pwcur', 'cur', 'Current PIN / password', 'current-password')}
      ${f('pwnew', 'nw', 'New password', 'new-password')}
      ${f('pwnew2', 'nw2', 'New password (repeat)', 'new-password')}
      <button class="btn" id="passgo">Change password</button>
    </div>`;
}
function settingsView() { return passwordView(); }

// ---- DM: item editor (name, description, type, rarity, price, stock, hidden, image) ----
function editorView() {
  const e = edit, m = S.merchants.find((x) => x.id === e.merchantId);
  const opt = (v, list) => list.map(([k, l]) => `<option value="${k}" ${String(v || '') === k ? 'selected' : ''}>${l}</option>`).join('');
  return `<div class="modal"><div class="card" style="text-align:left">
    <h2 style="margin-top:0">${e.id ? 'Edit item' : 'New item'}${m ? ' · ' + esc(m.name) : ''}</h2>
    <label class="fld"><span>Name</span><input type="text" id="ed-name" maxlength="40" data-ed="name" value="${esc(e.name)}"></label>
    <label class="fld"><span>Description<small>players see it on the item page</small></span><textarea id="ed-desc" maxlength="200" rows="3" data-ed="desc">${esc(e.desc)}</textarea></label>
    <div class="two">
      <label class="fld"><span>Type</span><select id="ed-type" data-ed="type"><option value="">Automatic</option>${opt(e.type, Object.entries(LABEL))}</select></label>
      <label class="fld"><span>Rarity</span><select id="ed-rarity" data-ed="rarity">${opt(e.rarity || 'none', [['none', 'None'], ...Object.entries(RARITY).filter(([k]) => k !== 'none')])}</select></label>
    </div>
    <div class="two">
      <label class="fld"><span>Price (gp)</span><input type="number" inputmode="decimal" step="0.01" min="0" id="ed-price" data-ed="price" value="${esc(e.price)}"></label>
      <label class="fld"><span>Stock<small>empty = unlimited</small></span><input type="number" inputmode="numeric" min="0" id="ed-stock" data-ed="stock" value="${esc(e.stock)}"></label>
    </div>
    <div class="two">
      <label class="fld"><span>Shown to players<small>hidden items wait in your stockroom</small></span><select id="ed-hidden" data-ed="hidden"><option value="0" ${e.hidden ? '' : 'selected'}>Shown</option><option value="1" ${e.hidden ? 'selected' : ''}>Hidden</option></select></label>
      <label class="fld"><span>Magical</span><select id="ed-magical" data-ed="magical"><option value="0" ${e.magical ? '' : 'selected'}>No</option><option value="1" ${e.magical ? 'selected' : ''}>Yes</option></select></label>
    </div>
    <button class="btn ghost" data-act="edpick">${e.file ? 'Image: ' + esc(e.file.name) : e.hasImage ? 'Change image' : 'Choose image'}</button>
    <button class="btn" data-act="edsave">Save</button>
    ${e.id ? '<button class="btn ghost" data-act="edcopy">Make a copy (variant)</button>' : ''}
    <button class="btn ghost" data-act="edcancel">Cancel</button>
  </div></div>`;
}
function openEditor(merchantId, it) {
  edit = it
    ? { id: it.id, merchantId: it.merchantId, name: it.name, desc: it.desc || '', type: it.type || '', rarity: it.rarity || 'none', price: it.price, stock: it.stock ?? '', hidden: !!it.hidden, magical: !!it.magical, hasImage: !!it.image, file: null }
    : { id: null, merchantId, name: '', desc: '', type: '', rarity: 'none', price: '', stock: '', hidden: false, magical: false, hasImage: false, file: null };
  render();
}
async function saveEditor(closeAfter = true) {
  const e = edit;
  const body = itemBody(e);
  if (e.id) body.id = e.id;
  const r = await api('dm/item', body);
  if (e.file) await uploadImage('item', r.id, e.file);
  if (closeAfter) { edit = null; render(); toast('Item saved'); }
  return r.id;
}

// Every field of an item, so a save (or the hide toggle) never drops one.
const itemBody = (i) => ({ merchantId: i.merchantId, name: i.name, desc: i.desc || '', type: i.type || '', rarity: i.rarity || 'none', price: i.price, stock: i.stock ?? '', hidden: !!i.hidden, magical: !!i.magical });

let apk = false;
async function loadAddr() {
  try { const r = await fetch('/api/address', { headers: { 'x-token': auth.token } }); addr = await r.json(); render(); } catch {}
  // The ESP hosts the Android app at /pazar.apk. Unknown paths answer with the app page there, so check the content type, not just the status.
  try { const h = await fetch('/pazar.apk', { method: 'HEAD' }); apk = h.ok && /android\.package-archive/.test(h.headers.get('content-type') || ''); render(); } catch {}
}
function apkCard() {
  if (!apk) return '';
  const url = location.origin + '/pazar.apk';
  return `<h2>Android app</h2><div class="card" style="text-align:left"><small>Players install this once (allow "install unknown apps"). It opens the table over the internet, or over the Pazar Wi-Fi at the table.</small>${(() => { try { return `<div class="qr">${QR.svg(url, { ecl: 'M' })}</div>`; } catch { return ''; } })()}<div class="price" style="white-space:normal;word-break:break-all">${esc(url)}</div><div class="tl"><a class="btn sm" href="/pazar.apk" download="pazar.apk">Download</a></div></div>`;
}
function addrCard() {
  return `<h2>Invite address</h2><div class="card" style="text-align:left">${addr && addr.url
    ? `${(() => { try { return `<div class="qr">${QR.svg(addr.url, { ecl: 'M' })}</div>`; } catch { return ''; } })()}<div class="price" style="white-space:normal;word-break:break-all">${esc(addr.url)}</div><small>${addr.funnel ? 'Public (Funnel)' : 'Tailscale network'} · players open this address</small><div class="tl"><button class="btn sm ghost" data-act="copyaddr">Copy</button><button class="btn sm ghost" data-act="shareaddr">Share</button></div>`
    : '<small>No address. Run <b>npm run tailscale</b> on the server, then refresh this page.</small>'}</div>`;
}
function ledgerFilters() {
  return `<div class="two"><select id="lf-p"><option value="">All players</option>${S.players.map((p) => `<option value="${p.id}" ${lf.pid === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
    <select id="lf-k"><option value="">All kinds</option>${Object.entries(KIND).map(([k, l]) => `<option value="${k}" ${lf.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <button class="btn ghost" data-act="csv">Download CSV (all records)</button>`;
}

// ---------- shared parts ----------
const initial = (n) => (String(n || '?').trim()[0] || '?').toUpperCase();
const SRV = () => (window.PazarApp ? '<button class="btn ghost" id="srv">Server address</button>' : '');

// Item type (guessed from the name until the item has an explicit `type`).
const LABEL = { weapon: 'Weapon', armor: 'Armor', potion: 'Potion', scroll: 'Scroll', gem: 'Trinket', gear: 'Gear', other: 'Item' };
const RARITY = { none: '', common: 'Common', uncommon: 'Uncommon', rare: 'Rare', veryrare: 'Very rare', legendary: 'Legendary', artifact: 'Artifact' };
const TYPE_RULES = [
  ['potion', /potion|elixir|antidote|salve|healing/],
  ['weapon', /sword|dagger|axe|spear|bow\b|mace|club|hammer|saber|sabre|knife|crossbow|staff|wand|rapier/],
  ['armor', /armor|armour|shield|helm|mail|leather|gauntlet/],
  ['scroll', /scroll|book|tome|map|spell/],
  ['gem', /ring|necklace|amulet|scale|stone|gem|jewel|crystal|talisman/],
  ['gear', /\brope\b|tent|torch|pack|bag|blanket|pick|shovel|lantern|oil|ration|food|tools?\b|key|lock/],
];
function itemType(i) {
  if (i.type && LABEL[i.type]) return i.type; // if the DM picked a type, name guessing is not used
  const n = String(i.name).toLowerCase();
  for (const [cat, re] of TYPE_RULES) if (re.test(n)) return cat;
  return 'other';
}
const FILTERS = [['all', 'All'], ['weapon', 'Weapon'], ['armor', 'Armor'], ['potion', 'Potion'], ['magic', 'Magic']];
const BAG_SLOTS = 18;

// Art area: a background image if there is one, otherwise a text box (type + name).
function art(i, { cls = '', label = null, extra = '', thumb = false } = {}) {
  const rar = i.rarity && i.rarity !== 'none' ? i.rarity : '';
  const lb = label || [i.magical ? 'Magical' : '', RARITY[rar] || '', LABEL[itemType(i)]].filter(Boolean).join(' · ');
  const src = thumb ? i.thumb || i.image : i.image;
  if (src) return `<span class="art ${cls} ${i.magical ? 'mg' : ''} ${rar ? 'r-' + rar : ''}" title="${esc(i.name)}" style="background-image:url('${esc(src)}')">${extra}</span>`;
  return `<span class="art ${cls} ${i.magical ? 'mg' : ''} ${rar ? 'r-' + rar : ''}"><span class="artlabel">${esc(lb)}</span><span class="artname">${esc(i.name)}</span>${extra}</span>`;
}
function portrait(m, opt = {}) {
  const bg = m.portrait ? ` style="background-image:url('${esc(m.portrait)}')"` : '';
  return `<div class="portrait ${opt.small ? 'sm' : ''}"${bg}>${m.portrait ? '' : `<div class="pface"><span class="pinit">${esc(initial(m.name))}</span><span class="plabel">PORTRAIT</span></div>`}
    <div class="plaque"><span class="pico">${esc(initial(m.name))}</span><span class="pname">${esc(m.name)}</span>${m.closed ? '<span class="tag bad">Closed to you today</span>' : ''}</div></div>`;
}
const led = (e, who = '') => `<div class="led"><span class="lt">Wk${e.week} D${e.day}</span><span class="ln">${who}${esc(e.name)}<small>${KIND[e.kind] || esc(e.kind)}${e.list ? ' · list ' + fmt(e.list) : ''}</small></span><span class="la ${e.amount < 0 ? 'neg' : 'pos'}">${e.amount > 0 ? '+' : ''}${fmt(e.amount)}</span></div>`;

// ---------- login ----------
function renderJoin() {
  $app.innerHTML = `
    <h1>Pazar</h1><p class="sub">Choose your character and enter the market.</p>
    <div class="grid">${CH.map((c) => `
      <button class="card ${pick === c.id ? 'sel' : ''}" data-pick="${c.id}">
        <div class="init">${esc(initial(c.name))}</div><b>${esc(c.name)}</b><small>${esc(c.blurb)}</small>
        <div class="stats"><span class="gold"><i class="coin"></i>${c.gold}</span></div>
      </button>`).join('')}</div>
    <h2>Your name</h2><input type="text" id="name" maxlength="16" placeholder="Your name" autocomplete="off">
    <button class="btn" id="go">Enter the Market</button>
    <button class="btn ghost" id="dm">I am the DM</button>
    ${SRV()}`;
}
function renderDMLogin() {
  $app.innerHTML = `<h1>DM</h1><p class="sub">Enter your PIN or password.</p>
    <input type="password" id="pin" placeholder="PIN / password" autocomplete="current-password"><button class="btn" id="dmgo">Enter</button>
    <button class="btn ghost" id="back">Back</button>
    ${SRV()}`;
}

// ---------- player ----------
const mer = (id) => S.merchants.find((m) => m.id === id);
const chr = (id) => CH.find((c) => c.id === id);

function renderPlayer() {
  const me = S.me, c = chr(me.charId) || { name: '' };
  const head = `<div class="top"><span class="pill">${esc(me.name)}${c.name ? ' · ' + esc(c.name) : ''}</span><span class="pill gold"><i class="coin"></i>${fmt(me.gold)}</span><span class="pill">Wk ${S.week} · Day ${S.day}</span></div>`;
  let body;
  if (view.iid) body = renderItemPage(me);
  else if (view.tab === 'bag') body = renderBag(me);
  else if (view.tab === 'bids') body = renderBids(me);
  else if (view.mid) body = renderItems();
  else body = renderMarket();
  const tb = (k, label, extra = '') => `<button data-tab="${k}" class="${view.tab === k ? 'on' : ''}">${label}${extra}</button>`;
  const tabs = view.iid ? '' : `<nav class="tabs">${tb('market', 'Market')}${tb('bids', 'Offers', S.bids.some((b) => b.status === 'counter') ? '<i class="dot"></i>' : '')}${tb('bag', 'Bag', me.inventory.length ? ' ' + me.inventory.length : '')}<button data-act="logout">Exit</button></nav>`;
  $app.innerHTML = head + (S.dmOnline ? '' : '<p class="hint">The DM is offline right now. The market is still open.</p>') + body + tabs;
}
function renderMarket() {
  return `<h2>Market</h2><div class="list">${S.merchants.map((m) => `
    <button class="card row" data-mid="${m.id}"><span class="pico" style="width:52px;height:52px;font-size:28px">${esc(initial(m.name))}</span>
      <span class="grow"><b style="margin:0">${esc(m.name)}</b>${m.closed ? '<span class="tag bad">Closed to you today</span>' : ''}<small>${m.items.length} items</small></span> <span class="gold">›</span></button>`).join('') || '<p class="empty">The market is empty.</p>'}</div>`;
}
function renderItems() {
  const m = mer(view.mid);
  if (!m) { view.mid = null; return renderMarket(); }
  const flt = view.flt || 'all';
  const shown = m.items.filter((i) => flt === 'all' || (flt === 'magic' ? i.magical : itemType(i) === flt));
  return `<button class="back" data-act="up">‹ Market</button>${portrait(m, { small: true })}
    <div class="filters">${FILTERS.map(([k, l]) => `<button data-flt="${k}" class="${flt === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="shelf">${shown.map((i) => `
      <button class="shelfitem" data-iid="${i.id}" ${i.stock === 0 ? 'disabled' : ''}>
        ${art(i, { extra: i.stock === 0 ? '<span class="sold">SOLD OUT</span>' : i.stock ? `<span class="stock">×${i.stock}</span>` : '' })}
        <span class="pr"><i class="coin"></i>${fmt(i.price)}</span></button>`).join('') || '<p class="empty" style="grid-column:1/-1">Nothing on this shelf.</p>'}</div>
    <p class="hint">Tap an item to make an offer or buy it.</p>`;
}
function renderBag(me) {
  const n = Math.max(BAG_SLOTS, Math.ceil(me.inventory.length / 3) * 3);
  const slots = Array.from({ length: n }, (_, k) => {
    const i = me.inventory[k];
    return i ? `<div class="bslot">${art(i, { thumb: true })}<span class="bp">${fmt(i.paid)}</span></div>` : '<div class="bslot"></div>';
  }).join('');
  const ledger = S.ledger.slice().reverse();
  return `<div class="bagbar"><span>Bag</span><span>${me.inventory.length}/${n}</span></div><div class="bag">${slots}</div>
    <div class="list bagdetail">${me.inventory.map((i) => `
      <div class="card row"><span class="grow"><b style="margin:0">${esc(i.name)}</b></span><span class="price">${fmt(i.paid)} gp</span></div>`).join('') || '<p class="empty">Your bag is empty.</p>'}</div>
    <h2>Spending record</h2>${ledger.map((e) => led(e, (mer(e.merchantId) ? esc(mer(e.merchantId).name) + ' · ' : ''))).join('') || '<p class="empty">No records yet.</p>'}`;
}
const BST = { new: 'Waiting for the DM', counter: 'Your reply', rejected: 'Rejected', withdrawn: 'Withdrawn', settled: 'Bought' };
const isOpen = (o) => ['new', 'counter'].includes(o.status);
function histLine(o) {
  const h = o.history[o.history.length - 1];
  return h && h.note ? `<small>Note: ${esc(h.note)}</small>` : '';
}
function renderBids(me) {
  const f = view.f;
  if (!S.merchants.find((m) => m.id === f.mid)) f.mid = S.merchants[0] && S.merchants[0].id;
  const m = mer(f.mid);
  const form = view.form ? `<div class="offer">
      <select id="f-m">${S.merchants.map((x) => `<option value="${x.id}" ${x.id === f.mid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <select id="f-i" style="margin-top:8px"><option value="">Custom request…</option>${(m ? m.items : []).map((i) => `<option value="${i.id}" ${i.id === f.iid ? 'selected' : ''}>${esc(i.name)} · ${fmt(i.price)} gp</option>`).join('')}</select>
      ${f.iid ? '' : `<input type="text" id="f-name" maxlength="40" placeholder="What do you want?" value="${esc(f.name)}" style="margin-top:8px">`}
      <input type="number" id="f-price" inputmode="decimal" step="0.01" min="0" placeholder="Your offer (gp)" value="${esc(f.price)}" style="margin-top:8px">
      <input type="text" id="f-note" maxlength="80" placeholder="Note (optional)" value="${esc(f.note)}" style="margin-top:8px">
      <button class="btn" data-act="bidsend">Send</button><button class="btn ghost" data-act="bidcancel">Cancel</button></div>`
    : '<button class="btn" data-act="bidnew">+ New Offer</button>';
  const bids = S.bids.slice().sort((a, b) => (isOpen(b) - isOpen(a)) || b.t - a.t);
  return `<h2>Offers</h2><p class="hint" style="text-align:left;margin-top:0">Haggle with the merchant at the table, then put your offer here. When one side accepts, the gold and the item change hands at once.</p>${form}
    <div class="list" style="margin-top:12px">${bids.map((o) => { const mm = mer(o.merchantId) || { name: '?' }; return `
      <div class="card" style="text-align:left"><div class="row"><b class="grow" style="margin:0">${esc(o.itemName)}</b><span class="tag">${BST[o.status]}</span></div>
        <small>${esc(mm.name)} · ${o.by === 'dm' ? 'merchant offer' : 'your offer'} <b class="gold" style="display:inline;margin:0">${fmt(o.price)} gp</b>${o.listPrice ? ` · list ${fmt(o.listPrice)}` : ''}</small>${histLine(o)}
        ${o.status === 'counter' && me.gold < o.price ? '<small class="tag bad">Not enough gold</small>' : ''}
        ${isOpen(o) ? `<div class="tl">${o.status === 'counter' ? `<button class="btn sm ok" data-bacc="${o.id}">Accept · ${fmt(o.price)} gp</button><button class="btn sm" data-bcnt="${o.id}">Counter</button>` : ''}<button class="btn sm ghost" data-bwd="${o.id}">Withdraw</button></div>` : ''}</div>`; }).join('') || '<p class="empty">No offers yet.</p>'}</div>`;
}
function currentItem() {
  for (const m of S.merchants) { const i = m.items.find((x) => x.id === view.iid); if (i) return { m, i }; }
  return null;
}
function renderItemPage(me) {
  const f = currentItem();
  if (!f) { view.iid = null; return renderMarket(); }
  const { m, i } = f;
  const open = !m.closed && i.stock !== 0, broke = me.gold < i.price;
  const mine = S.bids.filter((o) => o.itemId === i.id && isOpen(o));
  return `<button class="back" data-act="up">‹ Back</button>
    <div class="neg"><div class="nl">
    ${portrait(m, { small: true })}
    ${art(i, { cls: 'xl' })}
    ${i.desc ? `<p class="idesc">${esc(i.desc)}</p>` : ''}
    <div class="bigprice">${fmt(i.price)} gp</div></div><div class="nr">
    ${m.closed ? '<div class="bubble">I have no business with you today.</div>' : ''}
    ${mine.map((o) => `<div class="card" style="text-align:left"><div class="row"><b class="grow" style="margin:0">${o.by === 'dm' ? 'Merchant asks' : 'You offered'} ${fmt(o.price)} gp</b><span class="tag">${BST[o.status]}</span></div>${histLine(o)}
      ${o.status === 'counter' ? `<div class="tl"><button class="btn sm ok" data-bacc="${o.id}" ${me.gold < o.price ? 'disabled' : ''}>Accept · ${fmt(o.price)} gp</button><button class="btn sm" data-bcnt="${o.id}">Counter</button></div>` : ''}</div>`).join('')}
    ${open && !mine.length ? `
      <div class="offer"><p class="hint" style="margin-top:0">Haggle at the table, then send the price you agreed on or your best offer.</p>
        <input type="number" id="ib-price" inputmode="decimal" step="0.01" min="0" placeholder="Your offer (gp)" value="${esc(view.ib.price)}">
        <input type="text" id="ib-note" maxlength="80" placeholder="Note (optional)" value="${esc(view.ib.note)}" style="margin-top:8px">
        <button class="btn" data-act="itembid">Make offer</button></div>` : ''}
    <div class="actions">
      <button class="btn ok" data-act="accept" ${broke || !open ? 'disabled' : ''}>${broke ? 'Not enough gold' : `Buy at list price · ${fmt(i.price)} gp`}</button>
    </div></div></div>`;
}

// ---------- DM ----------
const pname = (id) => { const p = S.players.find((x) => x.id === id); return p ? esc(p.name) : '?'; };
const isClosedTo = (pid, mid) => S.closed.some((c) => c.playerId === pid && c.merchantId === mid);
function offerCard(o) {
  const mm = S.merchants.find((x) => x.id === o.merchantId) || { name: '?' };
  return `<div class="card dm-neg"><div class="hd"><span>${pname(o.playerId)} → ${esc(o.itemName)}</span><span class="tag">${BST[o.status]}</span></div>
    <small>${esc(mm.name)} · ${o.by === 'dm' ? 'merchant asks' : 'player offers'} <b class="gold" style="display:inline;margin:0">${fmt(o.price)}</b>${o.listPrice ? ` · list ${fmt(o.listPrice)} (${Math.round(o.price / o.listPrice * 100)}%)` : ' · custom request'} · week ${o.week}</small>${histLine(o)}
    ${isOpen(o) ? `<div class="tl">${o.status === 'new' ? `<button class="btn sm ok" data-dacc="${o.id}">Accept · ${fmt(o.price)}</button>` : ''}<button class="btn sm" data-dcnt="${o.id}">Counter-offer</button><button class="btn sm ghost" data-drej="${o.id}">Reject</button></div>` : ''}</div>`;
}

function renderDM() {
  const dtabs = [['live', 'Live'], ['bids', 'Offers'], ['market', 'Market'], ['players', 'People'], ['ledger', 'Ledger'], ['settings', 'Settings']];
  const tabs = `<nav class="tabs dm">${dtabs.map(([k, l]) => `<button data-dtab="${k}" class="${dmTab === k ? 'on' : ''}">${l}${k === 'bids' && S.bids.some((b) => b.status === 'new') ? '<i class="dot"></i>' : ''}</button>`).join('')}<button data-act="logout">Exit</button></nav>`;
  const head = `<div class="top"><span class="pill">DM</span><span class="pill">Wk ${S.week} · Day ${S.day}</span><button class="btn sm ghost" data-act="newday">New Day</button></div>`;
  let body = '';
  if (dmTab === 'live') {
    const inbox = S.bids.filter((b) => b.status === 'new').sort((a, b) => a.t - b.t);
    body = `<h2>Waiting for you</h2><div class="list">${inbox.map(offerCard).join('') || '<p class="empty">No offers are waiting.</p>'}</div>
      <h2>Feed</h2>${S.log.slice().reverse().map((l) => `<div class="feed">${esc(l.text)}</div>`).join('')}`;
  } else if (dmTab === 'bids') {
    const G = { new: ['new'], counter: ['counter'], closed: ['rejected', 'withdrawn', 'settled'] };
    const LBL = { new: 'New', counter: 'Waiting for player', closed: 'Closed' };
    const cnt = (k) => S.bids.filter((b) => G[k].includes(b.status)).length;
    const list = S.bids.filter((b) => G[dmFilter].includes(b.status)).sort((a, b) => b.t - a.t);
    body = `<div class="seg">${Object.keys(G).map((k) => `<button class="${dmFilter === k ? 'on' : ''}" data-bf="${k}">${LBL[k]} ${cnt(k)}</button>`).join('')}</div>
      <div class="list">${list.map(offerCard).join('') || '<p class="empty">No offers in this list.</p>'}</div>
      <button class="btn ghost" data-act="weekly">Start week ${S.week + 1}</button>`;
  } else if (dmTab === 'market') {
    body = `<button class="btn sm" data-act="addm">+ Merchant</button>` + S.merchants.map((m) => `
      <div class="card" style="text-align:left;margin-top:10px"><div class="row"><span class="pico" style="width:40px;height:40px">${esc(initial(m.name))}</span><b class="grow" style="margin:0">${esc(m.name)}</b><button class="btn sm ghost" data-img="portrait|${m.id}">Portrait</button>${m.portrait ? `<button class="btn sm ghost" data-imgdel="portrait|${m.id}">Remove portrait</button>` : ''}<button class="btn sm ghost" data-editm="${m.id}">Edit</button><button class="btn sm ghost" data-del="merchant|${m.id}">Delete</button></div>
        ${S.items.filter((i) => i.merchantId === m.id).map((i) => `<div class="row" style="padding:4px 0"><span class="grow">${i.image ? `<span class="mini" style="background-image:url('${esc(i.thumb || i.image)}')"></span>` : ''}${esc(i.name)}${i.magical ? ' <span class="tag mg">magical</span>' : ''}${i.hidden ? ' <span class="tag bad">hidden</span>' : ''}${i.stock !== null ? ` <small>(${i.stock})</small>` : ''}</span><span class="price">${fmt(i.price)}</span><button class="btn sm ghost" data-img="item|${i.id}">Image</button>${i.image ? `<button class="btn sm ghost" data-imgdel="item|${i.id}">Remove</button>` : ''}<button class="btn sm ghost" data-hide="${i.id}">${i.hidden ? 'Show' : 'Hide'}</button><button class="btn sm ghost" data-editi="${i.id}">Edit</button><button class="btn sm ghost" data-del="item|${i.id}">Delete</button></div>`).join('')}
        <button class="btn sm ghost" data-addi="${m.id}">+ Item</button></div>`).join('');
  } else if (dmTab === 'players') {
    body = addrCard() + apkCard() + `<h2>Players</h2><div class="list">${S.players.map((p) => `
      <div class="card" style="text-align:left"><div class="row"><span class="pico" style="width:40px;height:40px">${esc(initial(p.name))}</span><span class="grow"><b style="margin:0">${esc(p.name)}</b><small>${esc((chr(p.charId) || {}).name || '')} · ${p.inventory.length} items</small></span><span class="price"><i class="coin"></i>${fmt(p.gold)}</span></div>
        <div class="tl"><small style="align-self:center">Closed today:</small>${S.merchants.map((m) => { const c = isClosedTo(p.id, m.id); return `<button class="btn sm ${c ? '' : 'ghost'}" data-close="${p.id}|${m.id}|${c ? 0 : 1}">${esc(m.name)}${c ? ' ✕' : ''}</button>`; }).join('')}</div>
        <div class="tl"><button class="btn sm ghost" data-gold="${p.id}|-10">−10</button><button class="btn sm ghost" data-gold="${p.id}|10">+10</button><button class="btn sm ghost" data-gold="${p.id}|100">+100</button><button class="btn sm ghost" data-goldset="${p.id}">Set</button></div>
        <div class="tl"><button class="btn sm ghost" data-sendbid="${p.id}">Send offer</button><button class="btn sm ghost" data-del="player|${p.id}">Delete</button></div></div>`).join('') || '<p class="empty">Nobody here.</p>'}</div>`;
  } else if (dmTab === 'settings') {
    body = settingsView();
  } else {
    const L = S.ledger.slice().reverse().filter((e) => (!lf.pid || e.playerId === lf.pid) && (!lf.kind || e.kind === lf.kind));
    const spent = -L.filter((e) => e.amount < 0).reduce((a, e) => a + e.amount, 0);
    const granted = L.filter((e) => e.kind === 'dm' && e.amount > 0).reduce((a, e) => a + e.amount, 0);
    body = `<h2>Purchase ledger</h2>${ledgerFilters()}<div class="stat3" style="margin-top:10px"><div class="card"><b>${fmt(spent)}</b><small>spent</small></div><div class="card"><b>${fmt(granted)}</b><small>granted by the DM</small></div><div class="card"><b>${L.length}</b><small>entries</small></div></div>
      ${L.map((e) => led(e, pname(e.playerId) + ' · ' + (S.merchants.find((m) => m.id === e.merchantId) ? esc(S.merchants.find((m) => m.id === e.merchantId).name) + ' · ' : ''))).join('') || '<p class="empty">No entries yet.</p>'}`;
  }
  $app.innerHTML = head + `<div class="dmpane">${body}</div>` + tabs + (edit ? editorView() : '');
}

// ---------- render ----------
function render() {
  const ae = document.activeElement, keep = ae && ae.id && $app.contains(ae) ? { id: ae.id, a: ae.selectionStart, b: ae.selectionEnd } : null;
  if (!auth) pick === 'DM' ? renderDMLogin() : renderJoin();
  else if (!S) $app.innerHTML = '<p class="empty">Connecting…</p>';
  else if (S.role === 'dm') renderDM(); else renderPlayer();
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus(); try { el.setSelectionRange(keep.a, keep.b); } catch {} } }
}

// ---------- events ----------
$app.addEventListener('change', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.ed !== undefined && edit) { edit[t.dataset.ed] = ['magical', 'hidden'].includes(t.dataset.ed) ? t.value === '1' : t.value; return; }
  if (e.target.id === 'lf-p') { lf.pid = e.target.value; return render(); }
  if (e.target.id === 'lf-k') { lf.kind = e.target.value; return render(); }
  const f = view.f;
  if (e.target.id === 'f-m') { f.mid = e.target.value; f.iid = ''; render(); }
  if (e.target.id === 'f-i') { f.iid = e.target.value; render(); }
});
$app.addEventListener('input', (e) => {
  const t = e.target;
  if (t.dataset && t.dataset.pw !== undefined) { pw[t.dataset.pw] = t.value; return; }
  if (t.dataset && t.dataset.ed !== undefined && edit) { edit[t.dataset.ed] = ['magical', 'hidden'].includes(t.dataset.ed) ? t.value === '1' : t.value; return; }
  if (t.id === 'ib-price') { view.ib.price = t.value; return; }
  if (t.id === 'ib-note') { view.ib.note = t.value; return; }
  const f = view.f, k = { 'f-name': 'name', 'f-price': 'price', 'f-note': 'note' }[e.target.id];
  if (k) f[k] = e.target.value;
});
$app.addEventListener('click', async (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.pick) { pick = d.pick; return render(); }
  if (t.id === 'dm') { pick = 'DM'; return render(); }
  if (t.id === 'back') { pick = null; return render(); }
  if (t.id === 'srv') return void window.PazarApp.changeServer(); // Android shell
  if (t.id === 'go') {
    const name = document.getElementById('name').value;
    if (!pick || !CH.find((c) => c.id === pick)) return toast('Choose a character.');
    try { const r = await api('join', { name, charId: pick }); auth = r; store.set(r); connect(); } catch {}
    return;
  }
  if (t.id === 'passgo') {
    if (pw.nw.length < 6) return toast('The new password must be at least 6 characters.');
    if (pw.nw !== pw.nw2) return toast('The new passwords do not match.');
    try { await api('dm/password', { current: pw.cur, next: pw.nw }); pw = { cur: '', nw: '', nw2: '' }; toast('DM password changed.'); render(); } catch {}
    return;
  }
  if (t.id === 'dmgo') { try { const r = await api('dm/login', { pin: document.getElementById('pin').value }); auth = r; store.set(r); pick = null; connect(); } catch {} return; }
  if (d.tab) { view.tab = d.tab; view.mid = null; view.iid = null; return render(); }
  if (d.mid) { view.mid = d.mid; view.flt = 'all'; return render(); }
  if (d.flt) { view.flt = d.flt; return render(); }
  if (d.iid) { view.iid = d.iid; view.ib = { price: '', note: '' }; return render(); }
  if (d.dtab) { dmTab = d.dtab; return render(); }
  if (d.bf) { dmFilter = d.bf; return render(); }
  if (d.img) { const [k, id] = d.img.split('|'); return void pickImage(k, id); }
  if (d.imgdel) { const [k, id] = d.imgdel.split('|'); if (confirm('Remove the image?')) act('dm/mediaclear', { kind: k, id }); return; }
  if (d.close) { const [pid, mid, v] = d.close.split('|'); return void act('dm/close', { playerId: pid, merchantId: mid, closed: v === '1' }); }
  if (d.hide) { const it = S.items.find((x) => x.id === d.hide); return void act('dm/item', { id: it.id, ...itemBody(it), hidden: !it.hidden }); }
  if (d.bacc) return void act('bidreply', { id: d.bacc, action: 'accept' });
  if (d.bwd) return void act('bidreply', { id: d.bwd, action: 'withdraw' });
  if (d.bcnt) { const o = S.bids.find((x) => x.id === d.bcnt); const v = prompt('Your counter-offer (gp):', fmt(o.price)); return void (v && act('bidreply', { id: o.id, action: 'counter', price: v })); }
  if (d.dacc) return void act('dm/bidreply', { id: d.dacc, action: 'accept' });
  if (d.drej) { const n = prompt('Reason for rejecting (optional):', ''); return void (n !== null && act('dm/bidreply', { id: d.drej, action: 'reject', note: n })); }
  if (d.dcnt) {
    const o = S.bids.find((x) => x.id === d.dcnt), X = o.listPrice;
    const sug = X ? Math.round(((o.price + X) / 2) * 100) / 100 : o.price; // halfway between the offer and the list price
    const v = prompt('Counter-offer (gp):', fmt(sug)); if (!v) return;
    const n = prompt('Note (optional):', ''); return void (n !== null && act('dm/bidreply', { id: o.id, action: 'counter', price: v, note: n }));
  }
  if (d.sendbid) {
    const list = S.items.map((i, k) => { const m = S.merchants.find((x) => x.id === i.merchantId); return `${k + 1}) ${i.name} – ${m ? m.name : '?'} (${fmt(i.price)})`; }).join('\n');
    const k = parseInt(prompt(list + '\n\nItem number:'), 10), it = S.items[k - 1]; if (!it) return;
    const price = prompt('Offer price (gp):', fmt(Math.round(it.price * 80) / 100)); if (!price) return;
    const note = prompt('Note (optional):', ''); return void (note !== null && act('dm/bidsend', { playerId: d.sendbid, itemId: it.id, price, note }));
  }
  if (d.editm) { const m = S.merchants.find((x) => x.id === d.editm); const name = prompt('Merchant name:', m.name); if (!name) return; return void act('dm/merchant', { id: m.id, name, emoji: m.emoji }); }
  if (d.addi) return void openEditor(d.addi, null);
  if (d.editi) return void openEditor(null, S.items.find((x) => x.id === d.editi));
  if (d.del) { const [kind, id] = d.del.split('|'); if (confirm('Delete this?')) act('dm/delete', { kind, id }); return; }
  if (d.gold) { const [id, delta] = d.gold.split('|'); const p = S.players.find((x) => x.id === id); return void act('dm/player', { id, gold: Math.max(0, p.gold + +delta) }); }
  if (d.goldset) { const v = prompt('Gold:'); return void (v !== null && act('dm/player', { id: d.goldset, gold: v })); }
  switch (d.act) {
    case 'logout': return logout();
    case 'edpick': { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.onchange = () => { if (inp.files[0]) { edit.file = inp.files[0]; render(); } }; inp.click(); return; }
    case 'edsave': try { await saveEditor(true); } catch {} return;
    case 'edcopy': { try { const nid = await saveEditor(false); const r = await api('dm/itemvariant', { id: nid, name: `${edit.name} (copy)` }); edit = null; render(); toast('Copy created'); const it = S.items.find((x) => x.id === r.id); if (it) openEditor(null, it); } catch {} return; }
    case 'edcancel': edit = null; return render();
    case 'copyaddr': try { await navigator.clipboard.writeText(addr.url); toast('Address copied'); } catch { prompt('Copy the address:', addr.url); } return;
    case 'shareaddr': if (navigator.share) { try { await navigator.share({ title: 'Pazar', url: addr.url }); } catch {} } else { try { await navigator.clipboard.writeText(addr.url); toast('Address copied'); } catch { prompt('Copy the address:', addr.url); } } return;
    case 'csv': {
      try {
        const r = await fetch('/api/ledger.csv', { headers: { 'x-token': auth.token } });
        if (!r.ok) throw new Error();
        const a = document.createElement('a'); a.href = URL.createObjectURL(await r.blob()); a.download = 'ledger.csv'; document.body.appendChild(a); a.click(); a.remove();
      } catch { toast('Download failed'); }
      return;
    }
    case 'up': if (view.iid) view.iid = null; else view.mid = null; return render();
    case 'newday': if (confirm('New day: merchants you closed to players open again.')) act('dm/newday'); return;
    case 'addm': { const name = prompt('Merchant name:'); if (!name) return; return void act('dm/merchant', { name }); }
    case 'bidnew': view.form = true; return render();
    case 'bidcancel': view.form = false; return render();
    case 'bidsend': {
      const f = view.f;
      try { await api('bid', { merchantId: f.mid, itemId: f.iid || null, itemName: f.name, price: f.price, note: f.note }); view.form = false; view.f = { mid: f.mid, iid: '', name: '', price: '', note: '' }; toast('Offer sent'); render(); } catch {}
      return;
    }
    case 'weekly': if (confirm(`Start week ${S.week + 1}? It is also a new day. Open offers stay.`)) act('dm/weekly'); return;
    case 'itembid': {
      const f = currentItem(); if (!f) return;
      try { await api('bid', { merchantId: f.m.id, itemId: f.i.id, price: view.ib.price, note: view.ib.note }); view.ib = { price: '', note: '' }; toast('Offer sent to the DM'); render(); } catch {}
      return;
    }
    case 'accept': { const f = currentItem(); if (!f || !confirm(`Buy ${f.i.name} for ${fmt(f.i.price)} gp?`)) return; try { await api('accept', { itemId: view.iid }); toast(`Bought: ${f.i.name}`); view.iid = null; render(); } catch {} return; }
  }
});

(async function init() {
  try { CH = await (await fetch('/api/chars')).json(); } catch {}
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (auth) connect();
  render();
})();
