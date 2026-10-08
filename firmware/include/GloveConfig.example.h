#pragma once
#include <stdint.h>

// Copy to ignored GloveConfig.h. Order: thumb, index, middle, ring, little.
namespace glove_config {
constexpr uint8_t motorVerifiedMask = 0; // Bit weights 1,2,4,8,16. Index-only = 2; all = 31.
constexpr uint8_t servoVerifiedMask = 0; // Enable only circuits whose bench checks passed.
constexpr uint16_t homeUs[5] = {1500, 1500, 1500, 1500, 1500};
constexpr int16_t pullDeltaUs[5] = {0, 0, 0, 0, 0}; // After detached direction tests, start +/-20 us.
// Hard limits enforced independently: home & end in 1400..1600 us, abs(delta)<=100 us.
}
