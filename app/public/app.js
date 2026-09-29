'use strict';
const $app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (+n).toFixed(2).replace(/\.?0+$/, '');
const store = { get() { try { return JSON.parse(localStorage.getItem('auth')); } catch { return null; } }, set(v) { try { v ? localStorage.setItem('auth', JSON.stringify(v)) : localStorage.removeItem('auth'); } catch {} } };

const APPROACH = { persuasion: { name: 'İkna', risk: 'Hata −1' }, deception: { name: 'Blöf', risk: 'Hata −2' }, intimidation: { name: 'Gözdağı', risk: 'Hata −2' } };
const OUT = { crit: ['Kritik', 'Teklifin aynen kabul.'], success: ['Başarı', 'Ortada buluştunuz.'], fail: ['Olmadı', 'Satıcı geri adım atmadı.'], ret: ['Hakaret', 'Zar yok. Sabır azaldı.'], angered: ['Sinirlendi', 'Fiyat %10 arttı. Bugün pazarlık yok.'] };
const KIND = { buy: 'Alım', gamble: 'Hard Gamble', offer: 'Teklif teslimi', dm: 'DM' };

let CH = [], S = null, auth = store.get(), es = null;
let view = { tab: 'market', mid: null, iid: null, y: null, approach: 'persuasion', rolling: false, flt: 'all', form: false, f: { mid: null, iid: '', name: '', price: '', note: '' } };
let pick = null, dmTab = 'live', toastT, dmFilter = 'new';

