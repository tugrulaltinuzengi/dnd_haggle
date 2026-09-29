#pragma once
#include <ESPAsyncWebServer.h>

void httpBegin(AsyncWebServer& server);   // registers the catch-all handlers (API, SSE, media, static files)
void httpLoop();                           // pushes pending changes to the SSE clients (call from loop())
