// Item/portrait images on LittleFS (port of the media parts of server.js) with a total quota.
#include "media.h"
#include "actions.h"
#include "config.h"
#include <LittleFS.h>

static const char* UP = "/media/up.tmp";
static File up;
static bool busy = false;
static size_t upGot = 0;
static uint32_t lastTouch = 0;

// limits from spec E5 (smaller than the Node server, which targets phones and PCs)
static const size_t CAP_ITEM = 120 * 1024, CAP_THUMB = 60 * 1024, CAP_PORTRAIT = 120 * 1024;
static const uint32_t MIN_PX = 32, MAX_PX = 2048;

void mediaBegin() {
  LittleFS.mkdir("/media"); LittleFS.mkdir("/media/items"); LittleFS.mkdir("/media/portraits");
  LittleFS.remove(UP);
}
bool mediaBusy() { return busy; }

String mediaPathOf(const String& rel) {
  String clean = rel; int q = clean.indexOf('?'); if (q >= 0) clean = clean.substring(0, q);
  if (!clean.startsWith("/media/")) return "";
  if (clean.indexOf("..") >= 0 || clean.indexOf("//") >= 0 || clean.indexOf('\\') >= 0) return "";
  String tail = clean.substring(7);
  int slash = tail.indexOf('/');
  if (slash <= 0) return "";
  String sub = tail.substring(0, slash), name = tail.substring(slash + 1);
  if ((sub != "items" && sub != "portraits") || name.indexOf('/') >= 0 || !name.length()) return "";
  if (!(name.endsWith(".png") || name.endsWith(".jpg"))) return "";
  return clean;
}
const char* mediaMime(const String& p) { return p.endsWith(".png") ? "image/png" : "image/jpeg"; }

MediaJob mediaPrecheck(const char* kind, const char* id, const char* variant) {
  MediaJob j;
  String k = kind ? kind : "";
  if (k != "item" && k != "portrait") fail("Invalid kind");
  j.kind = k; j.variant = (variant && !strcmp(variant, "thumb")) ? "thumb" : "main";
  if (k == "item") itemOf(id); else merchantOf(id);   // 404 when unknown
  j.id = id; j.sub = k == "item" ? "items" : "portraits";
  j.cap = k == "portrait" ? CAP_PORTRAIT : j.variant == "thumb" ? CAP_THUMB : CAP_ITEM;
  return j;
}

bool mediaOpen() {
  if (busy && millis() - lastTouch < 15000) return false;
  if (busy) mediaAbort();          // a previous upload stalled (client vanished)
  up = LittleFS.open(UP, "w");
  if (!up) return false;
  busy = true; upGot = 0; lastTouch = millis();
  return true;
}
void mediaWrite(const uint8_t* d, size_t n) { if (busy && up) { up.write(d, n); upGot += n; lastTouch = millis(); } }
void mediaAbort() { if (up) up.close(); LittleFS.remove(UP); busy = false; }

