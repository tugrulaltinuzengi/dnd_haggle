#include "auth.h"
#include "config.h"
#include <mbedtls/md.h>
#include <mbedtls/pkcs5.h>

#ifndef DM_PIN
#define DM_PIN "1234"
#endif

Auth authOf(const char* tok) {
  Auth a;
  if (!tok || !*tok) return a;
  for (JsonVariant t : S["dm"].as<JsonArray>()) {
    const char* x = t.as<const char*>();
    if (x && !strcmp(x, tok)) { a.role = Auth::DM; a.tok = tok; return a; }
  }
  JsonObject p = findBy(S["players"], "token", tok);
  if (!p.isNull()) { a.role = Auth::PLAYER; a.player = p; }
  return a;
}

// ---- PBKDF2-HMAC-SHA256, 10000 iterations (spec E6) ----
static String hashPass(const String& pw, const String& salt) {
  uint8_t out[32];
  mbedtls_md_context_t ctx;
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, mbedtls_md_info_from_type(MBEDTLS_MD_SHA256), 1);
  mbedtls_pkcs5_pbkdf2_hmac(&ctx, (const unsigned char*)pw.c_str(), pw.length(), (const unsigned char*)salt.c_str(), salt.length(), 10000, 32, out);
  mbedtls_md_free(&ctx);
  static const char* H = "0123456789abcdef";
  String hex; hex.reserve(64);
  for (int i = 0; i < 32; i++) { hex += H[out[i] >> 4]; hex += H[out[i] & 15]; }
  return hex;
}

static bool constEq(const String& a, const String& b) {
  if (a.length() != b.length()) return false;
  uint8_t d = 0;
  for (size_t i = 0; i < a.length(); i++) d |= a[i] ^ b[i];
  return d == 0;
}

bool checkDmPass(const String& pw) {
  JsonObject p = S["settings"]["dmPass"];
  if (p.isNull()) return constEq(pw, String(DM_PIN));
  return constEq(hashPass(pw, p["salt"].as<String>()), p["hash"].as<String>());
}

void setDmPass(const String& next) {
  String salt = randHex(16);
  JsonObject p = S["settings"]["dmPass"].to<JsonObject>();
  p["salt"] = salt;
  p["hash"] = hashPass(next, salt);
}

// ---- PIN lockout (5 wrong tries lock that address) ----
namespace {
struct Fail { uint32_t ip; int n; uint32_t until; bool used; };
Fail fails[8];
Fail* slot(uint32_t ip, bool create) {
  for (auto& f : fails) if (f.used && f.ip == ip) return &f;
  if (!create) return nullptr;
  for (auto& f : fails) if (!f.used) { f = {ip, 0, 0, true}; return &f; }
  fails[0] = {ip, 0, 0, true}; return &fails[0];
}
}
bool pinLocked(uint32_t ip) { Fail* f = slot(ip, false); return f && f->until && (int32_t)(f->until - millis()) > 0; }
void pinFailed(uint32_t ip) {
  Fail* f = slot(ip, true);
  f->n++;
  if (f->n >= 5) { f->n = 0; f->until = millis() + PIN_LOCK_MS; if (!f->until) f->until = 1; }
}
void pinOk(uint32_t ip) { Fail* f = slot(ip, false); if (f) f->used = false; }
void pinClear() { for (auto& f : fails) f.used = false; }
