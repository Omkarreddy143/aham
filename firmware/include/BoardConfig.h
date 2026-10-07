#pragma once
#include <stdint.h>

// Provisional CLASSIC ESP32 DevKit layout. Verify the received board before wiring.
namespace board {
constexpr uint8_t flexPins[5] = {32, 33, 34, 35, 36};
constexpr uint8_t motorPins[5] = {18, 19, 23, 25, 26};
constexpr uint8_t fsrPin = 39;
constexpr bool fsrEnabled = false;
// Normally closed stop loop to GND: HIGH/open wire means STOP.
constexpr uint8_t stopPin = 27;
// External pull-up to 3.3 V is required; HIGH disables PCA9685 output signals.
constexpr uint8_t servoOePin = 13;
constexpr uint32_t baud = 230400;
constexpr uint32_t samplePeriodMs = 10;
}
