#pragma once
// World state (the same shape as app/server.js data.json), persistence, and the shared game helpers.
#include <Arduino.h>
#include <ArduinoJson.h>
#include <freertos/FreeRTOS.h>
#include <freertos/semphr.h>
#include "util.h"

extern JsonDocument S;        // day, week, offers, merchants, items, players, bans, dm, log, ledger, settings
extern JsonDocument CHARS;    // /www/chars.json (character presets: name, starting gold)

// One recursive mutex guards S and everything derived from it.
struct Lock { Lock(); ~Lock(); };

void stateBegin();            // mount LittleFS, load /data.json or seed; also loads CHARS
void stateMarkDirty();        // request a debounced save (1 s after the last change)
void stateLoop();             // call from loop(): performs the save when due
bool stateTakeBroadcast(uint32_t minGapMs);  // true when a change is waiting to be pushed to SSE clients
void stateRequestBroadcast();
void seedWorld();             // replace S with the default seed (also used by dm/reset in dev builds)

// ---- log / ledger ----
void logLine(const String& text, const char* playerId = nullptr);
void book(const char* kind, JsonObject p, const char* merchantId, const String& name, double amount, JsonVariantConst list = JsonVariantConst());

// ---- lookups (throw 404 like server.js) ----
JsonObject merchantOf(const char* id);
JsonObject itemOf(const char* id);
JsonObject playerOf(const char* id);
JsonObject charOf(const char* id);          // null object if unknown
String bkey(const char* pid, const char* mid);
bool isClosed(const char* pid, const char* mid);   // the DM closed this merchant to this player for today
