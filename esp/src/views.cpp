// Snapshots pushed over SSE. Field-for-field the same as app/server.js playerView()/dmView().
#include "views.h"
#include "config.h"
#include "../lib/engine/engine.h"
#include <vector>

// ArduinoJson's serializeJson(x, String&) CLEARS the string first, so appending needs a temporary.
static void jsonAppend(String& out, JsonVariantConst v) { String t; serializeJson(v, t); out += t; }

static void affViewTo(JsonObject o, const AffCfg& c, const char* pid, const char* mid) {
  int v = affOf(pid, mid), lv = affLevel(c, v);
  o["value"] = v; o["level"] = lv; o["name"] = LEVEL_NAMES[lv]; o["from"] = levelFrom(c, lv);
  if (lv < 4) { o["next"] = levelFrom(c, lv + 1); o["nextName"] = LEVEL_NAMES[lv + 1]; }
  else { o["next"] = nullptr; o["nextName"] = nullptr; }
}

static void offerViewTo(JsonObject dst, JsonObject o) {
  for (JsonPair kv : o) dst[kv.key().c_str()] = kv.value();
  JsonObject it = o["itemId"].isNull() ? JsonObject() : findBy(S["items"], "id", o["itemId"]);
  if (it.isNull()) dst["listPrice"] = nullptr; else dst["listPrice"] = it["price"].as<double>();
}

static const char* moodOf(int rep, int maxTypeRep) {
  if (rep <= 0) return "😡";
  double r = (double)rep / maxTypeRep;
  return r >= 0.75 ? "😊" : r >= 0.5 ? "😐" : "😠";
}

static void affJson(String& out, const AffCfg& c) {
  JsonDocument d;
  d["enabled"] = c.enabled; d["start"] = c.start; d["weeklyCap"] = c.weeklyCap;
  JsonArray th = d["thresholds"].to<JsonArray>(); for (int i = 0; i < 4; i++) th.add(c.thresholds[i]);
  JsonArray dc = d["dcMod"].to<JsonArray>(); for (int i = 0; i < 5; i++) dc.add(c.dcMod[i]);
  d["bonusRepFrom"] = c.bonusRepFrom;
  JsonObject g = d["gain"].to<JsonObject>();
  g["buy"] = c.gainBuy; g["offer"] = c.gainOffer; g["deal"] = c.gainDeal; g["ret"] = c.gainRet; g["angered"] = c.gainAngered;
  jsonAppend(out, d);
}

