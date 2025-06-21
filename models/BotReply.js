const mongoose = require('mongoose');

const botReplySchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer:   { type: String, required: true },
  type:     { type: String, enum: ['exact', 'partial'], default: 'partial' }
}, { collection: 'botreplies' });

module.exports = mongoose.model('BotReply', botReplySchema);