function toast(m) { const t = document.getElementById('toast'); t.textContent = m; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2500); }
async function api(path, body) {
  const r = await fetch('/api/' + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-token': (auth && auth.token) || '' }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { toast(j.error || 'Hata'); throw new Error(j.error); }
  return j;
}
const act = (path, body) => api(path, body).catch(() => {});

function connect() {
  if (es) es.close();
  es = new EventSource('/api/events?token=' + encodeURIComponent(auth.token));
  es.onmessage = (e) => { S = JSON.parse(e.data); render(); };
  es.onerror = async () => {
    if (es.readyState !== 2) return;            // tarayıcı kendi yeniden bağlanır
    const r = await fetch('/api/chars').catch(() => null);
    if (r) { auth = null; store.set(null); S = null; render(); } // sunucu ayakta ama token geçersiz
  };
}
function logout() { if (es) es.close(); auth = null; S = null; store.set(null); view = { tab: 'market', mid: null, iid: null, y: null, approach: 'persuasion', rolling: false, flt: 'all', form: false, f: { mid: null, iid: '', name: '', price: '', note: '' } }; render(); }

// ---------- ortak parçalar ----------
const initial = (n) => (String(n || '?').trim()[0] || '?').toLocaleUpperCase('tr');
const SRV = () => (window.PazarApp ? '<button class="btn ghost" id="srv">Sunucu adresi</button>' : '');

// Eşya türü (v2'de kütüphane `type` alanı gelene kadar addan tahmin edilir).
const LABEL = { weapon: 'Silah', armor: 'Zırh', potion: 'İksir', scroll: 'Tomar', gem: 'Tılsım', gear: 'Gereç', other: 'Eşya' };
const TYPE_RULES = [
  ['potion', /iksir|şifa|panzehir|merhem/],
  ['weapon', /kılıç|hançer|balta|mızrak|yay\b|ok\b|gürz|tokmak|çekiç|pala|kama|arbalet|asa\b|değnek/],
  ['armor', /zırh|kalkan|miğfer|kask|kolluk|deri/],
  ['scroll', /parşömen|kitap|tomar|harita|büyü/],
  ['gem', /yüzük|kolye|pul|taş|mücevher|kristal|tılsım|muska/],
  ['gear', /\bip\b|çadır|meşale|çanta|sırt|battaniye|kazma|kürek|fener|yağ|erzak|yiyecek|alet|anahtar|kilit|maymuncuk/],
];
function itemType(i) {
  const n = String(i.name).toLocaleLowerCase('tr');
  for (const [cat, re] of TYPE_RULES) if (re.test(n)) return cat;
  return 'other';
}
const FILTERS = [['all', 'Tümü'], ['weapon', 'Silah'], ['armor', 'Zırh'], ['potion', 'İksir'], ['magic', 'Büyülü']];
const BAG_SLOTS = 18;

// Görsel alanı: görsel varsa arka plan, yoksa yazı kutusu (tür + ad).
function art(i, { cls = '', label = null, extra = '' } = {}) {
  const lb = label || (i.magical ? 'Büyülü · ' : '') + LABEL[itemType(i)];
  if (i.image) return `<span class="art ${cls} ${i.magical ? 'mg' : ''}" style="background-image:url('${esc(i.image)}')">${extra}</span>`;
  return `<span class="art ${cls} ${i.magical ? 'mg' : ''}"><span class="artlabel">${esc(lb)}</span><span class="artname">${esc(i.name)}</span>${extra}</span>`;
}
function portrait(m, opt = {}) {
  const bg = m.portrait ? ` style="background-image:url('${esc(m.portrait)}')"` : '';
  return `<div class="portrait ${opt.small ? 'sm' : ''}"${bg}>${m.portrait ? '' : `<div class="pface"><span class="pinit">${esc(initial(m.name))}</span><span class="plabel">PORTRE</span></div>`}
    <div class="plaque"><span class="pico">${esc(initial(m.name))}</span><span class="pname">${esc(m.name)}</span>${m.revealed ? `<span class="tag">${esc(m.revealed)}</span>` : ''}${m.banned ? '<span class="tag bad">Bugün kapalı</span>' : ''}</div></div>`;
}
// Sabır çubuğu: oran gösterir (kaç puan olduğunu ve satıcı tipini açık etmez).
function repbar(rep, max, { sm = false } = {}) {
  const r = max > 0 ? Math.max(0, Math.min(1, rep / max)) : 1;
  const st = rep <= 0 ? ['zero', 'Bitti'] : r <= 0.34 ? ['low', 'Sinirli'] : r <= 0.67 ? ['mid', 'Huzursuz'] : ['', 'Sakin'];
  return `<div class="repbar ${st[0]} ${sm ? 'sm' : ''}"><span class="rl">Sabır</span><span class="rt"><i style="width:${Math.round(r * 100)}%"></i></span><span class="rw">${st[1]}</span></div>`;
}
const led = (e, who = '') => `<div class="led"><span class="lt">Hf${e.week} Gn${e.day}</span><span class="ln">${who}${esc(e.name)}<small>${KIND[e.kind] || esc(e.kind)}${e.list ? ' · etiket ' + fmt(e.list) : ''}</small></span><span class="la ${e.amount < 0 ? 'neg' : 'pos'}">${e.amount > 0 ? '+' : ''}${fmt(e.amount)}</span></div>`;

// ---------- giriş ----------
function renderJoin() {
  $app.innerHTML = `
    <h1>Pazar</h1><p class="sub">Karakterini seç, pazara gir.</p>
    <div class="grid">${CH.map((c) => `
      <button class="card ${pick === c.id ? 'sel' : ''}" data-pick="${c.id}">
        <div class="init">${esc(initial(c.name))}</div><b>${esc(c.name)}</b><small>${esc(c.blurb)}</small>
        <div class="stats"><span>İkna ${c.bonus.persuasion >= 0 ? '+' : ''}${c.bonus.persuasion}</span><span>Blöf +${c.bonus.deception}</span><span>Gözdağı +${c.bonus.intimidation}</span></div>
        <div class="stats"><span class="gold"><i class="coin"></i>${c.gold}</span></div>
      </button>`).join('')}</div>
    <h2>Adın</h2><input type="text" id="name" maxlength="16" placeholder="Adın" autocomplete="off">
    <button class="btn" id="go">Pazara Gir</button>
    <button class="btn ghost" id="dm">Ben DM'im</button>
    ${SRV()}`;
}
function renderDMLogin() {
  $app.innerHTML = `<h1>DM</h1><p class="sub">PIN'i gir.</p>
    <input type="password" id="pin" inputmode="numeric" placeholder="PIN"><button class="btn" id="dmgo">Gir</button>
    <button class="btn ghost" id="back">Geri</button>
    ${SRV()}`;
}

// ---------- oyuncu ----------
const mer = (id) => S.merchants.find((m) => m.id === id);
const chr = (id) => CH.find((c) => c.id === id);

function renderPlayer() {
  const me = S.me, c = chr(me.charId) || { name: '' };
  const head = `<div class="top"><span class="pill">${esc(me.name)}${c.name ? ' · ' + esc(c.name) : ''}</span><span class="pill gold"><i class="coin"></i>${fmt(me.gold)}</span><span class="pill">Hf ${S.week} · Gn ${S.day}${me.advantage ? ' · Avantaj' : ''}</span></div>`;
  let body;
  if (view.iid) body = renderNegotiation(me);
  else if (view.tab === 'bag') body = renderBag(me);
  else if (view.tab === 'bids') body = renderBids(me);
  else if (view.mid) body = renderItems();
  else body = renderMarket();
  const tb = (k, label, extra = '') => `<button data-tab="${k}" class="${view.tab === k ? 'on' : ''}">${label}${extra}</button>`;
  const tabs = view.iid ? '' : `<nav class="tabs">${tb('market', 'Pazar')}${tb('bids', 'Teklif', S.bids.some((b) => b.status === 'counter') ? '<i class="dot"></i>' : '')}${tb('bag', 'Çanta', me.inventory.length ? ' ' + me.inventory.length : '')}<button data-act="logout">Çık</button></nav>`;
  $app.innerHTML = head + (S.dmOnline ? '' : '<p class="hint">DM şu an çevrimdışı. Pazar yine de açık.</p>') + body + tabs;
}
function renderMarket() {
  return `<h2>Pazar</h2><div class="list">${S.merchants.map((m) => `
    <button class="card row" data-mid="${m.id}"><span class="pico" style="width:52px;height:52px;font-size:28px">${esc(initial(m.name))}</span>
      <span class="grow"><b style="margin:0">${esc(m.name)}</b>${m.revealed ? `<span class="tag">${esc(m.revealed)}</span>` : ''}${m.banned ? '<span class="tag bad">Bugün kapalı</span>' : ''}<small>${m.items.length} eşya</small></span> <span class="gold">›</span></button>`).join('') || '<p class="empty">Pazar boş.</p>'}</div>`;
}
function renderItems() {
  const m = mer(view.mid);
  if (!m) { view.mid = null; return renderMarket(); }
  const flt = view.flt || 'all';
  const shown = m.items.filter((i) => flt === 'all' || (flt === 'magic' ? i.magical : itemType(i) === flt));
  return `<button class="back" data-act="up">‹ Pazar</button>${portrait(m, { small: true })}
    <div class="filters">${FILTERS.map(([k, l]) => `<button data-flt="${k}" class="${flt === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="shelf">${shown.map((i) => `
      <button class="shelfitem" data-iid="${i.id}" ${i.stock === 0 ? 'disabled' : ''}>
        ${art(i, { extra: i.stock === 0 ? '<span class="sold">TÜKENDİ</span>' : i.stock ? `<span class="stock">×${i.stock}</span>` : '' })}
        <span class="pr"><i class="coin"></i>${fmt(i.price)}</span></button>`).join('') || '<p class="empty" style="grid-column:1/-1">Bu rafta bir şey yok.</p>'}</div>
    <p class="hint">Eşyaya dokun, pazarlığa başla.</p>`;
}
function renderBag(me) {
  const n = Math.max(BAG_SLOTS, Math.ceil(me.inventory.length / 3) * 3);
  const slots = Array.from({ length: n }, (_, k) => {
    const i = me.inventory[k];
    return i ? `<div class="bslot ${i.damaged ? 'dmg' : ''}">${art(i, { label: i.damaged ? 'Kusurlu' : null })}<span class="bp">${fmt(i.paid)}</span></div>` : '<div class="bslot"></div>';
  }).join('');
  const ledger = S.ledger.slice().reverse();
  return `<div class="bagbar"><span>Çanta</span><span>${me.inventory.length}/${n}</span></div><div class="bag">${slots}</div>
    <div class="list bagdetail">${me.inventory.map((i) => `
      <div class="card row"><span class="grow"><b style="margin:0">${esc(i.name)}</b>${i.damaged ? '<span class="tag bad">Kusurlu · satılamaz (0 gp)</span>' : ''}</span><span class="price">${fmt(i.paid)} gp</span></div>`).join('') || '<p class="empty">Çantan boş.</p>'}</div>
    <h2>Harcama kaydı</h2>${ledger.map((e) => led(e, (mer(e.merchantId) ? esc(mer(e.merchantId).name) + ' · ' : ''))).join('') || '<p class="empty">Henüz kayıt yok.</p>'}`;
}
const BST = { new: 'DM bekleniyor', counter: 'Cevap sende', accepted: 'Pazar gününde teslim', rejected: 'Reddedildi', withdrawn: 'Geri çekildi', settled: 'Teslim edildi', failed: 'Teslim olmadı' };
const isOpen = (o) => ['new', 'counter', 'accepted'].includes(o.status);
function histLine(o) {
  const h = o.history[o.history.length - 1];
  return h && h.note ? `<small>Not: ${esc(h.note)}</small>` : '';
}
function renderBids(me) {
  const f = view.f;
  if (!S.merchants.find((m) => m.id === f.mid)) f.mid = S.merchants[0] && S.merchants[0].id;
  const m = mer(f.mid);
  const form = view.form ? `<div class="offer">
      <select id="f-m">${S.merchants.map((x) => `<option value="${x.id}" ${x.id === f.mid ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <select id="f-i" style="margin-top:8px"><option value="">Özel istek…</option>${(m ? m.items : []).map((i) => `<option value="${i.id}" ${i.id === f.iid ? 'selected' : ''}>${esc(i.name)} · ${fmt(i.price)} gp</option>`).join('')}</select>
      ${f.iid ? '' : `<input type="text" id="f-name" maxlength="40" placeholder="Ne istiyorsun?" value="${esc(f.name)}" style="margin-top:8px">`}
      <input type="number" id="f-price" inputmode="decimal" step="0.01" min="0" placeholder="Teklifin (gp)" value="${esc(f.price)}" style="margin-top:8px">
      <input type="text" id="f-note" maxlength="80" placeholder="Not (isteğe bağlı)" value="${esc(f.note)}" style="margin-top:8px">
      <button class="btn" data-act="bidsend">Gönder</button><button class="btn ghost" data-act="bidcancel">Vazgeç</button></div>`
    : '<button class="btn" data-act="bidnew">+ Yeni Teklif</button>';
  const bids = S.bids.slice().sort((a, b) => (isOpen(b) - isOpen(a)) || b.t - a.t);
  return `<h2>Haftalık Pazar ${S.week}</h2><p class="hint" style="text-align:left;margin-top:0">Teklif bırak, DM cevaplasın. Anlaşılanlar Haftalık Pazar'da teslim edilir.</p>${form}
    <div class="list" style="margin-top:12px">${bids.map((o) => { const mm = mer(o.merchantId) || { name: '?' }; return `
      <div class="card" style="text-align:left"><div class="row"><b class="grow" style="margin:0">${esc(o.itemName)}</b><span class="tag">${BST[o.status]}</span></div>
        <small>${esc(mm.name)} · ${o.by === 'dm' ? 'satıcı teklifi' : 'teklifin'} <b class="gold" style="display:inline;margin:0">${fmt(o.price)} gp</b>${o.listPrice ? ` · etiket ${fmt(o.listPrice)}` : ''}</small>${histLine(o)}${o.reason ? `<small class="tag bad">${esc(o.reason)}</small>` : ''}
        ${o.status === 'accepted' && me.gold < o.price ? '<small class="tag bad">Altının yetmiyor</small>' : ''}
        ${isOpen(o) ? `<div class="tl">${o.status === 'counter' ? `<button class="btn sm ok" data-bacc="${o.id}">Kabul</button><button class="btn sm" data-bcnt="${o.id}">Karşı</button>` : ''}<button class="btn sm ghost" data-bwd="${o.id}">Geri çek</button></div>` : ''}</div>`; }).join('') || '<p class="empty">Henüz teklif yok.</p>'}</div>`;
}
function currentItem() {
  for (const m of S.merchants) { const i = m.items.find((x) => x.id === view.iid); if (i) return { m, i }; }
  return null;
}
function renderNegotiation(me) {
  const f = currentItem();
  if (!f) { view.iid = null; return renderMarket(); }
  const { m, i } = f, n = S.negs[i.id] || null, ch = chr(me.charId) || { bonus: { persuasion: 0, deception: 0, intimidation: 0 } };
  const status = n ? n.status : 'open', price = n ? n.price : i.price;
  const canHaggle = status === 'open' && !m.banned && i.stock !== 0;
  const min = Math.ceil(i.price * 25) / 100, max = Math.max(min, Math.floor(i.price * 99) / 100 - 0.01);
  if (view.y == null || view.iid !== view.yFor) { view.y = Math.min(max, Math.max(min, n && n.lastY ? n.lastY : Math.round(i.price * 70) / 100)); view.yFor = view.iid; }
  const last = n && n.history[n.history.length - 1];
  const line = n && n.line ? n.line : m.banned ? 'Bugün seninle işim yok. Etiket fiyatı geçerli.' : 'Ne istiyorsun?';
  const broke = me.gold < price;
  return `<button class="back" data-act="up">‹ Geri</button>
    <div class="repwrap">${repbar(n ? n.rep : 1, n ? n.maxRep : 1)}</div>
    ${portrait(m, { small: true })}
    <div class="bubble">${esc(line)}</div>
    ${art(i, { cls: 'xl' })}
    <div class="bigprice">${price !== i.price ? `<s>${fmt(i.price)}</s>` : ''}${fmt(price)} gp</div>
    ${view.rolling ? '<div class="dice">Zar atılıyor</div>' : last ? `<div class="result ${last.outcome}">${OUT[last.outcome][0]}${last.roll !== null ? `<small>Zar ${last.rolls.length > 1 ? last.rolls.join(' / ') + ' → ' : ''}${last.roll} + ${last.bonus} = ${last.total}</small>` : ''}<small>${OUT[last.outcome][1]}</small></div>` : ''}
    ${canHaggle && !view.rolling ? `
      <div class="offer"><div class="num"><span id="ynum">${fmt(view.y)}</span> gp<small>Teklifin</small></div>
        <div class="stepper"><button data-step="-1">−</button><input type="range" id="yr" min="${min}" max="${max}" step="0.01" value="${view.y}"><button data-step="1">+</button></div>
        <div class="chips">${Object.entries(APPROACH).map(([k, a]) => `<button class="chip ${view.approach === k ? 'on' : ''}" data-ap="${k}"><b>${a.name}</b><small>${ch.bonus[k] >= 0 ? '+' : ''}${ch.bonus[k]} · ${a.risk}</small></button>`).join('')}</div>
        <button class="btn" data-act="offer">Pazarlık Et${me.advantage ? ' · Avantaj' : ''}</button></div>` : ''}
    <div class="actions">
      <button class="btn ok" data-act="accept" ${broke ? 'disabled' : ''}>${broke ? 'Altının yetmiyor' : `Satın Al · ${fmt(price)} gp`}</button>
      <div class="two">
        ${m.revealed ? '<span></span>' : `<button class="btn ghost" data-act="insight" ${m.insightTried ? 'disabled' : ''}>${m.insightTried ? 'Bugün denedin' : 'Sez'}</button>`}
        ${i.magical ? '<span></span>' : `<button class="btn ghost" data-act="gamble">Hard Gamble</button>`}
      </div>
    </div>`;
}

// ---------- DM ----------
const pname = (id) => { const p = S.players.find((x) => x.id === id); return p ? esc(p.name) : '?'; };
const TYPE_LABEL = { comert: 'Cömert', notr: 'Nötr', acgozlu: 'Açgözlü' };
const OUT_TR = { crit: 'Kritik', success: 'Başarı', fail: 'Başarısız', ret: 'Ret', angered: 'Sinirlendi' };
const ST_TR = { open: 'sürüyor', deal: 'anlaşıldı', angered: 'kapandı' };

function renderDM() {
  const dtabs = [['live', 'Canlı'], ['bids', 'Teklif'], ['market', 'Pazar'], ['players', 'Kişi'], ['ledger', 'Defter']];
  const tabs = `<nav class="tabs">${dtabs.map(([k, l]) => `<button data-dtab="${k}" class="${dmTab === k ? 'on' : ''}">${l}${k === 'bids' && S.bids.some((b) => b.status === 'new') ? '<i class="dot"></i>' : ''}</button>`).join('')}<button data-act="logout">Çık</button></nav>`;
  const head = `<div class="top"><span class="pill">DM</span><span class="pill">Hf ${S.week} · Gn ${S.day}</span><button class="btn sm ghost" data-act="newday">Yeni Gün</button></div>`;
  let body = '';
  if (dmTab === 'live') {
    const negs = S.negs.filter((n) => n.last).reverse();
    body = `<h2>Pazarlıklar</h2><div class="list">${negs.map((n) => `
      <div class="card dm-neg"><div class="hd"><span>${pname(n.playerId)} → ${esc(n.item)}</span></div>${repbar(n.rep, n.maxRep, { sm: true })}
        <small style="margin-top:6px">${OUT_TR[n.last.outcome]} · teklif ${fmt(n.last.y)}${n.last.roll !== null ? ` · zar ${n.last.roll}+${n.last.bonus}` : ''} · fiyat <b class="gold" style="display:inline;margin:0">${fmt(n.price)}</b> · ${ST_TR[n.status]}</small>
        ${n.line ? `<small>Satıcı: ${esc(n.line)}</small>` : ''}
        <div class="tl"><button class="btn sm ghost" data-line="${n.playerId}|${n.itemId}|Olmaz!">Olmaz!</button><button class="btn sm ghost" data-line="${n.playerId}|${n.itemId}|Son fiyat.">Son fiyat.</button><button class="btn sm ghost" data-lineask="${n.playerId}|${n.itemId}">Yaz</button><button class="btn sm" data-price="${n.playerId}|${n.itemId}">Fiyat</button></div></div>`).join('') || '<p class="empty">Henüz pazarlık yok.</p>'}</div>
      <h2>Akış</h2>${S.log.slice().reverse().map((l) => `<div class="feed">${esc(l.text)}</div>`).join('')}`;
  } else if (dmTab === 'bids') {
    const G = { new: ['new'], counter: ['counter'], accepted: ['accepted'], closed: ['rejected', 'withdrawn', 'settled', 'failed'] };
    const LBL = { new: 'Yeni', counter: 'Karşı', accepted: 'Anlaşıldı', closed: 'Kapalı' };
    const cnt = (k) => S.bids.filter((b) => G[k].includes(b.status)).length;
    const list = S.bids.filter((b) => G[dmFilter].includes(b.status)).sort((a, b) => b.t - a.t);
    body = `<button class="btn" data-act="weekly">Haftalık Pazar (${cnt('accepted')} teslimat)</button>
      <div class="seg" style="margin-top:12px">${Object.keys(G).map((k) => `<button class="${dmFilter === k ? 'on' : ''}" data-bf="${k}">${LBL[k]} ${cnt(k)}</button>`).join('')}</div>
      <div class="list">${list.map((o) => { const mm = S.merchants.find((x) => x.id === o.merchantId) || { name: '?' };
        return `<div class="card dm-neg"><div class="hd"><span>${pname(o.playerId)} → ${esc(o.itemName)}</span><span class="tag">${BST[o.status]}</span></div>
          <small>${esc(mm.name)} · ${o.by === 'dm' ? 'satıcı teklifi' : 'oyuncu teklifi'} <b class="gold" style="display:inline;margin:0">${fmt(o.price)}</b>${o.listPrice ? ` · etiket ${fmt(o.listPrice)} (%${Math.round(o.price / o.listPrice * 100)})` : ''} · hafta ${o.week}</small>${histLine(o)}${o.reason ? `<small class="tag bad">${esc(o.reason)}</small>` : ''}
          ${isOpen(o) ? `<div class="tl">${o.status === 'new' ? `<button class="btn sm ok" data-dacc="${o.id}">Kabul</button>` : ''}<button class="btn sm" data-dcnt="${o.id}">Karşı teklif</button><button class="btn sm ghost" data-drej="${o.id}">Reddet</button></div>` : ''}</div>`; }).join('') || '<p class="empty">Bu listede teklif yok.</p>'}</div>`;
  } else if (dmTab === 'market') {
    body = `<button class="btn sm" data-act="addm">+ Satıcı</button>` + S.merchants.map((m) => `
      <div class="card" style="text-align:left;margin-top:10px"><div class="row"><span class="pico" style="width:40px;height:40px">${esc(initial(m.name))}</span><b class="grow" style="margin:0">${esc(m.name)}</b><button class="btn sm ghost" data-editm="${m.id}">Düzenle</button><button class="btn sm ghost" data-del="merchant|${m.id}">Sil</button></div>
        <div class="seg">${Object.entries(TYPE_LABEL).map(([k, l]) => `<button class="${m.type === k ? 'on' : ''}" data-mtype="${m.id}|${k}">${l}</button>`).join('')}</div>
        ${S.items.filter((i) => i.merchantId === m.id).map((i) => `<div class="row" style="padding:4px 0"><span class="grow">${esc(i.name)}${i.magical ? ' <span class="tag mg">büyülü</span>' : ''}${i.stock !== null ? ` <small>(${i.stock})</small>` : ''}</span><span class="price">${fmt(i.price)}</span><button class="btn sm ghost" data-editi="${i.id}">Düzenle</button><button class="btn sm ghost" data-del="item|${i.id}">Sil</button></div>`).join('')}
        <button class="btn sm ghost" data-addi="${m.id}">+ Eşya</button></div>`).join('');
  } else if (dmTab === 'players') {
    body = `<h2>Oyuncular</h2><div class="list">${S.players.map((p) => `
      <div class="card" style="text-align:left"><div class="row"><span class="pico" style="width:40px;height:40px">${esc(initial(p.name))}</span><span class="grow"><b style="margin:0">${esc(p.name)}</b><small>${esc((chr(p.charId) || {}).name || '')} · ${p.inventory.length} eşya</small></span><span class="price"><i class="coin"></i>${fmt(p.gold)}</span></div>
        <div class="tl"><button class="btn sm ghost" data-gold="${p.id}|-10">−10</button><button class="btn sm ghost" data-gold="${p.id}|10">+10</button><button class="btn sm ghost" data-gold="${p.id}|100">+100</button><button class="btn sm ghost" data-goldset="${p.id}">Ayarla</button></div>
        <div class="tl"><button class="btn sm ${p.advantage ? '' : 'ghost'}" data-adv="${p.id}|${p.advantage ? 0 : 1}">Avantaj ${p.advantage ? 'AÇIK' : 'ver'}</button><button class="btn sm ghost" data-sendbid="${p.id}">Teklif gönder</button><button class="btn sm ghost" data-del="player|${p.id}">Sil</button></div></div>`).join('') || '<p class="empty">Kimse yok.</p>'}</div>`;
  } else {
    const L = S.ledger.slice().reverse();
    const spent = -L.filter((e) => e.amount < 0).reduce((a, e) => a + e.amount, 0);
    const granted = L.filter((e) => e.kind === 'dm' && e.amount > 0).reduce((a, e) => a + e.amount, 0);
    body = `<h2>Alışveriş defteri</h2><div class="stat3"><div class="card"><b>${fmt(spent)}</b><small>harcanan</small></div><div class="card"><b>${fmt(granted)}</b><small>DM'in verdiği</small></div><div class="card"><b>${L.length}</b><small>işlem</small></div></div>
      ${L.map((e) => led(e, pname(e.playerId) + ' · ' + (S.merchants.find((m) => m.id === e.merchantId) ? esc(S.merchants.find((m) => m.id === e.merchantId).name) + ' · ' : ''))).join('') || '<p class="empty">Henüz işlem yok.</p>'}`;
  }
  $app.innerHTML = head + body + tabs;
}

// ---------- render ----------
function render() {
  const ae = document.activeElement, keep = ae && ae.id && $app.contains(ae) ? { id: ae.id, a: ae.selectionStart, b: ae.selectionEnd } : null;
  if (!auth) pick === 'DM' ? renderDMLogin() : renderJoin();
  else if (!S) $app.innerHTML = '<p class="empty">Bağlanıyor…</p>';
  else if (S.role === 'dm') renderDM(); else renderPlayer();
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus(); try { el.setSelectionRange(keep.a, keep.b); } catch {} } }
}

// ---------- olaylar ----------
$app.addEventListener('change', (e) => {
  const f = view.f;
  if (e.target.id === 'f-m') { f.mid = e.target.value; f.iid = ''; render(); }
  if (e.target.id === 'f-i') { f.iid = e.target.value; render(); }
});
$app.addEventListener('input', (e) => {
  const f = view.f, k = { 'f-name': 'name', 'f-price': 'price', 'f-note': 'note' }[e.target.id];
  if (k) f[k] = e.target.value;
  if (e.target.id === 'yr') { view.y = +e.target.value; const n = document.getElementById('ynum'); if (n) n.textContent = fmt(view.y); }
});
$app.addEventListener('click', async (e) => {
  const t = e.target.closest('button'); if (!t) return;
  const d = t.dataset;
  if (d.pick) { pick = d.pick; return render(); }
  if (t.id === 'dm') { pick = 'DM'; return render(); }
  if (t.id === 'back') { pick = null; return render(); }
  if (t.id === 'srv') return void window.PazarApp.changeServer(); // Android kabuğu
  if (t.id === 'go') {
    const name = document.getElementById('name').value;
    if (!pick || !CH.find((c) => c.id === pick)) return toast('Karakter seç.');
    try { const r = await api('join', { name, charId: pick }); auth = r; store.set(r); connect(); } catch {}
    return;
  }
  if (t.id === 'dmgo') { try { const r = await api('dm/login', { pin: document.getElementById('pin').value }); auth = r; store.set(r); pick = null; connect(); } catch {} return; }
  if (d.tab) { view.tab = d.tab; view.mid = null; view.iid = null; return render(); }
  if (d.mid) { view.mid = d.mid; view.flt = 'all'; return render(); }
  if (d.flt) { view.flt = d.flt; return render(); }
  if (d.iid) { view.iid = d.iid; view.y = null; return render(); }
  if (d.step) { const r = document.getElementById('yr'); const st = Math.max(0.01, Math.round(+r.max / 50 * 100) / 100); view.y = Math.min(+r.max, Math.max(+r.min, Math.round((view.y + (+d.step) * st) * 100) / 100)); return render(); }
  if (d.ap) { view.approach = d.ap; return render(); }
  if (d.dtab) { dmTab = d.dtab; return render(); }
  if (d.bf) { dmFilter = d.bf; return render(); }
  if (d.bacc) return void act('bidreply', { id: d.bacc, action: 'accept' });
  if (d.bwd) return void act('bidreply', { id: d.bwd, action: 'withdraw' });
  if (d.bcnt) { const o = S.bids.find((x) => x.id === d.bcnt); const v = prompt('Karşı teklifin (gp):', fmt(o.price)); return void (v && act('bidreply', { id: o.id, action: 'counter', price: v })); }
  if (d.dacc) { const n = prompt('Not (isteğe bağlı):', ''); return void (n !== null && act('dm/bidreply', { id: d.dacc, action: 'accept', note: n })); }
  if (d.drej) { const n = prompt('Red nedeni (isteğe bağlı):', ''); return void (n !== null && act('dm/bidreply', { id: d.drej, action: 'reject', note: n })); }
  if (d.dcnt) {
    const o = S.bids.find((x) => x.id === d.dcnt), m = S.merchants.find((x) => x.id === o.merchantId), X = o.listPrice;
    const u = { comert: 0.5, notr: 1, acgozlu: 1.5 }[m && m.type] || 1;
    const sug = X ? Math.round((o.price + ((X - o.price) / 2) * (u / 2)) * 100) / 100 : o.price;
    const v = prompt(X ? `Karşı teklif (gp). Kural önerisi: ${fmt(sug)}` : 'Karşı teklif (gp):', fmt(sug)); if (!v) return;
    const n = prompt('Not (isteğe bağlı):', ''); return void (n !== null && act('dm/bidreply', { id: o.id, action: 'counter', price: v, note: n }));
  }
  if (d.sendbid) {
    const list = S.items.map((i, k) => { const m = S.merchants.find((x) => x.id === i.merchantId); return `${k + 1}) ${i.name} – ${m ? m.name : '?'} (${fmt(i.price)})`; }).join('\n');
    const k = parseInt(prompt(list + '\n\nEşya numarası:'), 10), it = S.items[k - 1]; if (!it) return;
    const price = prompt('Teklif fiyatı (gp):', fmt(Math.round(it.price * 80) / 100)); if (!price) return;
    const note = prompt('Not (isteğe bağlı):', ''); return void (note !== null && act('dm/bidsend', { playerId: d.sendbid, itemId: it.id, price, note }));
  }
  if (d.line) { const [p, i, txt] = d.line.split('|'); return void act('dm/line', { playerId: p, itemId: i, text: txt }); }
  if (d.lineask) { const [p, i] = d.lineask.split('|'); const v = prompt('Satıcı ne desin?'); return void (v && act('dm/line', { playerId: p, itemId: i, text: v })); }
  if (d.price) { const [p, i] = d.price.split('|'); const v = prompt('Yeni fiyat (gp):'); return void (v && act('dm/setprice', { playerId: p, itemId: i, price: v })); }
  if (d.mtype) { const [id, type] = d.mtype.split('|'); const m = S.merchants.find((x) => x.id === id); return void act('dm/merchant', { id, name: m.name, type }); }
  if (d.editm) { const m = S.merchants.find((x) => x.id === d.editm); const name = prompt('Satıcı adı:', m.name); if (!name) return; return void act('dm/merchant', { id: m.id, name, type: m.type }); }
  if (d.addi) { const name = prompt('Eşya adı:'); if (!name) return; const price = prompt('Fiyat (gp):'); if (!price) return; const magical = confirm('Büyülü mü? (Hard Gamble yasak olur)'); const stock = prompt('Stok (boş = sınırsız):', ''); return void act('dm/item', { merchantId: d.addi, name, price, magical, stock }); }
  if (d.editi) { const i = S.items.find((x) => x.id === d.editi); const name = prompt('Eşya adı:', i.name); if (!name) return; const price = prompt('Fiyat (gp):', i.price); if (!price) return; const magical = confirm('Büyülü mü?'); const stock = prompt('Stok (boş = sınırsız):', i.stock ?? ''); return void act('dm/item', { id: i.id, merchantId: i.merchantId, name, price, magical, stock }); }
  if (d.del) { const [kind, id] = d.del.split('|'); if (confirm('Silinsin mi?')) act('dm/delete', { kind, id }); return; }
  if (d.gold) { const [id, delta] = d.gold.split('|'); const p = S.players.find((x) => x.id === id); return void act('dm/player', { id, gold: Math.max(0, p.gold + +delta) }); }
  if (d.goldset) { const v = prompt('Altın:'); return void (v !== null && act('dm/player', { id: d.goldset, gold: v })); }
  if (d.adv) { const [id, v] = d.adv.split('|'); return void act('dm/player', { id, advantage: v === '1' }); }
  switch (d.act) {
    case 'logout': return logout();
    case 'up': if (view.iid) view.iid = null; else view.mid = null; return render();
    case 'newday': if (confirm('Yeni gün: tüm pazarlıklar ve yasaklar sıfırlanır.')) act('dm/newday'); return;
    case 'addm': { const name = prompt('Satıcı adı:'); if (!name) return; return void act('dm/merchant', { name, type: 'notr' }); }
    case 'bidnew': view.form = true; return render();
    case 'bidcancel': view.form = false; return render();
    case 'bidsend': {
      const f = view.f;
      try { await api('bid', { merchantId: f.mid, itemId: f.iid || null, itemName: f.name, price: f.price, note: f.note }); view.form = false; view.f = { mid: f.mid, iid: '', name: '', price: '', note: '' }; toast('Teklif gönderildi'); render(); } catch {}
      return;
    }
    case 'weekly': { const n = S.bids.filter((b) => b.status === 'accepted').length; if (confirm(`Haftalık Pazar: ${n} anlaşma teslim edilir, yeni hafta başlar (pazarlıklar ve yasaklar sıfırlanır). Açık teklifler kalır.`)) act('dm/weekly'); return; }
    case 'offer': {
      view.rolling = true; render();
      const wait = new Promise((r) => setTimeout(r, 900));
      try { await api('offer', { itemId: view.iid, y: view.y, approach: view.approach }); } catch {}
      await wait; view.rolling = false; return render();
    }
    case 'accept': { const f = currentItem(); try { await api('accept', { itemId: view.iid }); toast(`Satın alındın: ${f.i.name}`); view.iid = null; render(); } catch {} return; }
    case 'gamble': {
      if (!confirm('Hard Gamble: %50 indirim.\nEşya KUSURLU olur, hiçbir tüccara satılamaz (0 gp).')) return;
      try { await api('gamble', { itemId: view.iid }); view.iid = null; render(); } catch {} return;
    }
    case 'insight': { const f = currentItem(); return void act('insight', { merchantId: f.m.id }); }
  }
});

(async function init() {
  try { CH = await (await fetch('/api/chars')).json(); } catch {}
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  if (auth) connect();
  render();
})();
