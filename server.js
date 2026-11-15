const express = require('express');
const path = require('path');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Base de données en mémoire robuste
let users = {}; // { phone: { password, depositBalance, withdrawableBalance, refBy, referralEarnings, packs, deposits, withdrawals } }
let deposits = [];
let withdrawals = [];

// Route d'inscription
app.post('/api/register', (req, res) => {
    let { phone, password, refBy } = req.body;
    if (!phone || !password) return res.json({ success: false, error: "Numéro et mot de passe requis." });
    
    phone = phone.trim();
    if (users[phone]) return res.json({ success: false, error: "Ce numéro est déjà enregistré." });

    let cleanRef = refBy ? refBy.trim().toUpperCase() : null;

    users[phone] = {
        password,
        depositBalance: 0,
        withdrawableBalance: 800, // Bonus de bienvenue 800 FCFA
        refBy: cleanRef,
        referralEarnings: 0,
        packs: [],
        deposits: [],
        withdrawals: []
    };

    res.json({ 
        success: true, 
        message: "Compte créé avec succès ! 800 FCFA de bonus offerts.",
        depositBalance: 0,
        withdrawableBalance: 800
    });
});

// Route de connexion
app.post('/api/login', (req, res) => {
    let { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, error: "Champs requis." });
    
    phone = phone.trim();
    const user = users[phone];
    if (!user || user.password !== password) {
        return res.json({ success: false, error: "Numéro ou mot de passe incorrect." });
    }

    res.json({
        success: true,
        message: "Connexion réussie.",
        depositBalance: user.depositBalance,
        withdrawableBalance: user.withdrawableBalance
    });
});

// Récupérer les infos d'un utilisateur, son équipe et ses filleuls
app.get('/api/user/:phone', (req, res) => {
    let phone = req.params.phone.trim();
    const user = users[phone];
    if (!user) return res.json({ success: false, error: "Utilisateur introuvable." });

    // Trouver tous les filleuls de cet utilisateur
    let referralsList = [];
    for (let uPhone in users) {
        let u = users[uPhone];
        // Si le filleul a pour parrain ce numéro OU le code de parrainage généré (NX + 4 derniers chiffres)
        let generatedCode = 'NX' + uPhone.replace(/[^0-9]/g, '').slice(-4).toUpperCase();
        if (u.refBy && (u.refBy === phone || u.refBy === generatedCode)) {
            let hasInvested = u.deposits && u.deposits.some(d => d.status === 'VALIDÉ');
            referralsList.push({
                phone: uPhone,
                joinedAt: u.joinedAt || "Récemment",
                invested: hasInvested
            });
        }
    }

    res.json({
        success: true,
        depositBalance: user.depositBalance,
        withdrawableBalance: user.withdrawableBalance,
        referralEarnings: user.referralEarnings || 0,
        packs: user.packs || [],
        referrals: referralsList
    });
});

// Acheter un pack d'investissement
app.post('/api/buy-pack', (req, res) => {
    let { userPhone, name, price, dailyGain, percent } = req.body;
    const user = users[userPhone];
    if (!user) return res.json({ success: false, error: "Utilisateur introuvable." });

    if (user.depositBalance < price) {
        return res.json({ success: false, error: "Solde dépôt insuffisant." });
    }

    user.depositBalance -= price;
    const newPack = {
        id: Date.now(),
        name,
        price,
        dailyGain,
        percent,
        date: new Date().toLocaleDateString('fr-FR')
    };
    user.packs.push(newPack);

    res.json({
        success: true,
        depositBalance: user.depositBalance,
        packs: user.packs
    });
});

// Effectuer un dépôt
app.post('/api/deposit', (req, res) => {
    let { userPhone, senderPhone, amount, method } = req.body;
    const user = users[userPhone];
    if (!user) return res.json({ success: false, error: "Utilisateur introuvable." });

    const newDep = {
        id: Date.now(),
        userPhone,
        senderPhone,
        amount: parseInt(amount),
        method,
        status: 'EN ATTENTE',
        date: new Date().toLocaleString()
    };
    deposits.push(newDep);
    user.deposits.push(newDep);

    res.json({ success: true, message: "Dépôt enregistré." });
});

