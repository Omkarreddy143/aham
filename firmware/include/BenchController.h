#pragma once
#include "AhamProtocol.h"

// Actuator-only bench protocol. Monitor types 5/6 cannot reach this controller.
// Authentication is checked by wifi_bench.cpp before accept().
namespace aham_bench {
constexpr uint8_t Command = 7, Receipt = 8, Hello = 9, HelloReceipt = 10;
constexpr size_t CommandSize = 14, TagSize = 16, ReceiptSize = 16;
enum Reason : uint8_t { Boot = 0, Ready = 1, ManualStop = 2, StopOpen = 3,
    LinkLost = 4, ArmExpired = 5, PullExpired = 6, I2cFault = 7, SessionChanged = 8 };
struct Controller {
    uint32_t boot, session = 0, receivedAt = 0, armedAt = 0, pullAt = 0, rampAt = 0;
    uint16_t sequence = 0, leaseMs = 250, checksum = 0, home, pulse;
    int16_t delta;
    uint8_t allowed, armed = 0, flags = 0, vibration = 0, pattern = 0, resistance = 0;
    uint8_t pwm = 0, reason = Boot;
    bool live = false, pulling = false;
    Controller(uint32_t nonce, uint8_t outputs, uint16_t homeUs, int16_t pullUs)
        : boot(nonce), home(homeUs), pulse(homeUs), delta(pullUs), allowed(outputs & 3) {}
    void disarm(uint8_t why) {
        armed = 0; pwm = 0; pulse = home; pulling = false; reason = why;
    }
    void lost(uint8_t why = LinkLost) {
        live = false; flags = vibration = pattern = resistance = 0; disarm(why);
    }
    bool arm(uint8_t outputs, uint32_t now, bool stopClosed) {
        // Local serial command only, fresh link, open hand and zero cue required.
        if (!outputs || (outputs & ~allowed) || !stopClosed || !live ||
            uint32_t(now - receivedAt) >= leaseMs || flags & 2 || vibration || resistance ||
            (outputs & 2 && reason == I2cFault)) return false;
        armed = outputs; armedAt = rampAt = now; reason = Ready; pulse = home; pwm = 0;
        return true;
    }
    bool accept(const aham::Packet& packet, uint32_t now) {
        if (packet.type != Command || packet.length != CommandSize + TagSize) return false;
        const uint8_t* p = packet.payload;
        const uint32_t next = aham::u32(p), nonce = aham::u32(p + 4);
        const uint16_t lease = aham::u16(p + 8);
        if (!next || nonce != boot || lease < 100 || lease > 250 || p[10] > 3 ||
            p[11] > 160 || p[12] > 3 || p[13] > 80 ||
            (!(p[10] & 1) && (p[11] || p[12])) || (!(p[10] & 2) && p[13])) return false;
        if (live && uint32_t(now - receivedAt) >= leaseMs) lost();
        if (session == next) {
            const uint16_t advance = uint16_t(packet.seq - sequence);
            if (!advance || advance >= 0x8000) return false;
        } else if (session) {
            if (live && uint32_t(now - receivedAt) < leaseMs) return false;
            disarm(SessionChanged); // A new sender never inherits arming.
        }
        session = next; sequence = packet.seq; receivedAt = now; leaseMs = lease;
        flags = p[10]; vibration = p[11]; pattern = p[12]; resistance = p[13];
        checksum = aham::crc(p, CommandSize); live = true;
        return true;
    }
    void tick(uint32_t now, bool stopClosed) {
        if (!stopClosed) { lost(StopOpen); return; }
        if (live && uint32_t(now - receivedAt) >= leaseMs) { lost(); return; }
        if (!live || !armed) { pwm = 0; pulse = home; return; }
        if (uint32_t(now - armedAt) >= 60000) { disarm(ArmExpired); return; }
        // Patterns: steady, slow pulse, rough pulse, soft pulse. Bounded on-time.
        const bool gate = pattern == 0 || (pattern == 1 ? now % 180 < 65 :
                          pattern == 2 ? now % 70 < 25 : now % 280 < 100);
        pwm = armed & 1 && flags & 1 && gate ? vibration : 0;
        const bool pull = (armed & 2) && (flags & 2) && resistance && delta;
        if (!pull) { pulse = home; pulling = false; rampAt = now; return; }
        if (!pulling) { pulling = true; pullAt = rampAt = now; }
        if (uint32_t(now - pullAt) >= 3000) { disarm(PullExpired); return; }
        // 80% preview -> configured small full stroke. Actual tendon force unknown.
        const int target = int(home) + int(delta) * resistance / 80;
        const uint32_t steps = uint32_t(now - rampAt) / 20;
        if (steps) {
            rampAt += steps * 20;
            const int limit = steps > 10 ? 20 : int(steps) * 2;
            const int difference = target - int(pulse);
            pulse = uint16_t(int(pulse) + (difference > limit ? limit :
                             difference < -limit ? -limit : difference));
        }
    }
};
}
