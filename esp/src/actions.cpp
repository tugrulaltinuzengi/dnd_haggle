// Port of app/server.js: P (player actions) and D (DM actions). Keep messages byte-identical to the Node server.
#include "actions.h"
#include "config.h"
#include "../lib/engine/engine.h"
#include <vector>
#include <algorithm>

// ---------- dice ----------
static std::vector<int> gFixed;
static size_t gFixedI = 0;
void diceSet(const int* seq, size_t n) { gFixed.assign(seq, seq + n); gFixedI = 0; }
static int d20() {
  if (gFixed.empty()) {
#ifdef DICE_FIXED
    return DICE_FIXED;
#else
    return 1 + (int)randInt(20);
#endif
  }
  return gFixed[gFixedI++ % gFixed.size()];
}

static bool truthy(JsonVariantConst v) {
  if (v.isNull()) return false;
  if (v.is<bool>()) return v.as<bool>();
  if (v.is<const char*>()) return v.as<const char*>()[0] != 0;
  if (v.is<double>() || v.is<long>()) return v.as<double>() != 0;
  return true;   // arrays / objects
}

static const char* const LINES_RET[] = {"Dalga mı geçiyorsun?", "Bu bir hakaret!", "Git buradan bu teklifle."};
static const char* const LINES_CRIT[] = {"Tamam tamam, sen kazandın.", "Al şunu, canım sıkılmasın.", "Bu sefer olsun."};
static const char* const LINES_SUCCESS[] = {"Ortada buluşalım.", "Sana özel. Bir daha yok.", "Hmm... peki."};
static const char* const LINES_FAIL[] = {"Olmaz. Bu son sözüm.", "Geri adım yok.", "Daha iyisini bulamazsın."};
static const char* const LINES_ANGERED[] = {"Yeter! Fiyat arttı.", "Pazarlık bitti. Al ya da git.", "Sabrımı taşırdın!"};
static const char* lineFor(const std::string& outcome) {
  const char* const* l = outcome == "ret" ? LINES_RET : outcome == "crit" ? LINES_CRIT : outcome == "success" ? LINES_SUCCESS : outcome == "fail" ? LINES_FAIL : LINES_ANGERED;
  return l[randInt(3)];
}

static const char* const ITEM_TYPES[] = {"weapon", "armor", "potion", "scroll", "gem", "gear", "other"};
static const char* const RARITIES[] = {"none", "common", "uncommon", "rare", "veryrare", "legendary", "artifact"};

// ---------- helpers ----------
static bool hasStock(JsonObject item) { return item["stock"].isNull() || item["stock"].as<int>() > 0; }

static void assertUnlocked(JsonObject p, JsonObject item) {
  AffCfg c = affCfg();
  if (!c.enabled) return;
  if ((item["minAffinity"] | 0) > affOf(p["id"], item["merchantId"])) fail("Bu eşya için yakınlığın yetmiyor.");
}

static eng::Neg negLoad(JsonObject n) {
  eng::Neg g;
  g.rep = n["rep"]; g.maxRep = n["maxRep"]; g.price = n["price"].as<double>();
  g.status = n["status"].as<const char*>();
  if (!n["lastY"].isNull()) { g.hasLastY = true; g.lastY = n["lastY"].as<double>(); }
  if (n["line"].is<const char*>()) g.line = n["line"].as<const char*>();
  for (JsonObject h : n["history"].as<JsonArray>()) {
    eng::Entry e;
    e.y = h["y"].as<double>(); e.approach = h["approach"].as<const char*>();
    for (int r : h["rolls"].as<JsonArray>()) e.rolls.push_back(r);
    if (!h["roll"].isNull()) { e.hasRoll = true; e.roll = h["roll"]; }
    e.bonus = h["bonus"] | 0;
    if (!h["total"].isNull()) { e.hasTotal = true; e.total = h["total"]; }
    e.outcome = h["outcome"].as<const char*>(); e.repLoss = h["repLoss"] | 0; e.price = h["price"].as<double>();
    g.history.push_back(e);
  }
  return g;
}
static void entryStore(JsonObject h, const eng::Entry& e) {
  h["y"] = e.y; h["approach"] = e.approach;
  JsonArray r = h["rolls"].to<JsonArray>(); for (int x : e.rolls) r.add(x);
  if (e.hasRoll) h["roll"] = e.roll; else h["roll"] = nullptr;
  h["bonus"] = e.bonus;
  if (e.hasTotal) h["total"] = e.total; else h["total"] = nullptr;
  h["outcome"] = e.outcome; h["repLoss"] = e.repLoss; h["price"] = e.price;
}
static void negStore(JsonObject n, const eng::Neg& g) {
  n["rep"] = g.rep; n["maxRep"] = g.maxRep; n["price"] = g.price; n["status"] = g.status;
  if (g.hasLastY) n["lastY"] = g.lastY; else n["lastY"] = nullptr;
  if (g.line.empty()) n["line"] = nullptr; else n["line"] = g.line;
  JsonArray h = n["history"].to<JsonArray>();
  size_t from = g.history.size() > 3 ? g.history.size() - 3 : 0;   // only the last 3 are ever shown; saves RAM
  for (size_t i = from; i < g.history.size(); i++) entryStore(h.add<JsonObject>(), g.history[i]);
}

