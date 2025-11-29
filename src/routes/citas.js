// /routes/citas.js
const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/citas
router.get('/', async (req, res) => {
    const queryText = `
        SELECT id, id_cliente, id_artista, fecha_programada, total_estimado, estado 
        FROM citas 
        ORDER BY fecha_programada DESC
    `;
    try {
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener citas:', err);
        res.status(500).json({ error: 'Error al consultar la tabla citas.' });
    }
});

// GET /api/citas/sesiones
router.get('/sesiones', async (req, res) => {
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

// POST /api/citas/generar
router.post('/generar', async (req, res) => {
    const queryText = `
        INSERT INTO citas (
            id_cliente,
            id_artista,
            fecha_programada,
            duracion_estimada_minutos,
            total_estimado,
            estado,
            creado_por,
            creado_en,
            notas
        )
        SELECT
            c.id AS id_cliente,
            a.id AS id_artista,
            NOW() + INTERVAL '7 days' AS fecha_programada,
            60 AS duracion_estimada_minutos,
            0 AS total_estimado,
            'programada'::estado AS estado,

            (SELECT u.id FROM usuarios u ORDER BY RANDOM() LIMIT 1) AS creado_por,
            NOW() AS creado_en,
            'Cita generada automáticamente' AS notas
        FROM clientes c
        CROSS JOIN artistas a
        WHERE NOT EXISTS (
            SELECT 1
            FROM citas ct
            WHERE ct.id_cliente = c.id
            AND ct.id_artista = a.id
        )
        RETURNING *;
    `;

    try {
        const result = await db.query(queryText);
        res.status(201).json({
            message: 'Citas generadas correctamente.',
            total_creadas: result.rowCount,
            citas: result.rows
        });
    } catch (err) {
        console.error('Error al generar citas automáticamente:', err);
        res.status(500).json({
            error: 'Ocurrió un error al generar las citas.'
        });
    }
});


module.exports = router;