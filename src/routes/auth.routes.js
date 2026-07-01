const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');

router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);
router.get('/verify-email', authCtrl.verifyEmail);
router.post('/validate-token', requireAuth, authCtrl.validateToken);

module.exports = router;
