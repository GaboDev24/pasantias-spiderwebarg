const express = require('express');
const router = express.Router();
const publicCtrl = require('../controllers/public.controller');
const { optionalAuth } = require('../middleware/auth');

router.get('/news', publicCtrl.getLatestNews);
router.get('/news/:id', publicCtrl.getNews);
router.get('/projects', optionalAuth, publicCtrl.getLatestProjects);
router.get('/projects/:id', optionalAuth, publicCtrl.getProject);
router.get('/skills', publicCtrl.getSkills);
router.get('/portfolio', publicCtrl.getPortfolioProjects);

module.exports = router;