String playerViewJson(JsonObject p) {
  const char* pid = p["id"];
  AffCfg cfg = affCfg();
  JsonDocument V;
  V["role"] = "player"; V["day"] = S["day"].as<int>(); V["week"] = S["week"].as<int>(); V["dmOnline"] = dmOnline();
  JsonArray bids = V["bids"].to<JsonArray>();
  for (JsonObject o : S["offers"].as<JsonArray>()) if (!strcmp(o["playerId"] | "", pid)) offerViewTo(bids.add<JsonObject>(), o);

  JsonArray led = V["ledger"].to<JsonArray>();
  {
    std::vector<JsonObject> mine;
    for (JsonObject e : S["ledger"].as<JsonArray>()) if (!strcmp(e["playerId"] | "", pid)) mine.push_back(e);
    size_t from = mine.size() > 40 ? mine.size() - 40 : 0;
    for (size_t i = from; i < mine.size(); i++) led.add<JsonObject>().set(mine[i]);
  }

  JsonObject me = V["me"].to<JsonObject>();
  me["id"] = pid; me["name"] = p["name"].as<const char*>(); me["charId"] = p["charId"].as<const char*>();
  me["gold"] = p["gold"].as<double>(); me["advantage"] = p["advantage"].as<bool>();
  JsonArray inv = me["inventory"].to<JsonArray>();
  for (JsonObject x : p["inventory"].as<JsonArray>()) {
    JsonObject o = inv.add<JsonObject>();
    for (JsonPair kv : x) o[kv.key().c_str()] = kv.value();
    JsonObject it = x["itemId"].isNull() ? JsonObject() : findBy(S["items"], "id", x["itemId"]);
    const char* img = it.isNull() ? "" : (it["image"] | ""), *th = it.isNull() ? "" : (it["thumb"] | "");
    if (*img) o["image"] = img; else o["image"] = nullptr;
    if (*th) o["thumb"] = th; else o["thumb"] = nullptr;
  }

  JsonArray ms = V["merchants"].to<JsonArray>();
  for (JsonObject m : S["merchants"].as<JsonArray>()) {
    const char* mid = m["id"];
    JsonObject o = ms.add<JsonObject>();
    o["id"] = mid; o["name"] = m["name"].as<const char*>(); o["emoji"] = m["emoji"].as<const char*>();
    const char* por = m["portrait"] | "";
    if (*por) o["portrait"] = por; else o["portrait"] = nullptr;
    o["banned"] = isBanned(pid, mid);
    String key = bkey(pid, mid);
    if (!S["revealed"][key].isNull() && S["revealed"][key].as<bool>()) o["revealed"] = eng::typeOf(m["type"].as<const char*>())->name; else o["revealed"] = nullptr;
    JsonVariant tried = S["insightTries"][key + ":" + String(S["day"].as<int>())];
    if (tried.is<const char*>()) o["insightTried"] = tried.as<const char*>(); else o["insightTried"] = nullptr;
    if (cfg.enabled) affViewTo(o["affinity"].to<JsonObject>(), cfg, pid, mid); else o["affinity"] = nullptr;
    JsonArray items = o["items"].to<JsonArray>();
    int have = affOf(pid, mid);
    for (JsonObject i : S["items"].as<JsonArray>()) {
      if (strcmp(i["merchantId"] | "", mid)) continue;
      JsonObject r = items.add<JsonObject>();
      int need = i["minAffinity"] | 0;
      r["id"] = i["id"].as<const char*>();
      if (cfg.enabled && need > have) {
        r["locked"] = true; r["need"] = need; r["needName"] = LEVEL_NAMES[affLevel(cfg, need)];
      } else {
        r["name"] = i["name"].as<const char*>(); r["price"] = i["price"].as<double>(); r["magical"] = i["magical"].as<bool>();
        if (i["stock"].isNull()) r["stock"] = nullptr; else r["stock"] = i["stock"].as<int>();
        r["minAffinity"] = need;
        const char* im = i["image"] | ""; if (*im) r["image"] = im; else r["image"] = nullptr;
        const char* tb = i["thumb"] | ""; if (*tb) r["thumb"] = tb; else r["thumb"] = nullptr;
        r["desc"] = i["desc"] | "";
        const char* ty = i["type"] | ""; if (*ty) r["type"] = ty; else r["type"] = nullptr;
        r["rarity"] = i["rarity"] | "none";
      }
    }
  }

  JsonObject negs = V["negs"].to<JsonObject>();
  for (JsonObject i : S["items"].as<JsonArray>()) {
    JsonObject n = S["negs"][nkey(pid, i["id"])];
    if (n.isNull()) continue;
    JsonObject m = merchantOf(i["merchantId"]);
    JsonObject r = negs[i["id"].as<const char*>()].to<JsonObject>();
    r["status"] = n["status"].as<const char*>(); r["price"] = n["price"].as<double>();
    if (n["lastY"].isNull()) r["lastY"] = nullptr; else r["lastY"] = n["lastY"].as<double>();
    r["rep"] = n["rep"].as<int>(); r["maxRep"] = n["maxRep"].as<int>();
    r["mood"] = moodOf(n["rep"].as<int>(), eng::typeOf(m["type"].as<const char*>())->rep);
    if (n["line"].isNull()) r["line"] = nullptr; else r["line"] = n["line"].as<const char*>();
    JsonArray h = r["history"].to<JsonArray>();
    JsonArray src = n["history"].as<JsonArray>();
    size_t from = src.size() > 3 ? src.size() - 3 : 0;
    for (size_t k = from; k < src.size(); k++) {
      JsonObject e = src[k], d = h.add<JsonObject>();
      d["y"] = e["y"].as<double>(); d["approach"] = e["approach"].as<const char*>();
      d["rolls"].set(e["rolls"]);
      d["roll"].set(e["roll"]); d["bonus"] = e["bonus"].as<int>(); d["total"].set(e["total"]); d["outcome"] = e["outcome"].as<const char*>();
    }
  }
  String out; out.reserve(8192);
  serializeJson(V, out);
  return out;
}

