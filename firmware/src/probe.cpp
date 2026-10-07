#include <Arduino.h>
#include <Wire.h>
#include <ESP8266WiFi.h>
#include "BoardConfig.h"

// Text-only bench diagnostic. No servo or motor commands; no binary host protocol.
void setup() {
    digitalWrite(board::servoOePin, HIGH); pinMode(board::servoOePin, OUTPUT);
    for (int i = 0; i < 5; ++i) if (board::motorPins[i] != 255) {
        digitalWrite(board::motorPins[i], LOW); pinMode(board::motorPins[i], OUTPUT);
    }
    WiFi.persistent(false); WiFi.mode(WIFI_OFF);
    Serial.begin(115200); Wire.begin(board::sdaPin, board::sclPin); Wire.setClock(100000);
    delay(500);
    Serial.println("AHAM NODEMCU PROBE: actuator supplies must be disconnected.");
    Serial.println("I2C addresses (ACK only; not a complete device test):");
    for (uint8_t address = 1; address < 127; ++address) {
        Wire.beginTransmission(address);
        if (Wire.endTransmission() == 0) Serial.printf("  0x%02X\n", address);
        yield();
    }
    for (uint8_t address = 0x68; address <= 0x69; ++address) {
        Wire.beginTransmission(address); Wire.write(0x75);
        if (Wire.endTransmission(false) == 0 && Wire.requestFrom(address, uint8_t(1)) == 1)
            Serial.printf("MPU address 0x%02X WHO_AM_I=0x%02X (expected 0x68)\n", address, Wire.read());
    }
    Serial.println("A0 is not a flex measurement until a verified divider is connected.");
}
void loop() {
    Serial.printf("A0 raw 10-bit: %u\n", unsigned(analogRead(A0)));
    delay(1000);
}
