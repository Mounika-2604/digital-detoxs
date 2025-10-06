const mongoose = require('mongoose');

const UsageSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  appId: { type: String, required: true },
  appName: { type: String, required: true },
  minutes: { type: Number, required: true },
  timestamp: { type: Date, default: Date.now },
  emergencyAccess: { type: Boolean, default: false }
});

module.exports = mongoose.model('Usage', UsageSchema);