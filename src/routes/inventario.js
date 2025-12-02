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

// GET /api/inventario/materiales/:id - Obtener material por ID
router.get('/materiales/:id', async (req, res) => {
    const { id } = req.params;
    const queryText = `
        SELECT * FROM materiales WHERE id = $1
    `;
    try {
        const result = await db.query(queryText, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Material no encontrado.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener material por ID:', err);
        res.status(500).json({ error: 'Error al consultar el material.' });
    }
});

// GET /api/inventario/materiales/codigo/:codigo - Obtener material por código
router.get('/materiales/codigo/:codigo', async (req, res) => {
    const { codigo } = req.params;
    const queryText = `
        SELECT * FROM materiales WHERE codigo = $1
    `;
    try {
        const result = await db.query(queryText, [codigo]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Material no encontrado.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener material por código:', err);
        res.status(500).json({ error: 'Error al consultar el material.' });
    }
});

// PUT /api/inventario/materiales/:id - Actualizar material
router.put('/materiales/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, codigo, cantidad_existencia, nivel_reorden, precio_costo, activo } = req.body;

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (nombre !== undefined) { fields.push(`nombre = $${paramIndex++}`); values.push(nombre); }
    if (codigo !== undefined) { fields.push(`codigo = $${paramIndex++}`); values.push(codigo); }
    if (cantidad_existencia !== undefined) { fields.push(`cantidad_existencia = $${paramIndex++}`); values.push(cantidad_existencia); }
    if (nivel_reorden !== undefined) { fields.push(`nivel_reorden = $${paramIndex++}`); values.push(nivel_reorden); }
    if (precio_costo !== undefined) { fields.push(`precio_costo = $${paramIndex++}`); values.push(precio_costo); }
    if (activo !== undefined) { fields.push(`activo = $${paramIndex++}`); values.push(activo); }

    if (fields.length === 0) {
        return res.status(400).json({ error: 'No se proporcionaron campos para actualizar.' });
    }

    values.push(id);
    const queryText = `
        UPDATE materiales
        SET ${fields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `;

    try {
        const result = await db.query(queryText, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Material no encontrado.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error al actualizar material:', err);
        res.status(500).json({ error: 'Error al actualizar el material.' });
    }
});

// DELETE /api/inventario/materiales/:id - Eliminar material (Soft Delete)
router.delete('/materiales/:id', async (req, res) => {
    const { id } = req.params;
    // Usamos soft delete (activo = false) para mantener integridad referencial
    const queryText = 'UPDATE materiales SET activo = false WHERE id = $1 RETURNING id';

    try {
        const result = await db.query(queryText, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Material no encontrado.' });
        }
        res.status(200).json({ message: 'Material desactivado exitosamente.' });
    } catch (err) {
        console.error('Error al eliminar material:', err);
        res.status(500).json({ error: 'Error al eliminar el material.' });
    }
});

module.exports = router;