const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Base de données centrale en mémoire sur le serveur
let db = {
    users: {},       // { phone: { password, depositBalance, withdrawableBalance, sponsor, firstDepositDone, packs } }
    deposits: [],    // Liste de tous les dépôts
    withdrawals: []  // Liste de tous les retraits
};

// 1. Inscription (avec capture du parrain)
app.post('/api/register', (req, res) => {
    const { phone, password, refBy } = req.body;
    if (!phone || !password) {
        return res.status(400).json({ success: false, error: "Numéro ou mot de passe manquant." });
    }
    if (db.users[phone]) {
        return res.status(400).json({ success: false, error: "Ce numéro est déjà utilisé." });
    }

    db.users[phone] = {
        password: password,
        depositBalance: 0,
        withdrawableBalance: 800, // Bonus de bienvenue
        sponsor: refBy || null,
        firstDepositDone: false,
        packs: []
    };

    res.json({ success: true, message: "Compte créé avec succès ! +800 FCFA de bonus.", balance: 800 });
});

// 2. Connexion
app.post('/api/login', (req, res) => {
    const { phone, password } = req.body;
    const user = db.users[phone];

    if (!user || user.password !== password) {
        return res.status(400).json({ success: false, error: "Numéro ou mot de passe incorrect." });
    }

    res.json({ 
        success: true, 
        message: "Connexion réussie !", 
        depositBalance: user.depositBalance,
        withdrawableBalance: user.withdrawableBalance 
    });
});

// 3. Récupérer les soldes et packs d'un utilisateur
app.get('/api/user/:phone', (req, res) => {
    const phone = req.params.phone;
    const user = db.users[phone];
    if (!user) {
        return res.status(404).json({ success: false, error: "Utilisateur introuvable." });
    }
    res.json({ 
        success: true, 
        depositBalance: user.depositBalance, 
        withdrawableBalance: user.withdrawableBalance,
        packs: user.packs || []
    });
});

// 4. Récupérer l'historique d'un utilisateur (Dépôts & Retraits)
app.get('/api/user/history/:phone', (req, res) => {
    const phone = req.params.phone;
    const userDeposits = db.deposits.filter(d => d.userPhone === phone);
    const userWithdrawals = db.withdrawals.filter(w => w.userPhone === phone);
    
    res.json({
        success: true,
        deposits: userDeposits,
        withdrawals: userWithdrawals
    });
});

// 5. Soumettre un dépôt
app.post('/api/deposit', (req, res) => {
    const { userPhone, senderPhone, amount, method } = req.body;
    const newDeposit = {
        id: Date.now(),
        userPhone,
        senderPhone,
        amount: Number(amount),
        method: method || 'Orange Money',
        status: 'EN ATTENTE',
        date: new Date().toLocaleString()
    };
    db.deposits.push(newDeposit);
    res.json({ success: true, message: "Demande de dépôt enregistrée." });
});

// 6. Acheter un pack (déduit du solde dépôt sur le serveur)
app.post('/api/buy-pack', (req, res) => {
    const { userPhone, name, price, dailyGain, percent } = req.body;
    const user = db.users[userPhone];

    if (!user) {
        return res.status(404).json({ success: false, error: "Utilisateur introuvable." });
    }

    if (user.depositBalance < price) {
        return res.status(400).json({ success: false, error: "Solde dépôt insuffisant sur le serveur." });
    }

    user.depositBalance -= price;
    if (!user.packs) user.packs = [];

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

// 7. Soumettre un retrait
app.post('/api/withdraw', (req, res) => {
    const { userPhone, amount, withdrawPhone } = req.body;
    const user = db.users[userPhone];

    if (!user || user.withdrawableBalance < amount) {
        return res.status(400).json({ success: false, error: "Solde retirable insuffisant." });
    }

    user.withdrawableBalance -= amount;
    const fee = amount * 0.10;
    const netAmount = amount - fee;

    const newWithdrawal = {
        id: Date.now(),
        userPhone,
        requestedAmount: amount,
        fee,
        netAmount,
        withdrawPhone,
        status: 'EN COURS DE TRAITEMENT',
        date: new Date().toLocaleString()
    };
    db.withdrawals.push(newWithdrawal);
    res.json({ success: true, message: "Retrait pris en compte." });
});

// 8. Données globales pour le Panneau Admin
app.get('/api/admin/data', (req, res) => {
    res.json({
        deposits: db.deposits,
        withdrawals: db.withdrawals,
        users: db.users
    });
});

// 9. Validation / Rejet d'un dépôt par l'Admin (avec versement auto des 17% au parrain)
app.post('/api/admin/verify-deposit', (req, res) => {
    const { depositId, action } = req.body;
    const deposit = db.deposits.find(d => d.id == depositId);

    if (!deposit || deposit.status !== 'EN ATTENTE') {
        return res.status(400).json({ success: false, message: "Dépôt introuvable ou déjà traité." });
    }

    if (action === 'APPROVE') {
        deposit.status = 'VALIDÉ';
        const userObj = db.users[deposit.userPhone];
        
        if (userObj) {
            userObj.depositBalance += deposit.amount;

            // Gestion du parrainage (17% sur le premier dépôt validé)
            if (userObj.sponsor && !userObj.firstDepositDone) {
                const sponsorPhone = userObj.sponsor;
                if (db.users[sponsorPhone]) {
                    const commission = Math.round(deposit.amount * 0.17);
                    db.users[sponsorPhone].withdrawableBalance += commission;
                    userObj.firstDepositDone = true;
                }
            }
        }
    } else {
        deposit.status = 'REJETÉ';
    }

    res.json({ success: true, message: "Dépôt mis à jour." });
});

// 10. Validation d'un retrait par l'Admin
app.post('/api/admin/verify-withdrawal', (req, res) => {
    const { withdrawalId, action } = req.body;
    const withdrawal = db.withdrawals.find(w => w.id == withdrawalId);

    if (!withdrawal) {
        return res.status(400).json({ success: false, message: "Retrait introuvable." });
    }

    withdrawal.status = (action === 'PAY') ? 'PAYÉ AVEC SUCCÈS' : 'ANNULÉ';
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur NexYield en écoute sur le port ${PORT}`);
});
