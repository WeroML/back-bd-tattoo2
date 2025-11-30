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

// GET /api/sesiones/:id
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const queryText = `
        SELECT id, id_cita, numero_sesion, fecha_programada, inicio_real, monto_cobrado, estado
        FROM sesiones 
        WHERE id = $1
    `;
    try {
        const result = await db.query(queryText, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sesión no encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener sesión:', err);
        res.status(500).json({ error: 'Error al consultar la tabla sesiones.' });
    }
});

module.exports = router;
