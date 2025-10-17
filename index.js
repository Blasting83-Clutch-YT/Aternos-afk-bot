// --- DEPENDANCES ---
const mineflayer = require('mineflayer');
// Assurez-vous que le chemin vers settings.json est correct
const config = require('./settings.json'); 

let bot = null; // Variable pour stocker l'instance actuelle du bot

// --- 1. GENERATEUR DE NOM D'UTILISATEUR ALEATOIRE ---
function generateRandomUsername() {
    // Caractères possibles pour le suffixe
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = 'AFK_';
    
    // Génère un suffixe aléatoire de 6 caractères
    for (let i = 0; i < 6; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Exemple: AFK_hY7tP9
    return result; 
}

// --- 2. FONCTION DE CREATION ET CONNEXION DU BOT ---
function createBot(username) {
    console.log(`[CYCLE] Tentative de connexion avec le nouveau nom: ${username}`);

    const botOptions = {
        host: config.host,
        port: config.port,
        username: username, // Utilisation du nom aléatoire généré
        version: config.version,
        auth: config.auth, 
        // Ajoutez ici toutes les autres options de connexion de votre bot (ex: hideErrors, clientToken, etc.)
    };
    
    const newBot = mineflayer.createBot(botOptions);

    // --- DEPLACEZ TOUTE LA LOGIQUE EXISTANTE DU BOT ICI ---
    // (Exemples d'événements à transférer)

    newBot.on('error', (err) => {
        console.error(`[ERREUR] Une erreur s'est produite: ${err.message}`);
    });

    newBot.on('kicked', (reason) => {
        console.log(`[DECONNEXION] Le bot a été kické: ${reason}`);
        // Laissez le planificateur (scheduler) gérer le prochain redémarrage
    });

    newBot.on('spawn', () => {
        console.log(`[CONNEXION] Bot connecté avec succès! Nom: ${newBot.username}`);
        // Mettez ici votre logique d'AFK et de mouvement (ex: bot.setControlState, bot.afk)
    });
    
    // --------------------------------------------------------

    return newBot;
}

// --- 3. FONCTION DE REDEMARRAGE ET CHANGEMENT DE NOM ---
function cycleBot() {
    // Déconnecter le bot actuel si une instance existe
    if (bot) {
        console.log('[CYCLE] Déconnexion de l\'instance actuelle pour changement de nom...');
        // bot.end() déconnecte le bot et nettoie ses ressources
        bot.end();
        bot = null; // Supprime la référence
    }

    // Générer un nouveau nom d'utilisateur
    const newUsername = generateRandomUsername();

    // Créer et démarrer une nouvelle instance du bot
    bot = createBot(newUsername);
}

// --- 4. PLANIFICATEUR (SCHEDULER) ---

// 3 heures en millisecondes: 3 * 60 minutes * 60 secondes * 1000 ms
const intervalTime = 3 * 60 * 60 * 1000; 
// Si vous voulez tester avec 5 minutes (300000 ms), changez la valeur

console.log(`[SCHEDULER] Le bot changera de nom et redémarrera automatiquement toutes les ${intervalTime / (60 * 60 * 1000)} heures.`);

// Démarre le cycle initial immédiatement
cycleBot();

// Configure le redémarrage périodique
setInterval(cycleBot, intervalTime);
