#pragma once
#include "GloveController.h"

namespace aham_glove {
// A pure output planner, also exercised by native tests. Disarmed servos receive
// a best-effort home pulse for 300 ms, then their individual channel turns off.
struct Outputs {
    uint16_t servoTicks[5] = {}, motorTicks[5] = {}, reportedPulse[5] = {};
    uint32_t parkAt[5] = {};
    uint8_t servoSignalMask = 0, parkingMask = 0;
    bool enabled = false;
    void reset() {
        enabled = false; servoSignalMask = parkingMask = 0;
        memset(servoTicks, 0, sizeof(servoTicks)); memset(motorTicks, 0, sizeof(motorTicks));
    }
    void plan(const Controller& c, uint32_t now, int jogFinger = -1, uint16_t jogPulse = 1500) {
        uint8_t nextSignal = 0; bool motorOn = false;
        for (uint8_t i = 0; i < 5; ++i) {
            const uint8_t bit = 1 << i;
            const bool armed = c.armedServos & bit;
            if (armed) parkingMask &= ~bit;
            else if ((servoSignalMask & bit) && !(parkingMask & bit)) { parkingMask |= bit; parkAt[i] = now; }
            const bool signal = armed || ((parkingMask & bit) && uint32_t(now - parkAt[i]) < 300);
            if (signal) nextSignal |= bit;
            else parkingMask &= ~bit;
            reportedPulse[i] = armed ? (jogFinger == i ? jogPulse : c.pulse[i]) : c.home[i];
            servoTicks[i] = signal ? uint16_t((uint32_t(reportedPulse[i]) * 4096 + 10000) / 20000) : 0;
            motorTicks[i] = uint16_t(uint32_t(c.pwm[i]) * 4096 / 255);
            motorOn |= c.pwm[i] != 0;
        }
        servoSignalMask = nextSignal; enabled = nextSignal || motorOn;
    }
};
}
