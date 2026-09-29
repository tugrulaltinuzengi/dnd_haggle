#pragma once
#include "state.h"

bool dmOnline();                                  // implemented by the HTTP layer (any DM SSE client connected)
String playerViewJson(JsonObject p);              // same shape as server.js playerView()
String dmViewJson();                              // same shape as server.js dmView()
