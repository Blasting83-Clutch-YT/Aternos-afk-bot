```markdown
# Nickname rotation (nick-rotator)

Short usage notes

1. Add the nick-rotator section to your settings.json. Example snippet (insert into your settings.json):
```json
"nick-rotator": {
  "enabled": true,
  "names": [
    "AFK_Bot_1",
    "AFK_Bot_2",
    "AFK_Bot_3"
  ],
  "intervalMs": 14400000
}
```

2. Do NOT commit real credentials. Keep settings.json local and add secrets to .gitignore (provided).

3. Install dependencies if not present:
   npm install mineflayer mineflayer-pathfinder minecraft-data

4. Run your bot normally:
   node index.js

Notes:
- The script uses in-game nickname commands (e.g., /nick). The server must support the nickname command and the bot must have permission to run it.
- The rotator stores rotation state in .nick_state.json (ignored by git). If you prefer no persistence, remove the state file usage.
- To make the rotator detect success/failure before advancing names, extend the code to parse chat messages from the server and only increment lastIndex on success.
```
