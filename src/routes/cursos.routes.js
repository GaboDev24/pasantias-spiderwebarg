/**
 * Rutas de Cursos-SpiderWebARG
 */

const express = require('express');
const router = express.Router();
const { getLatestCourses } = require('../controllers/cursos.controller');

// GET /api/cursos/latest?limit=3
router.get('/latest', getLatestCourses);

module.exports = router;
