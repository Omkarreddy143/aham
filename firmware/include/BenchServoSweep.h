#pragma once
#include <stdint.h>

namespace aham_glove {
// Detached, unloaded bench observation only. Never used for VR resistance.
constexpr uint32_t ServoSweepDurationMs = 10000;
inline uint16_t benchSweepPulse(uint16_t home, uint32_t elapsedMs) {
    const uint16_t center = home >= 1400 && home <= 1600 ? home : 1500;
    int target = center;
    if (elapsedMs >= 1000 && elapsedMs < 4000) target += 250;
    else if (elapsedMs >= 4000 && elapsedMs < 7000) target -= 250;
    return uint16_t(target < 1250 ? 1250 : target > 1750 ? 1750 : target);
}
}
