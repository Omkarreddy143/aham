#include "ActuatorSupervisor.h"
#include <fstream>
#include <iostream>
#include <sstream>
#include <string>
#include <vector>
#include <cstdlib>

using namespace aham;
int checks = 0;
void check(bool good, const char* message) { ++checks; if (!good) { std::cerr << "FAIL: " << message << '\n'; std::exit(1); } }
Packet ctrl(uint16_t seq, uint8_t action) { Packet p; p.type = Control; p.seq = seq; p.length = 1; p.payload[0] = action; return p; }
Packet vibration(uint16_t seq, uint8_t intensity = 255) { Packet p; p.type = Haptic; p.seq = seq; p.length = 15; put16(p.payload, 100); p.payload[2] = intensity; return p; }
void ready(Supervisor& s, uint32_t now = 0) {
    uint16_t a[5] = {900, 900, 900, 900, 900}, b[5] = {2700, 2700, 2700, 2700, 2700};
    s.sensors(a, true); s.accept(ctrl(0, Disarm), now); s.accept(ctrl(1, CaptureOpen), now);
    s.sensors(b, true); s.accept(ctrl(2, CaptureClosed), now); check(s.calibrated(), "calibration");
    check(s.accept(ctrl(3, Arm), now), "explicit arming");
}
std::vector<uint8_t> hex(const std::string& text) {
    std::vector<uint8_t> bytes;
    for (size_t i = 0; i < text.size(); i += 2) bytes.push_back(uint8_t(std::stoul(text.substr(i, 2), nullptr, 16)));
    return bytes;
}
int main(int argc, char** argv) {
    check(crc(reinterpret_cast<const uint8_t*>("123456789"), 9) == 0x29b1, "standard CRC16 check vector");
    check(argc == 2, "fixture path required");
    std::ifstream file(argv[1]); check(bool(file), "fixtures available"); std::string line;
    while (std::getline(file, line)) {
        if (line.empty()) continue;
        std::stringstream input(line); std::vector<std::string> fields; std::string field;
        while (std::getline(input, field, '|')) fields.push_back(field);
        auto payload = hex(fields[3]), frame = hex(fields[4]); Packet p;
        check(decode(frame.data(), frame.size() - 1, p), "cross-language frame decoded");
        check(p.type == std::stoi(fields[0]) && p.seq == std::stoi(fields[1]) && p.timeMs == std::stoul(fields[2]) && p.length == payload.size() && memcmp(p.payload, payload.data(), p.length) == 0, "decoded fields agree");
        uint8_t encoded[MaxEncoded]; size_t size = encode(p, encoded);
        check(size == frame.size() && memcmp(encoded, frame.data(), size) == 0, "C++ encoder agrees with Python fixture");
        StreamDecoder stream; Packet recovered;
        for (int i = 0; i < 100; ++i) stream.feed(0xaa, recovered);
        stream.feed(0, recovered); bool found = false;
        for (uint8_t byte : frame) if (stream.feed(byte, recovered)) found = true;
        check(found, "stream recovers after oversized frame");
    }
    Supervisor uncalibrated; uint16_t values[5] = {1000, 1000, 1000, 1000, 1000}; uncalibrated.sensors(values, true);
    check(!uncalibrated.accept(ctrl(1, Arm), 0), "cannot arm without calibration");
    Supervisor s; ready(s); check(s.accept(vibration(4), 10), "valid haptic accepted");
    check(s.duty(0, 10) == 160, "duty is locally capped");
    check(!s.accept(vibration(4), 90), "duplicate cannot refresh lease");
    check(!s.accept(vibration(3), 90), "out-of-order cannot refresh lease");
    check(s.duty(0, 109) == 160 && s.duty(0, 110) == 0, "lease expires at 100 ms");
    s.tick(160); check(s.state == Fault && s.fault == Timeout, "timeout latches fault at 150 ms");
    check(!s.accept(ctrl(5, Arm), 161), "timeout cannot silently re-arm");
    check(s.accept(ctrl(6, ClearFault), 162) && s.state == Disarmed, "clear leaves disarmed");
    Supervisor stop; ready(stop); stop.accept(vibration(4), 1); stop.sensors(values, false);
    check(stop.state == Fault && stop.fault == Stop && stop.duty(0, 2) == 0, "physical stop overrides command");
    check(!stop.accept(ctrl(5, ClearFault), 3), "fault cannot clear while stop loop open");
    Supervisor sensor; ready(sensor); values[2] = 4095; sensor.sensors(values, true);
    check(sensor.state == Fault && sensor.fault == Sensor, "rail sensor faults active output");
    Supervisor pressure; ready(pressure); Packet unsupported = vibration(4); put16(unsupported.payload + 12, 10);
    check(!pressure.accept(unsupported, 1) && pressure.fault == UnsupportedPressure, "unsupported pressure fails closed");
    Supervisor malformed; ready(malformed); Packet bad = vibration(4); put16(bad.payload, 101);
    check(!malformed.accept(bad, 1), "oversized lease rejected");
    Supervisor wrap; ready(wrap, 0xfffffff0u); wrap.accept(vibration(4), 0xfffffff0u);
    check(wrap.duty(0, 0x20) == 160 && wrap.duty(0, 0x60) == 0, "millis wrap does not extend lease");
    Supervisor duration; ready(duration);
    for (int i = 0; i <= 100; ++i) duration.accept(vibration(uint16_t(4 + i)), uint32_t(i * 20));
    check(duration.duty(0, 2000) == 0, "continuous request capped at two seconds");
    duration.accept(vibration(105, 0), 2001); duration.accept(vibration(106), 2002);
    check(duration.duty(0, 2002) == 160, "release resets duration limit");
    Supervisor seq; uint16_t a[5] = {900,900,900,900,900}, b[5] = {2700,2700,2700,2700,2700};
    seq.sensors(a,true); seq.accept(ctrl(65534,Disarm),0); seq.accept(ctrl(65535,CaptureOpen),0);
    seq.sensors(b,true); seq.accept(ctrl(0,CaptureClosed),0); check(seq.accept(ctrl(1,Arm),0), "sequence wrap accepted");
    Supervisor single(2, 2);
    uint16_t singleOpen[5] = {0, 900, 0, 0, 0}, singleClosed[5] = {4095, 2700, 0, 0, 0};
    single.sensors(singleOpen, true); single.accept(ctrl(0, CaptureOpen), 0);
    single.sensors(singleClosed, true); single.accept(ctrl(1, CaptureClosed), 0);
    check(single.calibrated() && single.curl(1) == 1000 && single.curl(0) == 0, "single sensor calibration ignores absent channels");
    check(single.accept(ctrl(2, Arm), 0), "single sensor can arm");
    Packet allMotors = vibration(3); memset(allMotors.payload + 2, 160, 5);
    check(single.accept(allMotors, 1), "single channel accepts complete haptic packet");
    check(single.duty(1, 1) == 160 && single.duty(0, 1) == 0 && single.duty(4, 1) == 0, "absent motors cannot actuate");
    singleClosed[1] = 0; single.sensors(singleClosed, true);
    check(single.fault == Sensor && single.duty(1, 2) == 0, "active single sensor rail still faults");
    Supervisor noDriver(2, 0); ready(noDriver); noDriver.accept(allMotors, 1);
    check(noDriver.duty(1, 1) == 0, "unverified driver keeps output zero");
    Supervisor noSensors(0, 31); noSensors.sensors(a, true); noSensors.loadCalibration(a, b);
    check(!noSensors.accept(ctrl(1, Arm), 0), "zero sensors cannot arm");
    std::cout << "PASS: " << checks << " native protocol/supervisor checks\n";
}
