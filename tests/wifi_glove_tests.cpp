#include "GloveOutputs.h"
#include "BenchServoSweep.h"
#include <assert.h>
#include <stdio.h>
#include <fstream>
#include <string>

const uint16_t homes[5] = {1500, 1500, 1500, 1500, 1500};
const int16_t pulls[5] = {80, -80, 40, -40, 100};
aham::Packet command(uint16_t seq=1, uint8_t flags=0, uint8_t value=0) {
    aham::Packet p; p.type=aham_glove::Command; p.seq=seq;
    p.length=aham_glove::CommandSize+aham_bench::TagSize;
    aham::put32(p.payload,123); aham::put32(p.payload+4,456); aham::put16(p.payload+8,250); p.payload[10]=flags;
    for(int i=0;i<5;i++){p.payload[11+i]=flags&1?value:0; p.payload[21+i]=flags&2?value:0;}
    return p; // Transport authenticates first; this test exercises the controller/planner.
}
int main(int argc,char** argv) {
    assert(argc==2);std::ifstream input(argv[1]);std::string hex;input>>hex;
    uint8_t bytes[aham::MaxEncoded];const size_t length=hex.size()/2;assert(length<=sizeof(bytes));
    for(size_t i=0;i<length;i++)bytes[i]=uint8_t(std::stoul(hex.substr(i*2,2),nullptr,16));
    aham::Packet p;assert(bytes[length-1]==0&&aham::decode(bytes,length-1,p));
    aham_glove::Controller fixture(456,31,31,homes,pulls);assert(fixture.accept(p,100));
    for(int i=0;i<5;i++){assert(fixture.vibration[i]==95);assert(fixture.resistance[i]==15+i);}
    assert(!fixture.armedMotors&&!fixture.armedServos&&!fixture.arm(31,31,101,true));

    aham_glove::Controller s(456,31,31,homes,pulls);aham_glove::Outputs output;
    assert(!s.arm(31,31,0,true));assert(s.accept(command(),100));assert(!s.arm(31,31,100,false));
    assert(s.arm(31,31,100,true));output.plan(s,100);assert(output.servoSignalMask==31);
    assert(s.accept(command(2,3,80),120));s.tick(120,true);
    for(uint32_t now=140;now<=340;now+=20){s.tick(now,true);output.plan(s,now);}
    assert(s.pulse[0]==1522&&s.pulse[1]==1478&&s.pulse[2]==1522&&s.pulse[3]==1478&&s.pulse[4]==1522);
    for(int i=0;i<5;i++)assert(output.motorTicks[i]==uint32_t(80)*4096/255);
    auto bad=command(3,3,80);bad.payload[15]=161;assert(!s.accept(bad,341)); // Invalid little vibration.
    bad=command(3,3,80);bad.payload[25]=81;assert(!s.accept(bad,341));
    bad=command(3);bad.type=7;assert(!s.accept(bad,341));
    bad=command(3);aham::put32(bad.payload+4,457);assert(!s.accept(bad,341));
    assert(!s.accept(command(2,3,80),341));
    assert(s.accept(command(3),345));s.tick(345,true);output.plan(s,345);
    for(int i=0;i<5;i++)assert(s.pulse[i]==homes[i]&&s.pwm[i]==0);
    s.tick(350,false);output.plan(s,350);assert(!s.armedMotors&&!s.armedServos);
    assert(output.servoSignalMask==31);output.plan(s,649);assert(output.servoSignalMask==31);
    output.plan(s,650);assert(!output.enabled&&!output.servoSignalMask);
    output.plan(s,651);assert(!output.enabled); // Parking must not restart itself.
    assert(s.accept(command(4),660));assert(!s.armedServos);assert(s.arm(2,2,660,true));
    output.plan(s,660);assert(output.servoSignalMask==2);
    output.plan(s,661,1,1510);assert(output.reportedPulse[1]==1510&&output.reportedPulse[0]==1500);
    assert(s.accept(command(5,3,80),680));s.tick(680,true);output.plan(s,680);
    assert(s.pwm[1]==80);for(int i=0;i<5;i++)if(i!=1)assert(!s.pwm[i]&&output.motorTicks[i]==0);
    s.tick(930,true);output.plan(s,930);assert(!s.armedMotors&&!s.armedServos&&s.reason==aham_bench::LinkLost);
    for(int i=0;i<5;i++)assert(output.motorTicks[i]==0);
    assert(s.accept(command(6),931));assert(!s.armedServos);assert(s.arm(2,2,931,true));
    assert(s.accept(command(7),1200));assert(!s.armedServos); // Late frame cannot inherit arm.

    aham_glove::Controller duration(456,31,31,homes,pulls);
    assert(duration.accept(command(),0));assert(duration.arm(31,31,0,true));
    for(uint32_t now=20;now<=3100;now+=20){assert(duration.accept(command(uint16_t(now),2,80),now));duration.tick(now,true);}
    assert(!duration.armedServos&&duration.reason==aham_bench::PullExpired);
    for(int i=0;i<5;i++)assert(duration.pulse[i]==homes[i]);
    assert(duration.accept(command(4000),3120));assert(duration.arm(31,31,3120,true));
    auto newSender=command(1);aham::put32(newSender.payload,124);assert(!duration.accept(newSender,3130));
    assert(duration.accept(newSender,3400));assert(!duration.armedServos);

    aham_glove::Controller expiry(456,31,31,homes,pulls);
    assert(expiry.accept(command(),0));assert(expiry.arm(31,31,0,true));
    for(uint32_t now=100;now<=60000;now+=100){assert(expiry.accept(command(uint16_t(now/100+1)),now));expiry.tick(now,true);}
    assert(!expiry.armedServos&&expiry.reason==aham_bench::ArmExpired);
    aham_glove::Controller wrap(456,2,2,homes,pulls);
    assert(wrap.accept(command(65535),0xfffffff0));assert(wrap.arm(2,2,0xfffffff0,true));
    assert(wrap.accept(command(0),0x10));wrap.tick(0x20,true);assert(wrap.armedServos==2);
    wrap.tick(0x10a,true);assert(!wrap.armedServos);
    aham_glove::Controller disabled(456,0,0,homes,pulls);assert(disabled.accept(command(),1));assert(!disabled.arm(31,31,2,true));
    const uint16_t invalidHome[5]={1500,1500,1399,1500,1500};
    const int16_t invalidPull[5]={80,101,40,150,100};
    aham_glove::Controller limits(456,31,31,invalidHome,invalidPull);
    assert(limits.allowedServos==17); // Bad index/middle/ring calibration is disabled.
    output.reset();assert(!output.enabled&&!output.servoSignalMask);
    for(int i=0;i<5;i++){assert(aham_glove::ServoChannels[i]==i);assert(aham_glove::MotorChannels[i]==8+i);}
    assert(aham_glove::ServoSweepDurationMs==10000);
    for(uint32_t elapsed : {0u,999u,1000u,3999u,4000u,6999u,7000u,9999u,10000u}) {
        const uint16_t expected=elapsed>=1000&&elapsed<4000?1750:elapsed>=4000&&elapsed<7000?1250:1500;
        assert(aham_glove::benchSweepPulse(1500,elapsed)==expected);
        for(uint16_t home : {1400,1500,1600}) {
            const uint16_t pulse=aham_glove::benchSweepPulse(home,elapsed);
            assert(pulse>=1250&&pulse<=1750);
        }
    }
    aham_glove::Controller sweep(456,31,31,homes,pulls);
    assert(sweep.accept(command(),0));assert(sweep.arm(0,2,0,true));
    output.reset();output.plan(sweep,1000,1,aham_glove::benchSweepPulse(1500,1000));
    assert(output.servoSignalMask==2&&output.reportedPulse[1]==1750&&output.servoTicks[1]==358);
    for(int i=0;i<5;i++)if(i!=1)assert(!output.servoTicks[i]&&!output.motorTicks[i]);
    sweep.tick(1000,false);output.plan(sweep,1000,1,1750);
    assert(!sweep.armedServos&&output.reportedPulse[1]==1500);
    output.plan(sweep,1300,1,1750);assert(!output.enabled);
    puts("Five-finger controller/output planning, interoperability, masks, limits, stop, lease and replay checks passed");
}
