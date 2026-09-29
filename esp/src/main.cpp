#include <Arduino.h>
#include <WiFi.h>
#include <DNSServer.h>
#include <ESPAsyncWebServer.h>
#include "config.h"
#include "state.h"
#include "http.h"

static DNSServer dns;
static AsyncWebServer server(80);

void setup() {
  Serial.begin(115200);
  delay(200);
#ifdef DEV_STA
  WiFi.mode(WIFI_AP_STA);
#else
  WiFi.mode(WIFI_AP);
#endif
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  WiFi.softAP(AP_SSID, AP_PASS, 6, 0, MAX_SSE);
#ifdef DEV_STA
  WiFi.begin(STA_SSID, STA_PASS);
#endif
  dns.start(53, "*", IPAddress(192, 168, 4, 1));   // captive portal: every name resolves to the ESP
  stateBegin();
  httpBegin(server);
  server.begin();
  Serial.printf("pazar %s up: AP %s ip=%s heap=%u\n", PAZAR_VERSION, AP_SSID, WiFi.softAPIP().toString().c_str(), ESP.getFreeHeap());
}

void loop() {
  dns.processNextRequest();
  stateLoop();
  httpLoop();
#ifdef DEV_STA
  static uint32_t t;
  if (millis() - t > 10000) { t = millis(); if (WiFi.status() == WL_CONNECTED) Serial.printf("STA ip=%s heap=%u min=%u\n", WiFi.localIP().toString().c_str(), ESP.getFreeHeap(), ESP.getMinFreeHeap()); }
#endif
  delay(5);
}