static JsonObject getNeg(JsonObject p, JsonObject item, JsonObject merchant) {
  String k = nkey(p["id"], item["id"]);
  JsonObject n = S["negs"][k];
  if (n.isNull()) {
    AffCfg c = affCfg();
    int bonusRep = c.enabled && affLevel(c, affOf(p["id"], merchant["id"])) >= c.bonusRepFrom ? 1 : 0;
    eng::Neg g = eng::newNegotiation(item["price"].as<double>(), merchant["type"].as<const char*>(), bonusRep);
    n = S["negs"][k].to<JsonObject>();
    negStore(n, g);
  }
  return n;
}

static void grant(JsonObject p, JsonObject item, double paid, bool damaged, const char* kind) {
  if (p["gold"].as<double>() < paid) fail("Altının yetmiyor.");
  if (!hasStock(item)) fail("Tükendi.");
  p["gold"] = round2(p["gold"].as<double>() - paid);
  JsonObject inv = p["inventory"].as<JsonArray>().add<JsonObject>();
  inv["id"] = newId(); inv["itemId"] = item["id"].as<const char*>(); inv["name"] = item["name"].as<const char*>();
  inv["paid"] = paid; inv["damaged"] = damaged; inv["magical"] = item["magical"].as<bool>();
  if (!item["stock"].isNull()) item["stock"] = item["stock"].as<int>() - 1;
  S["negs"].as<JsonObject>().remove(nkey(p["id"], item["id"]));
  book(kind, p, item["merchantId"], item["name"].as<String>(), -paid, item["price"]);
  AffCfg c = affCfg();
  bool gam = !strcmp(kind, "gamble");
  affChange(p, item["merchantId"], gam ? c.gainGamble : c.gainBuy, gam ? "hard gamble" : "alışveriş");
}

// ---------- offers (CRM) ----------
static bool isOpen(const char* st) { return !strcmp(st, "new") || !strcmp(st, "counter") || !strcmp(st, "accepted"); }
static void hist(JsonObject o, const char* who, const char* act, double price, const String& note = "") {
  JsonObject h = o["history"].as<JsonArray>().add<JsonObject>();
  h["t"] = nowMs(); h["who"] = who; h["act"] = act; h["price"] = price; h["note"] = note;
}
static String noteOf(JsonVariantConst v) { return jsSlice(jsTrim(strOf(v)), 80); }
static void checkBid(JsonObject item, double price) {
  double list = item["price"].as<double>();
  if (price >= list) fail("Etiketten düşük teklif ver.");
  if (price < list * eng::MIN_RATIO) fail("En az etiket fiyatının %25'i olmalı.");
}
static JsonObject offerOf(const char* id) { JsonObject o = findBy(S["offers"], "id", id); if (o.isNull()) fail("Teklif yok", 404); return o; }

