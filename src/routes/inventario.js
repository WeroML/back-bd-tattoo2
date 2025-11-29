// /routes/inventario.js
const express = require('express');
const db = require('../db');
const router = express.Router();

// GET /api/inventario/materiales
router.get('/materiales', async (req, res) => {
    const queryText = `
        SELECT id, nombre, codigo, cantidad_existencia, nivel_reorden, precio_costo, activo 
        FROM materiales 
        ORDER BY nombre ASC
    `;
    try {
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener materiales:', err);
        res.status(500).json({ error: 'Error al consultar la tabla materiales.' });
    }
});

// GET /api/inventario/compras
router.get('/compras', async (req, res) => {
    const queryText = `
        SELECT id, id_proveedor, fecha_compra, numero_factura, total, recibido 
        FROM compras 
        ORDER BY fecha_compra DESC
    `;
    try {
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener compras:', err);
        res.status(500).json({ error: 'Error al consultar la tabla compras.' });
    }
});

module.exports = router;