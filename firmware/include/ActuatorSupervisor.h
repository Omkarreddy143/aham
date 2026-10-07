#pragma once
#include "AhamProtocol.h"

namespace aham {
class Supervisor {
    bool openSet = false, closedSet = false, hasSeq = false;
    uint16_t lastSeq = 0, open[5] = {}, closed[5] = {}, raw[5] = {};
    uint8_t desired[5] = {}, pattern[5] = {};
    uint32_t start[5] = {}, refreshMs = 0;
    uint16_t leaseMs = 100;
    bool stopHealthy = false, sensorHealthy = false;
    void zero() { memset(desired, 0, sizeof(desired)); }
    void fail(FaultCode code) { zero(); state = Fault; fault = code; }
    bool fresh(uint16_t seq) const { uint16_t delta = uint16_t(seq - lastSeq); return !hasSeq || (delta != 0 && delta < 32768); }
public:
    State state = Disarmed; FaultCode fault = None;
    bool calibrated() const {
        if (!openSet || !closedSet) return false;
        for (int i = 0; i < 5; ++i) {
            int span = int(closed[i]) - int(open[i]); if (span < 0) span = -span;
            if (span < 120 || open[i] < 4 || closed[i] < 4 || open[i] > 4091 || closed[i] > 4091) return false;
        }
        return true;
    }
    bool loadCalibration(const uint16_t* a, const uint16_t* b) {
        memcpy(open, a, sizeof(open)); memcpy(closed, b, sizeof(closed)); openSet = closedSet = true;
        return calibrated();
    }
    void copyCalibration(uint16_t* a, uint16_t* b) const { memcpy(a, open, sizeof(open)); memcpy(b, closed, sizeof(closed)); }
    void sensors(const uint16_t* values, bool healthyStop) {
        memcpy(raw, values, sizeof(raw)); stopHealthy = healthyStop; sensorHealthy = true;
        for (int i = 0; i < 5; ++i) if (raw[i] < 4 || raw[i] > 4091) sensorHealthy = false;
        if (state == Armed && !stopHealthy) fail(Stop);
        if (state == Armed && !sensorHealthy) fail(Sensor);
    }
    bool accept(const Packet& p, uint32_t now) {
        if (p.type == Control) {
            if (p.length != 1 || p.payload[0] > ClearFault) return false;
            // A valid explicit disarm always stops output and establishes a new host sequence baseline.
            if (p.payload[0] == Disarm) { zero(); if (state != Fault) state = Disarmed; lastSeq = p.seq; hasSeq = true; return true; }
            if (!fresh(p.seq)) return false;
            lastSeq = p.seq; hasSeq = true;
            if (p.payload[0] == ClearFault && stopHealthy && sensorHealthy) { zero(); state = Disarmed; fault = None; return true; }
            if (state == Fault) return false;
            if (p.payload[0] == Arm) {
                if (!calibrated() || !stopHealthy || !sensorHealthy || state == Armed) return false;
                zero(); state = Armed; refreshMs = now; leaseMs = 100; return true;
            }
            if (state == Armed) return false;
            if (p.payload[0] == CaptureOpen) { memcpy(open, raw, sizeof(open)); openSet = true; }
            if (p.payload[0] == CaptureClosed) { memcpy(closed, raw, sizeof(closed)); closedSet = true; }
            return true;
        }
        if (p.type != Haptic || p.length != 15 || !fresh(p.seq)) return false;
        uint16_t lease = u16(p.payload);
        if (lease == 0 || lease > 100) return false;
        for (int i = 0; i < 5; ++i) if (p.payload[7 + i] > 3) return false;
        if (u16(p.payload + 12) || p.payload[14]) { if (state == Armed) fail(UnsupportedPressure); return false; }
        if (state != Armed || !stopHealthy || !sensorHealthy) return false;
        lastSeq = p.seq; hasSeq = true; refreshMs = now; leaseMs = lease;
        for (int i = 0; i < 5; ++i) {
            uint8_t next = p.payload[2 + i] > 160 ? 160 : p.payload[2 + i];
            if (next && !desired[i]) start[i] = now;
            desired[i] = next; pattern[i] = p.payload[7 + i];
        }
        return true;
    }
    void tick(uint32_t now) { if (state == Armed && uint32_t(now - refreshMs) >= 150) fail(Timeout); }
    uint8_t duty(int i, uint32_t now) const {
        if (state != Armed || uint32_t(now - refreshMs) >= leaseMs || uint32_t(now - start[i]) >= 2000) return 0;
        uint32_t elapsed = uint32_t(now - start[i]);
        if (pattern[i] == 1 && elapsed % 200 >= 60) return 0;
        if (pattern[i] == 2 && elapsed % 80 >= 35) return uint8_t(desired[i] / 3);
        if (pattern[i] == 3) return uint8_t(desired[i] / 2);
        return desired[i];
    }
    uint16_t flags(uint32_t now) const {
        uint16_t out = (calibrated() ? 1 : 0) | (stopHealthy ? 2 : 0) | (sensorHealthy ? 4 : 0);
        if (state == Armed && uint32_t(now - refreshMs) >= leaseMs) out |= 8;
        for (int i = 0; i < 5; ++i) if (desired[i] && uint32_t(now - start[i]) >= 2000) out |= 16;
        return out;
    }
    uint16_t curl(int i) const {
        if (!calibrated()) return 0;
        int n = (int(raw[i]) - int(open[i])) * 1000 / (int(closed[i]) - int(open[i]));
        return uint16_t(n < 0 ? 0 : n > 1000 ? 1000 : n);
    }
};
}
