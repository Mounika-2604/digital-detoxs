// ============================================
// models/Usage.js
// ============================================
const mongoose = require('mongoose');

const usageSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  appId: {
    type: String,
    required: true
  },
  appName: {
    type: String,
    required: true
  },
  timeSpent: {
    type: Number, // in minutes
    required: true
  },
  date: {
    type: Date,
    default: Date.now
  }
});

// Index for faster queries
usageSchema.index({ userId: 1, date: -1 });
usageSchema.index({ userId: 1, appId: 1, date: -1 });

module.exports = mongoose.model('Usage', usageSchema);
