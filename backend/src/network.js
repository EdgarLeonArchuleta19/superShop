import os from 'node:os';

// Adaptadores virtuales (máquinas virtuales, WSL, VPN…) que no sirven para que
// otros equipos de la tienda se conecten.
const VIRTUAL_ADAPTER = /vethernet|virtualbox|vmware|docker|wsl|hyper-v|loopback|bluetooth|tailscale|zerotier|vpn/i;

/** Direcciones IPv4 de esta computadora en la red local, la más probable primero. */
export function lanIPv4() {
  const list = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    if (VIRTUAL_ADAPTER.test(name)) continue;
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal || a.address.startsWith('169.254.')) continue;
      list.push({ name, address: a.address });
    }
  }
  const rank = (ip) => (ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : ip.startsWith('172.') ? 2 : 3);
  return list.sort((a, b) => rank(a.address) - rank(b.address));
}
