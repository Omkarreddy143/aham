#include "WifiMonitor.h"
#include <assert.h>
#include <stdio.h>
#include <fstream>
#include <string>

int main(int argc, char** argv) {
    // Fixture is emitted by the actual Python encoder and decoded by firmware.
    assert(argc==2);std::ifstream input(argv[1]);std::string hex;input>>hex;
    uint8_t bytes[aham::MaxEncoded];size_t length=hex.size()/2;
    assert(length<=sizeof(bytes));
    for(size_t i=0;i<length;i++)bytes[i]=uint8_t(std::stoul(hex.substr(i*2,2),nullptr,16));
    aham::Packet packet;assert(bytes[length-1]==0 && aham::decode(bytes,length-1,packet));
    aham_wifi::Monitor state;assert(state.accept(packet,100));
    assert(state.session==0x12345678 && state.sequence==65535 && state.flags==3);
    assert(state.vibration[1]==95 && state.resistance[4]==19 && state.reference[4]==60);
    const aham::Packet ack=state.receipt(101);
    assert(ack.type==6 && ack.length==8 && ack.payload[6]==0 && ack.payload[7]==0);
    assert(aham::u16(ack.payload+4)==aham::crc(packet.payload,packet.length));
    assert(!state.accept(packet,150) && state.receivedAt==100);
    aham::Packet invalid=packet;invalid.seq=0;invalid.payload[17]=81;assert(!state.accept(invalid,180));
    invalid=packet;invalid.seq=0;invalid.payload[6]=0;assert(!state.accept(invalid,180));
    packet.seq=0;assert(state.accept(packet,200)); // uint16 wrap
    packet.seq=65535;assert(!state.accept(packet,220));
    aham::put32(packet.payload,2);packet.seq=1;assert(!state.accept(packet,230));
    state.tick(450);assert(!state.live && state.flags==0);
    for(int i=0;i<5;i++)assert(state.vibration[i]==0 && state.resistance[i]==0 && state.reference[i]==0);
    assert(state.accept(packet,451)); // New sender after old lease expired.
    state.clear();assert(!state.live);
    puts("Wi-Fi firmware interoperability, replay, lease and output-OFF checks passed");
}
