#pragma once
#include "AhamProtocol.h"

// These two packet kinds are OBSERVATION ONLY. No actuator driver is included.
namespace aham_wifi {
constexpr uint8_t Preview = 5, Receipt = 6;
constexpr size_t PayloadSize = 27;
struct Monitor {
    uint32_t session = 0, receivedAt = 0;
    uint16_t sequence = 0, leaseMs = 250, checksum = 0;
    uint8_t flags = 0, vibration[5] = {}, patterns[5] = {}, resistance[5] = {}, reference[5] = {};
    bool live = false;
    void clear() {
        live = false; flags = 0;
        memset(vibration, 0, 5); memset(patterns, 0, 5);
        memset(resistance, 0, 5); memset(reference, 0, 5);
    }
    void tick(uint32_t now) { if (live && uint32_t(now - receivedAt) >= leaseMs) clear(); }
    bool accept(const aham::Packet& packet, uint32_t now) {
        if (packet.type != Preview || packet.length != PayloadSize) return false;
        const uint8_t* p = packet.payload;
        uint32_t nextSession = aham::u32(p);
        uint16_t nextLease = aham::u16(p + 4);
        if (!nextSession || nextLease < 100 || nextLease > 250 || p[6] > 3) return false;
        for (int i = 0; i < 5; ++i) {
            if (p[7+i] > 160 || p[12+i] > 3 || p[17+i] > 80 || p[22+i] > 100) return false;
            if (!(p[6] & 1) && (p[7+i] || p[12+i])) return false;
            if (!(p[6] & 2) && (p[17+i] || p[22+i])) return false;
        }
        tick(now);
        if (nextSession == session) {
            const uint16_t advance = uint16_t(packet.seq - sequence);
            if (!advance || advance >= 0x8000) return false;
        } else if (live) {
            return false; // A sender restart must wait for the old lease to expire.
        }
        session = nextSession; sequence = packet.seq; leaseMs = nextLease; receivedAt = now;
        flags = p[6]; live = true; checksum = aham::crc(p, PayloadSize);
        memcpy(vibration, p+7, 5); memcpy(patterns, p+12, 5);
        memcpy(resistance, p+17, 5); memcpy(reference, p+22, 5);
        return true;
    }
    aham::Packet receipt(uint32_t now) const {
        aham::Packet result; result.type = Receipt; result.seq = sequence; result.timeMs = now; result.length = 8;
        aham::put32(result.payload, session); aham::put16(result.payload+4, checksum);
        result.payload[6] = 0; // Motor output mask: always OFF.
        result.payload[7] = 0; // Servo output enabled: always false.
        return result;
    }
};
}
