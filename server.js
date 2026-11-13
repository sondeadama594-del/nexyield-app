const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Base de données centrale en mémoire sur le serveur
let db = {
    users: {},       // Stocke les mots de passe et soldes : { "07000000": { password: "...", depositBalance: 0, withdrawableBalance: 800 } }
    deposits: [],    // Liste de tous les dépôts
    withdrawals: []  // Liste de tous les retraits
};

// 1. Inscription
app.post('/api/register', (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password) {
        return res.status(400).json({ success: false, error: "Numéro ou mot de passe manquant." });
    }
    if (db.users[phone]) {
        return res.status(400).json({ success: false, error: "Ce numéro est déjà utilisé." });
    }

    // Créer le compte avec 800 FCFA de bonus initial
    db.users[phone] = {
        password: password,
        depositBalance: 0,
        withdrawableBalance: 800
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

// 3. Récupérer les soldes d'un utilisateur
app.get('/api/user/:phone', (req, res) => {
    const phone = req.params.phone;
    const user = db.users[phone];
    if (!user) {
        return res.status(404).json({ success: false, error: "Utilisateur introuvable." });
    }
    res.json({ success: true, depositBalance: user.depositBalance, withdrawableBalance: user.withdrawableBalance });
});

// 4. Soumettre un dépôt
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

// 5. Soumettre un retrait
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

// 6. Données pour le Panneau Admin (depuis votre PC)
app.get('/api/admin/data', (req, res) => {
    res.json({
        deposits: db.deposits,
        withdrawals: db.withdrawals,
        users: db.users
    });
});

// 7. Validation / Rejet d'un dépôt par l'Admin
app.post('/api/admin/verify-deposit', (req, res) => {
    const { depositId, action } = req.body;
    const deposit = db.deposits.find(d => d.id == depositId);

    if (!deposit || deposit.status !== 'EN ATTENTE') {
        return res.status(400).json({ success: false, message: "Dépôt introuvable ou déjà traité." });
    }

    if (action === 'APPROVE') {
        deposit.status = 'VALIDÉ';
        if (db.users[deposit.userPhone]) {
            db.users[deposit.userPhone].depositBalance += deposit.amount;
        }
    } else {
        deposit.status = 'REJETÉ';
    }

    res.json({ success: true, message: "Dépôt mis à jour." });
});

// 8. Validation d'un retrait par l'Admin
app.post('/api/admin/verify-withdrawal', (req, res) => {
    const { withdrawalId, action } = req.body;
    const withdrawal = db.withdrawals.find(w => w.id == withdrawalId);

    if (!withdrawal) {
        return res.status(400).json({ success: false, message: "Retrait introuvable." });
    }

    withdrawal.status = (action === 'PAY') ? 'PAYÉ AVEC SUCCÈS' : 'ANNULÉ';
    res.json({ success: true });
});

// Lancement du serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur NexYield en écoute sur le port ${PORT}`);
});
