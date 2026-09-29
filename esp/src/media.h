#pragma once
#include "state.h"

void mediaBegin();      // creates /media dirs and removes stale upload temp files

// Upload flow (POST /api/media?kind=&id=&variant=): precheck -> open -> write* -> finish, or abort.
struct MediaJob {
  String kind, id, variant, sub;   // sub = "items" | "portraits"
  size_t cap = 0;
};
MediaJob mediaPrecheck(const char* kind, const char* id, const char* variant);   // throws HttpError like server.js
bool mediaOpen();                 // false when another upload is running
void mediaWrite(const uint8_t* d, size_t n);
String mediaFinish(const MediaJob& j);                                            // JSON reply {url,w,h,bytes}; throws HttpError
void mediaAbort();
bool mediaBusy();

// Resolve "/media/items/x.png?v=1" to a safe LittleFS path; "" if not a valid media path.
String mediaPathOf(const String& rel);
const char* mediaMime(const String& path);
