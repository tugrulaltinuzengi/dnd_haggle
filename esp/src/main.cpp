#include <Arduino.h>
#include <WiFi.h>
#include <DNSServer.h>
#include <LittleFS.h>
#include <ESPAsyncWebServer.h>
#include "config.h"

static DNSServer dns;
static AsyncWebServer server(80);

void setup() {
  Serial.begin(115200);
#ifdef DEV_STA
  WiFi.mode(WIFI_AP_STA);
#else
  WiFi.mode(WIFI_AP);
#endif
  WiFi.softAPConfig(IPAddress(192,168,4,1), IPAddress(192,168,4,1), IPAddress(255,255,255,0));
  WiFi.softAP(AP_SSID, AP_PASS, 6, 0, MAX_SSE);
#ifdef DEV_STA
  WiFi.begin(STA_SSID, STA_PASS);
#endif
  dns.start(53, "*", IPAddress(192,168,4,1));
  LittleFS.begin(true);
  server.on("/api/ping", HTTP_GET, [](AsyncWebServerRequest* r) {
    r->send(200, "application/json", String("{\"ok\":true,\"version\":\"") + PAZAR_VERSION + "\",\"heap\":" + ESP.getFreeHeap() + "}");
  });
  server.onNotFound([](AsyncWebServerRequest* r) { r->send(200, "text/html", "<h1>pazar ESP</h1>"); });
  server.begin();
  Serial.printf("AP up: %s ip=%s heap=%u\n", AP_SSID, WiFi.softAPIP().toString().c_str(), ESP.getFreeHeap());
}
void loop() {
  dns.processNextRequest();
#ifdef DEV_STA
  static uint32_t t;
  if (millis() - t > 5000) { t = millis(); if (WiFi.status() == WL_CONNECTED) Serial.printf("STA ip=%s\n", WiFi.localIP().toString().c_str()); }
#endif
}
