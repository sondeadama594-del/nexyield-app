const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const users = [];
const deposits = [];
const withdrawals = [];

// 1. ROUTE D'INSCRIPTION (Enregistre le compte et le parrain s'il y en a un)
app.post('/api/register', (req, res) => {
    const { phone, password, refBy } = req.body;
    if (!phone || !password) return res.status(400).json({ success: false, error: 'Champs manquants.' });
    if (users.find(u => u.phone === phone)) return res.status(400).json({ success: false, error: 'Numéro déjà inscrit.' });

    const newUser = {
        phone,
        password,
        balance: 800, // Bonus de bienvenue
        depositedTotal: 0,
        refBy: refBy || null, // Le parrain (provenant du lien ?ref=)
        referralsCount: 0
    };
    users.push(newUser);
    res.json({ success: true, message: 'Compte créé avec succès !', balance: newUser.balance });
});

// Connexion
app.post('/api/login', (req, res) => {
    const { phone, password } = req.body;
    const user = users.find(u => u.phone === phone && u.password === password);
    if (!user) return res.status(400).json({ success: false, error: 'Identifiants incorrects.' });

    res.json({ success: true, message: 'Connexion réussie !', balance: user.balance });
});

// Récupérer le solde utilisateur
app.get('/api/user/:phone', (req, res) => {
    const user = users.find(u => u.phone === req.params.phone);
    if (!user) return res.status(404).json({ success: false });
    res.json({ success: true, balance: user.balance, depositedTotal: user.depositedTotal });
});

// Soumettre un Dépôt
app.post('/api/deposit', (req, res) => {
    const { userPhone, senderPhone, amount, method } = req.body;
    const numAmount = parseInt(amount);

    const newDeposit = {
        id: Date.now(),
        userPhone,
        senderPhone,
        amount: numAmount,
        method,
        status: 'EN ATTENTE'
    };
    deposits.push(newDeposit);
    res.json({ success: true, message: 'Demande de dépôt enregistrée. Veuillez patienter la validation.' });
});

// Demande de Retrait (10% de frais)
app.post('/api/withdraw', (req, res) => {
    const { userPhone, amount, withdrawPhone } = req.body;
    const reqAmount = parseInt(amount);

    if (reqAmount < 1200) {
        return res.status(400).json({ success: false, error: 'Seuil minimal : 1 200 FCFA.' });
    }

    const user = users.find(u => u.phone === userPhone);
    if (!user) return res.status(404).json({ success: false, error: 'Utilisateur introuvable.' });
    if (user.balance < reqAmount) return res.status(400).json({ success: false, error: 'Solde insuffisant.' });

    const fee = reqAmount * 0.10;
    const netAmount = reqAmount - fee;
    user.balance -= reqAmount;

    const newWithdrawal = {
        id: Date.now(),
        userPhone,
        withdrawPhone,
        requestedAmount: reqAmount,
        fee,
        netAmount,
        status: 'EN COURS DE TRAITEMENT'
    };
    withdrawals.push(newWithdrawal);

    res.json({ success: true, message: 'Retrait pris en compte avec succès !', balance: user.balance });
});

// Routes Admin
app.get('/api/admin/deposits', (req, res) => res.json(deposits));
app.get('/api/admin/withdrawals', (req, res) => res.json(withdrawals));

// 2. ROUTE DE VALIDATION ADMIN (Valide le dépôt et verse 500F au PARRAIN uniquement)
// Valider un dépôt + Bonus de parrainage unique (une seule fois par filleul)
app.post('/api/admin/verify-deposit', (req, res) => {
    const { depositId, action } = req.body;
    const deposit = deposits.find(d => d.id === depositId);
    if (!deposit || deposit.status !== 'EN ATTENTE') return res.status(400).json({ success: false });

    if (action === 'APPROVE') {
        deposit.status = 'VALIDÉ';
        const user = users.find(u => u.phone === deposit.userPhone);
        
        if (user) {
            // VÉRIFICATION : Est-ce son tout premier dépôt validé ET a-t-il un parrain ET n'a-t-il pas encore déclenché le bonus ?
            if (user.depositedTotal === 0 && user.refBy && !user.bonusPaid) {
                const sponsor = users.find(u => u.phone === user.refBy);
                if (sponsor) {
                    sponsor.balance += 500; // Le parrain reçoit 500 FCFA
                    sponsor.referralsCount += 1;
                    user.bonusPaid = true; // On marque le bonus comme déjà payé pour ce filleul !
                }
            }
            user.depositedTotal += deposit.amount;
        }
        res.json({ success: true, message: 'Dépôt validé avec succès !' });
    } else {
        deposit.status = 'REJETÉ';
        res.json({ success: true, message: 'Dépôt rejeté.' });
    }
});

app.post('/api/admin/verify-withdrawal', (req, res) => {
    const { withdrawalId, action } = req.body;
    const w = withdrawals.find(item => item.id === withdrawalId);
    if (!w) return res.status(400).json({ success: false });

    if (action === 'PAY') {
        w.status = 'PAYÉ AVEC SUCCÈS';
        res.json({ success: true });
    } else {
        w.status = 'ANNULÉ';
        const user = users.find(u => u.phone === w.userPhone);
        if (user) user.balance += w.requestedAmount;
        res.json({ success: true });
    }
});

// Simulation des gains journaliers
app.post('/api/admin/trigger-daily-yield', (req, res) => {
    users.forEach(user => {
        if (user.depositedTotal > 0) {
            let rate = 0.20;
            const amt = user.depositedTotal;

            if (amt >= 1000000) rate = 0.50;
            else if (amt >= 100000) rate = 0.35;
            else if (amt >= 50000) rate = 0.30;
            else if (amt >= 25000) rate = 0.25;
            else if (amt >= 10000) rate = 0.23;
            else if (amt >= 5000) rate = 0.21;
            else if (amt >= 3000) rate = 0.20;

            const dailyGain = amt * rate;
            user.balance += dailyGain;
        }
    });
    res.json({ success: true, message: 'Gains journaliers calculés et distribués avec succès !' });
});

app.listen(3000, () => console.log('Serveur démarré sur http://localhost:3000'));
// Récupérer l'historique personnel d'un utilisateur (dépôts et retraits)
app.get('/api/user/history/:phone', (req, res) => {
    const userPhone = req.params.phone;
    const userDeposits = deposits.filter(d => d.userPhone === userPhone);
    const userWithdrawals = withdrawals.filter(w => w.userPhone === userPhone);
    
    res.json({
        success: true,
        deposits: userDeposits,
        withdrawals: userWithdrawals
    });
});