const express = require('express');
const router = express.Router();
const chatCtrl = require('../controllers/chat.controller');
const { requireAuth } = require('../middleware/auth');

router.post('/send', requireAuth, chatCtrl.sendMessage);
router.get('/inbox', requireAuth, chatCtrl.getInbox);
router.get('/users', requireAuth, chatCtrl.getChatUsers);
router.get('/unread', requireAuth, chatCtrl.getUnreadCount);
router.get('/:userId', requireAuth, chatCtrl.getConversation);

module.exports = router;
