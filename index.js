// index.js - reconnection-based username rotator (use on offline/cracked servers)
const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;

const SETTINGS_PATH = path.resolve(__dirname, 'settings.json');
if (!fs.existsSync(SETTINGS_PATH)) {
  console.error('Missing settings.json. Copy settings.example.json to settings.json and edit it (do NOT commit real credentials).');
  process.exit(1);
}
const config = require(SETTINGS_PATH);
const express = require('express');

const app = express();
app.get('/', (req, res) => res.send('Bot has arrived'));
app.listen(8000, () => console.log('Server started'));

// Persisted rotation state (ignored by .gitignore)
const STATE_PATH = path.resolve(__dirname, '.nick_state.json');
let nickState = { lastIndex: -1 };
try {
  if (fs.existsSync(STATE_PATH)) {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (typeof parsed.lastIndex === 'number') nickState = parsed;
  }
} catch (e) {
  console.warn('Could not read .nick_state.json, starting fresh.');
}
function saveNickState() {
  try { fs.writeFileSync(STATE_PATH, JSON.stringify(nickState, null, 2), 'utf8'); } 
  catch (err) { console.warn('Failed to write .nick_state.json:', err); }
}

// Nick rotator configuration - defaults to 3 hours
const NICK_CFG = config['nick-rotator'] || { enabled: false, names: [], intervalMs: 3 * 60 * 60 * 1000 };

let currentBot = null;
let nickIntervalId = null;
let rotationScheduled = false;

function getNextNick() {
  if (!Array.isArray(NICK_CFG.names) || NICK_CFG.names.length === 0) return null;
  nickState.lastIndex = (nickState.lastIndex + 1) % NICK_CFG.names.length;
  saveNickState();
  return NICK_CFG.names[nickState.lastIndex];
}

function createBotWithUsername(username) {
  const account = Object.assign({}, config['bot-account'] || {});
  if (username) account.username = username;

  const bot = mineflayer.createBot({
    username: account.username,
    password: account.password,
    auth: account.type,
    host: config.server.ip,
    port: config.server.port,
    version: config.server.version,
  });

  currentBot = bot;

  bot.loadPlugin(pathfinder);
  const mcData = require('minecraft-data')(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.settings.colorsEnabled = false;

  let pendingPromise = Promise.resolve();

  function sendRegister(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/register ${password} ${password}`);
      bot.once('chat', (username, message) => {
        if (message.includes('successfully registered') || message.includes('already registered')) resolve();
        else reject(`Registration failed: "${message}"`);
      });
    });
  }
  function sendLogin(password) {
    return new Promise((resolve, reject) => {
      bot.chat(`/login ${password}`);
      bot.once('chat', (username, message) => {
        if (message.includes('successfully logged in')) resolve();
        else reject(`Login failed: "${message}"`);
      });
    });
  }

  bot.once('spawn', () => {
    console.log('[AfkBot] Bot joined the server as', bot.username);

    // Auto-auth if configured
    if (config.utils && config.utils['auto-auth'] && config.utils['auto-auth'].enabled) {
      const password = config.utils['auto-auth'].password;
      pendingPromise = pendingPromise
        .then(() => sendRegister(password))
        .then(() => sendLogin(password))
        .catch(error => console.error('[ERROR]', error));
    }

    // Chat messages
    if (config.utils && config.utils['chat-messages'] && config.utils['chat-messages'].enabled) {
      const messages = config.utils['chat-messages']['messages'] || [];
      if (config.utils['chat-messages'].repeat) {
        const delay = config.utils['chat-messages']['repeat-delay'] || 60;
        let i = 0;
        setInterval(() => {
          bot.chat(messages[i] || '');
          i = (i + 1) % messages.length;
        }, delay * 1000);
      } else messages.forEach(m => bot.chat(m));
    }

    // Movement/anti-afk as before
    const pos = config.position || {};
    if (pos.enabled) {
      bot.pathfinder.setMovements(defaultMove);
      bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
    }
    if (config.utils && config.utils['anti-afk'] && config.utils['anti-afk'].enabled) {
      bot.setControlState('jump', true);
      if (config.utils['anti-afk'].sneak) bot.setControlState('sneak', true);
    }

    // Schedule rotation if needed (only schedule once per process)
    scheduleRotationIfNeeded();
  });

  // On disconnect -> immediately reconnect using next username (if rotator enabled)
  bot.on('end', () => {
    console.log('[AfkBot] Connection ended.');
    currentBot = null;
    if (NICK_CFG.enabled) {
      const next = getNextNick();
      if (next) {
        console.log(`[NickRotator] Reconnecting after disconnect with username: ${next}`);
        setTimeout(() => createBotWithUsername(next), 2000);
        return;
      }
    }
    // fallback reconnect with same account if configured
    if (config.utils && config.utils['auto-reconnect']) {
      setTimeout(() => createBotWithUsername(account.username), config.utils['auto-recconect-delay'] || 5000);
    }
  });

  bot.on('kicked', (reason) => console.log('[AfkBot] Kicked:', reason));
  bot.on('error', (err) => console.log('[AfkBot] Error:', err && err.message));
  return bot;
}

function scheduleRotationIfNeeded() {
  if (!NICK_CFG.enabled) return;
  if (!Array.isArray(NICK_CFG.names) || NICK_CFG.names.length === 0) return;
  if (rotationScheduled) return;
  rotationScheduled = true;

  const intervalMs = typeof NICK_CFG.intervalMs === 'number' ? NICK_CFG.intervalMs : 3 * 60 * 60 * 1000;
  nickIntervalId = setInterval(() => {
    if (!currentBot) { console.log('[NickRotator] No connected bot when interval fired; waiting for reconnect.'); return; }
    const next = getNextNick();
    if (!next) { console.warn('[NickRotator] No names configured.'); return; }
    console.log(`[NickRotator] Interval triggered. Reconnecting with username: ${next}`);
    try {
      if (nickIntervalId) { clearInterval(nickIntervalId); nickIntervalId = null; rotationScheduled = false; }
      if (currentBot && currentBot.quit) { try { currentBot.quit(); } catch (e) {} }
      setTimeout(() => createBotWithUsername(next), 2000);
    } catch (e) { console.warn('Nick rotation reconnection error:', e); }
  }, intervalMs);

  console.log('[NickRotator] Rotation scheduled. Interval ms:', intervalMs);
}

function startInitialBot() {
  let initialUsername = null;
  if (NICK_CFG.enabled) initialUsername = getNextNick();
  const configuredUsername = (config['bot-account'] && config['bot-account'].username) || 'Bot';
  createBotWithUsername(initialUsername || configuredUsername);
}

startInitialBot();
