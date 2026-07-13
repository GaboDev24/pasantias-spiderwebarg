const express = require('express');
const router = express.Router();
const multer = require('multer');
const adminCtrl = require('../controllers/admin.controller');
const { requireAdmin } = require('../middleware/auth');

// Multer en memoria para archivos
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

// Usuarios
router.get('/users', requireAdmin, adminCtrl.listAllUsers);
router.get('/users/pending', requireAdmin, adminCtrl.listPendingUsers);
router.patch('/users/:userId/role', requireAdmin, adminCtrl.updateUserRole);
router.put('/users/:userId/role', requireAdmin, adminCtrl.updateUserRole);
router.delete('/users/:userId', requireAdmin, adminCtrl.deleteUser);

// Tokens de validacion
router.post('/tokens/generate', requireAdmin, adminCtrl.generateToken);
router.get('/tokens', requireAdmin, adminCtrl.listTokens);

// Aptitudes
router.get('/skills', requireAdmin, adminCtrl.listSkills);
router.post('/skills', requireAdmin, adminCtrl.createSkill);
router.delete('/skills/:skillId', requireAdmin, adminCtrl.deleteSkill);

// Proyectos
router.get('/projects', requireAdmin, adminCtrl.listProjects);
router.post('/projects', requireAdmin, adminCtrl.createProject);
router.put('/projects/:projectId', requireAdmin, adminCtrl.updateProject);
router.delete('/projects/:projectId', requireAdmin, adminCtrl.deleteProject);
router.get('/projects/:projectId/applications', requireAdmin, adminCtrl.listProjectApplications);
router.patch('/applications/:appId/status', requireAdmin, adminCtrl.updateApplicationStatus);
router.get('/projects/:projectId/progress', requireAdmin, adminCtrl.listProjectProgress);

// Noticias
router.post('/news', requireAdmin, adminCtrl.createNews);
router.put('/news/:newsId', requireAdmin, adminCtrl.updateNews);
router.delete('/news/:newsId', requireAdmin, adminCtrl.deleteNews);

// Portfolio
router.post('/portfolio', requireAdmin, adminCtrl.createPortfolioProject);
router.delete('/portfolio/:portfolioId', requireAdmin, adminCtrl.deletePortfolioProject);

// Upload de medios
router.post('/upload', requireAdmin, upload.single('file'), adminCtrl.uploadMedia);

module.exports = router;
