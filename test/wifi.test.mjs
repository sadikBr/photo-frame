// Guest Wi-Fi card: the text phone cameras read, and the frame's settings for it.
import assert from 'node:assert/strict';
import { wifiString, qrSvg } from '../public/js/wifi-common.js';
import { sanitizeSettings } from '../src/settings.js';

assert.equal(wifiString({ ssid: 'Bayt', password: 'abc12345', security: 'WPA' }), 'WIFI:T:WPA;S:Bayt;P:abc12345;;');
assert.equal(wifiString({ ssid: 'a;b,c:d', password: 'p\\q"r', security: 'WPA' }), 'WIFI:T:WPA;S:a\\;b\\,c\\:d;P:p\\\\q\\"r;;', 'special characters escaped');
assert.equal(wifiString({ ssid: 'Guest', password: 'x', security: 'nopass' }), 'WIFI:T:nopass;S:Guest;;', 'open network: no password');
assert.equal(wifiString({ ssid: 'Hidden', password: 'secret99', security: 'WPA', hidden: true }), 'WIFI:T:WPA;S:Hidden;P:secret99;H:true;;');
assert.equal(wifiString({ ssid: '' }), '');
const svg = qrSvg(wifiString({ ssid: 'بيت العائلة', password: 'كلمة 123', security: 'WPA' }), 300);
assert.match(svg, /^<svg[^>]+width="300"/);
assert.ok(svg.includes('<path d="M'), 'modules drawn');

let s = sanitizeSettings({ wifi: { ssid: '  Bayt 5G ', password: ' with spaces ', security: 'WPA2', hidden: 'yes' } });
assert.deepEqual(s.wifi, { ssid: '  Bayt 5G ', password: ' with spaces ', security: 'WPA', hidden: false, showPassword: true }, 'kept as typed; unknown security = WPA');
s = sanitizeSettings({ wifi: { ssid: 'x'.repeat(40), password: 'p'.repeat(80) + '\n', security: 'WEP' } });
assert.equal(s.wifi.ssid.length, 32);
assert.equal(s.wifi.password.length, 63);
assert.equal(sanitizeSettings({ wifi: { ssid: 'Open', password: 'zzz', security: 'nopass' } }).wifi.password, '', 'no password kept for an open network');
assert.equal(sanitizeSettings({ wifi: { ssid: '   ', password: 'a' } }).wifi, null, 'no name: no card');
assert.equal(sanitizeSettings({ night: { enabled: true, off: true } }).night.off, true);
assert.equal(sanitizeSettings({ night: { enabled: true, off: 'yes' } }).night.off, false);

console.log('wifi: all tests passed');
