const express = require('express');
const router = express.Router();
const multer = require('multer');
const usersCtrl = require('../controllers/users.controller');
const { requireAuth } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// Perfil
router.get('/me', requireAuth, usersCtrl.getMyProfile);
router.patch('/me', requireAuth, usersCtrl.updateProfile);
router.patch('/me/password', requireAuth, usersCtrl.changePassword);
router.post('/me/avatar', requireAuth, upload.single('avatar'), usersCtrl.uploadAvatar);

// Proyectos
router.post('/projects/:projectId/apply', requireAuth, usersCtrl.applyToProject);
router.delete('/projects/:projectId/apply', requireAuth, usersCtrl.cancelApplication);
router.get('/my-applications', requireAuth, usersCtrl.getMyApplications);

module.exports = router;
