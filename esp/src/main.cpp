#include <Arduino.h>
#include <WiFi.h>
#include <DNSServer.h>
#include <ESPAsyncWebServer.h>
#include "config.h"
#include "state.h"
#include "http.h"
#include "relay.h"

static DNSServer dns;
static AsyncWebServer server(80);

void setup() {
  Serial.begin(115200);
  delay(200);
  bool sta = false;
  // Join the home Wi-Fi whenever real credentials are set (needed for the remote-access relay). A failing STA scan disturbs the AP, so placeholders are ignored.
  sta = strlen(STA_SSID) > 0 && strcmp(STA_SSID, "REPLACE") != 0 && strcmp(STA_SSID, "HomeWifi") != 0;
  WiFi.mode(sta ? WIFI_AP_STA : WIFI_AP);
  WiFi.onEvent([](arduino_event_id_t ev, arduino_event_info_t info) {
    if (ev == ARDUINO_EVENT_WIFI_AP_STACONNECTED) Serial.printf("wifi: station connected %02x:%02x:%02x:%02x:%02x:%02x\n", info.wifi_ap_staconnected.mac[0], info.wifi_ap_staconnected.mac[1], info.wifi_ap_staconnected.mac[2], info.wifi_ap_staconnected.mac[3], info.wifi_ap_staconnected.mac[4], info.wifi_ap_staconnected.mac[5]);
    else if (ev == ARDUINO_EVENT_WIFI_AP_STADISCONNECTED) Serial.println("wifi: station left");
    else if (ev == ARDUINO_EVENT_WIFI_AP_STAIPASSIGNED) Serial.printf("wifi: ip assigned %s\n", IPAddress(info.wifi_ap_staipassigned.ip.addr).toString().c_str());
    else if (ev == ARDUINO_EVENT_WIFI_STA_GOT_IP) Serial.printf("wifi: home network ip %s\n", WiFi.localIP().toString().c_str());
    else if (ev == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) { static uint32_t d; if (++d % 10 == 1) Serial.printf("wifi: home network disconnected (reason %d)\n", (int)info.wifi_sta_disconnected.reason); }
    else if (ev == ARDUINO_EVENT_WIFI_AP_PROBEREQRECVED) { static uint32_t n; if (++n % 20 == 1) Serial.printf("wifi: probe request #%u\n", (unsigned)n); }
  });
  WiFi.softAPConfig(IPAddress(192, 168, 4, 1), IPAddress(192, 168, 4, 1), IPAddress(255, 255, 255, 0));
  bool apOk = WiFi.softAP(AP_SSID, AP_PASS, 6, 0, MAX_SSE);
  Serial.printf("softAP start: %s (ssid=%s, pass len=%u, mode=%d)\n", apOk ? "OK" : "FAILED", AP_SSID, (unsigned)strlen(AP_PASS), (int)WiFi.getMode());
  WiFi.setTxPower(WIFI_POWER_11dBm);   // lower current spikes: weak USB ports / cables make the board brown out and drop the AP
  if (sta) WiFi.begin(STA_SSID, STA_PASS);
  dns.start(53, "*", IPAddress(192, 168, 4, 1));   // captive portal: every name resolves to the ESP
  stateBegin();
  httpBegin(server);
  server.begin();
  relayBegin();
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