// ---------- player actions ----------
static void pOffer(JsonObject p, JsonObject b) {
  JsonObject item = itemOf(b["itemId"]), m = merchantOf(item["merchantId"]), ch = charOf(p["charId"]);
  if (!hasStock(item)) fail("Tükendi.");
  assertUnlocked(p, item);
  if (isBanned(p["id"], m["id"])) fail("Satıcı bugün pazarlık yapmıyor.");
  String approach = strOf(b["approach"]);
  if (!eng::validApproach(approach.c_str())) fail("Yaklaşım seç.");
  JsonObject neg = getNeg(p, item, m);
  int n = p["advantage"].as<bool>() ? 2 : 1;
  eng::HaggleIn in;
  for (int i = 0; i < n; i++) in.rolls.push_back(d20());
  AffCfg c = affCfg();
  in.dcMod = c.enabled ? c.dcMod[affLevel(c, affOf(p["id"], m["id"]))] : 0;
  in.X = item["price"].as<double>(); in.type = m["type"].as<const char*>(); in.Y = numOf(b["y"], 0.01);
  in.approach = approach.c_str(); in.bonus = ch["bonus"][approach.c_str()] | 0;
  eng::Neg g = negLoad(neg);
  eng::Entry e = eng::haggle(g, in);      // throws "Teklif...", "Bu pazarlık bitti.", "Bilinmeyen..." (mapped to 400 by the HTTP layer)
  if (e.hasRoll) p["advantage"] = false;
  if (g.status == "angered") S["bans"][bkey(p["id"], m["id"])] = S["day"].as<int>();
  if (e.outcome == "angered") affChange(p, m["id"], c.gainAngered, "satıcı sinirlendi");
  else if (e.outcome == "ret") affChange(p, m["id"], c.gainRet, "hakaret gibi teklif");
  else if (e.outcome == "crit" || e.outcome == "success") affChange(p, m["id"], c.gainDeal, "anlaşma");
  g.line = lineFor(e.outcome);
  negStore(neg, g);
  String t = String(p["name"].as<const char*>()) + " → " + m["name"].as<const char*>() + ": " + item["name"].as<const char*>() + " " + gp(e.y) + " teklif · " + e.outcome.c_str();
  if (e.hasRoll) t += " (" + String(e.roll) + "+" + String(e.bonus) + ")";
  t += " · " + gp(e.price);
  logLine(t, p["id"]);
}

static void pAccept(JsonObject p, JsonObject b) {
  JsonObject item = itemOf(b["itemId"]), m = merchantOf(item["merchantId"]);
  assertUnlocked(p, item);
  JsonObject n = S["negs"][nkey(p["id"], item["id"])];
  double paid = n.isNull() ? item["price"].as<double>() : n["price"].as<double>();
  grant(p, item, paid, false, "buy");
  logLine(String(p["name"].as<const char*>()) + " satın aldı: " + item["name"].as<const char*>() + " · " + gp(paid) + " (" + m["name"].as<const char*>() + ")", p["id"]);
}

static void pGamble(JsonObject p, JsonObject b) {
  JsonObject item = itemOf(b["itemId"]), m = merchantOf(item["merchantId"]);
  assertUnlocked(p, item);
  if (item["magical"].as<bool>()) fail("Büyülü eşyada Hard Gamble yok.");
  double paid = round2(item["price"].as<double>() * eng::GAMBLE_RATIO);
  grant(p, item, paid, true, "gamble");
  logLine(String(p["name"].as<const char*>()) + " HARD GAMBLE: " + item["name"].as<const char*>() + " · " + gp(paid) + " (" + m["name"].as<const char*>() + ") · kusurlu", p["id"]);
}

static void pBid(JsonObject p, JsonObject b) {
  JsonObject m = merchantOf(b["merchantId"]);
  JsonObject item;
  if (truthy(b["itemId"])) item = itemOf(b["itemId"]);
  if (!item.isNull() && strcmp(item["merchantId"], m["id"])) fail("Eşya bu satıcıda yok.");
  if (!item.isNull()) assertUnlocked(p, item);
  double price = numOf(b["price"], 0.01);
  if (!item.isNull()) checkBid(item, price);
  int open = 0;
  for (JsonObject o : S["offers"].as<JsonArray>()) if (!strcmp(o["playerId"], p["id"]) && isOpen(o["status"])) open++;
  if (open >= 10) fail("En fazla 10 açık teklif.");
  JsonObject o = S["offers"].as<JsonArray>().add<JsonObject>();
  String itemName = item.isNull() ? textOf(b["itemName"]) : String(item["name"].as<const char*>());
  o["id"] = newId(); o["playerId"] = p["id"].as<const char*>(); o["merchantId"] = m["id"].as<const char*>();
  if (item.isNull()) o["itemId"] = nullptr; else o["itemId"] = item["id"].as<const char*>();
  o["itemName"] = itemName; o["price"] = price; o["note"] = noteOf(b["note"]);
  o["from"] = "player"; o["by"] = "player"; o["status"] = "new"; o["week"] = S["week"].as<int>(); o["t"] = nowMs();
  o["history"].to<JsonArray>();
  hist(o, "player", "teklif", price, o["note"].as<String>());
  logLine(String(p["name"].as<const char*>()) + " → " + m["name"].as<const char*>() + ": " + itemName + " için " + gp(price) + " teklif", p["id"]);
}

