// Snapshots pushed over SSE. Field-for-field the same as app/server.js playerView()/dmView().
#include "views.h"
#include "config.h"
#include <vector>

// ArduinoJson's serializeJson(x, String&) CLEARS the string first, so appending needs a temporary.
static void jsonAppend(String& out, JsonVariantConst v) { String t; serializeJson(v, t); out += t; }

static void offerViewTo(JsonObject dst, JsonObject o) {
  for (JsonPair kv : o) dst[kv.key().c_str()] = kv.value();
  JsonObject it = o["itemId"].isNull() ? JsonObject() : findBy(S["items"], "id", o["itemId"]);
  if (it.isNull()) dst["listPrice"] = nullptr; else dst["listPrice"] = it["price"].as<double>();
}

String playerViewJson(JsonObject p) {
  const char* pid = p["id"];
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
  me["gold"] = p["gold"].as<double>();
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
    o["closed"] = isClosed(pid, mid);
    JsonArray items = o["items"].to<JsonArray>();
    for (JsonObject i : S["items"].as<JsonArray>()) {
      if (strcmp(i["merchantId"] | "", mid) || i["hidden"].as<bool>()) continue;
      JsonObject r = items.add<JsonObject>();
      r["id"] = i["id"].as<const char*>();
      r["name"] = i["name"].as<const char*>(); r["price"] = i["price"].as<double>(); r["magical"] = i["magical"].as<bool>();
      if (i["stock"].isNull()) r["stock"] = nullptr; else r["stock"] = i["stock"].as<int>();
      const char* im = i["image"] | ""; if (*im) r["image"] = im; else r["image"] = nullptr;
      const char* tb = i["thumb"] | ""; if (*tb) r["thumb"] = tb; else r["thumb"] = nullptr;
      r["desc"] = i["desc"] | "";
      const char* ty = i["type"] | ""; if (*ty) r["type"] = ty; else r["type"] = nullptr;
      r["rarity"] = i["rarity"] | "none";
    }
  }
  String out; out.reserve(8192);
  serializeJson(V, out);
  return out;
}

String dmViewJson() {
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
      o["gold"] = p["gold"].as<double>();
      o["inventory"].set(p["inventory"]);
      jsonAppend(out, d);
    }
    out += ']';
  }
  {   // merchants the DM closed to a player today
    JsonDocument d; JsonArray a = d.to<JsonArray>();
    int day = S["day"].as<int>();
    for (JsonPair kv : S["bans"].as<JsonObject>()) {
      if (!kv.value().is<int>() || kv.value().as<int>() != day) continue;
      String k = kv.key().c_str();
      int c = k.indexOf(':');
      if (c < 0) continue;
      JsonObject o = a.add<JsonObject>();
      o["playerId"] = k.substring(0, c); o["merchantId"] = k.substring(c + 1);
    }
    out += ",\"closed\":"; jsonAppend(out, d);
  }
  out += '}';
  return out;
}
