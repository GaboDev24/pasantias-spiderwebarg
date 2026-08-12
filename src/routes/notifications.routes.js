const express = require('express');
const router = express.Router();
const notificationsCtrl = require('../controllers/notifications.controller');
const { requireAuth } = require('../middleware/auth');

router.get('/', requireAuth, notificationsCtrl.getMyNotifications);
router.get('/unread-count', requireAuth, notificationsCtrl.getUnreadCount);
router.patch('/read-all', requireAuth, notificationsCtrl.markAllRead);
router.patch('/:id/read', requireAuth, notificationsCtrl.markAsRead);

module.exports = router;