static void pBidReply(JsonObject p, JsonObject b) {
  JsonObject o = offerOf(b["id"]);
  if (strcmp(o["playerId"], p["id"])) fail("Bu senin teklifin değil", 403);
  JsonObject it = o["itemId"].isNull() ? JsonObject() : findBy(S["items"], "id", o["itemId"]);
  String action = strOf(b["action"]);
  if (action == "accept") {
    if (strcmp(o["status"], "counter")) fail("Kabul edilecek karşı teklif yok.");
    o["status"] = "accepted"; hist(o, "player", "kabul", o["price"].as<double>());
  } else if (action == "counter") {
    if (strcmp(o["status"], "counter")) fail("Karşı teklif yok.");
    double price = numOf(b["price"], 0.01);
    if (!it.isNull()) checkBid(it, price);
    o["price"] = price; o["by"] = "player"; o["status"] = "new"; hist(o, "player", "teklif", price, noteOf(b["note"]));
  } else if (action == "withdraw") {
    if (!isOpen(o["status"])) fail("Bu teklif kapalı.");
    o["status"] = "withdrawn"; hist(o, "player", "geri çekti", o["price"].as<double>());
  } else fail("Bilinmeyen işlem");
  logLine(String(p["name"].as<const char*>()) + ": " + o["itemName"].as<const char*>() + " teklifi → " + o["status"].as<const char*>(), p["id"]);
}

static void pInsight(JsonObject p, JsonObject b) {
  JsonObject m = merchantOf(b["merchantId"]);
  String key = bkey(p["id"], m["id"]);
  if (!S["revealed"][key].isNull() && truthy(S["revealed"][key])) return;
  String tk = key + ":" + String(S["day"].as<int>());
  if (!S["insightTries"][tk].isNull()) fail("Bugün zaten denedin.");
  int roll = d20();
  int total = roll + (charOf(p["charId"])["bonus"]["insight"] | 0);
  bool ok = total >= 15;
  S["insightTries"][tk] = ok ? "ok" : "fail";
  if (ok) S["revealed"][key] = true;
  logLine(String(p["name"].as<const char*>()) + " " + m["name"].as<const char*>() + "'i sezmeye çalıştı: " + (ok ? "başardı" : "başaramadı"), p["id"]);
}

void runPlayer(const String& name, JsonObject p, JsonObject b) {
  if (name == "offer") pOffer(p, b);
  else if (name == "accept") pAccept(p, b);
  else if (name == "gamble") pGamble(p, b);
  else if (name == "bid") pBid(p, b);
  else if (name == "bidreply") pBidReply(p, b);
  else if (name == "insight") pInsight(p, b);
  else fail("Yok", 404);
}

// ---------- DM actions ----------
static bool inList(const char* v, const char* const* list, size_t n) { for (size_t i = 0; i < n; i++) if (!strcmp(v, list[i])) return true; return false; }
static void removeWhere(JsonArray a, bool (*pred)(JsonObject, const char*), const char* arg) {
  for (int i = (int)a.size() - 1; i >= 0; i--) if (pred(a[i], arg)) a.remove(i);
}

static void dMerchant(JsonObject b) {
  const char* type = b["type"];
  if (!type || !eng::typeOf(type)) fail("Tip seç.");
  String name = textOf(b["name"]);   // validate first: an invalid request must not leave a blank merchant behind
  JsonObject m;
  if (truthy(b["id"])) m = merchantOf(b["id"]); else { if (S["merchants"].size() >= MAX_MERCHANTS) fail("En fazla 12 satıcı."); m = S["merchants"].as<JsonArray>().add<JsonObject>(); m["id"] = newId(); }
  String emoji = b["emoji"].isNull() ? String(m["emoji"] | "") : strOf(b["emoji"]);
  emoji = jsSlice(jsTrim(emoji), 8);
  m["name"] = name; m["emoji"] = emoji; m["type"] = type;
}

