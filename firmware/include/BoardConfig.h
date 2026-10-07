#pragma once
#include <stdint.h>

// Finger order: thumb, index, middle, ring, little. Unavailable channels stay zero.
namespace board {
#if defined(ESP8266)
constexpr uint8_t flexPins[5] = {255, A0, 255, 255, 255};
constexpr uint8_t motorPins[5] = {255, 14, 255, 255, 255}; // D5: index only
constexpr uint8_t sensorMask = 2;
constexpr uint8_t stopPin = 12; // D6, normally closed loop to GND
constexpr uint8_t servoOePin = 13; // D7; external 3.3 V pull-up required
constexpr uint8_t sdaPin = 4, sclPin = 5; // D2 / D1
constexpr uint8_t fsrPin = A0;
#else
constexpr uint8_t flexPins[5] = {32, 33, 34, 35, 36};
constexpr uint8_t motorPins[5] = {18, 19, 23, 25, 26};
constexpr uint8_t sensorMask = 31;
constexpr uint8_t fsrPin = 39;
// Normally closed stop loop to GND: HIGH/open wire means STOP.
constexpr uint8_t stopPin = 27;
// External pull-up to 3.3 V is required; HIGH disables PCA9685 output signals.
constexpr uint8_t servoOePin = 13;
constexpr uint8_t sdaPin = 21, sclPin = 22;
#endif
// Received kit has no motor driver. Enable ONLY after driver/supply/stop bench checks.
constexpr bool motorDriverVerified = false;
constexpr uint8_t motorMask = motorDriverVerified ? sensorMask : 0;
constexpr bool fsrEnabled = false;
constexpr uint16_t capabilities = (motorMask ? 1 : 0) | (sensorMask << 2) | (motorMask << 7);
constexpr uint32_t baud = 230400;
constexpr uint32_t samplePeriodMs = 10;
}
