#pragma once
#include <ESPAsyncWebServer.h>

void httpBegin(AsyncWebServer& server);   // registers the catch-all handlers (API, SSE, media, static files)
bool sseResolve(const char* token, String& who);   // relay: true when the token is valid; who = "dm" or the player id
String sseView(const String& who);          // relay: the snapshot for that audience ("" when the player no longer exists)
void httpLoop();                           // pushes pending changes to the SSE clients (call from loop())
