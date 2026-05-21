const { exec } = require('child_process');
const os = require('os');

const interfaces = os.networkInterfaces();
const addresses = [];

for (const name of Object.keys(interfaces)) {
  for (const iface of interfaces[name]) {
    if (iface.family === 'IPv4' && !iface.internal) {
      addresses.push(iface.address);
    }
  }
}

if (addresses.length > 0) {
  console.log('  ► Ag IP:  http://' + addresses[0] + ':3000');
}
