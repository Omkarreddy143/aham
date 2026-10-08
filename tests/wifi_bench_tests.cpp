#include "BenchController.h"
#include <assert.h>
#include <stdio.h>
#include <fstream>
#include <string>

aham::Packet command(uint16_t seq = 1, uint8_t flags = 0, uint8_t vib = 0, uint8_t res = 0) {
    aham::Packet p; p.type = aham_bench::Command; p.seq = seq;
    p.length = aham_bench::CommandSize + aham_bench::TagSize;
    aham::put32(p.payload, 123); aham::put32(p.payload + 4, 456); aham::put16(p.payload + 8, 250);
    p.payload[10] = flags; p.payload[11] = vib; p.payload[12] = vib ? 1 : 0; p.payload[13] = res;
    return p; // Tags are checked in firmware transport; controller tests assume verified packets.
}
int main(int argc, char** argv) {
    assert(argc == 2);
    std::ifstream input(argv[1]); std::string hex; input >> hex;
    uint8_t bytes[aham::MaxEncoded]; const size_t length = hex.size() / 2;
    assert(length <= sizeof(bytes));
    for (size_t i = 0; i < length; ++i) bytes[i] = uint8_t(std::stoul(hex.substr(i*2, 2), nullptr, 16));
    aham::Packet fixture; assert(bytes[length-1] == 0 && aham::decode(bytes, length-1, fixture));
    aham_bench::Controller interoperability(456, 3, 1500, 80);
    assert(interoperability.accept(fixture, 100));
    assert(interoperability.vibration == 95 && interoperability.resistance == 16);
    assert(interoperability.flags == 3 && interoperability.armed == 0);
    assert(!interoperability.arm(3, 101, true)); // Cannot arm while already holding.

    aham_bench::Controller s(456, 3, 1500, 80);
    assert(!s.arm(3, 0, true)); // No live link.
    assert(s.accept(command(), 100)); assert(!s.arm(3, 100, false));
    assert(s.arm(3, 100, true));
    assert(s.accept(command(2, 3, 95, 80), 120)); s.tick(120, true);
    s.tick(220, true); assert(s.pulse == 1510); assert(s.armed == 3);
    auto invalid = command(3, 3, 161, 80); assert(!s.accept(invalid, 221));
    invalid = command(3, 3, 95, 81); assert(!s.accept(invalid, 221));
    invalid = command(3); aham::put32(invalid.payload + 4, 457); assert(!s.accept(invalid, 221));
    invalid = command(3); invalid.type = 5; assert(!s.accept(invalid, 221));
    assert(!s.accept(command(2, 3, 95, 80), 221)); // Duplicate.
    assert(s.accept(command(3), 230)); s.tick(230, true);
    assert(s.pulse == 1500 && s.pwm == 0); // Release parks immediately.
    assert(s.accept(command(4, 3, 95, 80), 240)); s.tick(240, true);
    s.tick(250, false); assert(s.armed == 0 && s.pwm == 0 && s.pulse == 1500);
    s.tick(260, true); assert(s.armed == 0); // Closing stop does not rearm.
    assert(s.accept(command(5), 270)); assert(s.arm(2, 270, true));
    s.tick(520, true); assert(!s.live && !s.armed && s.reason == aham_bench::LinkLost);
    assert(s.accept(command(6), 530)); assert(!s.armed); assert(s.arm(2, 530, true));
    assert(s.accept(command(7), 800)); assert(!s.armed); // Expired link cannot inherit arm even during accept.

    aham_bench::Controller duration(456, 2, 1500, -80);
    assert(duration.accept(command(), 0)); assert(duration.arm(2, 0, true));
    for (uint32_t now = 20; now <= 3100; now += 20) {
        assert(duration.accept(command(uint16_t(now), 2, 0, 80), now)); duration.tick(now, true);
        assert(duration.pulse >= 1420 && duration.pulse <= 1500);
    }
    assert(duration.armed == 0 && duration.pulse == 1500 && duration.reason == aham_bench::PullExpired);
    assert(duration.accept(command(4000), 3120)); assert(duration.arm(2, 3120, true));
    auto newSender = command(1); aham::put32(newSender.payload, 124);
    assert(!duration.accept(newSender, 3130));
    assert(duration.accept(newSender, 3400)); assert(!duration.armed);

    aham_bench::Controller time(456, 1, 1500, 0);
    assert(time.accept(command(65535), 0xfffffff0)); assert(time.arm(1, 0xfffffff0, true));
    assert(time.accept(command(0), 0x10)); time.tick(0x20, true); assert(time.armed == 1);
    time.tick(0x10a, true); assert(!time.armed); // Millisecond clock wrap + exact lease.
    aham_bench::Controller disabled(456, 0, 1500, 0);
    assert(disabled.accept(command(), 1)); assert(!disabled.arm(1, 2, true)); assert(!disabled.arm(2, 2, true));
    aham_bench::Controller sessionTime(456, 1, 1500, 0);
    assert(sessionTime.accept(command(), 0)); assert(sessionTime.arm(1, 0, true));
    for (uint32_t now = 100; now <= 60000; now += 100) {
        assert(sessionTime.accept(command(uint16_t(now / 100 + 1)), now)); sessionTime.tick(now, true);
    }
    assert(!sessionTime.armed && sessionTime.reason == aham_bench::ArmExpired);
    puts("Index bench interoperability, arming, stop, timeout, pull cap, replay and wrap checks passed");
}
