#if !defined(ESP8266)
#error "Select nodemcu_wifi_monitor for your ESP-12E NodeMCU / ESP8266."
#endif
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiUdp.h>
#include "BoardConfig.h"
#include "WifiMonitor.h"
#if __has_include("WifiSecrets.h")
#include "WifiSecrets.h"
#else
#include "WifiSecrets.example.h"
#endif

WiFiUDP udp;
IPAddress laptop;
aham_wifi::Monitor monitor;
bool configured = false, listening = false;
uint32_t lastPrint = 0;
constexpr uint16_t port = 4210;

void printChannels(const uint8_t* values) {
    Serial.print('[');
    for (int i=0; i<5; ++i) { if(i) Serial.print(','); Serial.print(values[i]); }
    Serial.print(']');
}
void setup() {
    // Receive-and-print only. The existing index driver and servo signals stay disabled.
    digitalWrite(board::servoOePin, HIGH); pinMode(board::servoOePin, OUTPUT);
    for (uint8_t pin : board::motorPins) if (pin != 255) { digitalWrite(pin, LOW); pinMode(pin, OUTPUT); }
    Serial.begin(115200);
    Serial.println("\nAHAM WIFI MONITOR: MOTOR/SERVO OUTPUT OFF; order T/I/M/R/L");
    configured = laptop.fromString(AHAM_LAPTOP_IP) && strcmp(AHAM_WIFI_SSID, "SET_HOTSPOT_NAME") != 0;
    WiFi.persistent(false);
    if (!configured) {
        WiFi.mode(WIFI_OFF);
        Serial.println("Copy WifiSecrets.example.h to WifiSecrets.h. Set hotspot name/password and laptop Wi-Fi IPv4; upload again.");
        return;
    }
    WiFi.mode(WIFI_STA); WiFi.hostname("aham-glove"); WiFi.setAutoReconnect(true);
    WiFi.begin(AHAM_WIFI_SSID, AHAM_WIFI_PASSWORD);
    Serial.println("Connecting to your 2.4 GHz hotspot...");
}
void loop() {
    const uint32_t now = millis();
    monitor.tick(now);
    if (!configured) { delay(10); return; }
    if (WiFi.status() != WL_CONNECTED) {
        if (listening) { udp.stop(); listening=false; }
        monitor.clear();
        if(uint32_t(now-lastPrint)>=2000) { lastPrint=now; Serial.println("Waiting for Wi-Fi; requests zero; OUTPUT OFF"); }
        delay(1); return;
    }
    if (!listening) {
        listening = udp.begin(port) == 1;
        if (!listening) { delay(10); return; }
        Serial.print("ESP_IP="); Serial.print(WiFi.localIP()); Serial.print(" UDP="); Serial.println(port);
        Serial.print("Allowed laptop="); Serial.println(laptop);
    }
    // Bound work so invalid traffic cannot starve the independent expiry check.
    for (int count=0; count<8; ++count) {
        const int size=udp.parsePacket(); if(!size) break;
        if (udp.remoteIP()!=laptop || size<2 || size>int(aham::MaxEncoded)) { udp.flush(); continue; }
        const IPAddress sender=udp.remoteIP(); const uint16_t senderPort=udp.remotePort();
        uint8_t bytes[aham::MaxEncoded]; const int read=udp.read(bytes, sizeof(bytes));
        aham::Packet packet;
        if(read!=size || bytes[read-1]!=0 || !aham::decode(bytes,size-1,packet) || !monitor.accept(packet,millis())) continue;
        const aham::Packet receipt=monitor.receipt(millis());
        const size_t length=aham::encode(receipt,bytes);
        if(udp.beginPacket(sender,senderPort)) { udp.write(bytes,length); udp.endPacket(); }
    }
    monitor.tick(millis());
    if(uint32_t(now-lastPrint)>=200) {
        lastPrint=now;
        Serial.print(monitor.live?"LINK=LIVE ":"LINK=STALE ");
        Serial.print("VIB="); printChannels(monitor.vibration);
        Serial.print(" RES%="); printChannels(monitor.resistance);
        Serial.print(" CURL%="); printChannels(monitor.reference);
        Serial.print(" HOLD="); Serial.print(bool(monitor.flags&2));
        Serial.println(" OUTPUT=OFF");
    }
    delay(1);
}