static String enumOf(JsonVariantConst v, const char* const* list, size_t n, const char* def, const char* label) {
  String x = (v.isNull() || (v.is<const char*>() && !v.as<const char*>()[0])) ? String(def ? def : "") : strOf(v);
  bool isDef = def ? x == def : (v.isNull() || (v.is<const char*>() && !v.as<const char*>()[0]));
  if (!isDef && !inList(x.c_str(), list, n)) fail((String(label) + " geçersiz").c_str());
  return x;
}

static void dItem(JsonObject b, JsonObject out) {
  merchantOf(b["merchantId"]);
  String name = textOf(b["name"]);
  double price = numOf(b["price"], 0.01);
  bool magical = truthy(b["magical"]);
  bool stockNull = b["stock"].isNull() || (b["stock"].is<const char*>() && !b["stock"].as<const char*>()[0]);
  long stock = stockNull ? 0 : (long)max(0.0, floor(b["stock"].as<double>()));
  double ma = floor(b["minAffinity"].as<double>()); if (!(ma == ma)) ma = 0;
  int minAff = (int)max(0.0, min(100.0, ma));
  String desc = jsSlice(jsTrim(strOf(b["desc"])), 200);
  bool typeNull = b["type"].isNull() || (b["type"].is<const char*>() && !b["type"].as<const char*>()[0]);
  String type = enumOf(b["type"], ITEM_TYPES, 7, nullptr, "Tür");
  String rarity = enumOf(b["rarity"], RARITIES, 7, "none", "Nadirlik");
  JsonObject it;
  if (truthy(b["id"])) it = itemOf(b["id"]); else { if (S["items"].size() >= MAX_ITEMS) fail("En fazla 80 eşya."); it = S["items"].as<JsonArray>().add<JsonObject>(); it["id"] = newId(); }
  it["merchantId"] = b["merchantId"].as<const char*>(); it["name"] = name; it["price"] = price; it["magical"] = magical;
  if (stockNull) it["stock"] = nullptr; else it["stock"] = stock;
  it["minAffinity"] = minAff; it["desc"] = desc;
  if (typeNull) it["type"] = nullptr; else it["type"] = type;
  it["rarity"] = rarity;
  String suffix = String(":") + it["id"].as<const char*>();
  JsonObject negs = S["negs"];
  std::vector<String> del;
  for (JsonPair kv : negs) { String k = kv.key().c_str(); if (k.endsWith(suffix)) del.push_back(k); }
  for (auto& k : del) negs.remove(k);
  out["id"] = it["id"].as<const char*>();
}

static void dItemVariant(JsonObject b, JsonObject out) {
  JsonObject src = itemOf(b["id"]);
  String nid = newId();
  String nm = truthy(b["name"]) ? textOf(b["name"]) : textStr(String(src["name"].as<const char*>()) + " (kopya)");
  if (S["items"].size() >= MAX_ITEMS) fail("En fazla 80 eşya.");
  JsonObject copy = S["items"].as<JsonArray>().add<JsonObject>();
  for (JsonPair kv : src) copy[kv.key().c_str()] = kv.value();
  copy["id"] = nid; copy["name"] = nm;
  String img = mediaCopy(src["image"] | "", nid, false), th = mediaCopy(src["thumb"] | "", nid, true);
  if (img.length()) copy["image"] = img; else copy["image"] = nullptr;
  if (th.length()) copy["thumb"] = th; else copy["thumb"] = nullptr;
  out["id"] = nid;
}

static void dDelete(JsonObject b) {
  String kind = strOf(b["kind"]); const char* id = b["id"];
  if (!id) id = "";
  if (kind == "merchant") {
    JsonObject m = findBy(S["merchants"], "id", id);
    if (!m.isNull()) mediaUnlink(m["portrait"] | "");
    for (JsonObject i : S["items"].as<JsonArray>()) if (!strcmp(i["merchantId"] | "", id)) { mediaUnlink(i["image"] | ""); mediaUnlink(i["thumb"] | ""); }
    removeWhere(S["merchants"], [](JsonObject x, const char* a) { return !strcmp(x["id"] | "", a); }, id);
    removeWhere(S["items"], [](JsonObject x, const char* a) { return !strcmp(x["merchantId"] | "", a); }, id);
  } else if (kind == "item") {
    JsonObject i = findBy(S["items"], "id", id);
    if (!i.isNull()) { mediaUnlink(i["image"] | ""); mediaUnlink(i["thumb"] | ""); }
    removeWhere(S["items"], [](JsonObject x, const char* a) { return !strcmp(x["id"] | "", a); }, id);
  } else if (kind == "player") {
    removeWhere(S["players"], [](JsonObject x, const char* a) { return !strcmp(x["id"] | "", a); }, id);
  } else fail("Bilinmeyen tür");
}

