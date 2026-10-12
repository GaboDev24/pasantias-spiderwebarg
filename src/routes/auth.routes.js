const express = require('express');
const router = express.Router();
const authCtrl = require('../controllers/auth.controller');
const { requireAuth } = require('../middleware/auth');
const { authLimiter, registerLimiter } = require('../middleware/rateLimiters');

// SEC-03: Rate limiters en login, validate-token y register
router.post('/register', registerLimiter, authCtrl.register);
router.post('/login', authLimiter, authCtrl.login);

// BUG-02: verify-email unificado aqui con soporte a redirect via ?redirect=1
// (server.js ya no tiene una ruta /verify-email separada)
router.get('/verify-email', authCtrl.verifyEmail);

router.post('/validate-token', authLimiter, requireAuth, authCtrl.validateToken);
router.post('/accept-terms', requireAuth, authCtrl.acceptTerms);

module.exports = router;
