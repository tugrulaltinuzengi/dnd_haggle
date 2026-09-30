// HTTP layer: same routes, status codes and messages as app/server.js.
#include "http.h"
#include "actions.h"
#include "views.h"
#include "media.h"
#include "config.h"
#include "relay.h"
#include <LittleFS.h>
#include <vector>

// ---------- SSE: one AsyncEventSource per audience ("dm" or a player id) so every audience gets its own snapshot ----------
namespace {
struct Slot {
  AsyncEventSource* es = nullptr;
  String who;            // "dm" or player id
  bool used = false;
};
Slot slots[MAX_SSE];

size_t sseCount() { size_t n = 0; for (auto& s : slots) if (s.used && s.es) n += s.es->count(); return n; }

String viewFor(const String& who) {
  Lock l;
  if (who == "dm") return dmViewJson();
  JsonObject p = findBy(S["players"], "id", who.c_str());
  if (p.isNull()) return "";
  return playerViewJson(p);
}

Slot* slotFor(const String& who) {
  for (auto& s : slots) if (s.used && s.who == who) return &s;
  for (auto& s : slots) if (!s.used) {
    s.used = true; s.who = who;
    if (!s.es) {
      s.es = new AsyncEventSource("/api/events");
      Slot* sp = &s;
      s.es->onConnect([sp](AsyncEventSourceClient* c) {
        String v = viewFor(sp->who);
        if (v.length()) c->send(v.c_str());
        stateRequestBroadcast();     // dmOnline may have changed for everyone else
      });
      s.es->onDisconnect([](AsyncEventSourceClient*) { stateRequestBroadcast(); });
    }
    return &s;
  }
  // all slots taken: reuse one that no longer has clients
  for (auto& s : slots) if (s.es && s.es->count() == 0) { s.who = who; return &s; }
  return nullptr;
}
}

bool dmOnline() {
  if (relayDmOnline()) return true;
  for (auto& s : slots) if (s.used && s.who == "dm" && s.es && s.es->count() > 0) return true;
  return false;
}

void sseCloseDmExcept(const String&) {
  // All DM tabs share one stream; the browser reconnects with its (still valid) token.
  for (auto& s : slots) if (s.used && s.who == "dm" && s.es) s.es->close();
  relayCloseDm();
}

bool sseResolve(const char* token, String& who) {
  Lock l;
  Auth a = authOf(token);
  if (a.role == Auth::NONE) return false;
  who = a.role == Auth::DM ? String("dm") : String(a.player["id"].as<const char*>());
  return true;
}

String sseView(const String& who) { return viewFor(who); }

void httpLoop() {
  static uint32_t beat = 0;
  if (millis() - beat > 25000) { beat = millis(); stateRequestBroadcast(); }   // keeps proxies and phones from dropping idle streams
  if (!stateTakeBroadcast(150)) return;
  relayNotify();
  for (auto& s : slots) {
    if (!s.used || !s.es || s.es->count() == 0) continue;
    String v = viewFor(s.who);
    if (!v.length()) { s.es->close(); continue; }      // player was deleted
    s.es->send(v.c_str());
  }
}

// ---------- helpers ----------
namespace {
struct Body {          // stored in request->_tempObject (freed by the library with free()); JSON bytes follow the header
  int state;           // 0 collecting, 1 media upload opened, 2 response already sent
  size_t len;
};
}

static void sendJson(AsyncWebServerRequest* r, int code, const String& json) {
  AsyncWebServerResponse* res = r->beginResponse(code, "application/json; charset=utf-8", json);
  res->addHeader("Cache-Control", "no-store");
  r->send(res);
}
static void sendErr(AsyncWebServerRequest* r, int code, const char* msg) {
  JsonDocument d; d["error"] = msg; String s; serializeJson(d, s);
  sendJson(r, code, s);
}

static void changed() { stateMarkDirty(); stateRequestBroadcast(); }

