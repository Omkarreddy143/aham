#pragma once
#include "BenchController.h"

namespace aham_glove {
constexpr uint8_t Command = 11, Receipt = 12;
constexpr size_t CommandSize = 26, ReceiptSize = 29;
constexpr uint8_t ServoChannels[5] = {0, 1, 2, 3, 4};
constexpr uint8_t MotorChannels[5] = {8, 9, 10, 11, 12};
inline bool validLimits(uint16_t home, int16_t delta) {
    return home >= 1400 && home <= 1600 && delta >= -100 && delta <= 100 &&
        int(home) + delta >= 1400 && int(home) + delta <= 1600;
}
struct Controller {
    uint32_t boot, session = 0, receivedAt = 0, armedAt = 0;
    uint32_t pullAt[5] = {}, rampAt[5] = {};
    uint16_t sequence = 0, leaseMs = 250, checksum = 0, home[5] = {}, pulse[5] = {};
    int16_t delta[5] = {};
    uint8_t allowedMotors = 0, allowedServos = 0, armedMotors = 0, armedServos = 0;
    uint8_t flags = 0, vibration[5] = {}, pattern[5] = {}, resistance[5] = {}, pwm[5] = {};
    uint8_t reason = aham_bench::Boot;
    bool live = false, pulling[5] = {};
    Controller(uint32_t nonce, uint8_t motors, uint8_t servos, const uint16_t* homes, const int16_t* pulls)
        : boot(nonce), allowedMotors(motors & 31) {
        for (uint8_t i = 0; i < 5; ++i) {
            const bool valid = validLimits(homes[i], pulls[i]);
            home[i] = pulse[i] = valid ? homes[i] : 1500;
            delta[i] = valid ? pulls[i] : 0;
            if (valid && (servos & (1 << i))) allowedServos |= 1 << i;
        }
    }
    void disarm(uint8_t why) {
        armedMotors = armedServos = 0; reason = why;
        memset(pwm, 0, sizeof(pwm)); memset(pulling, 0, sizeof(pulling));
        memcpy(pulse, home, sizeof(pulse));
    }
    void lost(uint8_t why = aham_bench::LinkLost) {
        live = false; flags = 0;
        memset(vibration, 0, 5); memset(pattern, 0, 5); memset(resistance, 0, 5);
        disarm(why);
    }
    bool arm(uint8_t motors, uint8_t servos, uint32_t now, bool stopClosed) {
        if (!(motors | servos) || (motors & ~allowedMotors) || (servos & ~allowedServos) ||
            !stopClosed || !live || uint32_t(now - receivedAt) >= leaseMs || (flags & 2) ||
            reason == aham_bench::I2cFault) return false;
        for (uint8_t i = 0; i < 5; ++i) if (vibration[i] || resistance[i]) return false;
        disarm(aham_bench::Ready); armedMotors = motors; armedServos = servos; armedAt = now;
        for (uint8_t i = 0; i < 5; ++i) rampAt[i] = now;
        return true;
    }
    // Transport must verify HMAC before calling this method.
    bool accept(const aham::Packet& packet, uint32_t now) {
        if (packet.type != Command || packet.length != CommandSize + aham_bench::TagSize) return false;
        const uint8_t* p = packet.payload;
        const uint32_t nextSession = aham::u32(p), nonce = aham::u32(p + 4);
        const uint16_t lease = aham::u16(p + 8);
        if (!nextSession || nonce != boot || lease < 100 || lease > 250 || p[10] > 3) return false;
        for (uint8_t i = 0; i < 5; ++i) {
            if (p[11+i] > 160 || p[16+i] > 3 || p[21+i] > 80 ||
                (!(p[10] & 1) && (p[11+i] || p[16+i])) || (!(p[10] & 2) && p[21+i])) return false;
        }
        if (live && uint32_t(now - receivedAt) >= leaseMs) lost();
        if (nextSession == session) {
            const uint16_t advance = uint16_t(packet.seq - sequence);
            if (!advance || advance >= 0x8000) return false;
        } else if (session) {
            if (live && uint32_t(now - receivedAt) < leaseMs) return false;
            disarm(aham_bench::SessionChanged);
        }
        session = nextSession; sequence = packet.seq; leaseMs = lease; receivedAt = now;
        flags = p[10]; live = true; checksum = aham::crc(p, CommandSize);
        memcpy(vibration, p + 11, 5); memcpy(pattern, p + 16, 5); memcpy(resistance, p + 21, 5);
        return true;
    }
    void tick(uint32_t now, bool stopClosed) {
        if (!stopClosed) { lost(aham_bench::StopOpen); return; }
        if (live && uint32_t(now - receivedAt) >= leaseMs) { lost(); return; }
        if (!live || !(armedMotors | armedServos)) { memset(pwm, 0, 5); memcpy(pulse, home, sizeof(pulse)); return; }
        if (uint32_t(now - armedAt) >= 60000) { disarm(aham_bench::ArmExpired); return; }
        for (uint8_t i = 0; i < 5; ++i) {
            const bool gate = pattern[i] == 0 || (pattern[i] == 1 ? now % 180 < 65 :
                              pattern[i] == 2 ? now % 70 < 25 : now % 280 < 100);
            pwm[i] = (armedMotors & (1 << i)) && (flags & 1) && gate ? vibration[i] : 0;
            const bool pull = (armedServos & (1 << i)) && (flags & 2) && resistance[i] && delta[i];
            if (!pull) { pulse[i] = home[i]; pulling[i] = false; rampAt[i] = now; continue; }
            if (!pulling[i]) { pulling[i] = true; pullAt[i] = rampAt[i] = now; }
            if (uint32_t(now - pullAt[i]) >= 3000) { disarm(aham_bench::PullExpired); return; }
            const int target = int(home[i]) + int(delta[i]) * resistance[i] / 80;
            const uint32_t steps = uint32_t(now - rampAt[i]) / 20;
            if (steps) {
                rampAt[i] += steps * 20;
                const int limit = steps > 10 ? 20 : int(steps) * 2;
                const int diff = target - int(pulse[i]);
                pulse[i] = uint16_t(int(pulse[i]) + (diff > limit ? limit : diff < -limit ? -limit : diff));
            }
        }
    }
};
}
