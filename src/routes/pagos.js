// /routes/pagos.js
const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/pagos
router.get('/', async (req, res) => {
    const queryText = `
        SELECT id, id_cliente, id_cita, monto, metodo, fecha_pago, referencia 
        FROM pagos 
        ORDER BY fecha_pago DESC
    `;
    try {
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener pagos:', err);
        res.status(500).json({ error: 'Error al consultar la tabla pagos.' });
    }
});

module.exports = router;