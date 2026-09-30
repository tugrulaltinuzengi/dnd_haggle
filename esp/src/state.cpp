#include "state.h"
#include "config.h"
#include <LittleFS.h>

JsonDocument S;
JsonDocument CHARS;
static SemaphoreHandle_t mtx = nullptr;

Lock::Lock() { xSemaphoreTakeRecursive(mtx, portMAX_DELAY); }
Lock::~Lock() { xSemaphoreGiveRecursive(mtx); }

static volatile bool saveDue = false, bcastDue = false;
static uint32_t saveAt = 0, lastBcast = 0;

// ---------- persistence ----------
static const char* DATA = "/data.json";
static const char* TMP = "/data.tmp";

void seedWorld() {
  S.clear();
  S["day"] = 1; S["week"] = 1;
  S["offers"].to<JsonArray>();
  JsonArray m = S["merchants"].to<JsonArray>();
  struct { const char* id; const char* name; const char* emoji; } ms[] = {
    {"m1", "Bora", "🧓"}, {"m2", "Marla", "👩‍🔧"}, {"m3", "Grom", "🐗"}};
  for (auto& x : ms) { JsonObject o = m.add<JsonObject>(); o["id"] = x.id; o["name"] = x.name; o["emoji"] = x.emoji; }
  JsonArray it = S["items"].to<JsonArray>();
  struct { const char* mid; const char* name; double price; bool magical; int stock; } is[] = {
    {"m1", "Potion of Healing", 50, false, -1}, {"m1", "Hempen Rope (50 ft)", 1, false, -1}, {"m1", "Tent", 2, false, -1},
    {"m2", "Longsword", 15, false, -1}, {"m2", "Chain Mail", 75, false, -1}, {"m2", "Thieves' Tools", 25, false, -1},
    {"m3", "Potion of Flying", 250, true, 2}, {"m3", "+1 Shield", 400, true, 1}, {"m3", "Dragon Scale", 120, false, -1}};
  for (auto& x : is) {
    JsonObject o = it.add<JsonObject>();
    o["id"] = newId(); o["merchantId"] = x.mid; o["name"] = x.name; o["price"] = x.price; o["magical"] = x.magical;
    if (x.stock < 0) o["stock"] = nullptr; else o["stock"] = x.stock;
    o["hidden"] = false;
  }
  S["players"].to<JsonArray>();
  S["bans"].to<JsonObject>();
  S["dm"].to<JsonArray>(); S["log"].to<JsonArray>(); S["ledger"].to<JsonArray>();
  S["settings"].to<JsonObject>();
}

static void ensureShape() {
  auto arr = [](const char* k) { if (!S[k].is<JsonArray>()) S[k].to<JsonArray>(); };
  auto obj = [](const char* k) { if (!S[k].is<JsonObject>()) S[k].to<JsonObject>(); };
  arr("offers"); arr("merchants"); arr("items"); arr("players"); arr("dm"); arr("log"); arr("ledger");
  obj("bans"); obj("settings");
  if (!S["day"].is<int>()) S["day"] = 1;
  if (!S["week"].is<int>()) S["week"] = 1;
  // Older saves carried the dice engine and affinity; drop what no longer exists. Accepted-but-undelivered offers become new again.
  for (const char* k : {"negs", "revealed", "insightTries", "affinity", "affinityWeek"}) S.remove(k);
  S["settings"].as<JsonObject>().remove("affinity");
  for (JsonObject m : S["merchants"].as<JsonArray>()) m.remove("type");
  for (JsonObject i : S["items"].as<JsonArray>()) { i.remove("minAffinity"); i["hidden"] = i["hidden"].as<bool>(); }
  for (JsonObject p : S["players"].as<JsonArray>()) p.remove("advantage");
  for (JsonObject o : S["offers"].as<JsonArray>()) if (!strcmp(o["status"] | "", "accepted")) o["status"] = "new";
}

static bool loadFile(const char* path) {
  File f = LittleFS.open(path, "r");
  if (!f) return false;
  String raw = f.readString();
  f.close();
  JsonDocument tmp;
  if (deserializeJson(tmp, raw)) return false;
  S = tmp;
  return S["merchants"].is<JsonArray>();
}

