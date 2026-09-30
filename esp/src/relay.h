#pragma once
// Remote access: the ESP dials OUT to the Cloudflare Worker relay (relay/) and serves relayed requests by calling itself over loopback.
// Disabled when RELAY_HOST is empty in secrets.ini. Protocol: docs/superpowers/specs/2026-09-30-remote-access-design.md, relay/src/hub-core.js.
#include <stddef.h>
void relayBegin();
bool relayConnected();
// Relayed SSE streams are fed straight from the state (no loopback socket per remote player).
void relayNotify();            // a snapshot changed: push fresh views to every relayed stream (safe from any task)
void relayCloseDm();           // end every relayed DM stream (DM password changed); browsers reconnect with their token
size_t relaySseCount();
bool relayDmOnline();
