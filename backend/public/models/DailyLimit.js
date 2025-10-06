const mongoose = require('mongoose');

const dailyLimitSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  appId: {
    type: String,
    required: true
  },
  dailyLimit: {
    type: Number,
    required: true,
    default: 60 // minutes
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Ensure one limit per user per app
dailyLimitSchema.index({ userId: 1, appId: 1 }, { unique: true });

module.exports = mongoose.model('DailyLimit', dailyLimitSchema);