static void dPlayer(JsonObject b) {
  JsonObject p = playerOf(b["id"]);
  if (b.containsKey("gold")) {
    double g = numOf(b["gold"]), d = round2(g - p["gold"].as<double>());
    if (d != 0) book("dm", p, nullptr, "DM altın ayarı", d);
    p["gold"] = g;
  }
  if (b.containsKey("advantage")) p["advantage"] = truthy(b["advantage"]);
}

static void dBidReply(JsonObject b) {
  JsonObject o = offerOf(b["id"]);
  JsonObject it = o["itemId"].isNull() ? JsonObject() : findBy(S["items"], "id", o["itemId"]);
  String note = noteOf(b["note"]);
  if (!isOpen(o["status"])) fail("Bu teklif kapalı.");
  String action = strOf(b["action"]);
  if (action == "accept") {
    if (!strcmp(o["status"], "accepted")) fail("Zaten kabul edildi.");
    o["status"] = "accepted"; hist(o, "dm", "kabul", o["price"].as<double>(), note);
  } else if (action == "counter") {
    double price = numOf(b["price"], 0.01);
    if (!it.isNull()) checkBid(it, price);
    o["price"] = price; o["by"] = "dm"; o["status"] = "counter"; hist(o, "dm", "karşı teklif", price, note);
  } else if (action == "reject") {
    o["status"] = "rejected"; hist(o, "dm", "reddetti", o["price"].as<double>(), note);
  } else fail("Bilinmeyen işlem");
  o["dmNote"] = note.length() ? note : String(o["dmNote"] | "");
}

static void dBidSend(JsonObject b) {
  JsonObject p = playerOf(b["playerId"]), it = itemOf(b["itemId"]);
  double price = numOf(b["price"], 0.01);
  checkBid(it, price);
  JsonObject o = S["offers"].as<JsonArray>().add<JsonObject>();
  o["id"] = newId(); o["playerId"] = p["id"].as<const char*>(); o["merchantId"] = it["merchantId"].as<const char*>(); o["itemId"] = it["id"].as<const char*>();
  o["itemName"] = it["name"].as<const char*>(); o["price"] = price; o["note"] = noteOf(b["note"]);
  o["from"] = "dm"; o["by"] = "dm"; o["status"] = "counter"; o["week"] = S["week"].as<int>(); o["t"] = nowMs();
  o["history"].to<JsonArray>();
  hist(o, "dm", "teklif gönderdi", price, o["note"].as<String>());
  logLine(String(merchantOf(it["merchantId"])["name"].as<const char*>()) + " → " + p["name"].as<const char*>() + ": " + it["name"].as<const char*>() + " için " + gp(price) + " teklif", p["id"]);
}

static void dNewDay() {
  S["day"] = S["day"].as<int>() + 1; S["negs"].to<JsonObject>(); S["bans"].to<JsonObject>();
  logLine(String("Yeni gün: ") + S["day"].as<int>());
}

static void dWeekly() {
  std::vector<JsonObject> acc;
  for (JsonObject o : S["offers"].as<JsonArray>()) if (!strcmp(o["status"], "accepted")) acc.push_back(o);
  std::sort(acc.begin(), acc.end(), [](JsonObject a, JsonObject b) { return a["t"].as<uint64_t>() < b["t"].as<uint64_t>(); });
  int done = 0;
  AffCfg c = affCfg();
  for (JsonObject o : acc) {
    JsonObject p = findBy(S["players"], "id", o["playerId"]);
    JsonObject it = o["itemId"].isNull() ? JsonObject() : findBy(S["items"], "id", o["itemId"]);
    const char* why = nullptr;
    if (p.isNull()) why = "Oyuncu yok";
    else if (!o["itemId"].isNull() && it.isNull()) why = "Eşya kalmadı";
    else if (!it.isNull() && !it["stock"].isNull() && it["stock"].as<int>() <= 0) why = "Tükendi";
    else if (p["gold"].as<double>() < o["price"].as<double>()) why = "Altın yetmedi";
    if (why) { o["status"] = "failed"; o["reason"] = why; hist(o, "dm", "teslim olmadı", o["price"].as<double>(), why); continue; }
    double price = o["price"].as<double>();
    p["gold"] = round2(p["gold"].as<double>() - price);
    JsonObject inv = p["inventory"].as<JsonArray>().add<JsonObject>();
    inv["id"] = newId();
    if (o["itemId"].isNull()) inv["itemId"] = nullptr; else inv["itemId"] = o["itemId"].as<const char*>();
    inv["name"] = o["itemName"].as<const char*>(); inv["paid"] = price; inv["damaged"] = false; inv["magical"] = it.isNull() ? false : it["magical"].as<bool>();
    if (!it.isNull() && !it["stock"].isNull()) it["stock"] = it["stock"].as<int>() - 1;
    book("offer", p, o["merchantId"], o["itemName"].as<String>(), -price, it.isNull() ? JsonVariantConst() : JsonVariantConst(it["price"]));
    affChange(p, o["merchantId"], c.gainOffer, "teklif teslimi");
    o["status"] = "settled"; hist(o, "dm", "teslim edildi", price);
    done++;
  }
  S["week"] = S["week"].as<int>() + 1;
  dNewDay();
  logLine(String("Haftalık Pazar: ") + done + " teslimat, yeni hafta " + S["week"].as<int>());
}

