// src/routes/categorias.js
const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// En routes/disenos.js

router.get('/', async (req, res) => {
    const queryText = `
        SELECT * FROM categorias_disenos ORDER BY id ASC;
    `;
    
    try {
        const result = await pool.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Error interno' });
    }
});

module.exports = router;