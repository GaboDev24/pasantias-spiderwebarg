const express = require('express');
const router = express.Router();
const multer = require('multer');
const usersCtrl = require('../controllers/users.controller');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// Perfil
router.get('/me', requireAuth, usersCtrl.getMyProfile);
router.patch('/me', requireAuth, usersCtrl.updateProfile);
router.patch('/me/password', requireAuth, usersCtrl.changePassword);
router.post('/me/avatar', requireAuth, upload.single('avatar'), usersCtrl.uploadAvatar);
router.post('/me/cv', requireAuth, upload.single('cv'), usersCtrl.uploadCV);

// Perfil público (admin/ceo pueden ver cualquier usuario)
router.get('/:userId/profile', requireAdmin, usersCtrl.getUserPublicProfile);

// Proyectos
router.post('/projects/:projectId/apply', requireAuth, usersCtrl.applyToProject);
router.delete('/projects/:projectId/apply', requireAuth, usersCtrl.cancelApplication);
router.get('/my-applications', requireAuth, usersCtrl.getMyApplications);

// Progreso de proyectos
const adminCtrl = require('../controllers/admin.controller');
router.post('/projects/:projectId/progress', requireAdmin, adminCtrl.createProjectProgress);

module.exports = router;
