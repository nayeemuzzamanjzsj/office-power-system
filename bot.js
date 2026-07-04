// bot.js
// Discord bot — reads from the SAME deviceStore instance as the dashboard.
// No hardcoded/random data: every reply is computed live from store state.
const { Client, GatewayIntentBits } = require('discord.js');
const { ROOMS } = require('./deviceStore');

module.exports = function startBot(store) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  const ALERT_CHANNEL_ID = process.env.DISCORD_ALERT_CHANNEL_ID;

  function resolveRoom(input) {
    const norm = (s) => s.toLowerCase().replace(/room|\s/g, '');
    const target = norm(input);
    return ROOMS.find((r) => {
      const rn = norm(r);
      return rn === target || rn.startsWith(target) || target.startsWith(rn.replace(/\d/g, ''));
    });
  }

  function humanRoomLine(room) {
    const { devices, power } = store.getRoomSummary(room);
    const fansOn = devices.filter((d) => d.type === 'fan' && d.status === 'ON').length;
    const lightsOn = devices.filter((d) => d.type === 'light' && d.status === 'ON').length;
    if (fansOn === 0 && lightsOn === 0) return `${room}: all off.`;
    return `${room}: ${fansOn} fan${fansOn === 1 ? '' : 's'} ON, ${lightsOn} light${lightsOn === 1 ? '' : 's'} ON (${power}W).`;
  }

  function formatStatus() {
    return ROOMS.map(humanRoomLine).join(' ');
  }

  function formatRoom(name) {
    const match = resolveRoom(name);
    if (!match) return `Hmm, I don't know a room called "${name}". Try one of: ${ROOMS.join(', ')}.`;
    const { devices, power } = store.getRoomSummary(match);
    const lines = devices
      .map((d) => `${d.name}: ${d.status}`)
      .join(', ');
    return `${match} is currently drawing ${power}W. Devices — ${lines}.`;
  }

  function formatUsage() {
    const total = store.getTotalPower();
    const kwh = (store.todayEnergyWh / 1000).toFixed(2);
    return `Total power right now: ${total}W. Today's estimated usage: ${kwh} kWh.`;
  }

  client.on('ready', () => {
    console.log(`Discord bot logged in as ${client.user.tag}`);
  });

  client.on('messageCreate', (msg) => {
    if (msg.author.bot) return;
    const content = msg.content.trim();

    if (content === '!status') {
      msg.reply(`Here's the office right now — ${formatStatus()}`);
    } else if (content.startsWith('!room')) {
      const name = content.replace('!room', '').trim();
      if (!name) {
        msg.reply(`Which room? Try: ${ROOMS.map((r) => `\`!room ${r.replace(/\s/g, '').toLowerCase()}\``).join(', ')}`);
        return;
      }
      msg.reply(formatRoom(name));
    } else if (content === '!usage') {
      msg.reply(formatUsage());
    } else if (content === '!help') {
      msg.reply('Commands: `!status`, `!room <name>` (e.g. `!room work1`), `!usage`');
    }
  });

  // Proactive alert posting
  store.on('alert', (alert) => {
    if (!ALERT_CHANNEL_ID) return;
    const channel = client.channels.cache.get(ALERT_CHANNEL_ID);
    if (channel) channel.send(`⚠️ Hey! ${alert.message}`);
  });

  client.login(process.env.DISCORD_TOKEN);

  return client;
};
