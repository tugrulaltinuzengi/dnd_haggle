// Port of app/server.js: P (player actions) and D (DM actions). Keep messages byte-identical to the Node server.
// Haggling happens at the table, in person: the player types an offer, the DM (playing the merchant) accepts, counters or rejects.
#include "actions.h"
#include "config.h"
#include <vector>

static bool truthy(JsonVariantConst v) {
  if (v.isNull()) return false;
  if (v.is<bool>()) return v.as<bool>();
  if (v.is<const char*>()) return v.as<const char*>()[0] != 0;
  if (v.is<double>() || v.is<long>()) return v.as<double>() != 0;
  return true;   // arrays / objects
}

static const char* const ITEM_TYPES[] = {"weapon", "armor", "potion", "scroll", "gem", "gear", "other"};
static const char* const RARITIES[] = {"none", "common", "uncommon", "rare", "veryrare", "legendary", "artifact"};

// ---------- helpers ----------
static JsonObject shownItemOf(const char* id) {   // hidden items do not exist for players
  JsonObject i = itemOf(id);
  if (i["hidden"].as<bool>()) fail("No such item", 404);
  return i;
}
static void assertOpen(JsonObject p, const char* mid) {
  if (isClosed(p["id"], mid)) fail("The merchant is not trading with you today.");
}

// Moves gold and the item: used by list-price purchases and by accepted offers. `item` may be null (custom request).
static void deliver(JsonObject p, JsonObject item, const String& name, double price, bool magical, const char* kind, const char* merchantId) {
  if (!item.isNull() && !item["stock"].isNull() && item["stock"].as<int>() <= 0) fail("Sold out.");
  if (p["gold"].as<double>() < price) fail("Not enough gold.");
  p["gold"] = round2(p["gold"].as<double>() - price);
  JsonObject inv = p["inventory"].as<JsonArray>().add<JsonObject>();
  inv["id"] = newId();
  if (item.isNull()) inv["itemId"] = nullptr; else inv["itemId"] = item["id"].as<const char*>();
  inv["name"] = name; inv["paid"] = price; inv["magical"] = magical;
  if (!item.isNull() && !item["stock"].isNull()) item["stock"] = item["stock"].as<int>() - 1;
  book(kind, p, merchantId, name, -price, item.isNull() ? JsonVariantConst() : JsonVariantConst(item["price"]));
}

// ---------- offers ----------
// new (the player is waiting for the DM) <-> counter (the DM answered); either side accepting settles it at once.
static bool isOpen(const char* st) { return !strcmp(st, "new") || !strcmp(st, "counter"); }
static void hist(JsonObject o, const char* who, const char* act, double price, const String& note = "") {
  JsonObject h = o["history"].as<JsonArray>().add<JsonObject>();
  h["t"] = nowMs(); h["who"] = who; h["act"] = act; h["price"] = price; h["note"] = note;
}
static String noteOf(JsonVariantConst v) { return jsSlice(jsTrim(strOf(v)), 80); }
static void checkBid(JsonObject item, double price) {
  if (price >= item["price"].as<double>()) fail("Offer must be below the list price.");
}
static JsonObject offerOf(const char* id) { JsonObject o = findBy(S["offers"], "id", id); if (o.isNull()) fail("No such offer", 404); return o; }
static void settle(JsonObject o, const char* who) {
  JsonObject p = playerOf(o["playerId"]);
  JsonObject it = o["itemId"].isNull() ? JsonObject() : findBy(S["items"], "id", o["itemId"]);
  if (!o["itemId"].isNull() && it.isNull()) fail("Item is gone");
  double price = o["price"].as<double>();
  deliver(p, it, o["itemName"].as<String>(), price, it.isNull() ? false : it["magical"].as<bool>(), "offer", o["merchantId"]);
  o["status"] = "settled";
  hist(o, who, "accept", price);
  logLine(String(p["name"].as<const char*>()) + " bought " + o["itemName"].as<const char*>() + " for " + gp(price) + " (" + merchantOf(o["merchantId"])["name"].as<const char*>() + ", agreed offer)", p["id"]);
}

