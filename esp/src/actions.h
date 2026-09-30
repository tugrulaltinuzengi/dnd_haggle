#pragma once
#include "auth.h"

// Ports of server.js P (player) and D (dm) tables. They throw HttpError on invalid input.
// `out` receives extra fields for the {ok:true, ...out} reply (e.g. {id}).
void runPlayer(const String& name, JsonObject p, JsonObject b);
void runDm(const String& name, JsonObject b, const Auth& a, JsonObject out);

// implemented by the HTTP layer
void sseCloseDmExcept(const String& keepToken);

// media helpers used by dm/delete, dm/itemvariant, dm/mediaclear
String mediaCopy(const char* rel, const String& nid, bool thumb);   // returns "" if nothing copied
void mediaUnlink(const char* rel);

