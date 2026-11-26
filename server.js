const express = require('express');
const path = require('path');
const { connectDB, User, Transaction } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'NexYield_Admin_2026_Secure!';
const activeAdminTokens = new Set();

function normalizePhone(raw) {
  if (!raw) return '';
  const cleaned = String(raw).trim().replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  return '+' + cleaned;
}

function makeInviteCode(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return 'NX' + digits.slice(-4).padStart(4, '0');
}

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    const token = 'ADM_TOKEN_' + Math.random().toString(36).substring(2) + Date.now();
    activeAdminTokens.add(token);
    return res.json({ success: true, token });
  }
  return res.json({ success: false, error: 'Mot de passe administrateur incorrect.' });
});

const verifyAdmin = (req, res, next) => {
  const token = req.headers['x-admin-token'];
  if (token && activeAdminTokens.has(token)) {
    return next();
  }
  return res.status(403).json({ success: false, error: 'Accès refusé. Non autorisé.' });
};

app.post('/api/register', async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { password, refBy } = req.body;
    if (!phone || phone.length < 6 || !password) {
      return res.json({ success: false, error: 'Numéro et mot de passe requis.' });
    }

    const existing = await User.findOne({ phone });
    if (existing) {
      return res.json({ success: false, error: 'Ce numéro est déjà enregistré.' });
    }

    const cleanRef = refBy ? String(refBy).trim().toUpperCase() : null;

    await User.create({
      phone,
      password,
      depositBalance: 0,
      withdrawableBalance: 800,
      refBy: cleanRef,
      referralEarnings: 0,
      packs: [],
      deposits: [],
      withdrawals: [],
      joinedAt: new Date().toLocaleDateString('fr-FR')
    });

    return res.json({
      success: true,
      message: 'Compte créé avec succès ! 800 FCFA de bonus offerts.',
      depositBalance: 0,
      withdrawableBalance: 800
    });
  } catch (err) {
    return res.json({ success: false, error: 'Erreur lors de l’inscription.' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const phone = normalizePhone(req.body.phone);
    const { password } = req.body;
    if (!phone || !password) {
      return res.json({ success: false, error: 'Champs requis.' });
    }

    const user = await User.findOne({ phone });
    if (!user || user.password !== password) {
      return res.json({ success: false, error: 'Numéro ou mot de passe incorrect.' });
    }

    return res.json({
      success: true,
      message: 'Connexion réussie.',
      depositBalance: user.depositBalance,
      withdrawableBalance: user.withdrawableBalance
    });
  } catch (err) {
    return res.json({ success: false, error: 'Erreur lors de la connexion.' });
  }
});

app.get('/api/user/:phone', async (req, res) => {
  try {
    const phone = normalizePhone(decodeURIComponent(req.params.phone));
    const user = await User.findOne({ phone });
    if (!user) {
      return res.json({ success: false, error: 'Utilisateur introuvable.' });
    }

    const myCode = makeInviteCode(phone);
    const allUsers = await User.find({ refBy: { $ne: null } });

    const referralsList = allUsers
      .filter((u) => {
        const ref = String(u.refBy || '').trim().toUpperCase();
        return ref === myCode || normalizePhone(ref) === phone;
      })
      .map((u) => ({
        phone: u.phone,
        joinedAt: u.joinedAt || 'Récemment',
        invested: Array.isArray(u.deposits) && u.deposits.some((d) => d.status === 'VALIDÉ')
      }));

    return res.json({
      success: true,
      depositBalance: user.depositBalance,
      withdrawableBalance: user.withdrawableBalance,
      referralEarnings: user.referralEarnings || 0,
      packs: user.packs || [],
      referrals: referralsList
    });
  } catch (err) {
    return res.json({ success: false, error: 'Erreur de chargement du profil.' });
  }
});

