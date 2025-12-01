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

// --- NUEVO: POST /api/inventario/materiales (Para crear productos) ---
router.post('/materiales', async (req, res) => {
    const { nombre, codigo, cantidad_existencia, nivel_reorden, precio_costo } = req.body;
    
    // Validación simple
    if (!nombre || !codigo) {
        return res.status(400).json({ error: 'Nombre y Código son obligatorios' });
    }

    try {
        const query = `
            INSERT INTO materiales (nombre, codigo, cantidad_existencia, nivel_reorden, precio_costo, activo) 
            VALUES ($1, $2, $3, $4, $5, true) 
            RETURNING *
        `;
        const values = [
            nombre, 
            codigo, 
            cantidad_existencia || 0, 
            nivel_reorden || 5, 
            precio_costo || 0
        ];
        
        const result = await db.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error al crear material:', err);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;