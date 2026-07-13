const express = require('express');
const router = express.Router();
const chatCtrl = require('../controllers/chat.controller');
const { requireAuth } = require('../middleware/auth');

router.post('/send', requireAuth, chatCtrl.sendMessage);
router.get('/inbox', requireAuth, chatCtrl.getInbox);
router.get('/users', requireAuth, chatCtrl.getChatUsers);
router.get('/unread', requireAuth, chatCtrl.getUnreadCount);
router.get('/search', requireAuth, chatCtrl.searchUsers);
router.get('/friends', requireAuth, chatCtrl.getFriends);
router.post('/friends/:friendId', requireAuth, chatCtrl.addFriend);
router.delete('/friends/:friendId', requireAuth, chatCtrl.removeFriend);
router.get('/:userId', requireAuth, chatCtrl.getConversation);

module.exports = router;
