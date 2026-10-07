#pragma once
#include <Arduino.h>
#include <Wire.h>

// Raw acquisition only: no XYZ position or heading estimate.
class Mpu6050 {
    uint8_t address = 0;
    uint32_t lastProbe = 0;
    bool writeRegister(uint8_t reg, uint8_t value) {
        Wire.beginTransmission(address); Wire.write(reg); Wire.write(value);
        return Wire.endTransmission() == 0;
    }
    bool readRegisters(uint8_t reg, uint8_t* bytes, uint8_t count) {
        Wire.beginTransmission(address); Wire.write(reg);
        if (Wire.endTransmission(false) != 0 || Wire.requestFrom(address, count) != count) return false;
        for (uint8_t i = 0; i < count; ++i) bytes[i] = uint8_t(Wire.read());
        return true;
    }
public:
    int16_t raw[6] = {}; // accel XYZ (+/-2 g), gyro XYZ (+/-250 deg/s)
    bool valid = false;
    void begin(uint8_t sda, uint8_t scl) {
        Wire.begin(sda, scl); Wire.setClock(100000);
#if defined(ESP8266)
        Wire.setClockStretchLimit(1500);
#else
        Wire.setTimeOut(3);
#endif
    }
    void update(uint32_t now) {
        if (!address) {
            if (uint32_t(now - lastProbe) < 1000) return;
            lastProbe = now;
            for (uint8_t candidate = 0x68; candidate <= 0x69; ++candidate) {
                address = candidate; uint8_t id;
                if (readRegisters(0x75, &id, 1) && id == 0x68 &&
                    writeRegister(0x6b, 1) && writeRegister(0x1a, 3) &&
                    writeRegister(0x19, 9) && writeRegister(0x1b, 0) && writeRegister(0x1c, 0)) break;
                address = 0;
            }
            valid = false; return;
        }
        uint8_t bytes[14];
        valid = readRegisters(0x3b, bytes, sizeof(bytes));
        if (!valid) { address = 0; memset(raw, 0, sizeof(raw)); return; }
        for (int i = 0; i < 6; ++i) {
            int offset = i < 3 ? i * 2 : i * 2 + 2;
            raw[i] = int16_t(uint16_t(bytes[offset]) << 8 | bytes[offset + 1]);
        }
    }
};
