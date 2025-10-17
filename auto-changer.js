const fs = require('fs');
const { spawn } = require('child_process');
const path = require('path');

// Configuration
const CONFIG_FILE = './settings.json';
const CHANGE_INTERVAL = 3 * 60 * 60 * 1000; // 3 heures en millisecondes
const BOT_COMMAND = 'node';
const BOT_ARGS = ['.'];

// Listes pour générer des pseudos aléatoires crédibles
const adjectives = [
    'Cool', 'Epic', 'Pro', 'Super', 'Mega', 'Ultra', 'Dark', 'Shadow',
    'Fire', 'Ice', 'Thunder', 'Storm', 'Swift', 'Silent', 'Golden', 'Silver',
    'Wild', 'Crazy', 'Fast', 'Strong', 'Brave', 'Bold', 'Quick', 'Bright'
];

const nouns = [
    'Gamer', 'Player', 'Warrior', 'Hunter', 'Miner', 'Builder', 'Crafter',
    'Knight', 'Dragon', 'Wolf', 'Tiger', 'Eagle', 'Falcon', 'Phoenix',
    'Ninja', 'Samurai', 'Wizard', 'Rogue', 'Archer', 'Hero', 'Legend'
];

let botProcess = null;

// Génère un pseudo aléatoire
function generateUsername() {
    const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
    const noun = nouns[Math.floor(Math.random() * nouns.length)];
    const num = Math.floor(Math.random() * 9999);
    return `${adj}${noun}${num}`;
}

// Lit et met à jour le fichier settings.json
function updateUsername() {
    try {
        // Lire le fichier de config
        const configPath = path.resolve(CONFIG_FILE);
        const configData = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configData);

        // Générer un nouveau pseudo
        const newUsername = generateUsername();
        const oldUsername = config.username || 'N/A';

        // Mettre à jour le pseudo
        config.username = newUsername;

        // Sauvegarder la config
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

        console.log(`[${new Date().toLocaleString()}] Pseudo changé: ${oldUsername} -> ${newUsername}`);
        return true;
    } catch (error) {
        console.error('Erreur lors de la mise à jour du pseudo:', error);
        return false;
    }
}

// Arrête le bot proprement
function stopBot() {
    return new Promise((resolve) => {
        if (botProcess) {
            console.log(`[${new Date().toLocaleString()}] Arrêt du bot...`);
            
            botProcess.on('exit', () => {
                botProcess = null;
                resolve();
            });

            // Essayer d'abord un arrêt propre
            botProcess.kill('SIGTERM');
            
            // Force kill après 5 secondes si toujours actif
            setTimeout(() => {
                if (botProcess) {
                    botProcess.kill('SIGKILL');
                }
            }, 5000);
        } else {
            resolve();
        }
    });
}

// Démarre le bot
function startBot() {
    console.log(`[${new Date().toLocaleString()}] Démarrage du bot...`);
    
    botProcess = spawn(BOT_COMMAND, BOT_ARGS, {
        stdio: 'inherit',
        cwd: process.cwd()
    });

    botProcess.on('error', (error) => {
        console.error('Erreur lors du démarrage du bot:', error);
    });

    botProcess.on('exit', (code) => {
        if (code !== 0 && code !== null) {
            console.log(`[${new Date().toLocaleString()}] Le bot s'est arrêté avec le code: ${code}`);
            console.log(`[${new Date().toLocaleString()}] Redémarrage dans 10 secondes...`);
            setTimeout(() => {
                if (!botProcess) {
                    startBot();
                }
            }, 10000);
        }
    });
}

// Cycle complet: arrêt, changement de pseudo, redémarrage
async function cycleBot() {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`[${new Date().toLocaleString()}] Début du cycle de changement de pseudo`);
    
    await stopBot();
    await new Promise(resolve => setTimeout(resolve, 2000)); // Attendre 2 secondes
    
    if (updateUsername()) {
        await new Promise(resolve => setTimeout(resolve, 1000)); // Attendre 1 seconde
        startBot();
        console.log(`[${new Date().toLocaleString()}] Prochain changement dans 3 heures`);
    } else {
        console.error('Échec de la mise à jour du pseudo, réessai dans 1 minute...');
        setTimeout(cycleBot, 60000);
    }
    
    console.log(`${'='.repeat(50)}\n`);
}

// Gestion de l'arrêt du script
process.on('SIGINT', async () => {
    console.log('\n\nArrêt du script...');
    await stopBot();
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n\nArrêt du script...');
    await stopBot();
    process.exit(0);
});

// Démarrage du script
console.log('========================================');
console.log('  Auto Username Changer - Aternos Bot');
console.log('========================================');
console.log(`Intervalle: ${CHANGE_INTERVAL / 1000 / 60 / 60} heures`);
console.log(`Fichier config: ${CONFIG_FILE}`);
console.log('========================================\n');

// Premier cycle immédiat
cycleBot();

// Programmer les cycles suivants
setInterval(cycleBot, CHANGE_INTERVAL);
