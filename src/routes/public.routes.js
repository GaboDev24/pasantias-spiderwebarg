const express = require('express');
const router = express.Router();
const publicCtrl = require('../controllers/public.controller');

router.get('/news', publicCtrl.getLatestNews);
router.get('/news/:id', publicCtrl.getNews);
router.get('/projects', publicCtrl.getLatestProjects);
router.get('/projects/:id', publicCtrl.getProject);
router.get('/skills', publicCtrl.getSkills);

module.exports = router;