static void dMediaClear(JsonObject b) {
  String kind = strOf(b["kind"]);
  if (kind == "item") { JsonObject i = itemOf(b["id"]); mediaUnlink(i["image"] | ""); mediaUnlink(i["thumb"] | ""); i["image"] = nullptr; i["thumb"] = nullptr; }
  else if (kind == "portrait") { JsonObject m = merchantOf(b["id"]); mediaUnlink(m["portrait"] | ""); m["portrait"] = nullptr; }
  else fail("Tür geçersiz");
}

static long intIn(JsonVariantConst v, long mn, long mx, const String& label) {
  double d = v.is<const char*>() ? atof(v.as<const char*>()) : v.as<double>();
  bool numeric = v.is<double>() || v.is<long>() || v.is<int>() || v.is<bool>() || (v.is<const char*>() && v.as<const char*>()[0]);
  long n = (long)floor(d + 0.5);
  if (!numeric || n < mn || n > mx) fail((label + ": " + String(mn) + " ile " + String(mx) + " arasında olmalı").c_str());
  return n;
}
static void arrIn(JsonVariantConst v, int len, int mn, int mx, const String& label, int* out) {
  if (!v.is<JsonArrayConst>() || (int)v.size() != len) fail((label + ": " + String(len) + " değer olmalı").c_str());
  for (int i = 0; i < len; i++) out[i] = (int)intIn(v[i], mn, mx, label);
}

static void dAffSettings(JsonObject b) {
  if (truthy(b["reset"])) { S["settings"].as<JsonObject>().remove("affinity"); logLine("DM: yakınlık ayarları varsayılana döndü"); return; }
  AffCfg cur = affCfg();
  int th[4]; for (int i = 0; i < 4; i++) th[i] = cur.thresholds[i];
  if (b.containsKey("thresholds")) arrIn(b["thresholds"], 4, 1, 99, "Seviye eşikleri", th);
  for (int i = 1; i < 4; i++) if (th[i] <= th[i - 1]) fail("Seviye eşikleri artan olmalı");
  int gain[6] = {cur.gainBuy, cur.gainOffer, cur.gainDeal, cur.gainGamble, cur.gainRet, cur.gainAngered};
  static const char* const GK[6] = {"buy", "offer", "deal", "gamble", "ret", "angered"};
  for (int i = 0; i < 6; i++) if (b["gain"].is<JsonObject>() && b["gain"].as<JsonObject>().containsKey(GK[i])) gain[i] = (int)intIn(b["gain"][GK[i]], -20, 20, String("Kazanç (") + GK[i] + ")");
  bool enabled = b.containsKey("enabled") ? truthy(b["enabled"]) : cur.enabled;
  int start = b.containsKey("start") ? (int)intIn(b["start"], 0, 100, "Başlangıç") : cur.start;
  int weeklyCap = b.containsKey("weeklyCap") ? (int)intIn(b["weeklyCap"], 0, 100, "Haftalık tavan") : cur.weeklyCap;
  int dc[5]; for (int i = 0; i < 5; i++) dc[i] = cur.dcMod[i];
  if (b.containsKey("dcMod")) arrIn(b["dcMod"], 5, -5, 0, "Zar eşiği indirimi", dc);
  int bonusRepFrom = b.containsKey("bonusRepFrom") ? (int)intIn(b["bonusRepFrom"], 0, 5, "Sabır bonusu seviyesi") : cur.bonusRepFrom;
  JsonObject a = S["settings"]["affinity"].to<JsonObject>();
  a["enabled"] = enabled; a["start"] = start; a["weeklyCap"] = weeklyCap;
  JsonArray ta = a["thresholds"].to<JsonArray>(); for (int i = 0; i < 4; i++) ta.add(th[i]);
  JsonArray da = a["dcMod"].to<JsonArray>(); for (int i = 0; i < 5; i++) da.add(dc[i]);
  a["bonusRepFrom"] = bonusRepFrom;
  JsonObject g = a["gain"].to<JsonObject>(); for (int i = 0; i < 6; i++) g[GK[i]] = gain[i];
  logLine(String("DM: yakınlık ayarlarını güncelledi (") + (enabled ? "açık" : "kapalı") + ")");
}

