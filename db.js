const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  depositBalance: { type: Number, default: 0 },
  withdrawableBalance: { type: Number, default: 800 },
  refBy: { type: String, default: null },
  referralEarnings: { type: Number, default: 0 },
  packs: { type: Array, default: [] },
  deposits: { type: Array, default: [] },
  withdrawals: { type: Array, default: [] },
  joinedAt: { type: String, default: () => new Date().toLocaleDateString('fr-FR') }
});

const transactionSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  kind: { type: String, enum: ['deposit', 'withdrawal'], required: true },
  userPhone: { type: String, required: true },
  senderPhone: { type: String },
  withdrawPhone: { type: String },
  amount: { type: Number, required: true },
  requestedAmount: { type: Number },
  fee: { type: Number },
  netAmount: { type: Number },
  method: { type: String },
  status: { type: String, required: true },
  date: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('La variable d’environnement MONGODB_URI est manquante.');
  }
  await mongoose.connect(uri);
  console.log('Connecté à MongoDB Atlas');
}

module.exports = { connectDB, User, Transaction };