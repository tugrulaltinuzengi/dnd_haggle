// Relay client. Frames are JSON text over one WebSocket (see relay/src/hub-core.js):
//   Worker -> ESP: req {id,method,path,headers,len} | body {id,data} | bend {id} | abort {id}
//   ESP -> Worker: open {id,status,headers} | chunk {id,data} | end {id} | err {id,message}
// Each request is served by opening a loopback socket to our own AsyncWebServer (HTTP/1.0, so no chunked encoding and the
// server closes the socket at the end), which reuses every route, limit and auth check unchanged.
#include "relay.h"
#include "config.h"
#include "http.h"
#include "state.h"
#include <WiFi.h>
#include <WiFiClient.h>
#include <WebSocketsClient.h>
#include <ArduinoJson.h>
#include <mbedtls/base64.h>
#include <time.h>
#include "relay_ca.h"

#ifndef RELAY_HOST
#define RELAY_HOST ""
#endif
#ifndef RELAY_KEY
#define RELAY_KEY ""
#endif
#ifndef RELAY_PORT
#define RELAY_PORT 443
#endif
#ifndef RELAY_TLS
#define RELAY_TLS 1
#endif

namespace {
constexpr int MAX_JOBS = 3;
constexpr size_t READ_CHUNK = 1024;
constexpr uint32_t IDLE_MS = 15000, IDLE_SSE_MS = 70000;

struct Job {
  bool used = false, sse = false, headDone = false;
  String id, head;
  long clen = -1, sent = 0;
  uint32_t last = 0;
  WiFiClient c;
};
Job jobs[MAX_JOBS];
WebSocketsClient ws;
String wsPath;
bool started = false, connected = false;

String b64(const uint8_t* p, size_t n) {
  size_t cap = 4 * ((n + 2) / 3) + 4, olen = 0;
  String out; out.reserve(cap);
  uint8_t tmp[1400];
  if (cap > sizeof tmp) return out;
  mbedtls_base64_encode(tmp, sizeof tmp, &olen, p, n);
  tmp[olen] = 0;
  out = (const char*)tmp;
  return out;
}

void sendFrame(const String& f) { ws.sendTXT(f.c_str(), f.length()); }
void sendEnd(const String& id) { sendFrame("{\"t\":\"end\",\"id\":\"" + id + "\"}"); }
void sendErr(const String& id, const char* msg) { sendFrame("{\"t\":\"err\",\"id\":\"" + id + "\",\"message\":\"" + msg + "\"}"); }
void sendChunk(const String& id, const uint8_t* p, size_t n) {
  while (n) {
    size_t k = n > 1000 ? 1000 : n;     // b64() works in a 1400-char buffer
    String f; f.reserve(k * 4 / 3 + 48);
    f = "{\"t\":\"chunk\",\"id\":\"" + id + "\",\"data\":\"" + b64(p, k) + "\"}";
    sendFrame(f);
    p += k; n -= k;
  }
}

// ---- relayed SSE: one entry per remote EventSource, fed from sseView() ----
constexpr int MAX_STREAMS = 12;
// Cloudflare does not tell us when a viewer leaves, so a stream lives at most this long and is then ended from here; the browser reconnects on its own
// (a few hundred ms, and the first event of the new stream is a full snapshot). A viewer that left is therefore freed within this time.
constexpr uint32_t STREAM_MAX_MS = 30000, DM_GRACE_MS = 8000;
struct Stream { bool used = false; String id, who; uint32_t born = 0; };
Stream streams[MAX_STREAMS];
volatile size_t streamCount = 0, dmStreamCount = 0;
volatile uint32_t dmGoneAt = 0;   // when the last DM stream ended; the DM counts as online a little longer so the renewal above does not flicker
volatile bool wantBroadcast = false, wantCloseDm = false;

void recount() {
  size_t n = 0, d = 0;
  for (auto& s : streams) if (s.used) { n++; if (s.who == "dm") d++; }
  if (dmStreamCount && !d) dmGoneAt = millis() ? millis() : 1;
  streamCount = n; dmStreamCount = d;
}
void sendEvent(const String& id, const String& json) {
  String m; m.reserve(json.length() + 8);
  m = "data: "; m += json; m += "\n\n";
  sendChunk(id, (const uint8_t*)m.c_str(), m.length());
}
void closeStream(Stream& s) { sendEnd(s.id); s.used = false; s.id = ""; s.who = ""; recount(); }
void dropStreams() { for (auto& s : streams) { s.used = false; s.id = ""; s.who = ""; } recount(); }
Stream* streamById(const char* id) { for (auto& s : streams) if (s.used && s.id == id) return &s; return nullptr; }

void sendSimple(const String& id, int status, const char* body) {
  JsonDocument d; d["t"] = "open"; d["id"] = id; d["status"] = status;
  d["headers"]["content-type"] = "application/json; charset=utf-8"; d["headers"]["cache-control"] = "no-store";
  String f; serializeJson(d, f); sendFrame(f);
  sendChunk(id, (const uint8_t*)body, strlen(body));
  sendEnd(id);
}

// Returns true when the request was an SSE subscription and has been answered here.
bool tryStream(const String& id, const String& path) {
  if (!path.startsWith("/api/events")) return false;
  int q = path.indexOf("token=");
  String tok = q < 0 ? String("") : path.substring(q + 6);
  int amp = tok.indexOf('&'); if (amp >= 0) tok = tok.substring(0, amp);
  String who;
  if (!tok.length() || !sseResolve(tok.c_str(), who)) { sendSimple(id, 401, "{\"error\":\"Login required\"}"); return true; }
  if (ESP.getFreeHeap() < MIN_FREE_HEAP) { sendSimple(id, 503, "{\"error\":\"At capacity, try again\"}"); return true; }
  // at most 3 streams per audience and MAX_STREAMS in total: evict the oldest (most likely a viewer that already left)
  int same = 0; Stream* oldest = nullptr; Stream* oldestSame = nullptr; Stream* freeSlot = nullptr;
  for (auto& s : streams) {
    if (!s.used) { if (!freeSlot) freeSlot = &s; continue; }
    if (!oldest || s.born < oldest->born) oldest = &s;
    if (s.who == who) { same++; if (!oldestSame || s.born < oldestSame->born) oldestSame = &s; }
  }
  if (same >= 3) { closeStream(*oldestSame); freeSlot = oldestSame; }
  else if (!freeSlot) { closeStream(*oldest); freeSlot = oldest; }
  freeSlot->used = true; freeSlot->id = id; freeSlot->who = who; freeSlot->born = millis(); recount();
  JsonDocument d; d["t"] = "open"; d["id"] = id; d["status"] = 200;
  d["headers"]["content-type"] = "text/event-stream"; d["headers"]["cache-control"] = "no-cache";
  String f; serializeJson(d, f); sendFrame(f);
  static const uint8_t RETRY[] = "retry: 500\n\n";
  sendChunk(id, RETRY, sizeof RETRY - 1);
  String v = sseView(who);
  if (v.length()) sendEvent(id, v);
  stateRequestBroadcast();       // dmOnline may have changed for everyone else
  return true;
}

void broadcastStreams() {
  for (auto& s : streams) {
    if (!s.used) continue;
    String v = sseView(s.who);
    if (!v.length() || millis() - s.born > STREAM_MAX_MS) { closeStream(s); continue; }   // player deleted, or the stream is old enough to renew
    sendEvent(s.id, v);
  }
}

void freeJob(Job& j) { j.c.stop(); j.used = false; j.head = ""; j.id = ""; }
void freeAll() { for (auto& j : jobs) if (j.used) freeJob(j); }
Job* jobById(const char* id) { for (auto& j : jobs) if (j.used && j.id == id) return &j; return nullptr; }

bool cleanToken(const String& s) { for (size_t i = 0; i < s.length(); i++) { char c = s[i]; if (c == '\r' || c == '\n') return false; } return true; }

void startJob(JsonDocument& d) {
  String id = d["id"] | "";
  const char* method = d["method"] | "GET";
  String path = d["path"] | "/";
  if (!strcmp(method, "GET") && id.length() && tryStream(id, path)) return;
  if (!id.length() || path.length() < 1 || path[0] != '/' || path.indexOf(' ') >= 0 || !cleanToken(path) || (strcmp(method, "GET") && strcmp(method, "POST"))) { sendErr(id, "Bad request"); return; }
  Job* j = nullptr;
  for (auto& x : jobs) if (!x.used) { j = &x; break; }
  if (!j) { sendErr(id, "Busy, try again"); return; }
  j->c.stop();
  if (!j->c.connect(IPAddress(127, 0, 0, 1), 80, 1500)) { sendErr(id, "The table is busy"); return; }
  j->used = true; j->id = id; j->head = ""; j->headDone = false; j->clen = -1; j->sent = 0; j->last = millis();
  j->sse = path.startsWith("/api/events");
  String req = String(method) + " " + path + " HTTP/1.0\r\nHost: localhost\r\n";
  static const char* const FWD[] = {"x-token", "x-now", "content-type", "x-client-ip"};
  JsonObject h = d["headers"].as<JsonObject>();
  for (const char* k : FWD) { String v = h[k] | ""; if (v.length() && v.length() < 200 && cleanToken(v)) req += String(k) + ": " + v + "\r\n"; }
  int len = d["len"] | 0;
  if (!strcmp(method, "POST")) req += "Content-Length: " + String(len) + "\r\n";
  req += "\r\n";
  j->c.print(req);
}

void onBody(JsonDocument& d) {
  Job* j = jobById(d["id"] | "");
  if (!j) return;
  const char* s = d["data"] | "";
  uint8_t buf[1600]; size_t olen = 0;
  if (mbedtls_base64_decode(buf, sizeof buf, &olen, (const uint8_t*)s, strlen(s)) != 0 || !olen) { sendErr(j->id, "Bad body"); freeJob(*j); return; }
  size_t off = 0; uint32_t t0 = millis();
  while (off < olen && millis() - t0 < 3000) {      // the loopback socket can take a partial write
    size_t w = j->c.write(buf + off, olen - off);
    if (w) off += w; else vTaskDelay(pdMS_TO_TICKS(3));
  }
  if (off < olen) { sendErr(j->id, "The table is busy"); freeJob(*j); return; }
  j->last = millis();
}

// Turns the loopback response head into an "open" frame (status + a few whitelisted headers).
void sendOpen(Job& j) {
  int sp = j.head.indexOf(' ');
  int status = sp > 0 ? j.head.substring(sp + 1).toInt() : 502;
  JsonDocument d;
  d["t"] = "open"; d["id"] = j.id; d["status"] = status;
  JsonObject hh = d["headers"].to<JsonObject>();
  int pos = j.head.indexOf("\r\n");
  while (pos >= 0) {
    int nxt = j.head.indexOf("\r\n", pos + 2);
    String line = j.head.substring(pos + 2, nxt < 0 ? j.head.length() : nxt);
    int c = line.indexOf(':');
    if (c > 0) {
      String k = line.substring(0, c), v = line.substring(c + 1); k.toLowerCase(); v.trim();
      if (k == "content-type" || k == "cache-control" || k == "content-disposition" || k == "etag" || k == "x-content-type-options") hh[k] = v;
      else if (k == "content-length") { hh[k] = v; j.clen = v.toInt(); }
    }
    pos = nxt;
  }
  String f; serializeJson(d, f);
  sendFrame(f);
}

void pump() {
  uint8_t buf[READ_CHUNK];
  for (auto& j : jobs) {
    if (!j.used) continue;
    int avail = 0;
    while ((avail = j.c.available()) > 0) {
      int n = j.c.read(buf, avail > (int)sizeof buf ? sizeof buf : avail);
      if (n <= 0) break;
      j.last = millis();
      int off = 0;
      if (!j.headDone) {
        for (int i = 0; i < n && !j.headDone; i++) {
          j.head += (char)buf[i]; off = i + 1;
          if (j.head.length() >= 4 && j.head.endsWith("\r\n\r\n")) { j.headDone = true; sendOpen(j); }
        }
        if (j.head.length() > 3000 && !j.headDone) { sendErr(j.id, "Bad response"); freeJob(j); break; }
      }
      if (j.headDone && n > off) { sendChunk(j.id, buf + off, n - off); j.sent += n - off; }
    }
    if (!j.used) continue;
    bool done = j.headDone && j.clen >= 0 && j.sent >= j.clen;
    bool closed = !j.c.connected() && j.c.available() == 0;
    bool idle = millis() - j.last > (j.sse ? IDLE_SSE_MS : IDLE_MS);
    if (done || closed || idle) {
      if (!j.headDone) sendErr(j.id, "The table did not answer"); else sendEnd(j.id);
      freeJob(j);
    }
  }
}

void onWs(WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED: connected = true; Serial.println("relay: connected"); break;
    case WStype_DISCONNECTED: if (connected) Serial.println("relay: disconnected"); connected = false; freeAll(); dropStreams(); break;
    case WStype_TEXT: {
      JsonDocument d;
      if (deserializeJson(d, payload, length)) return;
      const char* t = d["t"] | "";
      if (!strcmp(t, "req")) startJob(d);
      else if (!strcmp(t, "body")) onBody(d);
      else if (!strcmp(t, "abort")) {
        const char* aid = d["id"] | "";
        Job* j = jobById(aid); if (j) freeJob(*j);
        Stream* s = streamById(aid); if (s) { s->used = false; s->id = ""; s->who = ""; recount(); stateRequestBroadcast(); }
      }
      break;
    }
    default: break;
  }
}

