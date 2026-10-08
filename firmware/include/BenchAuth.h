#pragma once
#include <bearssl/bearssl.h>
#include "BenchController.h"

namespace aham_bench {
inline void tag(const aham::Packet& packet, size_t bodyLength, const uint8_t* key, uint8_t* out) {
    const char domain[] = "AHAM-BENCH-v1";
    uint8_t header[8]; header[0] = aham::Version; header[1] = packet.type;
    aham::put16(header + 2, packet.seq); aham::put32(header + 4, packet.timeMs);
    br_hmac_key_context kc; br_hmac_context ctx;
    br_hmac_key_init(&kc, &br_sha256_vtable, key, 32);
    br_hmac_init(&ctx, &kc, TagSize);
    br_hmac_update(&ctx, domain, sizeof(domain) - 1);
    br_hmac_update(&ctx, header, sizeof(header));
    br_hmac_update(&ctx, packet.payload, bodyLength); br_hmac_out(&ctx, out);
}
inline bool authentic(const aham::Packet& packet, size_t bodyLength, const uint8_t* key) {
    if (packet.length != bodyLength + TagSize) return false;
    uint8_t expected[TagSize]; tag(packet, bodyLength, key, expected);
    uint8_t difference = 0;
    for (size_t i = 0; i < TagSize; ++i) difference |= expected[i] ^ packet.payload[bodyLength + i];
    return difference == 0;
}
inline void sign(aham::Packet& packet, size_t bodyLength, const uint8_t* key) {
    tag(packet, bodyLength, key, packet.payload + bodyLength); packet.length = bodyLength + TagSize;
}
}
