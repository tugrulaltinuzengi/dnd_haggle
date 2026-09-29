#pragma once
#include "state.h"

struct Auth {
  enum Role { NONE, DM, PLAYER } role = NONE;
  String tok;          // DM token
  JsonObject player;   // valid when role == PLAYER
};

Auth authOf(const char* tok);                    // like server.js auth()
bool checkDmPass(const String& pw);              // DM_PIN until the first change, PBKDF2 hash afterwards
void setDmPass(const String& next);              // stores salt+hash in S.settings.dmPass
bool pinLocked(uint32_t ip);
void pinFailed(uint32_t ip);
void pinOk(uint32_t ip);
void pinClear();

#ifndef PIN_LOCK_MS
#define PIN_LOCK_MS 600000
#endif