void stateBegin() {
  mtx = xSemaphoreCreateRecursiveMutex();
  if (!LittleFS.begin(true)) Serial.println("LittleFS mount failed");
  // character sheets ship with the web files
  {
    File f = LittleFS.open("/www/chars.json", "r");
    if (!f || deserializeJson(CHARS, f)) Serial.println("WARNING: /www/chars.json missing or invalid (run sync-web + uploadfs)");
  }
  Lock l;
  bool ok = loadFile(DATA);
  if (!ok && LittleFS.exists(DATA)) {
    Serial.println("state: /data.json corrupt, moving to /data.bad");
    LittleFS.remove("/data.bad"); LittleFS.rename(DATA, "/data.bad");
  }
  if (!ok && LittleFS.exists(TMP) && loadFile(TMP)) { ok = true; Serial.println("state: recovered from /data.tmp"); }
  if (!ok) { seedWorld(); Serial.println("state: seeded"); }
  ensureShape();
  if (S["clock"].is<uint64_t>()) clockRestore(S["clock"].as<uint64_t>());
  Serial.printf("state: %u players, %u merchants, %u items, heap=%u\n", (unsigned)S["players"].size(), (unsigned)S["merchants"].size(), (unsigned)S["items"].size(), ESP.getFreeHeap());
}

void stateMarkDirty() { saveDue = true; saveAt = millis() + 1000; }
void stateRequestBroadcast() { bcastDue = true; }

namespace {
// Buffered Print so serializeJson does not write to flash one byte at a time.
struct BufOut : Print {
  File& f; uint8_t buf[1024]; size_t n = 0; bool ok = true;
  explicit BufOut(File& file) : f(file) {}
  size_t write(uint8_t c) override { if (n == sizeof buf) flush(); buf[n++] = c; return 1; }
  size_t write(const uint8_t* p, size_t len) override { for (size_t i = 0; i < len; i++) write(p[i]); return len; }
  void flush() override { if (n && f.write(buf, n) != n) ok = false; n = 0; }
};
}

static void doSave() {
  Lock l;
  S["clock"] = nowMs();
  File f = LittleFS.open(TMP, "w");
  if (!f) { Serial.println("save: cannot open tmp"); return; }
  BufOut out(f);
  serializeJson(S, out);
  out.flush();
  bool ok = out.ok && f.size() > 2;
  f.close();
  if (!ok) { Serial.println("save: write failed (flash full?)"); LittleFS.remove(TMP); return; }
  LittleFS.remove(DATA);
  LittleFS.rename(TMP, DATA);
}

void stateLoop() {
  if (saveDue && (int32_t)(millis() - saveAt) >= 0) { saveDue = false; doSave(); }
}

bool stateTakeBroadcast(uint32_t minGapMs) {
  if (!bcastDue) return false;
  if (millis() - lastBcast < minGapMs) return false;
  bcastDue = false; lastBcast = millis();
  return true;
}

// ---------- log / ledger ----------
void logLine(const String& text, const char* playerId) {
  JsonArray lg = S["log"].as<JsonArray>();
  JsonObject o = lg.add<JsonObject>();
  o["t"] = nowMs(); o["text"] = text;
  if (playerId) o["playerId"] = playerId; else o["playerId"] = nullptr;
  while (lg.size() > LOG_MAX) lg.remove(0);
}

void book(const char* kind, JsonObject p, const char* merchantId, const String& name, double amount, JsonVariantConst list) {
  JsonArray lg = S["ledger"].as<JsonArray>();
  JsonObject e = lg.add<JsonObject>();
  e["id"] = newId(); e["t"] = nowMs(); e["day"] = S["day"].as<int>(); e["week"] = S["week"].as<int>();
  e["kind"] = kind; e["playerId"] = p["id"].as<const char*>();
  if (merchantId) e["merchantId"] = merchantId; else e["merchantId"] = nullptr;
  e["name"] = name; e["amount"] = round2(amount);
  if (list.isNull()) e["list"] = nullptr; else e["list"] = list.as<double>();
  while (lg.size() > LEDGER_MAX) lg.remove(0);
}

// ---------- lookups ----------
JsonObject merchantOf(const char* id) { JsonObject o = findBy(S["merchants"], "id", id); if (o.isNull()) fail("No such merchant", 404); return o; }
JsonObject itemOf(const char* id) { JsonObject o = findBy(S["items"], "id", id); if (o.isNull()) fail("No such item", 404); return o; }
JsonObject playerOf(const char* id) { JsonObject o = findBy(S["players"], "id", id); if (o.isNull()) fail("No such player", 404); return o; }
JsonObject charOf(const char* id) { return findBy(CHARS.as<JsonArray>(), "id", id); }
String bkey(const char* pid, const char* mid) { return String(pid) + ":" + mid; }
bool isClosed(const char* pid, const char* mid) { JsonVariant v = S["bans"][bkey(pid, mid)]; return v.is<int>() && v.as<int>() == S["day"].as<int>(); }

