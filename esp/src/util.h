#pragma once
// Small helpers shared by all firmware modules.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <stdexcept>

// Mirrors server.js HttpError: thrown by actions, turned into {error} JSON by the HTTP layer.
struct HttpError : std::runtime_error {
  int code;
  HttpError(const char* m, int c = 400) : std::runtime_error(m), code(c) {}
};
[[noreturn]] inline void fail(const char* msg, int code = 400) { throw HttpError(msg, code); }

String randHex(size_t bytes);                  // hardware RNG
String newId();                                // 10 hex chars, like server.js id()
String newToken();                             // 32 hex chars
uint32_t randInt(uint32_t n);                  // 0..n-1
uint64_t nowMs();                              // epoch ms (synced from browsers, see clock.cpp)
void clockSync(uint64_t epochMs);
uint64_t clockSaved();                         // last persisted epoch (for boot)
void clockRestore(uint64_t epochMs);

double round2(double v);                       // Math.round(v*100)/100
String gp(double n);                           // "12.5 gp"
String isoTime(uint64_t epochMs);              // 2026-09-29T12:00:00.000Z
size_t jsLen(const String& s);                 // length in UTF-16 code units, like JS
String jsSlice(const String& s, size_t maxUnits);
String jsTrim(const String& s);

// server.js num()/text(): validated inputs
double numOf(JsonVariantConst v, double min = 0);
String textOf(JsonVariantConst v, size_t max = 40);
String textStr(const String& s, size_t max = 40);   // same validation for a plain string
String strOf(JsonVariantConst v);              // String(v ?? '')

JsonObject findBy(JsonArray a, const char* key, const char* val);   // null object if not found
