#pragma once
#include <stdint.h>

// Copy to ignored BenchConfig.h. Enable each circuit only AFTER its bench checks.
namespace bench_config {
constexpr bool motorVerified = false; // Diode, transistor pinout, external 3 V supply.
constexpr bool servoVerified = false; // External 5 V V+, OE pull-up, detached tendon.
constexpr uint8_t servoChannel = 1; // Index; other 15 channels remain off.
constexpr uint16_t homeUs = 1500; // Determine unloaded; this is NOT a force limit.
constexpr int16_t pullDeltaUs = 0; // After detached JOG tests: start with +20 or -20 us.
// Firmware independently rejects home/pull outside 1400..1600 us or delta >100 us.
}