static const char* mimeOf(const String& p) {
  if (p.endsWith(".html")) return "text/html; charset=utf-8";
  if (p.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (p.endsWith(".css")) return "text/css; charset=utf-8";
  if (p.endsWith(".json")) return "application/json; charset=utf-8";
  if (p.endsWith(".svg")) return "image/svg+xml";
  if (p.endsWith(".webmanifest")) return "application/manifest+json";
  if (p.endsWith(".png")) return "image/png";
  if (p.endsWith(".apk")) return "application/vnd.android.package-archive";
  return "application/octet-stream";
}

static String hdr(AsyncWebServerRequest* r, const char* name) { return r->hasHeader(name) ? r->header(name) : String(); }

// ---------- static files ----------
static void serveStatic(AsyncWebServerRequest* r) {
  String path = r->url();
  if (path == "/") path = "/index.html";
  String fs = "/www" + path;
  if (path.indexOf("..") >= 0 || !LittleFS.exists(fs)) {
    // Unknown page: hand out the app, so captive-portal probes (/generate_204, /hotspot-detect.html, ...) open pazar.
    fs = "/www/index.html"; path = "/index.html";
    if (!LittleFS.exists(fs)) { r->send(200, "text/html; charset=utf-8", "<h1>pazar</h1><p>Web files are not uploaded yet (uploadfs).</p>"); return; }
  }
  AsyncWebServerResponse* res = r->beginResponse(LittleFS, fs, mimeOf(path));
  res->addHeader("Cache-Control", "no-cache");
  if (path.endsWith(".apk")) res->addHeader("Content-Disposition", "attachment; filename=\"pazar.apk\"");
  r->send(res);
}

// ---------- csv ----------
static String num(double v) {
  char b[40]; snprintf(b, sizeof b, "%.2f", v);
  size_t n = strlen(b);
  while (n && b[n - 1] == '0') b[--n] = 0;
  if (n && b[n - 1] == '.') b[--n] = 0;
  return String(b);
}
static String q(const String& v) { String s = v; s.replace("\"", "\"\""); return "\"" + s + "\""; }
static String ledgerCsv() {
  String out = "\xEF\xBB\xBF" "time,week,day,kind,player,merchant,item,amount,list";
  for (JsonObject e : S["ledger"].as<JsonArray>()) {
    JsonObject p = findBy(S["players"], "id", e["playerId"] | ""), m = e["merchantId"].isNull() ? JsonObject() : findBy(S["merchants"], "id", e["merchantId"]);
    out += '\n';
    out += q(isoTime(e["t"].as<uint64_t>())) + ',' + q(String(e["week"].as<int>())) + ',' + q(String(e["day"].as<int>())) + ',' + q(e["kind"].as<const char*>()) + ',';
    out += q(p.isNull() ? String(e["playerId"] | "") : String(p["name"].as<const char*>())) + ',' + q(m.isNull() ? String("") : String(m["name"].as<const char*>())) + ',';
    out += q(e["name"] | "") + ',' + q(num(e["amount"].as<double>())) + ',' + q(e["list"].isNull() ? String("") : num(e["list"].as<double>()));
  }
  return out;
}

// ---------- JSON actions ----------
static void handleAction(AsyncWebServerRequest* r, const String& name, const uint8_t* data, size_t len) {
  JsonDocument bdoc;
  if (len) { if (deserializeJson(bdoc, data, len)) { sendErr(r, 400, "Invalid JSON"); return; } }
  JsonObject b = bdoc.as<JsonObject>();
  if (b.isNull()) b = bdoc.to<JsonObject>();
  try {
    Lock l;
    if (name == "join") {
      String nm = textOf(b["name"], 16);
      JsonObject ch = charOf(b["charId"] | "");
      if (ch.isNull()) fail("Choose a character.");
      JsonObject p;
      String low = nm; low.toLowerCase();
      for (JsonObject x : S["players"].as<JsonArray>()) { String n2 = x["name"].as<const char*>(); n2.toLowerCase(); if (n2 == low) { p = x; break; } }
      if (p.isNull()) {
        if (S["players"].size() >= MAX_PLAYERS) fail("The table is full (at most 8 players).");
        p = S["players"].as<JsonArray>().add<JsonObject>();
        p["id"] = newId(); p["token"] = newToken(); p["name"] = nm; p["charId"] = ch["id"].as<const char*>();
        p["gold"] = ch["gold"].as<double>(); p["inventory"].to<JsonArray>();
        logLine(nm + " entered the market (" + ch["name"].as<const char*>() + ")", p["id"]);
      }
      changed();
      JsonDocument o; o["token"] = p["token"].as<const char*>(); o["role"] = "player";
      String s; serializeJson(o, s); sendJson(r, 200, s);
      return;
    }
    if (name == "dm/login") {
      uint32_t ip = r->client()->remoteIP();
      if (ip == 0x0100007F && r->hasHeader("x-client-ip")) {   // 127.0.0.1: request relayed by relay.cpp, which carries the real client address
        uint32_t h = 2166136261u; String c = r->header("x-client-ip");
        for (size_t i = 0; i < c.length(); i++) { h ^= (uint8_t)c[i]; h *= 16777619u; }
        ip = h;
      }
      if (pinLocked(ip)) fail("Too many attempts. Wait a while.", 429);
      if (!checkDmPass(strOf(b["pin"]))) { pinFailed(ip); fail("Wrong PIN", 403); }
      pinOk(ip);
      String t = newToken();
      JsonArray dm = S["dm"].as<JsonArray>(); dm.add(t);
      while (dm.size() > 10) dm.remove(0);
      stateMarkDirty();
      JsonDocument o; o["token"] = t; o["role"] = "dm";
      String s; serializeJson(o, s); sendJson(r, 200, s);
      return;
    }
    Auth a = authOf(hdr(r, "x-token").c_str());
    if (a.role == Auth::NONE) fail("Login required", 401);
    JsonDocument outDoc; JsonObject out = outDoc.to<JsonObject>();
    if (name.startsWith("dm/")) {
      if (a.role != Auth::DM) fail("DM only", 403);
      runDm(name.substring(3), b, a, out);
    } else {
      if (a.role != Auth::PLAYER) fail("Player only", 403);
      runPlayer(name, a.player, b);
    }
    changed();
    JsonDocument res; res["ok"] = true;
    for (JsonPair kv : out) res[kv.key().c_str()] = kv.value();
    String s; serializeJson(res, s); sendJson(r, 200, s);
  } catch (const HttpError& e) {
    sendErr(r, e.code, e.what());
  } catch (const std::runtime_error& e) {
    { Serial.printf("500: %s\n", e.what()); sendErr(r, 500, "Server error"); }
  }
}

// ---------- request dispatch ----------
static void handleAll(AsyncWebServerRequest* r) {
  if (r->hasHeader("x-now")) clockSync(strtoull(r->header("x-now").c_str(), nullptr, 10));   // the board has no RTC; browsers tell it the time
  Body* bd = (Body*)r->_tempObject;
  if (bd && bd->state == 2) return;                // an earlier stage already answered (413, 403, ...)
  String url = r->url();
  bool get = r->method() == HTTP_GET, post = r->method() == HTTP_POST;

  if (url.startsWith("/api/")) {
    String name = url.substring(5);
    if (get && name == "events") {
      const AsyncWebParameter* tp = r->getParam("token");
      Auth a;
      { Lock l; a = authOf(tp ? tp->value().c_str() : ""); }
      if (a.role == Auth::NONE) { sendErr(r, 401, "Login required"); return; }
      if (sseCount() + relaySseCount() >= MAX_SSE || ESP.getFreeHeap() < MIN_FREE_HEAP) { sendErr(r, 503, "At capacity, try again"); return; }
      Slot* s = slotFor(a.role == Auth::DM ? String("dm") : String(a.player["id"].as<const char*>()));
      if (!s) { sendErr(r, 503, "At capacity, try again"); return; }
      r->send(new AsyncEventSourceResponse(s->es));
      return;
    }
    if (get && name == "ping") {
      char b[200]; snprintf(b, sizeof b, "{\"ok\":true,\"version\":\"%s\",\"heap\":%u,\"minHeap\":%u,\"sse\":%u,\"relay\":%s}", PAZAR_VERSION, ESP.getFreeHeap(), ESP.getMinFreeHeap(), (unsigned)(sseCount() + relaySseCount()), relayConnected() ? "true" : "false");
      sendJson(r, 200, b); return;
    }
    if (get && name == "limits") { sendJson(r, 200, "{\"item\":122880,\"thumb\":61440,\"portrait\":122880}"); return; }
    if (get && name == "chars") {
      if (!LittleFS.exists("/www/chars.json")) { sendErr(r, 500, "Server error"); return; }
      r->send(LittleFS, "/www/chars.json", "application/json; charset=utf-8"); return;
    }
    if (get && (name == "address" || name == "ledger.csv")) {
      Auth a; { Lock l; a = authOf(hdr(r, "x-token").c_str()); }
      if (a.role != Auth::DM) { sendErr(r, 403, "DM only"); return; }
      if (name == "address") { sendJson(r, 200, "{\"url\":\"http://192.168.4.1\"}"); return; }
      String csv; { Lock l; csv = ledgerCsv(); }
      AsyncWebServerResponse* res = r->beginResponse(200, "text/csv; charset=utf-8", csv);
      res->addHeader("Content-Disposition", "attachment; filename=\"ledger.csv\"");
      r->send(res); return;
    }
    if (post && name == "media") {
      try {
        Auth a; { Lock l; a = authOf(hdr(r, "x-token").c_str()); }
        if (a.role != Auth::DM) { sendErr(r, 403, "DM only"); return; }
        Lock l;
        auto prm = [&](const char* k) -> const char* { const AsyncWebParameter* p = r->getParam(k); return p ? p->value().c_str() : nullptr; };
        MediaJob j = mediaPrecheck(prm("kind"), prm("id"), prm("variant"));
        if (!bd || bd->state != 1) fail("Empty file");     // no body arrived, so nothing was opened
        String reply = mediaFinish(j);
        changed();
        sendJson(r, 200, reply);
      } catch (const HttpError& e) { mediaAbort(); sendErr(r, e.code, e.what()); }
      return;
    }
    if (!post) { sendErr(r, 404, "Not found"); return; }
    handleAction(r, name, bd ? (const uint8_t*)(bd + 1) : nullptr, bd ? bd->len : 0);
    return;
  }

  if (get && url.startsWith("/media/")) {
    String p = mediaPathOf(url);
    if (!p.length() || !LittleFS.exists(p)) { r->send(404, "text/plain", "Not found"); return; }
    AsyncWebServerResponse* res = r->beginResponse(LittleFS, p, mediaMime(p));
    res->addHeader("Cache-Control", "public, max-age=31536000, immutable");
    res->addHeader("X-Content-Type-Options", "nosniff");
    r->send(res); return;
  }
  serveStatic(r);
}

// Body chunks: JSON bodies are collected (max BODY_MAX); /api/media streams to flash.
static void handleBody(AsyncWebServerRequest* r, uint8_t* data, size_t len, size_t index, size_t total) {
  String url = r->url();
  if (index == 0) {
    bool isMedia = url == "/api/media";
    size_t keep = isMedia ? 0 : total;
    if (!isMedia && total > BODY_MAX) {
      Body* b = (Body*)calloc(1, sizeof(Body)); b->state = 2; r->_tempObject = b;
      sendErr(r, 413, "Too large"); return;
    }
    Body* b = (Body*)calloc(1, sizeof(Body) + keep + 1);
    if (!b) { sendErr(r, 503, "At capacity, try again"); return; }
    r->_tempObject = b;
    if (isMedia) {
      try {
        Auth a; { Lock l; a = authOf(hdr(r, "x-token").c_str()); }
        if (a.role != Auth::DM) fail("DM only", 403);
        auto prm = [&](const char* k) -> const char* { const AsyncWebParameter* p = r->getParam(k); return p ? p->value().c_str() : nullptr; };
        Lock l;
        MediaJob j = mediaPrecheck(prm("kind"), prm("id"), prm("variant"));
        if (total > j.cap) fail("File too large", 413);
        if (ESP.getFreeHeap() < MIN_FREE_HEAP || !mediaOpen()) fail("Busy, try again", 503);
        b->state = 1;
      } catch (const HttpError& e) { b->state = 2; sendErr(r, e.code, e.what()); return; }
    }
  }
  Body* b = (Body*)r->_tempObject;
  if (!b || b->state == 2) return;
  if (url == "/api/media") { mediaWrite(data, len); return; }
  memcpy((uint8_t*)(b + 1) + index, data, len);
  b->len = index + len;
}

void httpBegin(AsyncWebServer& server) {
  mediaBegin();
  server.onRequestBody(handleBody);
  server.onNotFound(handleAll);
}
