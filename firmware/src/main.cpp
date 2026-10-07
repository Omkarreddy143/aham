#include <Arduino.h>
#include <Preferences.h>
#include "BoardConfig.h"
#include "ActuatorSupervisor.h"

aham::Supervisor supervisor;
aham::StreamDecoder decoder;
Preferences settings;
uint16_t rawFlex[5] = {}, txSeq = 0;
uint32_t lastSample = 0;

void readSensors() {
    for (int i = 0; i < 5; ++i) {
        uint32_t total = 0;
        for (int j = 0; j < 8; ++j) total += analogRead(board::flexPins[i]);
        rawFlex[i] = uint16_t(total / 8);
    }
    supervisor.sensors(rawFlex, digitalRead(board::stopPin) == LOW);
}
void saveCalibration() {
    if (!supervisor.calibrated()) return;
    uint16_t a[5], b[5]; supervisor.copyCalibration(a, b);
    uint16_t pairs[10]; memcpy(pairs, a, sizeof(a)); memcpy(pairs + 5, b, sizeof(b));
    settings.putBytes("flex", pairs, sizeof(pairs));
}
void sendTelemetry(uint32_t now) {
    aham::Packet p; p.type = aham::Telemetry; p.seq = txSeq++; p.timeMs = now; p.length = 33;
    p.payload[0] = supervisor.state; aham::put16(p.payload + 1, supervisor.flags(now)); p.payload[3] = supervisor.fault;
    for (int i = 0; i < 5; ++i) {
        aham::put16(p.payload + 4 + i * 2, supervisor.curl(i));
        aham::put16(p.payload + 14 + i * 2, rawFlex[i]);
        p.payload[26 + i] = supervisor.duty(i, now);
    }
    aham::put16(p.payload + 24, board::fsrEnabled ? uint16_t(analogRead(board::fsrPin)) : 0);
    aham::put16(p.payload + 31, 1); // Vibration capability only. No pressure commands accepted.
    uint8_t bytes[aham::MaxEncoded]; size_t length = aham::encode(p, bytes);
    if (Serial.availableForWrite() >= int(length)) Serial.write(bytes, length);
}
void setup() {
    // Hold the servo signal generator disabled even though no mechanical driver is included.
    digitalWrite(board::servoOePin, HIGH); pinMode(board::servoOePin, OUTPUT);
    pinMode(board::stopPin, INPUT_PULLUP);
    for (int i = 0; i < 5; ++i) {
        digitalWrite(board::motorPins[i], LOW); pinMode(board::motorPins[i], OUTPUT);
        ledcSetup(i, 20000, 8); ledcAttachPin(board::motorPins[i], i); ledcWrite(i, 0);
    }
    analogReadResolution(12); analogSetAttenuation(ADC_11db);
    Serial.begin(board::baud); settings.begin("aham", false);
    if (settings.getBytesLength("flex") == sizeof(uint16_t) * 10) {
        uint16_t pairs[10]; settings.getBytes("flex", pairs, sizeof(pairs)); supervisor.loadCalibration(pairs, pairs + 5);
    }
    readSensors();
}
void loop() {
    uint32_t now = millis();
    if (uint32_t(now - lastSample) >= board::samplePeriodMs) { lastSample = now; readSensors(); }
    // Stop input is checked every iteration, independently of serial traffic.
    if (digitalRead(board::stopPin) != LOW) supervisor.sensors(rawFlex, false);
    aham::Packet p;
    // Bound serial work so a flood cannot starve supervision.
    for (int i = 0; i < 96 && Serial.available(); ++i) {
        if (decoder.feed(uint8_t(Serial.read()), p)) {
            bool accepted = supervisor.accept(p, millis());
            if (accepted && p.type == aham::Control && p.payload[0] == aham::CaptureClosed) saveCalibration();
        }
    }
    now = millis(); supervisor.tick(now);
    for (int i = 0; i < 5; ++i) ledcWrite(i, supervisor.duty(i, now));
    static uint32_t lastTx = 0;
    if (uint32_t(now - lastTx) >= 10) { lastTx = now; sendTelemetry(now); }
}
