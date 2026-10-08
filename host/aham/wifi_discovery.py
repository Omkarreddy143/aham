"""Locate the paired ESP using authenticated HELLO only; never send output commands."""
import ipaddress
import secrets
import socket
import time

from .protocol import decode
from .wifi_bench import HELLO, HELLO_BODY, HELLO_ACK, HELLO_RECEIPT, authenticated, signed


def probe_targets(address, network=None):
    address = ipaddress.IPv4Address(address)
    if network is None:
        return [str(address)]
    network = ipaddress.IPv4Network(network, strict=False)
    if not network.is_private or network.num_addresses > 256 or address not in network:
        raise ValueError("Discovery requires the ESP's private local subnet, at most 256 addresses")
    return [str(address), str(network.broadcast_address),
            *(str(host) for host in network.hosts() if host != address)]


def discover(address, key, port=4212, network=None, timeout=2):
    """Return only an authenticated paired reply, including its current DHCP IP."""
    if len(key) != 32 or not any(key):
        raise ValueError("A nonzero 32-byte pairing key is required")
    targets = probe_targets(address, network)
    session = secrets.randbits(32) or 1
    sequence = secrets.randbits(16)
    packet = signed(HELLO, sequence, int(time.monotonic()*1000), HELLO_BODY.pack(session), key).encode()
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        for target in targets:
            try:
                listener.sendto(packet, (target, port))
            except OSError:
                continue
        deadline = time.monotonic()+timeout
        while time.monotonic() < deadline:
            listener.settimeout(max(.001, deadline-time.monotonic()))
            try:
                frame, sender = listener.recvfrom(128)
            except socket.timeout:
                break
            except ConnectionResetError:
                continue
            if sender[1] != port or (sender[0] not in targets and network is None):
                continue
            if network is not None and ipaddress.IPv4Address(sender[0]) not in ipaddress.IPv4Network(network, strict=False):
                continue
            try:
                ack = decode(frame)
                if ack.kind != HELLO_RECEIPT or ack.sequence != sequence:
                    continue
                returned_session, boot = HELLO_ACK.unpack(authenticated(ack, HELLO_ACK.size, key))
                if returned_session == session and boot:
                    return {"ip": sender[0], "port": sender[1], "authenticated": True}
            except ValueError:
                continue
    return None
