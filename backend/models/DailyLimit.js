const mongoose = require('mongoose');

const DailyLimitSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appId: { type: String, required: true },
  limitMinutes: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('DailyLimit', DailyLimitSchema);