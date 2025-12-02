// /routes/clientes.js
const express = require('express');
const db = require('../db/index'); // Importa nuestra utilidad de consulta a DB
const router = express.Router();

// 1. GET /api/clientes - Obtener todos los clientes
router.get('/', async (req, res) => {
    try {
        const queryText = `
            SELECT id, nombre, apellido, correo, telefono, fecha_nacimiento 
            FROM clientes 
            ORDER BY id ASC
        `;
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener todos los clientes:', err.message);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// 2. GET /api/clientes/:id - Obtener un cliente por su ID
router.get('/:id', async (req, res) => {
    const { id } = req.params; // Capturamos el ID de la URL

    // Consulta para obtener la información de cliente, incluyendo datos médicos sensibles
    const queryText = `
        SELECT * FROM clientes 
        WHERE id = $1
    `;

    try {
        const result = await db.query(queryText, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado.' });
        }

        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(`Error al obtener cliente ${id}:`, err.message);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

router.post('/', async (req, res) => {
    // 1. Desestructurar los datos del cuerpo de la petición
    const {
        nombre,
        apellido,
        correo,
        telefono,
        fecha_nacimiento,
        alergias,
        notas_medicas
    } = req.body;

    // 2. Validación básica de campos obligatorios
    if (!nombre) {
        return res.status(400).json({ error: 'El nombre del cliente es obligatorio.' });
    }

    // 3. Consulta de inserción
    const insertQuery = `
        INSERT INTO clientes (
            nombre, apellido, correo, telefono, fecha_nacimiento, 
            alergias, notas_medicas, creado_en, actualizado_en
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
        RETURNING id, nombre, correo;
    `;

    const values = [
        nombre,
        apellido || null,
        correo || null,
        telefono || null,
        fecha_nacimiento || null,
        alergias || null,
        notas_medicas || null
    ];

    try {
        // 4. Ejecutar la inserción
        const result = await db.query(insertQuery, values);

        res.status(201).json({
            message: 'Cliente registrado con éxito.',
            cliente: result.rows[0]
        });

    } catch (err) {
        console.error('Error al registrar cliente:', err);
        // Manejar duplicidad de correo si está definido como UNIQUE en la DB (aunque no lo vimos en el esquema)
        if (err.code === '23505') {
            return res.status(409).json({ error: 'El correo electrónico ya está registrado.' });
        }
        res.status(500).json({ error: 'Error interno del servidor al registrar el cliente.' });
    }
});

// PUT /api/clientes/:id - Editar cliente
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const {
        nombre,
        apellido,
        correo,
        telefono,
        fecha_nacimiento,
        alergias,
        notas_medicas
    } = req.body;

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (nombre !== undefined) { fields.push(`nombre = $${paramIndex++}`); values.push(nombre); }
    if (apellido !== undefined) { fields.push(`apellido = $${paramIndex++}`); values.push(apellido); }
    if (correo !== undefined) { fields.push(`correo = $${paramIndex++}`); values.push(correo); }
    if (telefono !== undefined) { fields.push(`telefono = $${paramIndex++}`); values.push(telefono); }
    if (fecha_nacimiento !== undefined) { fields.push(`fecha_nacimiento = $${paramIndex++}`); values.push(fecha_nacimiento); }
    if (alergias !== undefined) { fields.push(`alergias = $${paramIndex++}`); values.push(alergias); }
    if (notas_medicas !== undefined) { fields.push(`notas_medicas = $${paramIndex++}`); values.push(notas_medicas); }

    if (fields.length === 0) {
        return res.status(400).json({ error: 'No se proporcionaron campos para actualizar.' });
    }

    fields.push(`actualizado_en = NOW()`);
    values.push(id);
    const queryText = `
        UPDATE clientes
        SET ${fields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `;

    try {
        const result = await db.query(queryText, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado.' });
        }
        res.status(200).json({
            message: 'Cliente actualizado exitosamente.',
            cliente: result.rows[0]
        });
    } catch (err) {
        console.error(`Error al actualizar cliente ${id}:`, err.message);
        if (err.code === '23505') {
            return res.status(409).json({ error: 'El correo electrónico ya está registrado.' });
        }
        res.status(500).json({ error: 'Error interno al actualizar el cliente.' });
    }
});

// DELETE /api/clientes/:id - Eliminar cliente (borrado físico)
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    const queryText = 'DELETE FROM clientes WHERE id = $1 RETURNING id';
    try {
        const result = await db.query(queryText, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado.' });
        }
        res.status(200).json({ message: 'Cliente eliminado exitosamente.' });
    } catch (err) {
        console.error(`Error al eliminar cliente ${id}:`, err.message);
        res.status(500).json({ error: 'Error interno al eliminar el cliente.' });
    }
});

module.exports = router;