String dmViewJson() {
  AffCfg cfg = affCfg();
  String out; out.reserve(16384);
  out += "{\"role\":\"dm\",\"day\":"; out += S["day"].as<int>();
  out += ",\"week\":"; out += S["week"].as<int>();

  {   // bids
    JsonDocument d; JsonArray a = d.to<JsonArray>();
    for (JsonObject o : S["offers"].as<JsonArray>()) offerViewTo(a.add<JsonObject>(), o);
    out += ",\"bids\":"; jsonAppend(out, d);
  }
  {   // last 150 ledger entries, written straight from S
    JsonArray l = S["ledger"].as<JsonArray>();
    size_t from = l.size() > 150 ? l.size() - 150 : 0;
    out += ",\"ledger\":[";
    for (size_t i = from; i < l.size(); i++) { if (i > from) out += ','; jsonAppend(out, l[i]); }
    out += ']';
  }
  {   // affinity matrix
    JsonDocument d; JsonArray a = d.to<JsonArray>();
    for (JsonObject p : S["players"].as<JsonArray>()) for (JsonObject m : S["merchants"].as<JsonArray>()) {
      JsonObject o = a.add<JsonObject>();
      o["playerId"] = p["id"].as<const char*>(); o["merchantId"] = m["id"].as<const char*>();
      affViewTo(o, cfg, p["id"], m["id"]);
    }
    out += ",\"affinity\":"; jsonAppend(out, d);
  }
  out += ",\"settings\":{\"affinity\":"; affJson(out, cfg);
  out += ",\"defaults\":"; affJson(out, AffCfg{true, 20, 10, {20, 40, 60, 80}, {0, 0, -1, -2, -3}, 3, 2, 5, 1, -1, -5});
  out += ",\"levelNames\":[\"Stranger\",\"Acquaintance\",\"Customer\",\"Friend\",\"Confidant\"]}";
  {
    out += ",\"chars\":[";
    bool first = true;
    for (JsonObject c : CHARS.as<JsonArray>()) { if (!first) out += ','; first = false; out += '"'; out += c["id"].as<const char*>(); out += '"'; }
    out += ']';
  }
  out += ",\"merchants\":"; jsonAppend(out, S["merchants"]);
  out += ",\"items\":"; jsonAppend(out, S["items"]);
  {
    JsonArray l = S["log"].as<JsonArray>();
    size_t from = l.size() > 40 ? l.size() - 40 : 0;
    out += ",\"log\":[";
    for (size_t i = from; i < l.size(); i++) { if (i > from) out += ','; jsonAppend(out, l[i]); }
    out += ']';
  }
  {   // players without their tokens
    out += ",\"players\":[";
    bool first = true;
    for (JsonObject p : S["players"].as<JsonArray>()) {
      if (!first) out += ','; first = false;
      JsonDocument d; JsonObject o = d.to<JsonObject>();
      o["id"] = p["id"].as<const char*>(); o["name"] = p["name"].as<const char*>(); o["charId"] = p["charId"].as<const char*>();
      o["gold"] = p["gold"].as<double>(); o["advantage"] = p["advantage"].as<bool>();
      o["inventory"].set(p["inventory"]);
      jsonAppend(out, d);
    }
    out += ']';
  }
  {   // active negotiations
    JsonDocument d; JsonArray a = d.to<JsonArray>();
    for (JsonPair kv : S["negs"].as<JsonObject>()) {
      String k = kv.key().c_str();
      int c = k.indexOf(':');
      if (c < 0) continue;
      String pid = k.substring(0, c), iid = k.substring(c + 1);
      JsonObject n = kv.value(), it = findBy(S["items"], "id", iid.c_str());
      JsonObject o = a.add<JsonObject>();
      o["playerId"] = pid; o["itemId"] = iid; o["rep"] = n["rep"].as<int>(); o["maxRep"] = n["maxRep"].as<int>();
      o["status"] = n["status"].as<const char*>(); o["price"] = n["price"].as<double>();
      if (n["line"].isNull()) o["line"] = nullptr; else o["line"] = n["line"].as<const char*>();
      JsonArray h = n["history"].as<JsonArray>();
      if (h.size()) o["last"].set(h[h.size() - 1]); else o["last"] = nullptr;
      if (!it.isNull()) o["item"] = it["name"].as<const char*>();
    }
    out += ",\"negs\":"; jsonAppend(out, d);
  }
  out += '}';
  return out;
}