app.post('/api/buy-pack', async (req, res) => {
  try {
    const userPhone = normalizePhone(req.body.userPhone);
    const { name, price, dailyGain, percent } = req.body;
    const user = await User.findOne({ phone: userPhone });
    if (!user) return res.json({ success: false, error: 'Utilisateur introuvable.' });

    if (user.depositBalance < price) {
      return res.json({ success: false, error: 'Solde dépôt insuffisant.' });
    }

    user.depositBalance -= price;
    user.packs.push({
      id: Date.now(),
      name,
      price,
      dailyGain,
      percent,
      date: new Date().toLocaleDateString('fr-FR')
    });
    await user.save();

    return res.json({ success: true, depositBalance: user.depositBalance, packs: user.packs });
  } catch (err) {
    return res.json({ success: false, error: 'Erreur lors de l’achat.' });
  }
});

app.post('/api/deposit', async (req, res) => {
  try {
    const userPhone = normalizePhone(req.body.userPhone);
    const { senderPhone, amount, method } = req.body;
    const user = await User.findOne({ phone: userPhone });
    if (!user) return res.json({ success: false, error: 'Utilisateur introuvable.' });

    const txId = Date.now();
    const dateStr = new Date().toLocaleString('fr-FR');
    const parsedAmount = parseInt(amount, 10);

    const depRecord = {
      id: txId,
      userPhone,
      senderPhone,
      amount: parsedAmount,
      method,
      status: 'EN ATTENTE',
      date: dateStr
    };

    user.deposits.push(depRecord);
    await user.save();

    await Transaction.create({
      id: txId,
      kind: 'deposit',
      userPhone,
      senderPhone,
      amount: parsedAmount,
      method,
      status: 'EN ATTENTE',
      date: dateStr
    });

    return res.json({ success: true, message: 'Dépôt enregistré.' });
  } catch (err) {
    return res.json({ success: false, error: 'Erreur lors de l’enregistrement du dépôt.' });
  }
});

app.post('/api/withdraw', async (req, res) => {
  try {
    const userPhone = normalizePhone(req.body.userPhone);
    const amount = parseInt(req.body.amount, 10);
    const { withdrawPhone } = req.body;
    const user = await User.findOne({ phone: userPhone });
    if (!user) return res.json({ success: false, error: 'Utilisateur introuvable.' });

    if (user.withdrawableBalance < amount) {
      return res.json({ success: false, error: 'Solde retirable insuffisant.' });
    }

    const txId = Date.now();
    const dateStr = new Date().toLocaleString('fr-FR');
    const fee = amount * 0.10;
    const netAmount = amount * 0.90;

    user.withdrawableBalance -= amount;
    const witRecord = {
      id: txId,
      userPhone,
      requestedAmount: amount,
      fee,
      netAmount,
      withdrawPhone,
      status: 'EN COURS DE TRAITEMENT',
      date: dateStr
    };

    user.withdrawals.push(witRecord);
    await user.save();

    await Transaction.create({
      id: txId,
      kind: 'withdrawal',
      userPhone,
      withdrawPhone,
      amount,
      requestedAmount: amount,
      fee,
      netAmount,
      status: 'EN COURS DE TRAITEMENT',
      date: dateStr
    });

    return res.json({ success: true, withdrawableBalance: user.withdrawableBalance });
  } catch (err) {
    return res.json({ success: false, error: 'Erreur lors du retrait.' });
  }
});

app.get('/api/user/history/:phone', async (req, res) => {
  try {
    const phone = normalizePhone(decodeURIComponent(req.params.phone));
    const user = await User.findOne({ phone });
    if (!user) return res.json({ deposits: [], withdrawals: [] });
    return res.json({ deposits: user.deposits || [], withdrawals: user.withdrawals || [] });
  } catch (err) {
    return res.json({ deposits: [], withdrawals: [] });
  }
});

app.post('/api/spin-wheel', async (req, res) => {
  try {
    const userPhone = normalizePhone(req.body.userPhone);
    const user = await User.findOne({ phone: userPhone });
    if (!user) return res.json({ success: false, error: 'Utilisateur introuvable.' });

    user.withdrawableBalance += 50;
    await user.save();
    return res.json({ success: true, withdrawableBalance: user.withdrawableBalance });
  } catch (err) {
    return res.json({ success: false, error: 'Erreur réseau.' });
  }
});

