#if !defined(ESP8266)
#error "Select nodemcu_wifi_glove for ESP-12E / ESP8266."
#endif
#include <Arduino.h>
#include <ESP8266WiFi.h>
#include <WiFiUdp.h>
#include <Wire.h>
#include <stdio.h>
#include "BoardConfig.h"
#include "BenchAuth.h"
#include "GloveOutputs.h"
#include "BenchServoSweep.h"
#if __has_include("WifiSecrets.h")
#include "WifiSecrets.h"
#else
#include "WifiSecrets.example.h"
#endif
#if __has_include("GloveConfig.h")
#include "GloveConfig.h"
#else
#include "GloveConfig.example.h"
#endif
#if __has_include("BenchSecrets.h")
#include "BenchSecrets.h"
#else
constexpr uint8_t benchKey[32] = {};
#endif

namespace {
WiFiUDP udp;
IPAddress laptop;
aham_glove::Controller* state = nullptr;
aham_glove::Outputs output;
bool configured = false, listening = false, pcaReady = false, paired = false, usbSession = false;
uint16_t writtenServo[5] = {}, writtenMotor[5] = {};
uint32_t lastPrint = 0, jogAt = 0;
int jogFinger = -1;
uint16_t jogPulse = 1500;
constexpr uint16_t port = 4212;
constexpr uint8_t address = 0x40;
uint32_t jogDurationMs = 3 * 1000;
bool benchSweep = false;
const char* names[5] = {"THUMB", "INDEX", "MIDDLE", "RING", "LITTLE"};

bool writeRegister(uint8_t reg, uint8_t value) {
    Wire.beginTransmission(address); Wire.write(reg); Wire.write(value);
    return Wire.endTransmission() == 0;
}
bool readRegister(uint8_t reg, uint8_t& value) {
    Wire.beginTransmission(address); Wire.write(reg);
    if (Wire.endTransmission(false) != 0 || Wire.requestFrom(address, uint8_t(1)) != 1) return false;
    value = uint8_t(Wire.read()); return true;
}
bool writeChannel(uint8_t ch, uint16_t ticks) {
    // Zero uses FULL_OFF, which overrides the ON comparator.
    Wire.beginTransmission(address); Wire.write(uint8_t(0x06 + ch * 4));
    Wire.write(uint8_t(0)); Wire.write(uint8_t(0));
    Wire.write(uint8_t(ticks)); Wire.write(uint8_t(ticks ? ticks >> 8 : 0x10));
    return Wire.endTransmission() == 0;
}
bool setupPca() {
    Wire.begin(board::sdaPin, board::sclPin); Wire.setClock(100000); Wire.setClockStretchLimit(2000);
    // All 16 channels share this approximately 50 Hz frequency. OUTDRV=1 drives BJT bases.
    if (!writeRegister(0x00, 0x30) || !writeRegister(0xfe, 121) ||
        !writeRegister(0x01, 0x04) || !writeRegister(0x00, 0x20)) return false;
    delay(1); if (!writeRegister(0x00, 0xa0)) return false;
    for (uint8_t ch = 0; ch < 16; ++ch) if (!writeChannel(ch, 0)) return false;
    return true;
}
void i2cFault() {
    digitalWrite(board::servoOePin, HIGH); pcaReady = false; jogFinger = -1;
    state->lost(aham_bench::I2cFault); output.reset();
    Serial.println("I2C FAULT: OE disabled. Cut actuator power and release tendons manually; reboot after repair.");
}
void applyOutputs(uint32_t now) {
    if (!pcaReady) { digitalWrite(board::servoOePin, HIGH); output.reset(); return; }
    output.plan(*state, now, jogFinger, jogPulse);
    // Zero motors BEFORE parking servos. Any failed write disables all outputs via OE.
    for (uint8_t i = 0; i < 5; ++i) if (output.motorTicks[i] != writtenMotor[i]) {
        if (!writeChannel(aham_glove::MotorChannels[i], output.motorTicks[i])) { i2cFault(); return; }
        writtenMotor[i] = output.motorTicks[i];
    }
    for (uint8_t i = 0; i < 5; ++i) if (output.servoTicks[i] != writtenServo[i]) {
        if (!writeChannel(aham_glove::ServoChannels[i], output.servoTicks[i])) { i2cFault(); return; }
        writtenServo[i] = output.servoTicks[i];
    }
    digitalWrite(board::servoOePin, output.enabled ? LOW : HIGH);
}
void pcaStatus() {
    // Read actual chip registers rather than repeating the controller's requests.
    uint8_t mode1, mode2, prescale, allOn, allOff, servo[4], motor[4];
    bool ok = pcaReady && readRegister(0x00, mode1) && readRegister(0x01, mode2) &&
        readRegister(0xfe, prescale) && readRegister(0xfb, allOn) && readRegister(0xfd, allOff);
    for (uint8_t i = 0; ok && i < 4; ++i) {
        ok = readRegister(uint8_t(0x06 + 4 * 1 + i), servo[i]) &&
             readRegister(uint8_t(0x06 + 4 * 9 + i), motor[i]);
    }
    if (!ok) { i2cFault(); Serial.println("PCA DIAG READ_FAILED; outputs disabled"); return; }
    Serial.print("PCA DIAG MODE1=0x"); Serial.print(mode1, HEX);
    Serial.print(" MODE2=0x"); Serial.print(mode2, HEX);
    Serial.print(" PRESCALE="); Serial.print(prescale);
    Serial.print(" NOMINAL_HZ="); Serial.print(25000000.0 / (4096.0 * (prescale + 1)), 2);
    Serial.print(" D7_LEVEL="); Serial.print(digitalRead(board::servoOePin));
    Serial.print(" ALL_ON_H=0x"); Serial.print(allOn, HEX);
    Serial.print(" ALL_OFF_H=0x"); Serial.print(allOff, HEX);
    const uint8_t* channels[2] = {servo, motor};
    for (uint8_t i = 0; i < 2; ++i) {
        const uint8_t* data = channels[i];
        const uint16_t on = uint16_t(data[0]) | (uint16_t(data[1] & 15) << 8);
        const uint16_t off = uint16_t(data[2]) | (uint16_t(data[3] & 15) << 8);
        Serial.print(i ? " CH9_ON=" : " CH1_ON="); Serial.print(on);
        Serial.print(" OFF="); Serial.print(off);
        Serial.print(" FULL_ON="); Serial.print(bool(data[1] & 16));
        Serial.print(" FULL_OFF="); Serial.print(bool(data[3] & 16));
    }
    Serial.println();
}
void pwmProbe() {
    // Optional extra wire from the selected PCA PWM signal to D5, with VCC <=3.3 V.
    // Two bounded measurements take at most 50 ms; no output is armed or changed.
    const uint32_t highUs = pulseIn(board::motorPins[1], HIGH, 25000);
    const uint32_t lowUs = pulseIn(board::motorPins[1], LOW, 25000);
    const uint32_t period = highUs && lowUs ? highUs + lowUs : 0;
    Serial.print("PWM PROBE PIN=D5 HIGH_US="); Serial.print(highUs);
    Serial.print(" LOW_US="); Serial.print(lowUs);
    Serial.print(" PERIOD_US="); Serial.print(period);
    Serial.print(" HZ="); Serial.print(period ? 1000000.0 / period : 0.0, 2);
    Serial.println("; physical jumper required; separate cycles sampled");
}
int fingerNumber(const char* text) {
    for (int i = 0; i < 5; ++i) if (!strcmp(text, names[i])) return i;
    if (!strcmp(text, "PINKY")) return 4;
    return -1;
}
void commands(const char* text) {
    const uint32_t now = millis();
    state->tick(now, digitalRead(board::stopPin) == LOW);
    if (!strcmp(text, "PCA STATUS")) { pcaStatus(); return; }
    if (!strcmp(text, "PWM PROBE")) { pwmProbe(); return; }
    if (!strcmp(text, "STATUS")) {
        Serial.print("STATUS PCA="); Serial.print(pcaReady);
        Serial.print(" STOP_CLOSED="); Serial.print(digitalRead(board::stopPin) == LOW);
        Serial.print(" WIFI="); Serial.print(WiFi.status() == WL_CONNECTED);
        Serial.print(" LIVE="); Serial.print(state->live);
        Serial.print(" AGE_MS="); Serial.print(uint32_t(now - state->receivedAt));
        Serial.print(" M_ALLOWED="); Serial.print(state->allowedMotors);
        Serial.print(" S_ALLOWED="); Serial.print(state->allowedServos);
        Serial.print(" HOLD="); Serial.print(bool(state->flags & 2));
        Serial.print(" TRANSPORT="); Serial.print(usbSession ? "USB" : "WIFI");
        Serial.print(" REASON="); Serial.println(state->reason);
        return;
    }
    if (!strcmp(text, "STOP") || !strcmp(text, "HOME")) {
        jogFinger = -1; state->disarm(aham_bench::ManualStop); applyOutputs(now);
        Serial.println("DISARMED: motor zero and home requested; use mechanical release if loaded."); return;
    }
    char kind[8] = {}, finger[8] = {}, extra;
    if (sscanf(text, "ARM %7s %7s %c", kind, finger, &extra) == 2) {
        const int number = fingerNumber(finger);
        const uint8_t selected = !strcmp(finger, "ALL") ? 31 : number >= 0 ? uint8_t(1 << number) : 0;
        const bool motor = !strcmp(kind, "MOTOR") || !strcmp(kind, "BOTH");
        const bool servo = !strcmp(kind, "SERVO") || !strcmp(kind, "BOTH");
        const uint8_t motors = motor ? selected & state->allowedMotors : 0;
        const uint8_t servos = servo ? selected & state->allowedServos : 0;
        // ALL selects only verified circuits; a named finger must be fully verified for the requested kinds.
        const bool namedMissing = strcmp(finger, "ALL") &&
            ((motor && motors != selected) || (servo && servos != selected));
        if (!selected || !(motor || servo) || namedMissing || !pcaReady ||
            !state->arm(motors, servos, now, digitalRead(board::stopPin) == LOW)) {
            Serial.println("NOT ARMED: check verification masks, PCA, D6 STOP loop, fresh link, open hand and zero cues."); return;
        }
        jogFinger = -1; applyOutputs(now);
        Serial.print("ARMED motor mask="); Serial.print(state->armedMotors);
        Serial.print(" servo mask="); Serial.println(state->armedServos); return;
    }
    char direction[5] = {}, seconds[3] = {};
    if (sscanf(text, "SWEEP %7s %c", finger, &extra) == 1) {
        const int number = fingerNumber(finger);
        if (number < 0 || state->armedMotors ||
            state->armedServos != uint8_t(1 << number) || (state->flags & 2) || !pcaReady) {
            Serial.println("SWEEP refused: arm only the named servo, zero cues, detach all threads."); return;
        }
        jogFinger = number; jogPulse = state->home[number]; jogAt = now;
        jogDurationMs = aham_glove::ServoSweepDurationMs; benchSweep = true;
        applyOutputs(now); Serial.print("10 s SWEEP "); Serial.print(names[number]);
        Serial.println(" center 1s, +250 us 3s, -250 us 3s, center 3s; clamped 1250..1750 us.");
        return;
    }
    const int jogFields = sscanf(text, "JOG %7s %4s %2s %c", finger, direction, seconds, &extra);
    if (jogFields == 2 || jogFields == 3) {
        const int number = fingerNumber(finger);
        const bool knownDuration = jogFields == 2 || !strcmp(seconds, "3") ||
            !strcmp(seconds, "10") || !strcmp(seconds, "15");
        const bool knownStep = !strcmp(direction, "+10") || !strcmp(direction, "-10") ||
            !strcmp(direction, "+50") || !strcmp(direction, "-50") ||
            !strcmp(direction, "+100") || !strcmp(direction, "-100");
        if (number < 0 || !knownStep || !knownDuration ||
            !(state->armedServos & (1 << number)) || (state->flags & 2) || !pcaReady) {
            Serial.println("JOG needs an armed named servo, open hand, detached tendon and duration 3, 10 or 15 seconds."); return;
        }
        const int pulse = int(state->home[number]) + atoi(direction);
        if (pulse < 1400 || pulse > 1600) return;
        jogFinger = number; jogPulse = uint16_t(pulse); jogAt = now; benchSweep = false;
        jogDurationMs = jogFields == 2 ? 3000 : uint32_t(atoi(seconds)) * 1000;
        applyOutputs(now); Serial.print(jogDurationMs / 1000); Serial.print(" s JOG "); Serial.print(names[number]);
        Serial.print(" pulse us="); Serial.println(pulse); return;
    }
    Serial.println("STATUS; PCA STATUS; PWM PROBE; ARM MOTOR|SERVO|BOTH THUMB|INDEX|MIDDLE|RING|LITTLE|ALL; JOG INDEX +/-10|50|100 [3|10|15 seconds]; SWEEP INDEX (detached only); STOP; HOME. Send newline.");
}
bool handlePacket(const aham::Packet& packet, aham::Packet& ack, bool fromUsb);
int hexDigit(char value) {
    if (value >= '0' && value <= '9') return value - '0';
    if (value >= 'a' && value <= 'f') return value - 'a' + 10;
    if (value >= 'A' && value <= 'F') return value - 'A' + 10;
    return -1;
}
void serialFrame(const char* text) {
    const size_t length = strlen(text);
    if (!paired || length < 4 || length > aham::MaxEncoded * 2 || (length & 1)) return;
    uint8_t bytes[aham::MaxEncoded];
    for (size_t i = 0; i < length / 2; ++i) {
        const int high = hexDigit(text[i*2]), low = hexDigit(text[i*2+1]);
        if (high < 0 || low < 0) return;
        bytes[i] = uint8_t(high * 16 + low);
    }
    aham::Packet packet, ack;
    if (bytes[length/2-1] || !aham::decode(bytes, length/2-1, packet) || !handlePacket(packet, ack, true)) return;
    const size_t count = aham::encode(ack, bytes);
    const char digits[] = "0123456789abcdef";
    Serial.print("FRAME_ACK ");
    for (size_t i = 0; i < count; ++i) { Serial.print(digits[bytes[i] >> 4]); Serial.print(digits[bytes[i] & 15]); }
    Serial.println();
}
void serialCommands() {
    static char line[aham::MaxEncoded * 2 + 8]; static size_t used = 0; static bool overflow = false;
    for (int count = 0; count < 64 && Serial.available(); ++count) {
        const char c = char(Serial.read()); if (c == '\r') continue;
        if (c == '\n') {
            if (!overflow) {
                line[used] = 0;
                if (!strncmp(line, "FRAME ", 6)) serialFrame(line + 6);
                else commands(line);
            }
            used = 0; overflow = false;
        } else if (used < sizeof(line)-1) line[used++] = c;
        else overflow = true;
    }
}
void cancelJog(uint32_t now) {
    if (jogFinger >= 0 && (!(state->armedServos & (1 << jogFinger)) || (state->flags & 2) ||
        uint32_t(now - jogAt) >= jogDurationMs)) {
        jogFinger = -1; benchSweep = false;
        if (state->armedMotors | state->armedServos) state->disarm(aham_bench::ManualStop);
    } else if (jogFinger >= 0 && benchSweep) {
        jogPulse = aham_glove::benchSweepPulse(state->home[jogFinger], uint32_t(now - jogAt));
    }
}
bool handlePacket(const aham::Packet& packet, aham::Packet& ack, bool fromUsb) {
        if (!paired) return false;
        if (packet.type == aham_bench::Hello && aham_bench::authentic(packet, 4, benchKey) && aham::u32(packet.payload)) {
            ack.type = aham_bench::HelloReceipt; ack.seq = packet.seq; ack.timeMs = millis();
            memcpy(ack.payload, packet.payload, 4); aham::put32(ack.payload + 4, state->boot);
            aham_bench::sign(ack, 8, benchKey);
        } else if (packet.type == aham_glove::Command &&
                   aham_bench::authentic(packet, aham_glove::CommandSize, benchKey) && state->accept(packet, millis())) {
            usbSession = fromUsb;
            state->tick(millis(), digitalRead(board::stopPin) == LOW); cancelJog(millis()); applyOutputs(millis());
            ack.type = aham_glove::Receipt; ack.seq = state->sequence; ack.timeMs = millis();
            aham::put32(ack.payload, state->session); aham::put32(ack.payload + 4, state->boot);
            aham::put16(ack.payload + 8, state->checksum);
            ack.payload[10] = state->armedMotors; ack.payload[11] = state->armedServos;
            memcpy(ack.payload + 12, state->pwm, 5);
            for (uint8_t i = 0; i < 5; ++i) aham::put16(ack.payload + 17 + i*2,
                output.servoSignalMask & (1 << i) ? output.reportedPulse[i] : state->home[i]);
            ack.payload[27] = output.servoSignalMask; ack.payload[28] = state->reason;
            aham_bench::sign(ack, aham_glove::ReceiptSize, benchKey);
        } else return false;
        return true;
}
void receive() {
    for (int count = 0; count < 8; ++count) {
        const int size = udp.parsePacket(); if (!size) break;
        if (udp.remoteIP() != laptop || size < 2 || size > int(aham::MaxEncoded)) { udp.flush(); continue; }
        const IPAddress sender = udp.remoteIP(); const uint16_t senderPort = udp.remotePort();
        uint8_t bytes[aham::MaxEncoded]; const int read = udp.read(bytes, sizeof(bytes));
        aham::Packet packet, ack;
        if (read != size || bytes[read-1] || !aham::decode(bytes, size-1, packet) || !handlePacket(packet, ack, false)) continue;
        const size_t length = aham::encode(ack, bytes);
        if (udp.beginPacket(sender, senderPort)) { udp.write(bytes, length); udp.endPacket(); }
    }
}
template <typename T> void printArray(const T* array) {
    Serial.print('['); for (int i = 0; i < 5; ++i) { if (i) Serial.print(','); Serial.print(array[i]); } Serial.print(']');
}
}
void setup() {
    digitalWrite(board::servoOePin, HIGH); pinMode(board::servoOePin, OUTPUT);
    pinMode(board::motorPins[1], INPUT); // D5 optional PWM probe; disconnect the old direct motor driver.
    pinMode(board::stopPin, INPUT_PULLUP); Serial.begin(115200);
    Serial.println("\nAHAM FIVE-FINGER BENCH: DISARMED; order T/I/M/R/L; servos 0..4, motor SIGNALS 8..12.");
    static aham_glove::Controller controller(ESP.random() | 1, glove_config::motorVerifiedMask,
        glove_config::servoVerifiedMask, glove_config::homeUs, glove_config::pullDeltaUs);
    state = &controller;
    pcaReady = setupPca();
    if (!pcaReady) state->disarm(aham_bench::I2cFault);
    uint8_t keySet = 0; for (uint8_t byte : benchKey) keySet |= byte;
    paired = keySet != 0;
    configured = keySet && laptop.fromString(AHAM_LAPTOP_IP) && strcmp(AHAM_WIFI_SSID, "SET_HOTSPOT_NAME");
    Serial.print("Verified motor mask="); Serial.print(state->allowedMotors);
    Serial.print(" servo mask="); Serial.print(state->allowedServos); Serial.print(" PCA="); Serial.println(pcaReady);
    Serial.println("Motor drivers: external 3 V + transistor + diode EACH. PCA V+ = separate 5 V servo rail.");
    Serial.println("D6 normally closed STOP loop to GND; D7 OE has external 1k pull-up to 3V. Tendons DETACHED first.");
    WiFi.persistent(false);
    if (!configured) { WiFi.mode(WIFI_OFF); Serial.println("Configure WifiSecrets.h and run setup_wifi_bench.py --five-finger first."); return; }
    WiFi.mode(WIFI_STA); WiFi.hostname("aham-five-finger"); WiFi.setAutoReconnect(true);
    // Keep the 250 ms actuator lease responsive; modem sleep can delay LAN packets.
    WiFi.setSleepMode(WIFI_NONE_SLEEP);
    WiFi.begin(AHAM_WIFI_SSID, AHAM_WIFI_PASSWORD);
}
void loop() {
    const uint32_t now = millis();
    state->tick(now, digitalRead(board::stopPin) == LOW);
    if (!configured || WiFi.status() != WL_CONNECTED) {
        if (!usbSession) state->lost(pcaReady ? aham_bench::LinkLost : aham_bench::I2cFault);
        if (listening) { udp.stop(); listening = false; }
    } else {
        if (!listening) {
            listening = udp.begin(port) == 1;
            if (listening) { Serial.print("ESP_IP="); Serial.print(WiFi.localIP()); Serial.print(" UDP="); Serial.println(port); }
        }
        if (listening) receive();
    }
    cancelJog(millis()); serialCommands(); cancelJog(millis()); applyOutputs(millis());
    if (uint32_t(now - lastPrint) >= 500) {
        lastPrint = now; Serial.print("VIB="); printArray(state->vibration);
        Serial.print(" RES%="); printArray(state->resistance); Serial.print(" PWM="); printArray(state->pwm);
        Serial.print(" SERVO_US="); printArray(state->pulse); Serial.print(" M_ARM="); Serial.print(state->armedMotors);
        Serial.print(" S_ARM="); Serial.print(state->armedServos); Serial.print(" S_SIGNAL="); Serial.print(output.servoSignalMask);
        Serial.print(" REASON="); Serial.println(state->reason);
    }
    delay(1);
}