void startWs() {
  wsPath = String("/_esp?key=") + RELAY_KEY;
#if RELAY_TLS
  if (!RELAY_CA_PEM[0]) { Serial.println("relay: no CA certificate in relay_ca.h, refusing to connect without TLS verification"); started = true; return; }
  ws.beginSslWithCA(RELAY_HOST, RELAY_PORT, wsPath.c_str(), RELAY_CA_PEM);
#else
  ws.begin(RELAY_HOST, RELAY_PORT, wsPath.c_str());
#endif
  ws.onEvent(onWs);
  ws.setReconnectInterval(5000);
  ws.enableHeartbeat(15000, 4000, 2);
  started = true;
  Serial.printf("relay: dialing %s:%d (%s)\n", RELAY_HOST, (int)RELAY_PORT, RELAY_TLS ? "tls" : "plain");
}

void task(void*) {
  bool ntp = false;
  for (;;) {
    if (!started) {
      if (WiFi.status() == WL_CONNECTED) {
        if (!ntp) { configTime(0, 0, "pool.ntp.org", "time.cloudflare.com"); ntp = true; }
        if (!RELAY_TLS || time(nullptr) > 1700000000) startWs();   // TLS needs a real clock to check certificate dates
      }
      vTaskDelay(pdMS_TO_TICKS(500));
      continue;
    }
    if (RELAY_TLS && !RELAY_CA_PEM[0]) { vTaskDelay(pdMS_TO_TICKS(1000)); continue; }
    ws.loop();
    pump();
    if (wantCloseDm) { wantCloseDm = false; for (auto& s : streams) if (s.used && s.who == "dm") closeStream(s); }
    if (wantBroadcast) { wantBroadcast = false; broadcastStreams(); }
    static uint32_t lastKa = 0;
    if (streamCount && millis() - lastKa > 4000) {       // SSE comment: Cloudflare only notices a viewer that left when a write fails, so write often
      lastKa = millis();
      static const uint8_t KA[3] = {':', 10, 10};
      for (auto& s : streams) {
        if (!s.used) continue;
        if (millis() - s.born > STREAM_MAX_MS) closeStream(s); else sendChunk(s.id, KA, sizeof KA);
      }
    }
    if (dmGoneAt && !dmStreamCount && millis() - dmGoneAt > DM_GRACE_MS) { dmGoneAt = 0; stateRequestBroadcast(); }
    vTaskDelay(pdMS_TO_TICKS(2));
  }
}
}  // namespace

bool relayConnected() { return connected; }
void relayNotify() { if (streamCount) wantBroadcast = true; }
void relayCloseDm() { if (dmStreamCount) wantCloseDm = true; }
size_t relaySseCount() { return streamCount; }
bool relayDmOnline() { return dmStreamCount > 0 || (dmGoneAt && millis() - dmGoneAt < DM_GRACE_MS); }

void relayBegin() {
  if (!RELAY_HOST[0]) return;
  xTaskCreatePinnedToCore(task, "relay", 10240, nullptr, 1, nullptr, 1);
}