// Demande de retrait
app.post('/api/withdraw', (req, res) => {
    let { userPhone, amount, withdrawPhone } = req.body;
    const user = users[userPhone];
    if (!user) return res.json({ success: false, error: "Utilisateur introuvable." });

    amount = parseInt(amount);
    if (user.withdrawableBalance < amount) {
        return res.json({ success: false, error: "Solde retirable insuffisant." });
    }

    user.withdrawableBalance -= amount;
    const newWit = {
        id: Date.now(),
        userPhone,
        requestedAmount: amount,
        fee: amount * 0.10,
        netAmount: amount * 0.90,
        withdrawPhone,
        status: 'EN COURS DE TRAITEMENT',
        date: new Date().toLocaleString()
    };
    withdrawals.push(newWit);
    user.withdrawals.push(newWit);

    res.json({ success: true, withdrawableBalance: user.withdrawableBalance });
});

// Historique personnel
app.get('/api/user/history/:phone', (req, res) => {
    let phone = req.params.phone.trim();
    const user = users[phone];
    if (!user) return res.json({ deposits: [], withdrawals: [] });
    res.json({ deposits: user.deposits || [], withdrawals: user.withdrawals || [] });
});

// Route pour tourner la roue (Bonus 50 FCFA)
app.post('/api/spin-wheel', (req, res) => {
    let { userPhone } = req.body;
    const user = users[userPhone];
    if (!user) return res.json({ success: false, error: "Utilisateur introuvable." });

    user.withdrawableBalance += 50;
    res.json({ success: true, withdrawableBalance: user.withdrawableBalance });
});

// Panel Admin - Données
app.get('/api/admin/data', (req, res) => {
    res.json({ deposits, withdrawals });
});

// Valider ou Rejeter un dépôt + Attribution des 25% de parrainage
app.post('/api/admin/verify-deposit', (req, res) => {
    const { depositId, action } = req.body;
    const dep = deposits.find(d => d.id === depositId);
    if (!dep) return res.json({ success: false });

    if (action === 'APPROVE' && dep.status === 'EN ATTENTE') {
        dep.status = 'VALIDÉ';
        const user = users[dep.userPhone];
        if (user) {
            // Vérifier si c'est le PREMIER dépôt validé de cet utilisateur pour déclencher le parrainage 25%
            let validDepositsCount = user.deposits.filter(d => d.status === 'VALIDÉ').length;
            
            user.depositBalance += dep.amount;

            // Si c'est le tout premier dépôt validé et qu'il a un parrain
            if (validDepositsCount === 1 && user.refBy) {
                for (let pPhone in users) {
                    let parentUser = users[pPhone];
                    let parentCode = 'NX' + pPhone.replace(/[^0-9]/g, '').slice(-4).toUpperCase();
                    if (user.refBy === pPhone || user.refBy === parentCode) {
                        let commission = dep.amount * 0.25; // 25% du premier dépôt
                        parentUser.withdrawableBalance += commission;
                        parentUser.referralEarnings = (parentUser.referralEarnings || 0) + commission;
                        break;
                    }
                }
            }
        }
    } else if (action === 'REJECT') {
        dep.status = 'REJETÉ';
    }
    res.json({ success: true });
});

// Traiter un retrait
app.post('/api/admin/verify-withdrawal', (req, res) => {
    const { withdrawalId, action } = req.body;
    const wit = withdrawals.find(w => w.id === withdrawalId);
    if (!wit) return res.json({ success: false });

    if (action === 'PAY') wit.status = 'PAYÉ';
    if (action === 'CANCEL') {
        wit.status = 'ANNULÉ';
        const user = users[wit.userPhone];
        if (user) user.withdrawableBalance += wit.requestedAmount; // Remboursement si annulé
    }
    res.json({ success: true });
});

// Simuler les gains de 24h
app.post('/api/admin/trigger-daily-yield', (req, res) => {
    for (let phone in users) {
        let user = users[phone];
        if (user.packs && user.packs.length > 0) {
            let totalDaily = user.packs.reduce((sum, p) => sum + p.dailyGain, 0);
            user.withdrawableBalance += totalDaily;
        }
    }
    res.json({ success: true, message: "Gains de 24h distribués !" });
});

app.listen(PORT, () => {
    console.log(`Serveur NexYield démarré sur le port ${PORT}`);
});
