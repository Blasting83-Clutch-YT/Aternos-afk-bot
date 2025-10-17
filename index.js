const fs = require('fs');
const path = require('path');
const mineflayer = require('mineflayer');
const Movements = require('mineflayer-pathfinder').Movements;
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const { GoalBlock } = require('mineflayer-pathfinder').goals;

const config = require('./settings.json');
const express = require('express');

const app = express();

app.get('/', (req, res) => {
  res.send('Bot has arrived');
});

app.listen(8000, () => {
  console.log('Server started');
});

// Persisted state file for nickname rotation (ignored by .gitignore)
const STATE_PATH = path.resolve(__dirname, '.nick_state.json');
// Nick rotator config must be added to settings.json (see README below). Example path: config['nick-rotator']
const NICK_CFG = config['nick-rotator'] || { enabled: false, names: [], intervalMs: 4 * 60 * 60 * 1000 };

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
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify(nickState, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to write .nick_state.json:', err);
  }
}

let currentBot = null;
let nickIntervalId = null;

function rotateNick() {
  if (!NICK_CFG.enabled) return;
  if (!Array.isArray(NICK_CFG.names) || NICK_CFG.names.length === 0) return;
  if (!currentBot || !currentBot.chat) {
    console.log('[NickRotator] No connected bot to send nick command to.');
    return;
  }

  nickState.lastIndex = (nickState.lastIndex + 1) % NICK_CFG.names.length;
  const newNick = NICK_CFG.names[nickState.lastIndex];

  // Try common /nick variants. Adjust order if your server uses specific command.
  const commands = [
    `/nick ${newNick}`,
    `/nick ${currentBot.username} ${newNick}`,
    `/nick set ${newNick}`
  ];

  // Send the first guess. To be more robust, extend to parse chat replies and only advance on success.
  currentBot.chat(commands[0]);
  console.log(`[${new Date().toISOString()}] [NickRotator] Sent: ${commands[0]} -> ${newNick}`);

  saveNickState();
}

function createBot() {
   const bot = mineflayer.createBot({
      username: config['bot-account']['username'],
      password: config['bot-account']['password'],
      auth: config['bot-account']['type'],
      host: config.server.ip,
      port: config.server.port,
      version: config.server.version,
   });

   currentBot = bot; // keep global reference

   bot.loadPlugin(pathfinder);
   const mcData = require('minecraft-data')(bot.version);
   const defaultMove = new Movements(bot, mcData);
   bot.settings.colorsEnabled = false;

   let pendingPromise = Promise.resolve();

   function sendRegister(password) {
      return new Promise((resolve, reject) => {
         bot.chat(`/register ${password} ${password}`);
         console.log(`[Auth] Sent /register command.`);

         bot.once('chat', (username, message) => {
            console.log(`[ChatLog] <${username}> ${message}`);

            if (message.includes('successfully registered')) {
               console.log('[INFO] Registration confirmed.');
               resolve();
            } else if (message.includes('already registered')) {
               console.log('[INFO] Bot was already registered.');
               resolve();
            } else if (message.includes('Invalid command')) {
               reject(`Registration failed: Invalid command. Message: "${message}"`);
            } else {
               reject(`Registration failed: unexpected message "${message}".`);
            }
         });
      });
   }

   function sendLogin(password) {
      return new Promise((resolve, reject) => {
         bot.chat(`/login ${password}`);
         console.log(`[Auth] Sent /login command.`);

         bot.once('chat', (username, message) => {
            console.log(`[ChatLog] <${username}> ${message}`);

            if (message.includes('successfully logged in')) {
               console.log('[INFO] Login successful.');
               resolve();
            } else if (message.includes('Invalid password')) {
               reject(`Login failed: Invalid password. Message: "${message}"`);
            } else if (message.includes('not registered')) {
               reject(`Login failed: Not registered. Message: "${message}"`);
            } else {
               reject(`Login failed: unexpected message "${message}".`);
            }
         });
      });
   }

   bot.once('spawn', () => {
      console.log('\x1b[33m[AfkBot] Bot joined the server', '\x1b[0m');

      if (config.utils['auto-auth'].enabled) {
         console.log('[INFO] Started auto-auth module');

         const password = config.utils['auto-auth'].password;

         pendingPromise = pendingPromise
            .then(() => sendRegister(password))
            .then(() => sendLogin(password))
            .catch(error => console.error('[ERROR]', error));
      }

      if (config.utils['chat-messages'].enabled) {
         console.log('[INFO] Started chat-messages module');
         const messages = config.utils['chat-messages']['messages'];

         if (config.utils['chat-messages'].repeat) {
            const delay = config.utils['chat-messages']['repeat-delay'];
            let i = 0;

            let msg_timer = setInterval(() => {
               bot.chat(`${messages[i]}`);

               if (i + 1 === messages.length) {
                  i = 0;
               } else {
                  i++;
               }
            }, delay * 1000);
         } else {
            messages.forEach((msg) => {
               bot.chat(msg);
            });
         }
      }

      const pos = config.position;

      if (config.position.enabled) {
         console.log(
            `\x1b[32m[Afk Bot] Starting to move to target location (${pos.x}, ${pos.y}, ${pos.z})\x1b[0m`
         );
         bot.pathfinder.setMovements(defaultMove);
         bot.pathfinder.setGoal(new GoalBlock(pos.x, pos.y, pos.z));
      }

      if (config.utils['anti-afk'].enabled) {
         bot.setControlState('jump', true);
         if (config.utils['anti-afk'].sneak) {
            bot.setControlState('sneak', true);
         }
      }

      // Start nickname rotation once (do not start multiple intervals on reconnects)
      if (NICK_CFG.enabled && Array.isArray(NICK_CFG.names) && NICK_CFG.names.length > 0) {
         if (!nickIntervalId) {
            // run immediately and then every interval
            rotateNick();
            nickIntervalId = setInterval(() => {
              rotateNick();
            }, typeof NICK_CFG.intervalMs === 'number' ? NICK_CFG.intervalMs : 4 * 60 * 60 * 1000);
            console.log('[NickRotator] Rotation scheduled. Interval ms:', NICK_CFG.intervalMs);
         }
      }
   });

   bot.on('goal_reached', () => {
      console.log(
         `\x1b[32m[AfkBot] Bot arrived at the target location. ${bot.entity.position}\x1b[0m`
      );
   });

   bot.on('death', () => {
      console.log(
         `\x1b[33m[AfkBot] Bot has died and was respawned at ${bot.entity.position}`,
         '\x1b[0m'
      );
   });

   if (config.utils['auto-reconnect']) {
      bot.on('end', () => {
         // clear current bot reference; do not clear the nick interval (it will wait for next createBot to set currentBot)
         currentBot = null;
         setTimeout(() => {
            createBot();
         }, config.utils['auto-recconect-delay']);
      });
   }

   bot.on('kicked', (reason) =>
      console.log(
         '\x1b[33m',
         `[AfkBot] Bot was kicked from the server. Reason: \n${reason}`,
         '\x1b[0m'
      )
   );

   bot.on('error', (err) =>
      console.log(`\x1b[31m[ERROR] ${err.message}`, '\x1b[0m')
   );
}

createBot();