static void dAffinity(JsonObject b) {
  JsonObject p = playerOf(b["playerId"]); JsonObject m = merchantOf(b["merchantId"]);
  int cur = affOf(p["id"], m["id"]);
  double v;
  if (b.containsKey("value")) v = b["value"].is<const char*>() ? atof(b["value"].as<const char*>()) : b["value"].as<double>();
  else v = cur + (b["delta"].is<const char*>() ? atof(b["delta"].as<const char*>()) : b["delta"].as<double>());
  if (!isfinite(v)) fail("Geçersiz sayı");
  int nv = (int)max(0.0, min(100.0, floor(v + 0.5)));
  S["affinity"][bkey(p["id"], m["id"])] = nv;
  logLine(String("DM: ") + p["name"].as<const char*>() + " yakınlığı " + nv + " yaptı (" + m["name"].as<const char*>() + ")", p["id"]);
}

static void dPassword(JsonObject b, const Auth& a) {
  if (!checkDmPass(strOf(b["current"]))) fail("Mevcut şifre yanlış", 403);
  String next = strOf(b["next"]);
  size_t n = jsLen(next);
  if (n < 6 || n > 64) fail("Yeni şifre 6–64 karakter olmalı");
  setDmPass(next);
  JsonArray dm = S["dm"].to<JsonArray>(); dm.add(a.tok);
  sseCloseDmExcept(a.tok);
  logLine("DM şifresi değiştirildi");
}

static void dLine(JsonObject b) {
  JsonObject n = S["negs"][nkey(b["playerId"] | "", b["itemId"] | "")];
  if (n.isNull()) fail("Aktif pazarlık yok", 404);
  n["line"] = textOf(b["text"], 80);
}
static void dSetPrice(JsonObject b) {
  const char* pid = b["playerId"] | "";
  JsonObject n = S["negs"][nkey(pid, b["itemId"] | "")];
  if (n.isNull()) fail("Aktif pazarlık yok", 404);
  double price = numOf(b["price"], 0.01);
  n["price"] = price; n["status"] = "deal";
  logLine(String("DM fiyatı ") + gp(price) + " olarak sabitledi", pid);
}

void runDm(const String& name, JsonObject b, const Auth& a, JsonObject out) {
  if (name == "merchant") dMerchant(b);
  else if (name == "item") dItem(b, out);
  else if (name == "itemvariant") dItemVariant(b, out);
  else if (name == "delete") dDelete(b);
  else if (name == "player") dPlayer(b);
  else if (name == "bidreply") dBidReply(b);
  else if (name == "bidsend") dBidSend(b);
  else if (name == "weekly") dWeekly();
  else if (name == "mediaclear") dMediaClear(b);
  else if (name == "affsettings") dAffSettings(b);
  else if (name == "affinity") dAffinity(b);
  else if (name == "password") dPassword(b, a);
  else if (name == "newday") dNewDay();
  else if (name == "line") dLine(b);
  else if (name == "setprice") dSetPrice(b);
#ifdef DEV_STA
  else if (name == "reset") { seedWorld(); JsonArray dm = S["dm"].to<JsonArray>(); dm.add(a.tok); pinClear(); diceSet(nullptr, 0); }
  else if (name == "dice") {
    std::vector<int> seq; for (JsonVariant v : b["seq"].as<JsonArray>()) seq.push_back(v.as<int>());
    diceSet(seq.data(), seq.size());
  }
#endif
  else fail("Yok", 404);
}
