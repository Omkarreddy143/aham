#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace aham {
constexpr uint8_t Version = 1;
constexpr size_t MaxRaw = 64, MaxEncoded = 66;
enum Type : uint8_t { Telemetry = 1, Haptic = 2, Control = 3 };
enum Action : uint8_t { Disarm = 0, Arm = 1, CaptureOpen = 2, CaptureClosed = 3, ClearFault = 4 };
enum State : uint8_t { Disarmed = 0, Calibrating = 1, Armed = 2, Fault = 3 };
enum FaultCode : uint8_t { None = 0, Stop = 1, Timeout = 2, UnsupportedPressure = 3, Sensor = 4 };
struct Packet { uint8_t type = 0; uint16_t seq = 0; uint32_t timeMs = 0; uint8_t payload[54] = {}; size_t length = 0; };
inline uint16_t u16(const uint8_t* p) { return uint16_t(p[0]) | uint16_t(p[1]) << 8; }
inline uint32_t u32(const uint8_t* p) { return uint32_t(u16(p)) | uint32_t(u16(p + 2)) << 16; }
inline void put16(uint8_t* p, uint16_t n) { p[0] = uint8_t(n); p[1] = uint8_t(n >> 8); }
inline void put32(uint8_t* p, uint32_t n) { put16(p, uint16_t(n)); put16(p + 2, uint16_t(n >> 16)); }
inline uint16_t crc(const uint8_t* data, size_t length) {
    uint16_t n = 0xffff;
    for (size_t i = 0; i < length; ++i) {
        n ^= uint16_t(data[i]) << 8;
        for (uint8_t b = 0; b < 8; ++b) n = n & 0x8000 ? uint16_t((n << 1) ^ 0x1021) : uint16_t(n << 1);
    }
    return n;
}
inline size_t encode(const Packet& packet, uint8_t* out) {
    if (packet.length > sizeof(packet.payload)) return 0;
    uint8_t raw[MaxRaw]; raw[0] = Version; raw[1] = packet.type;
    put16(raw + 2, packet.seq); put32(raw + 4, packet.timeMs);
    memcpy(raw + 8, packet.payload, packet.length);
    size_t size = packet.length + 10; put16(raw + size - 2, crc(raw, size - 2));
    size_t codeAt = 0, at = 1; uint8_t code = 1;
    for (size_t i = 0; i < size; ++i) {
        if (raw[i] == 0) { out[codeAt] = code; codeAt = at++; code = 1; }
        else { out[at++] = raw[i]; ++code; }
    }
    out[codeAt] = code; out[at++] = 0; return at;
}
// Encoded input excludes the terminating zero.
inline bool decode(const uint8_t* in, size_t length, Packet& packet) {
    if (length == 0 || length > MaxEncoded - 1) return false;
    uint8_t raw[MaxRaw]; size_t at = 0, count = 0;
    while (at < length) {
        uint8_t code = in[at++];
        if (!code || at + code - 1 > length) return false;
        for (uint8_t b = 1; b < code; ++b) {
            if (count >= MaxRaw || in[at] == 0) return false;
            raw[count++] = in[at++];
        }
        if (code != 255 && at < length) { if (count >= MaxRaw) return false; raw[count++] = 0; }
    }
    if (count < 10 || raw[0] != Version || crc(raw, count - 2) != u16(raw + count - 2)) return false;
    packet.type = raw[1]; packet.seq = u16(raw + 2); packet.timeMs = u32(raw + 4);
    packet.length = count - 10; memcpy(packet.payload, raw + 8, packet.length); return true;
}
class StreamDecoder {
    uint8_t buffer[MaxEncoded]; size_t length = 0; bool overflow = false;
public:
    bool feed(uint8_t byte, Packet& packet) {
        if (!byte) { bool valid = !overflow && decode(buffer, length, packet); length = 0; overflow = false; return valid; }
        if (length >= MaxEncoded - 1) overflow = true;
        else if (!overflow) buffer[length++] = byte;
        return false;
    }
};
}
