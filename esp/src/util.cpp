#include "util.h"
#include <esp_system.h>
#include <math.h>

String randHex(size_t bytes) {
  static const char* H = "0123456789abcdef";
  String s; s.reserve(bytes * 2);
  for (size_t i = 0; i < bytes; i++) { uint8_t b = esp_random() & 0xff; s += H[b >> 4]; s += H[b & 15]; }
  return s;
}
String newId() { return randHex(5); }
String newToken() { return randHex(16); }
uint32_t randInt(uint32_t n) { return esp_random() % n; }

// ---- clock: no RTC on the board, so the first browser request that carries x-now sets the epoch. ----
static int64_t g_offset = 0;      // epoch_ms - millis()
static bool g_synced = false;
static uint64_t g_restored = 0;
uint64_t nowMs() { return (uint64_t)((int64_t)millis() + g_offset); }
void clockSync(uint64_t epochMs) {
  if (epochMs < 1700000000000ULL) return;  // ignore garbage
  g_offset = (int64_t)epochMs - (int64_t)millis();
  g_synced = true;
}
uint64_t clockSaved() { return nowMs(); }
void clockRestore(uint64_t epochMs) { if (!g_synced && epochMs > g_restored) { g_restored = epochMs; g_offset = (int64_t)epochMs - (int64_t)millis(); } }

double round2(double v) { return floor(v * 100.0 + 0.5) / 100.0; }

String gp(double n) {
  char buf[40]; snprintf(buf, sizeof buf, "%.2f", n);
  size_t len = strlen(buf);
  // toFixed(2).replace(/\.?0+$/, '')
  if (strchr(buf, '.')) { while (len && buf[len - 1] == '0') buf[--len] = 0; if (len && buf[len - 1] == '.') buf[--len] = 0; }
  else { // no decimal point cannot happen with %.2f, kept for safety
  }
  return String(buf) + " gp";
}

String isoTime(uint64_t ms) {
  time_t s = (time_t)(ms / 1000); struct tm t; gmtime_r(&s, &t);
  char buf[40]; snprintf(buf, sizeof buf, "%04d-%02d-%02dT%02d:%02d:%02d.%03uZ", t.tm_year + 1900, t.tm_mon + 1, t.tm_mday, t.tm_hour, t.tm_min, t.tm_sec, (unsigned)(ms % 1000));
  return String(buf);
}

// UTF-16 unit count for one UTF-8 lead byte (4-byte sequences are surrogate pairs).
static inline int unitsOf(uint8_t lead) { return lead >= 0xF0 ? 2 : 1; }
static inline int bytesOf(uint8_t lead) { return lead >= 0xF0 ? 4 : lead >= 0xE0 ? 3 : lead >= 0xC0 ? 2 : 1; }

size_t jsLen(const String& s) {
  size_t n = 0;
  for (size_t i = 0; i < s.length();) { uint8_t c = s[i]; n += unitsOf(c); i += bytesOf(c); }
  return n;
}
String jsSlice(const String& s, size_t maxUnits) {
  size_t units = 0, i = 0;
  while (i < s.length()) {
    uint8_t c = s[i]; int u = unitsOf(c);
    if (units + u > maxUnits) break;   // never split a surrogate pair
    units += u; i += bytesOf(c);
  }
  return s.substring(0, i);
}
String jsTrim(const String& in) {
  String s = in; s.trim(); return s;
}

double numOf(JsonVariantConst v, double min) {
  double n = NAN;  // missing/null/objects -> NaN -> "Gecersiz sayi", like +undefined in JS
  if (v.is<double>() || v.is<long>() || v.is<int>()) n = v.as<double>();
  else if (v.is<bool>()) n = v.as<bool>() ? 1 : 0;
  else if (v.is<const char*>()) { const char* p = v.as<const char*>(); char* end; double d = strtod(p, &end); if (end != p && !*end) n = d; }
  n = floor(n * 100.0 + 0.5) / 100.0;
  if (!isfinite(n) || n < min) fail("Geçersiz sayı");
  return n;
}
String strOf(JsonVariantConst v) {
  if (v.isNull()) return String("");
  if (v.is<const char*>()) return String(v.as<const char*>());
  String s; serializeJson(v, s); return s;
}
String textStr(const String& in, size_t max) {
  String s = jsSlice(jsTrim(in), max);
  s = jsTrim(s);
  if (!s.length()) fail("Boş olamaz");
  return s;
}
String textOf(JsonVariantConst v, size_t max) {
  String s = jsSlice(jsTrim(strOf(v)), max);
  s = jsTrim(s);
  if (!s.length()) fail("Bo\xC5\x9F olamaz");
  return s;
}

JsonObject findBy(JsonArray a, const char* key, const char* val) {
  if (!val) return JsonObject();
  for (JsonObject o : a) { const char* x = o[key]; if (x && !strcmp(x, val)) return o; }
  return JsonObject();
}
