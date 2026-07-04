# Office Power Monitoring System

Monitor 18 office devices (fans + lights across 3 rooms) via a live web dashboard
and a Discord bot — both backed by one shared server, so they always agree.

## Architecture

```
[Simulated Device Layer] --> [Backend: Express + deviceStore.js] --> [Web UI  (Socket.io, live push)]
                                                                  --> [Discord Bot (REST polling)]
                                                                  --> both reach --> [The user]
```

- `deviceStore.js` — the single source of truth. Holds all 18 devices in memory,
  randomly toggles them to simulate real activity, tracks cumulative energy use,
  and raises alerts (after-hours usage, room on 2+ hrs).
- `server.js` — Express REST API (`/api/status`, `/api/room/:name`, `/api/usage`)
  + Socket.io, which pushes a fresh snapshot to every connected browser the
  moment any device changes state (no polling, no refresh).
- `public/index.html` — the dashboard: live device grid by room, glowing/spinning
  icons for ON devices, total + per-room power, and a timestamped alerts panel.
- `bot.js` — a Discord bot (discord.js) that reads from the exact same
  `deviceStore` instance (same process) and answers `!status`, `!room <name>`,
  `!usage`, plus proactively posts to a channel when an alert fires.

Because the bot and the dashboard both read from the one `deviceStore` object,
there is never a sync issue — one source of truth, two views.

## Setup

```bash
npm install
cp .env.example .env
# edit .env: add DISCORD_TOKEN + DISCORD_ALERT_CHANNEL_ID if you want the bot
npm start
```

Visit `http://localhost:3000` for the dashboard. If `DISCORD_TOKEN` is not set,
the server still runs fine — it just skips starting the bot (useful for judges
who only want to see the dashboard).

### Getting a Discord bot token
1. https://discord.com/developers/applications → New Application → Bot → Reset Token.
2. Enable "Message Content Intent" under Bot settings.
3. Invite the bot to your server (OAuth2 → URL Generator → bot scope, Send Messages + Read Message History).
4. Right-click your alerts channel → Copy Channel ID (enable Developer Mode in Discord settings first) → put in `DISCORD_ALERT_CHANNEL_ID`.

## Discord commands

| Command | Example | Behavior |
|---|---|---|
| `!status` | `!status` | Friendly one-line summary of all 3 rooms |
| `!room <name>` | `!room work1` | Per-device status + power draw for one room |
| `!usage` | `!usage` | Total power right now + today's estimated kWh |

Room name matching is fuzzy — `work1`, `workroom1`, `Work Room 1` all resolve.

## Simulated data model

Each device: `{ id, name, type (fan/light), room, status (ON/OFF), wattage, lastChanged }`.
Fans draw 60W, lights 15W when ON. A background timer randomly flips one
device every 4-9 seconds so the system always looks "alive" for a demo, and a
5-second tick accumulates energy usage and evaluates alert conditions.

## Alerts

- **After-hours**: any device ON outside 9 AM–5 PM.
- **Room stuck on**: all 5 devices in a room ON continuously for 2+ hours.

Both are deduplicated (won't spam repeatedly) and shown with timestamps on the
dashboard; if configured, the bot also posts them to Discord automatically.

## Hardware / electrical schematic (concept, Wokwi)

No physical hardware is required for this demo — device state is simulated in
software. For the required hardware concept, build this in
[Wokwi](https://wokwi.com/) (new project → ESP32) to represent **one room**:

**Components:**
- 1x ESP32 dev board
- 2x relay modules (or 2x LEDs as fan-motor stand-ins) — controls for Fan 1 & Fan 2
- 3x LEDs (with 220Ω resistors) — represent Light 1–3
- 1x ACS712 current sensor module — simulates sensing real current draw for
  power monitoring (wired in series with one relay's load line)
- Breadboard + jumper wires

**Wiring logic:**
- Each relay's IN pin → an ESP32 GPIO (e.g. GPIO 16 = Fan 1, GPIO 17 = Fan 2).
  The relay's NO/COM terminals would switch real 220V/110V mains to the fan
  motor in a real deployment; in Wokwi, the relay's output side just drives an
  indicator LED to visualize ON/OFF.
- Each light LED's anode → a GPIO through a 220Ω resistor (GPIO 18/19/21 =
  Light 1/2/3), cathode → GND. GPIO HIGH = light ON.
- ACS712 VCC → 5V, GND → GND, OUT → an ESP32 ADC pin (e.g. GPIO 34). It sits in
  series with the live wire feeding one relay's load, so its analog output
  scales with the current actually being drawn — this is how you'd get real
  wattage readings instead of assumed constants in a physical build.
- ESP32 connects to Wi-Fi and would POST sensor readings to the same backend
  API (`/api/device/:id/toggle` or a dedicated ingest route) that the
  simulator currently feeds, so the real hardware could swap in transparently.

This keeps the concept physically sound (relays for switching higher-power
AC loads, a current sensor for real wattage, GPIOs read/written over Wi-Fi to
the shared backend) without requiring 18 devices to be wired for the demo.

## Repo structure

```
deviceStore.js   — shared in-memory state + simulator + alert logic
server.js        — Express API + Socket.io + starts bot.js
bot.js           — Discord bot commands
public/index.html — live dashboard
.env.example     — required environment variables
```

## Notes for reviewers

- Toggle any device on the dashboard by clicking it — this proves the bot and
  dashboard are reading the same live state, not two separate mocks.
- To see after-hours alerts without waiting, temporarily change your system
  clock or adjust the `afterHours` condition in `deviceStore.js`.
