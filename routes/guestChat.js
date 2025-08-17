// routes/guestChat.js
const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/guestChatController');

// POST /api/guest-chat
router.post('/', ctrl.createGuestMessage);

module.exports = router;
