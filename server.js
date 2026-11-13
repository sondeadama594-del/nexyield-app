const express = require('express');
const app = express();
const path = require('path');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Base de données en mémoire vive (centralisée sur le serveur)
let db = {
    deposits: [],
    withdrawals: [],
    users: {}
};

// 1. Enregistrer une demande de dépôt (depuis n'importe quel appareil, ex: téléphone)
app.post('/api/deposit', (req, res) => {
    const { phone, amount, proof } = req.body;
    if (!phone || !amount) {
        return res.status(400).json({ success: false, message: "Numéro ou montant manquant." });
    }

    const newDeposit = {
        id: Date.now().toString(),
        phone,
        amount: Number(amount),
        proof: proof || '',
        status: 'pending', // en attente de validation
        date: new Date().toLocaleString()
    };

    db.deposits.push(newDeposit);
    res.json({ success: true, message: "Demande de dépôt envoyée avec succès !" });
});

// 2. Envoyer une demande de retrait
app.post('/api/withdraw', (req, res) => {
    const { phone, amount } = req.body;
    if (!phone || !amount) {
        return res.status(400).json({ success: false, message: "Données manquantes." });
    }

    const newWithdrawal = {
        id: Date.now().toString(),
        phone,
        amount: Number(amount),
        status: 'pending',
        date: new Date().toLocaleString()
    };

    db.withdrawals.push(newWithdrawal);
    res.json({ success: true, message: "Demande de retrait enregistrée." });
});

// 3. Récupérer toutes les données pour le Panneau Admin (depuis votre PC)
app.get('/api/admin/data', (req, res) => {
    res.json({
        deposits: db.deposits,
        withdrawals: db.withdrawals,
        users: db.users
    });
});

// 4. Valider un dépôt depuis le Panneau Admin (sur votre PC)
app.post('/api/admin/validate-deposit', (req, res) => {
    const { depositId } = req.body;
    const deposit = db.deposits.find(d => d.id === depositId);

    if (!deposit || deposit.status !== 'pending') {
        return res.status(400).json({ success: false, message: "Dépôt introuvable ou déjà traité." });
    }

    deposit.status = 'approved';

    // Créer ou mettre à jour le compte de l'utilisateur sur le serveur
    if (!db.users[deposit.phone]) {
        db.users[deposit.phone] = { depositBalance: 0, withdrawableBalance: 0 };
    }
    db.users[deposit.phone].depositBalance += deposit.amount;

    res.json({ success: true, message: "Dépôt validé avec succès !" });
});

// Lancement du serveur sur le port 3000 (ou celui de Render)
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Serveur NexYield démarré sur http://localhost:${PORT}`);
});