// ---------- player actions ----------
static void pAccept(JsonObject p, JsonObject b) {   // buy at the list price, no haggling
  JsonObject item = shownItemOf(b["itemId"]), m = merchantOf(item["merchantId"]);
  assertOpen(p, m["id"]);
  double price = item["price"].as<double>();
  deliver(p, item, item["name"].as<String>(), price, item["magical"].as<bool>(), "buy", m["id"]);
  logLine(String(p["name"].as<const char*>()) + " bought: " + item["name"].as<const char*>() + " · " + gp(price) + " (" + m["name"].as<const char*>() + ")", p["id"]);
}

static void pBid(JsonObject p, JsonObject b) {
  JsonObject m = merchantOf(b["merchantId"]);
  JsonObject item;
  if (truthy(b["itemId"])) item = shownItemOf(b["itemId"]);
  if (!item.isNull() && strcmp(item["merchantId"], m["id"])) fail("That item is not sold by this merchant.");
  assertOpen(p, m["id"]);
  double price = numOf(b["price"], 0.01);
  if (!item.isNull()) checkBid(item, price);
  int open = 0;
  for (JsonObject o : S["offers"].as<JsonArray>()) if (!strcmp(o["playerId"], p["id"]) && isOpen(o["status"])) open++;
  if (open >= 10) fail("At most 10 open offers.");
  String itemName = item.isNull() ? textOf(b["itemName"]) : String(item["name"].as<const char*>());
  JsonObject o = S["offers"].as<JsonArray>().add<JsonObject>();
  o["id"] = newId(); o["playerId"] = p["id"].as<const char*>(); o["merchantId"] = m["id"].as<const char*>();
  if (item.isNull()) o["itemId"] = nullptr; else o["itemId"] = item["id"].as<const char*>();
  o["itemName"] = itemName; o["price"] = price; o["note"] = noteOf(b["note"]);
  o["from"] = "player"; o["by"] = "player"; o["status"] = "new"; o["week"] = S["week"].as<int>(); o["t"] = nowMs();
  o["history"].to<JsonArray>();
  hist(o, "player", "offer", price, o["note"].as<String>());
  logLine(String(p["name"].as<const char*>()) + " → " + m["name"].as<const char*>() + ": offer " + gp(price) + " for " + itemName, p["id"]);
}

static void pBidReply(JsonObject p, JsonObject b) {
  JsonObject o = offerOf(b["id"]);
  if (strcmp(o["playerId"], p["id"])) fail("This is not your offer", 403);
  if (!isOpen(o["status"])) fail("This offer is closed.");
  String action = strOf(b["action"]);
  if (action == "accept") {
    if (strcmp(o["status"], "counter")) fail("There is no counter-offer to accept.");
    settle(o, "player");
  } else if (action == "counter") {
    if (strcmp(o["status"], "counter")) fail("There is no counter-offer.");
    double price = numOf(b["price"], 0.01);
    JsonObject it = o["itemId"].isNull() ? JsonObject() : findBy(S["items"], "id", o["itemId"]);
    if (!it.isNull()) checkBid(it, price);
    o["price"] = price; o["by"] = "player"; o["status"] = "new"; hist(o, "player", "offer", price, noteOf(b["note"]));
    logLine(String(p["name"].as<const char*>()) + ": counter-offer " + gp(price) + " for " + o["itemName"].as<const char*>(), p["id"]);
  } else if (action == "withdraw") {
    o["status"] = "withdrawn"; hist(o, "player", "withdraw", o["price"].as<double>());
    logLine(String(p["name"].as<const char*>()) + ": withdrew the offer for " + o["itemName"].as<const char*>(), p["id"]);
  } else fail("Unknown action");
}

void runPlayer(const String& name, JsonObject p, JsonObject b) {
  if (name == "accept") pAccept(p, b);
  else if (name == "bid") pBid(p, b);
  else if (name == "bidreply") pBidReply(p, b);
  else fail("Not found", 404);
}

// ---------- DM actions ----------
static bool inList(const char* v, const char* const* list, size_t n) { for (size_t i = 0; i < n; i++) if (!strcmp(v, list[i])) return true; return false; }
static void removeWhere(JsonArray a, bool (*pred)(JsonObject, const char*), const char* arg) {
  for (int i = (int)a.size() - 1; i >= 0; i--) if (pred(a[i], arg)) a.remove(i);
}

