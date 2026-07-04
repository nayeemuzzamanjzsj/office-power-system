// deviceStore.js
// Single source of truth for all device state. Backend API, dashboard (via socket.io),
// and the Discord bot all read/write through this module ONLY.

const EventEmitter = require('events');

const ROOMS = ['Drawing Room', 'Work Room 1', 'Work Room 2'];
const WATTAGE = { fan: 60, light: 15 };

function buildInitialDevices() {
  const devices = [];
  let id = 1;
  for (const room of ROOMS) {
    for (let f = 1; f <= 2; f++) {
      devices.push({
        id: `D${id++}`,
        name: `Fan ${f}`,
        type: 'fan',
        room,
        status: Math.random() > 0.5 ? 'ON' : 'OFF',
        wattage: WATTAGE.fan,
        lastChanged: new Date().toISOString(),
      });
    }
    for (let l = 1; l <= 3; l++) {
      devices.push({
        id: `D${id++}`,
        name: `Light ${l}`,
        type: 'light',
        room,
        status: Math.random() > 0.5 ? 'ON' : 'OFF',
        wattage: WATTAGE.light,
        lastChanged: new Date().toISOString(),
      });
    }
  }
  return devices;
}

class DeviceStore extends EventEmitter {
  constructor() {
    super();
    this.devices = buildInitialDevices();
    this.alerts = [];
    this.todayEnergyWh = 0; // accumulated watt-hours today (simulated)
    this._lastTick = Date.now();

    // Simulate random device toggles every 4-9 seconds
    this._scheduleRandomToggle();

    // Track energy usage + check alert conditions every 5 seconds
    setInterval(() => this._tick(), 5000);
  }

  _scheduleRandomToggle() {
    const delay = 4000 + Math.random() * 5000;
    setTimeout(() => {
      const d = this.devices[Math.floor(Math.random() * this.devices.length)];
      this.setDeviceStatus(d.id, d.status === 'ON' ? 'OFF' : 'ON');
      this._scheduleRandomToggle();
    }, delay);
  }

  _tick() {
    const now = Date.now();
    const hours = (now - this._lastTick) / 1000 / 3600;
    this._lastTick = now;
    const totalW = this.getTotalPower();
    this.todayEnergyWh += totalW * hours;

    this._checkAlerts();
    this.emit('update', this.getSnapshot());
  }

  _checkAlerts() {
    const now = new Date();
    const hour = now.getHours();
    const afterHours = hour >= 17 || hour < 9; // outside 9AM-5PM

    if (afterHours) {
      const onDevices = this.devices.filter((d) => d.status === 'ON');
      if (onDevices.length > 0) {
        this._pushAlertOnce(
          `after-hours-${now.toDateString()}-${hour}`,
          `${onDevices.length} device(s) left ON after office hours (it's ${now.toLocaleTimeString()}).`
        );
      }
    }

    // Room fully on for 2+ hours continuously
    for (const room of ROOMS) {
      const roomDevices = this.devices.filter((d) => d.room === room);
      const allOn = roomDevices.every((d) => d.status === 'ON');
      if (allOn) {
        const oldestChange = Math.max(
          ...roomDevices.map((d) => new Date(d.lastChanged).getTime())
        );
        const hoursOn = (Date.now() - oldestChange) / 1000 / 3600;
        if (hoursOn >= 2) {
          this._pushAlertOnce(
            `room-all-on-${room}`,
            `${room}: all devices have been ON continuously for over 2 hours.`
          );
        }
      }
    }
  }

  _pushAlertOnce(key, message) {
    const exists = this.alerts.find((a) => a.key === key);
    if (!exists) {
      const alert = { key, message, timestamp: new Date().toISOString() };
      this.alerts.unshift(alert);
      this.alerts = this.alerts.slice(0, 50);
      this.emit('alert', alert);
    }
  }

  setDeviceStatus(id, status) {
    const d = this.devices.find((x) => x.id === id);
    if (!d) return null;
    if (d.status !== status) {
      d.status = status;
      d.lastChanged = new Date().toISOString();
      this.emit('update', this.getSnapshot());
    }
    return d;
  }

  getTotalPower() {
    return this.devices
      .filter((d) => d.status === 'ON')
      .reduce((sum, d) => sum + d.wattage, 0);
  }

  getRoomPower(room) {
    return this.devices
      .filter((d) => d.room === room && d.status === 'ON')
      .reduce((sum, d) => sum + d.wattage, 0);
  }

  getRoomSummary(room) {
    const devices = this.devices.filter((d) => d.room === room);
    return {
      room,
      devices,
      power: this.getRoomPower(room),
    };
  }

  getSnapshot() {
    return {
      devices: this.devices,
      totalPower: this.getTotalPower(),
      rooms: ROOMS.map((r) => ({
        room: r,
        power: this.getRoomPower(r),
        devices: this.devices.filter((d) => d.room === r),
      })),
      todayEnergyWh: this.todayEnergyWh,
      alerts: this.alerts,
      timestamp: new Date().toISOString(),
    };
  }
}

module.exports = { DeviceStore, ROOMS };
