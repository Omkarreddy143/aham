#if !defined(ESP8266)
#error "Select nodemcu_wifi_bench (ESP-12E / ESP8266)."
#endif
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiUdp.h>
#include <Wire.h>
#include "BoardConfig.h"
#include "BenchAuth.h"
#if __has_include("WifiSecrets.h")
#include "WifiSecrets.h"
#else
#include "WifiSecrets.example.h"
#endif
#if __has_include("BenchConfig.h")
#include "BenchConfig.h"
#else
#include "BenchConfig.example.h"
#endif
#if __has_include("BenchSecrets.h")
#include "BenchSecrets.h"
#else
constexpr uint8_t benchKey[32] = {};
#endif

namespace {
WiFiUDP udp;
IPAddress laptop;
aham_bench::Controller* state = nullptr;
bool configured = false, listening = false, pcaReady = false;
bool oeEnabled = false, parkPending = false;
uint32_t lastPrint = 0, parkAt = 0, lastWrite = 0;
uint16_t lastPulse = 0;
uint32_t jogAt = 0;
uint16_t jogPulse = 1500;
bool jogging = false;
constexpr uint16_t port = 4211;
constexpr uint8_t pcaAddress = 0x40;

bool writeRegister(uint8_t reg, uint8_t value) {
    Wire.beginTransmission(pcaAddress); Wire.write(reg); Wire.write(value);
    return Wire.endTransmission() == 0;
}
bool channel(uint8_t number, uint16_t pulseUs) {
    const uint16_t ticks = uint16_t((uint32_t(pulseUs) * 4096 + 10000) / 20000);
    Wire.beginTransmission(pcaAddress); Wire.write(uint8_t(0x06 + 4 * number));
    Wire.write(uint8_t(0)); Wire.write(uint8_t(0));
    Wire.write(uint8_t(ticks)); Wire.write(uint8_t(pulseUs ? ticks >> 8 : 0x10));
    return Wire.endTransmission() == 0;
}
bool setupPca() {
    Wire.begin(board::sdaPin, board::sclPin); Wire.setClock(100000);
    Wire.setClockStretchLimit(2000);
    // 25 MHz nominal oscillator: prescale 121 gives approximately 50 Hz.
    if (!writeRegister(0x00, 0x30) || !writeRegister(0xfe, 121) ||
        !writeRegister(0x01, 0x04) || !writeRegister(0x00, 0x20)) return false;
    delay(1);
    if (!writeRegister(0x00, 0xa0)) return false;
    for (uint8_t i = 0; i < 16; ++i) if (!channel(i, 0)) return false;
    return channel(bench_config::servoChannel, bench_config::homeUs);
}
void outputs(uint32_t now) {
    analogWrite(board::motorPins[1], state->pwm);
    const bool servoArmed = state->armed & 2;
    if (!pcaReady) { digitalWrite(board::servoOePin, HIGH); oeEnabled = false; return; }
    if (servoArmed) { parkPending = false; }
    else if (oeEnabled && !parkPending) { parkPending = true; parkAt = now; }
    // Best-effort home command for 300 ms before suppressing pulses.
    // Neither this command nor OE guarantees slack in a stalled/loaded mechanism.
    const bool enable = servoArmed || (parkPending && uint32_t(now - parkAt) < 300);
    const uint16_t pulse = servoArmed ? (jogging ? jogPulse : state->pulse) : state->home;
    if (enable && (pulse != lastPulse || uint32_t(now - lastWrite) >= 100)) {
        if (!channel(bench_config::servoChannel, pulse)) {
            state->lost(aham_bench::I2cFault); pcaReady = false;
            analogWrite(board::motorPins[1], 0);
            digitalWrite(board::servoOePin, HIGH); oeEnabled = false;
            Serial.println("I2C FAULT: remove actuator power and release tendon manually."); return;
        }
        lastPulse = pulse; lastWrite = now;
    }
    digitalWrite(board::servoOePin, enable ? LOW : HIGH);
    oeEnabled = enable;
    if (!enable) parkPending = false;
}
void localCommand(const char* text) {
    const uint32_t now = millis();
    state->tick(now, digitalRead(board::stopPin) == LOW);
    uint8_t mask = 0;
    if (!strcmp(text, "ARM MOTOR")) mask = 1;
    else if (!strcmp(text, "ARM SERVO")) mask = 2;
    else if (!strcmp(text, "ARM BOTH")) mask = 3;
    if (mask) {
        jogging = false;
        if ((mask & 2) && !pcaReady) { Serial.println("PCA unavailable; servo not armed."); return; }
        Serial.println(state->arm(mask, now, digitalRead(board::stopPin) == LOW) ?
                       "ARMED for up to 60 s; STOP to park/disarm." :
                       "NOT ARMED: check verified flags, STOP loop, fresh link, open hand and zero cues.");
    } else if (!strcmp(text, "STOP") || !strcmp(text, "HOME")) {
        jogging = false;
        state->disarm(aham_bench::ManualStop); outputs(now); Serial.println("DISARMED; home requested.");
    } else if (!strcmp(text, "JOG +10") || !strcmp(text, "JOG -10")) {
        // Servo must be separately armed while thread is DETACHED. Bound cumulative jog.
        if (!(state->armed & 2) || state->flags & 2) { Serial.println("JOG needs ARM SERVO, hand open, tendon detached."); return; }
        const int candidate = int(state->home) + (text[4] == '+' ? 10 : -10);
        if (candidate < 1400 || candidate > 1600 || abs(candidate - int(state->home)) > 100) return;
        // One brief jog, then automatically home/disarm after 300 ms.
        if (!channel(bench_config::servoChannel, uint16_t(candidate))) {
            state->lost(aham_bench::I2cFault); pcaReady = false; outputs(now); return;
        }
        digitalWrite(board::servoOePin, LOW); oeEnabled = true;
        lastPulse = uint16_t(candidate); lastWrite = now;
        jogPulse = uint16_t(candidate); jogging = true; jogAt = now;
        Serial.print("JOG pulse us="); Serial.println(candidate);
    } else Serial.println("Commands: ARM MOTOR | ARM SERVO | ARM BOTH | STOP | HOME | JOG +10 | JOG -10 (newline)");
}
void serialCommands() {
    static char line[32]; static size_t used = 0; static bool overflow = false;
    for (int count = 0; count < 64 && Serial.available(); ++count) {
        const char c = char(Serial.read());
        if (c == '\r') continue;
        if (c == '\n') {
            if (!overflow) {
                line[used] = 0; localCommand(line);
            }
            used = 0; overflow = false;
        } else if (used < sizeof(line) - 1) line[used++] = c;
        else overflow = true;
    }
}
void receive() {
    for (int count = 0; count < 8; ++count) {
        const int size = udp.parsePacket(); if (!size) break;
        if (udp.remoteIP() != laptop || size < 2 || size > int(aham::MaxEncoded)) { udp.flush(); continue; }
        const IPAddress sender = udp.remoteIP(); const uint16_t senderPort = udp.remotePort();
        uint8_t bytes[aham::MaxEncoded]; const int read = udp.read(bytes, sizeof(bytes));
        aham::Packet packet, ack;
        if (read != size || bytes[read - 1] || !aham::decode(bytes, size - 1, packet)) continue;
        if (packet.type == aham_bench::Hello && aham_bench::authentic(packet, 4, benchKey) && aham::u32(packet.payload)) {
            ack.type = aham_bench::HelloReceipt; ack.seq = packet.seq; ack.timeMs = millis();
            memcpy(ack.payload, packet.payload, 4); aham::put32(ack.payload + 4, state->boot);
            aham_bench::sign(ack, 8, benchKey);
        } else if (packet.type == aham_bench::Command &&
                   aham_bench::authentic(packet, aham_bench::CommandSize, benchKey) &&
                   state->accept(packet, millis())) {
            state->tick(millis(), digitalRead(board::stopPin) == LOW);
            outputs(millis());
            ack.type = aham_bench::Receipt; ack.seq = state->sequence; ack.timeMs = millis();
            aham::put32(ack.payload, state->session); aham::put32(ack.payload + 4, state->boot);
            aham::put16(ack.payload + 8, state->checksum);
            ack.payload[10] = state->armed; ack.payload[11] = state->pwm;
            aham::put16(ack.payload + 12, oeEnabled ? lastPulse : state->home);
            ack.payload[14] = oeEnabled ? 1 : 0; ack.payload[15] = state->reason;
            aham_bench::sign(ack, aham_bench::ReceiptSize, benchKey);
        } else continue;
        const size_t length = aham::encode(ack, bytes);
        if (udp.beginPacket(sender, senderPort)) { udp.write(bytes, length); udp.endPacket(); }
    }
}
}
void setup() {
    digitalWrite(board::servoOePin, HIGH); pinMode(board::servoOePin, OUTPUT);
    digitalWrite(board::motorPins[1], LOW); pinMode(board::motorPins[1], OUTPUT);
    pinMode(board::stopPin, INPUT_PULLUP); analogWriteRange(255); analogWriteFreq(1000);
    Serial.begin(115200); Serial.println("\nAHAM INDEX BENCH: boots DISARMED; no force measurement.");
    const bool limits = bench_config::homeUs >= 1400 && bench_config::homeUs <= 1600 &&
        abs(bench_config::pullDeltaUs) <= 100 &&
        int(bench_config::homeUs) + bench_config::pullDeltaUs >= 1400 &&
        int(bench_config::homeUs) + bench_config::pullDeltaUs <= 1600 && bench_config::servoChannel == 1;
    const uint8_t allowed = (bench_config::motorVerified ? 1 : 0) |
        (bench_config::servoVerified && limits ? 2 : 0);
    static aham_bench::Controller controller(ESP.random() | 1, allowed, limits ? bench_config::homeUs : 1500,
                                           limits ? bench_config::pullDeltaUs : 0);
    state = &controller;
    if (allowed & 2) pcaReady = setupPca();
    if (allowed & 2 && !pcaReady) state->disarm(aham_bench::I2cFault);
    uint8_t keySet = 0; for (uint8_t byte : benchKey) keySet |= byte;
    configured = keySet && laptop.fromString(AHAM_LAPTOP_IP) && strcmp(AHAM_WIFI_SSID, "SET_HOTSPOT_NAME");
    Serial.print("Verified outputs mask="); Serial.print(allowed); Serial.print(" PCA="); Serial.println(pcaReady);
    Serial.println("D6 must connect through removable STOP loop to GND; disconnected means STOP.");
    WiFi.persistent(false);
    if (!configured) { WiFi.mode(WIFI_OFF); Serial.println("Configure ignored WifiSecrets.h and generate BenchSecrets.h/key first."); return; }
    WiFi.mode(WIFI_STA); WiFi.hostname("aham-index-bench"); WiFi.setAutoReconnect(true);
    WiFi.begin(AHAM_WIFI_SSID, AHAM_WIFI_PASSWORD);
}
void loop() {
    uint32_t now = millis();
    state->tick(now, digitalRead(board::stopPin) == LOW);
    if (jogging && (!state->armed || state->flags & 2 || uint32_t(now - jogAt) >= 300)) {
        jogging = false; state->disarm(aham_bench::ManualStop);
    }
    if (!configured || WiFi.status() != WL_CONNECTED) {
        state->lost(); jogging = false;
        if (listening) { udp.stop(); listening = false; }
    } else {
        if (!listening) {
            listening = udp.begin(port) == 1;
            if (listening) { Serial.print("ESP_IP="); Serial.print(WiFi.localIP()); Serial.print(" UDP="); Serial.println(port); }
        }
        if (listening) receive();
    }
    serialCommands();
    // JOG is a 300 ms detached bench motion; stop/link ticks still take precedence.
    outputs(millis());
    if (uint32_t(now - lastPrint) >= 500) {
        lastPrint = now;
        Serial.print("INDEX VIB="); Serial.print(state->vibration); Serial.print(" RES%="); Serial.print(state->resistance);
        Serial.print(" HOLD="); Serial.print(bool(state->flags & 2)); Serial.print(" ARMED="); Serial.print(state->armed);
        Serial.print(" PWM="); Serial.print(state->pwm); Serial.print(" SERVO_US="); Serial.print(state->pulse);
        Serial.print(" OE_ENABLED="); Serial.print(oeEnabled); Serial.print(" REASON="); Serial.println(state->reason);
    }
    delay(1);
}