static void dMerchant(JsonObject b) {
  String name = textOf(b["name"]);   // validate first: an invalid request must not leave a blank merchant behind
  JsonObject m;
  if (truthy(b["id"])) m = merchantOf(b["id"]); else { if (S["merchants"].size() >= MAX_MERCHANTS) fail("At most 12 merchants."); m = S["merchants"].as<JsonArray>().add<JsonObject>(); m["id"] = newId(); }
  String emoji = b["emoji"].isNull() ? String(m["emoji"] | "") : strOf(b["emoji"]);
  emoji = jsSlice(jsTrim(emoji), 8);
  m["name"] = name; m["emoji"] = emoji;
}

static String enumOf(JsonVariantConst v, const char* const* list, size_t n, const char* def, const char* label) {
  String x = (v.isNull() || (v.is<const char*>() && !v.as<const char*>()[0])) ? String(def ? def : "") : strOf(v);
  bool isDef = def ? x == def : (v.isNull() || (v.is<const char*>() && !v.as<const char*>()[0]));
  if (!isDef && !inList(x.c_str(), list, n)) fail((String(label) + " is invalid").c_str());
  return x;
}

static void dItem(JsonObject b, JsonObject out) {
  merchantOf(b["merchantId"]);
  String name = textOf(b["name"]);
  double price = numOf(b["price"], 0.01);
  bool magical = truthy(b["magical"]);
  bool stockNull = b["stock"].isNull() || (b["stock"].is<const char*>() && !b["stock"].as<const char*>()[0]);
  long stock = stockNull ? 0 : (long)max(0.0, floor(b["stock"].as<double>()));
  String desc = jsSlice(jsTrim(strOf(b["desc"])), 200);
  bool typeNull = b["type"].isNull() || (b["type"].is<const char*>() && !b["type"].as<const char*>()[0]);
  String type = enumOf(b["type"], ITEM_TYPES, 7, nullptr, "Type");
  String rarity = enumOf(b["rarity"], RARITIES, 7, "none", "Rarity");
  bool hidden = truthy(b["hidden"]);
  JsonObject it;
  if (truthy(b["id"])) it = itemOf(b["id"]); else { if (S["items"].size() >= MAX_ITEMS) fail("At most 80 items."); it = S["items"].as<JsonArray>().add<JsonObject>(); it["id"] = newId(); }
  it["merchantId"] = b["merchantId"].as<const char*>(); it["name"] = name; it["price"] = price; it["magical"] = magical;
  if (stockNull) it["stock"] = nullptr; else it["stock"] = stock;
  it["desc"] = desc;
  if (typeNull) it["type"] = nullptr; else it["type"] = type;
  it["rarity"] = rarity;
  it["hidden"] = hidden;
  out["id"] = it["id"].as<const char*>();
}

static void dItemVariant(JsonObject b, JsonObject out) {
  JsonObject src = itemOf(b["id"]);
  String nid = newId();
  String nm = truthy(b["name"]) ? textOf(b["name"]) : textStr(String(src["name"].as<const char*>()) + " (copy)");
  if (S["items"].size() >= MAX_ITEMS) fail("At most 80 items.");
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
  } else fail("Unknown kind");
}

static void dPlayer(JsonObject b) {
  JsonObject p = playerOf(b["id"]);
  if (b.containsKey("gold")) {
    double g = numOf(b["gold"]), d = round2(g - p["gold"].as<double>());
    if (d != 0) book("dm", p, nullptr, "DM gold adjustment", d);
    p["gold"] = g;
  }
}

static void dClose(JsonObject b) {   // closes (or reopens) one merchant to one player until the next day
  JsonObject p = playerOf(b["playerId"]), m = merchantOf(b["merchantId"]);
  String k = bkey(p["id"], m["id"]);
  bool closed = truthy(b["closed"]);
  if (closed) S["bans"][k] = S["day"].as<int>(); else S["bans"].as<JsonObject>().remove(k);
  logLine(String("DM: ") + m["name"].as<const char*>() + " is " + (closed ? "closed" : "open again") + " to " + p["name"].as<const char*>() + " today", p["id"]);
}

