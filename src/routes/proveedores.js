const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// GET /api/proveedores - Listar todos los proveedores activos
router.get('/', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM proveedores WHERE activo = true ORDER BY nombre ASC');
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener proveedores:', err);
        res.status(500).json({ error: 'Error al obtener proveedores' });
    }
});

// GET /api/proveedores/:id - Obtener un proveedor por ID
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('SELECT * FROM proveedores WHERE id = $1', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Proveedor no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener proveedor:', err);
        res.status(500).json({ error: 'Error al obtener proveedor' });
    }
});

// POST /api/proveedores - Crear nuevo proveedor
router.post('/', async (req, res) => {
    const { nombre, contacto, correo, telefono, direccion } = req.body;
    
    if (!nombre) {
        return res.status(400).json({ error: 'El nombre es obligatorio' });
    }

    try {
        const query = `
            INSERT INTO proveedores (nombre, contacto, correo, telefono, direccion)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        const values = [nombre, contacto, correo, telefono, direccion];
        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error al crear proveedor:', err);
        res.status(500).json({ error: 'Error al crear proveedor' });
    }
});

// PUT /api/proveedores/:id - Actualizar proveedor
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, contacto, correo, telefono, direccion } = req.body;

    try {
        const query = `
            UPDATE proveedores
            SET nombre = COALESCE($1, nombre),
                contacto = COALESCE($2, contacto),
                correo = COALESCE($3, correo),
                telefono = COALESCE($4, telefono),
                direccion = COALESCE($5, direccion)
            WHERE id = $6
            RETURNING *
        `;
        const values = [nombre, contacto, correo, telefono, direccion, id];
        const result = await pool.query(query, values);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Proveedor no encontrado' });
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error('Error al actualizar proveedor:', err);
        res.status(500).json({ error: 'Error al actualizar proveedor' });
    }
});

// DELETE /api/proveedores/:id - Eliminar proveedor (Soft delete) O sea que solo se pone como falso el campo "activo"
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query('UPDATE proveedores SET activo = false WHERE id = $1 RETURNING *', [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Proveedor no encontrado' });
        }
        res.json({ message: 'Proveedor eliminado correctamente' });
    } catch (err) {
        console.error('Error al eliminar proveedor:', err);
        res.status(500).json({ error: 'Error al eliminar proveedor' });
    }
});

module.exports = router;
