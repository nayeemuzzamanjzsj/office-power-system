// server.js
// Backend API + Socket.io realtime feed. Single source of truth = deviceStore.
try { require('dotenv').config(); } catch (e) { /* dotenv optional */ }
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { DeviceStore, ROOMS } = require('./deviceStore');

const store = new DeviceStore();

// Accepts aliases like "drawing", "work1", "workroom2", "Work Room 1"
function resolveRoom(input) {
  const norm = (s) => s.toLowerCase().replace(/room|\s/g, '');
  const target = norm(input);
  return ROOMS.find((r) => {
    const rn = norm(r);
    return rn === target || rn.startsWith(target) || target.startsWith(rn.replace(/\d/g, ''));
  });
}

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// REST API (also used by the Discord bot)
app.get('/api/status', (req, res) => res.json(store.getSnapshot()));

app.get('/api/room/:name', (req, res) => {
  const match = resolveRoom(req.params.name);
  if (!match) return res.status(404).json({ error: 'Room not found', rooms: ROOMS });
  res.json(store.getRoomSummary(match));
});

app.get('/api/usage', (req, res) => {
  res.json({
    totalPowerW: store.getTotalPower(),
    todayEnergyKwh: +(store.todayEnergyWh / 1000).toFixed(2),
  });
});

app.post('/api/device/:id/toggle', (req, res) => {
  const d = store.devices.find((x) => x.id === req.params.id);
  if (!d) return res.status(404).json({ error: 'Device not found' });
  const updated = store.setDeviceStatus(d.id, d.status === 'ON' ? 'OFF' : 'ON');
  res.json(updated);
});

const server = http.createServer(app);
const io = new Server(server);

io.on('connection', (socket) => {
  socket.emit('snapshot', store.getSnapshot());
  socket.on('toggle', (id) => {
    const d = store.devices.find((x) => x.id === id);
    if (d) store.setDeviceStatus(id, d.status === 'ON' ? 'OFF' : 'ON');
  });
});

store.on('update', (snapshot) => io.emit('snapshot', snapshot));
store.on('alert', (alert) => io.emit('alert', alert));

// Expose store for the Discord bot (same process, single source of truth)
module.exports = { store };

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Dashboard running: http://localhost:${PORT}`));

// Start the Discord bot in the same process if a token is provided
if (process.env.DISCORD_TOKEN) {
  require('./bot')(store);
} else {
  console.log('DISCORD_TOKEN not set — skipping Discord bot startup.');
}