static void dBidReply(JsonObject b) {
  JsonObject o = offerOf(b["id"]);
  String note = noteOf(b["note"]);
  if (!isOpen(o["status"])) fail("This offer is closed.");
  if (note.length()) o["dmNote"] = note;
  String action = strOf(b["action"]);
  if (action == "accept") {
    if (strcmp(o["status"], "new")) fail("Waiting for the player to answer.");
    settle(o, "dm");
  } else if (action == "counter") {
    double price = numOf(b["price"], 0.01);
    o["price"] = price; o["by"] = "dm"; o["status"] = "counter"; hist(o, "dm", "counter", price, note);
    logLine(String(merchantOf(o["merchantId"])["name"].as<const char*>()) + ": counter-offer " + gp(price) + " for " + o["itemName"].as<const char*>(), o["playerId"]);
  } else if (action == "reject") {
    o["status"] = "rejected"; hist(o, "dm", "reject", o["price"].as<double>(), note);
  } else fail("Unknown action");
}

static void dBidSend(JsonObject b) {
  JsonObject p = playerOf(b["playerId"]), it = itemOf(b["itemId"]);
  double price = numOf(b["price"], 0.01);
  JsonObject o = S["offers"].as<JsonArray>().add<JsonObject>();
  o["id"] = newId(); o["playerId"] = p["id"].as<const char*>(); o["merchantId"] = it["merchantId"].as<const char*>(); o["itemId"] = it["id"].as<const char*>();
  o["itemName"] = it["name"].as<const char*>(); o["price"] = price; o["note"] = noteOf(b["note"]);
  o["from"] = "dm"; o["by"] = "dm"; o["status"] = "counter"; o["week"] = S["week"].as<int>(); o["t"] = nowMs();
  o["history"].to<JsonArray>();
  hist(o, "dm", "send", price, o["note"].as<String>());
  logLine(String(merchantOf(it["merchantId"])["name"].as<const char*>()) + " → " + p["name"].as<const char*>() + ": offer " + gp(price) + " for " + it["name"].as<const char*>(), p["id"]);
}

static void dNewDay() {
  S["day"] = S["day"].as<int>() + 1; S["bans"].to<JsonObject>();
  logLine(String("New day: ") + S["day"].as<int>());
}

static void dWeekly() {
  S["week"] = S["week"].as<int>() + 1;
  dNewDay();
  logLine(String("New week: ") + S["week"].as<int>());
}

static void dMediaClear(JsonObject b) {
  String kind = strOf(b["kind"]);
  if (kind == "item") { JsonObject i = itemOf(b["id"]); mediaUnlink(i["image"] | ""); mediaUnlink(i["thumb"] | ""); i["image"] = nullptr; i["thumb"] = nullptr; }
  else if (kind == "portrait") { JsonObject m = merchantOf(b["id"]); mediaUnlink(m["portrait"] | ""); m["portrait"] = nullptr; }
  else fail("Invalid kind");
}

static void dPassword(JsonObject b, const Auth& a) {
  if (!checkDmPass(strOf(b["current"]))) fail("Current password is wrong", 403);
  String next = strOf(b["next"]);
  size_t n = jsLen(next);
  if (n < 6 || n > 64) fail("New password must be 6–64 characters");
  setDmPass(next);
  JsonArray dm = S["dm"].to<JsonArray>(); dm.add(a.tok);
  sseCloseDmExcept(a.tok);
  logLine("DM password changed");
}

void runDm(const String& name, JsonObject b, const Auth& a, JsonObject out) {
  if (name == "merchant") dMerchant(b);
  else if (name == "item") dItem(b, out);
  else if (name == "itemvariant") dItemVariant(b, out);
  else if (name == "delete") dDelete(b);
  else if (name == "player") dPlayer(b);
  else if (name == "close") dClose(b);
  else if (name == "bidreply") dBidReply(b);
  else if (name == "bidsend") dBidSend(b);
  else if (name == "weekly") dWeekly();
  else if (name == "mediaclear") dMediaClear(b);
  else if (name == "password") dPassword(b, a);
  else if (name == "newday") dNewDay();
#ifdef DEV_STA
  else if (name == "reset") { seedWorld(); JsonArray dm = S["dm"].to<JsonArray>(); dm.add(a.tok); pinClear(); }
#endif
  else fail("Not found", 404);
}