app.get('/api/admin/data', verifyAdmin, async (req, res) => {
  const allTx = await Transaction.find().sort({ id: -1 });
  const deposits = allTx.filter((t) => t.kind === 'deposit');
  const withdrawals = allTx.filter((t) => t.kind === 'withdrawal');
  return res.json({ deposits, withdrawals });
});

app.post('/api/admin/verify-deposit', verifyAdmin, async (req, res) => {
  const { depositId, action } = req.body;
  const dep = await Transaction.findOne({ id: depositId, kind: 'deposit' });
  if (!dep) return res.json({ success: false });

  if (action === 'APPROVE' && dep.status === 'EN ATTENTE') {
    dep.status = 'VALIDÉ';
    await dep.save();

    const user = await User.findOne({ phone: dep.userPhone });
    if (user) {
      const idx = user.deposits.findIndex((d) => d.id === depositId);
      if (idx !== -1) {
        user.deposits[idx].status = 'VALIDÉ';
        user.markModified('deposits');
      }
      const validDepositsCount = user.deposits.filter((d) => d.status === 'VALIDÉ').length;
      user.depositBalance += dep.amount;
      await user.save();

      if (validDepositsCount === 1 && user.refBy) {
        const refCode = String(user.refBy).trim().toUpperCase();
        const allUsers = await User.find();
        const parentUser = allUsers.find(
          (p) => makeInviteCode(p.phone) === refCode || p.phone === normalizePhone(refCode)
        );
        if (parentUser) {
          const commission = dep.amount * 0.25;
          parentUser.withdrawableBalance += commission;
          parentUser.referralEarnings = (parentUser.referralEarnings || 0) + commission;
          await parentUser.save();
        }
      }
    }
  } else if (action === 'REJECT') {
    dep.status = 'REJETÉ';
    await dep.save();
    const user = await User.findOne({ phone: dep.userPhone });
    if (user) {
      const idx = user.deposits.findIndex((d) => d.id === depositId);
      if (idx !== -1) {
        user.deposits[idx].status = 'REJETÉ';
        user.markModified('deposits');
        await user.save();
      }
    }
  }
  return res.json({ success: true });
});

app.post('/api/admin/verify-withdrawal', verifyAdmin, async (req, res) => {
  const { withdrawalId, action } = req.body;
  const wit = await Transaction.findOne({ id: withdrawalId, kind: 'withdrawal' });
  if (!wit) return res.json({ success: false });

  const user = await User.findOne({ phone: wit.userPhone });

  if (action === 'PAY') {
    wit.status = 'PAYÉ';
    await wit.save();
    if (user) {
      const idx = user.withdrawals.findIndex((w) => w.id === withdrawalId);
      if (idx !== -1) {
        user.withdrawals[idx].status = 'PAYÉ';
        user.markModified('withdrawals');
        await user.save();
      }
    }
  } else if (action === 'CANCEL') {
    wit.status = 'ANNULÉ';
    await wit.save();
    if (user) {
      user.withdrawableBalance += wit.requestedAmount;
      const idx = user.withdrawals.findIndex((w) => w.id === withdrawalId);
      if (idx !== -1) {
        user.withdrawals[idx].status = 'ANNULÉ';
        user.markModified('withdrawals');
      }
      await user.save();
    }
  }
  return res.json({ success: true });
});

app.post('/api/admin/trigger-daily-yield', verifyAdmin, async (req, res) => {
  const allUsers = await User.find();
  for (const user of allUsers) {
    if (Array.isArray(user.packs) && user.packs.length > 0) {
      const totalDaily = user.packs.reduce((sum, p) => sum + (p.dailyGain || 0), 0);
      user.withdrawableBalance += totalDaily;
      await user.save();
    }
  }
  return res.json({ success: true, message: 'Gains de 24h distribués !' });
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Serveur NexYield connecté à la base sur le port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Échec connexion base de données :', err.message);
    process.exit(1);
  });