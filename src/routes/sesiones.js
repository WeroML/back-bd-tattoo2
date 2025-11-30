const express = require('express');
const db = require('../db');
const { pool } = require('../db');

const router = express.Router();

// GET /api/sesiones
router.get('/', async (req, res) => {
    const queryText = `
        SELECT id, id_cita, numero_sesion, fecha_programada, inicio_real, monto_cobrado, estado
        FROM sesiones 
        ORDER BY fecha_programada DESC
    `;
    try {
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener sesiones:', err);
        res.status(500).json({ error: 'Error al consultar la tabla sesiones.' });
    }
});

module.exports = router;
