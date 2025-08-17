const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
  res.send('🗑️ Unpaid Cleanup & Notifier está OK');
});

module.exports = router;