// ---- image sniffing straight from the temp file (PNG + JPEG only) ----
namespace {
struct Win {
  File& f; size_t size; uint8_t buf[256]; size_t base = (size_t)-1;
  Win(File& file, size_t n) : f(file), size(n) {}
  int at(size_t i) {
    if (i >= size) return -1;
    if (base == (size_t)-1 || i < base || i >= base + sizeof buf) {
      base = i; f.seek(base);
      size_t got = f.read(buf, sizeof buf); if (got == 0) return -1;
    }
    return buf[i - base];
  }
  uint32_t u16(size_t i) { return (at(i) << 8) | at(i + 1); }
  uint32_t u32(size_t i) { return ((uint32_t)at(i) << 24) | (at(i + 1) << 16) | (at(i + 2) << 8) | at(i + 3); }
};
struct Info { bool ok = false; const char* ext = ""; uint32_t w = 0, h = 0; };
Info sniff(File& f, size_t size) {
  Info r; Win w(f, size);
  static const uint8_t PNG[8] = {137, 80, 78, 71, 13, 10, 26, 10};
  if (size >= 24) {
    bool png = true; for (int i = 0; i < 8; i++) if (w.at(i) != PNG[i]) png = false;
    if (png && w.at(12) == 'I' && w.at(13) == 'H' && w.at(14) == 'D' && w.at(15) == 'R') { r.ok = true; r.ext = "png"; r.w = w.u32(16); r.h = w.u32(20); return r; }
  }
  if (size > 4 && w.at(0) == 0xff && w.at(1) == 0xd8) {
    size_t i = 2;
    while (i + 9 < size) {
      if (w.at(i) != 0xff) { i++; continue; }
      int m = w.at(i + 1);
      if (m >= 0xc0 && m <= 0xcf && m != 0xc4 && m != 0xc8 && m != 0xcc) { r.ok = true; r.ext = "jpg"; r.h = w.u16(i + 5); r.w = w.u16(i + 7); return r; }
      if (m == 0xd8 || m == 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
      i += 2 + w.u16(i + 2);
    }
  }
  return r;
}
size_t dirBytes(const char* path) {
  size_t total = 0; File d = LittleFS.open(path);
  if (!d) return 0;
  for (File f = d.openNextFile(); f; f = d.openNextFile()) if (!f.isDirectory()) total += f.size();
  return total;
}
}

String mediaFinish(const MediaJob& j) {
  size_t size = upGot;
  if (up) up.close();
  struct Guard { ~Guard() { LittleFS.remove(UP); busy = false; } } guard;   // temp file is always cleaned (renamed files no longer exist)
  if (!size) fail("Empty file");
  File f = LittleFS.open(UP, "r");
  Info info = sniff(f, size);
  f.close();
  if (!info.ok) fail("Only PNG or JPEG is accepted.");
  if (info.w < MIN_PX || info.h < MIN_PX || info.w > MAX_PX || info.h > MAX_PX) fail("Image must be 32–2048 px.");

  String dir = "/media/" + j.sub;
  String base = j.id + (j.variant == "thumb" ? ".t" : "");
  size_t replaced = 0;
  for (const char* e : {"png", "jpg"}) { String p = dir + "/" + base + "." + e; if (LittleFS.exists(p)) { File o = LittleFS.open(p, "r"); replaced += o.size(); o.close(); } }
  size_t used = dirBytes("/media/items") + dirBytes("/media/portraits");
  if (used - replaced + size > MEDIA_QUOTA || LittleFS.totalBytes() - LittleFS.usedBytes() < size + 16384) fail("Medya deposu dolu", 413);

  for (const char* e : {"png", "jpg"}) LittleFS.remove(dir + "/" + base + "." + e);
  String fin = dir + "/" + base + "." + info.ext;
  if (!LittleFS.rename(UP, fin)) fail("Kaydedilemedi", 500);
  String rel = fin + "?v=" + String((uint32_t)nowMs(), 36);
  rel.replace("/media/", "/media/");   // no-op, keeps the relative form used by the web client

  if (j.kind == "item") {
    JsonObject it = itemOf(j.id.c_str());
    if (j.variant == "thumb") it["thumb"] = rel; else it["image"] = rel;
  } else merchantOf(j.id.c_str())["portrait"] = rel;

  JsonDocument r; r["url"] = rel; r["w"] = info.w; r["h"] = info.h; r["bytes"] = size;
  String out; serializeJson(r, out);
  return out;
}

// ---- used by dm/delete, dm/itemvariant, dm/mediaclear ----
void mediaUnlink(const char* rel) {
  if (!rel || !*rel) return;
  String p = mediaPathOf(rel);
  if (p.length()) LittleFS.remove(p);
}

String mediaCopy(const char* rel, const String& nid, bool thumb) {
  if (!rel || !*rel) return "";
  String src = mediaPathOf(rel);
  if (!src.length() || !LittleFS.exists(src)) return "";
  String dir = src.substring(0, src.lastIndexOf('/'));
  String ext = src.substring(src.lastIndexOf('.'));
  String dst = dir + "/" + nid + (thumb ? ".t" : "") + ext;
  File in = LittleFS.open(src, "r"), out = LittleFS.open(dst, "w");
  if (!in || !out) return "";
  uint8_t buf[512]; size_t n;
  while ((n = in.read(buf, sizeof buf)) > 0) out.write(buf, n);
  return dst + "?v=" + String((uint32_t)nowMs(), 36);
}
