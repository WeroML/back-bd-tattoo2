// /routes/citas.js
const express = require('express');
const db = require('../db');
const { pool } = require('../db');
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


// GET /api/citas/:id
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const queryText = `
        SELECT id, id_cliente, id_artista, fecha_programada, total_estimado, estado, notas, creado_por, creado_en
        FROM citas 
        WHERE id = $1
    `;
    try {
        const result = await db.query(queryText, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cita no encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(`Error al obtener cita con ID ${id}:`, err);
        res.status(500).json({ error: 'Error al consultar la cita específica.' });
    }
});


// POST /api/citas/generar - Crea una cita y su sesión inicial
router.post('/generar', async (req, res) => {
    // 1. Desestructurar los datos de la petición
    const {
        id_cliente,
        id_artista,
        fecha_programada,
        duracion_estimada_minutos,
        total_estimado,
        notas,
        creado_por // ID del usuario que registra la cita (ej. administrador/recepcionista)
    } = req.body;

    const estado_cita = 'programada';
    const numero_sesion_inicial = 1;

    // Asignar un cliente para la conexión a la base de datos
    const client = await pool.connect();

    try {
        // 2. INICIAR TRANSACCIÓN
        await client.query('BEGIN');

        // A. INSERTAR EN CITAS
        const citaInsertQuery = `
            INSERT INTO citas (
                id_cliente, id_artista, fecha_programada, duracion_estimada_minutos, 
                total_estimado, estado, creado_por, notas
            ) VALUES ($1, $2, $3, $4, $5, $6::estado_cita, $7, $8)
            RETURNING id, creado_en; 
        `;

        const citaValues = [
            id_cliente,
            id_artista,
            fecha_programada,
            duracion_estimada_minutos,
            total_estimado,
            estado_cita,
            creado_por,
            notas || 'Cita generada por API'
        ];

        const citaResult = await client.query(citaInsertQuery, citaValues);
        const nuevaCitaId = citaResult.rows[0].id;
        const creadoEn = citaResult.rows[0].creado_en;


        // B. INSERTAR EN SESIONES (Registro inicial)
        const sesionInsertQuery = `
            INSERT INTO sesiones (
                id_cita, numero_sesion, fecha_programada, duracion_minutos, monto_cobrado, estado, creado_en
            ) VALUES ($1, $2, $3, $4, $5, $6::estado_sesion, $7)
            RETURNING id;
        `;

        // se mantiene NULL para la inserción, asumiendo que las columnas son NULLABLES.
        const sesionValues = [
            nuevaCitaId,
            numero_sesion_inicial,
            fecha_programada,
            duracion_estimada_minutos,
            total_estimado,
            estado_cita,
            creadoEn
        ];

        const sesionResult = await client.query(sesionInsertQuery, sesionValues);
        // 3. CONFIRMAR TRANSACCIÓN
        await client.query('COMMIT');

        res.status(201).json({
            message: 'Cita y sesión inicial creadas con éxito.',
            cita_id: nuevaCitaId,
            sesion_id: sesionResult.rows[0].id
        });

    } catch (err) {
        // 4. REVERTIR TRANSACCIÓN si algo falla 
        await client.query('ROLLBACK');
        console.error('Error transaccional al generar cita:', err);

        // Manejo de errores específicos
        if (err.code === '42601') {
            return res.status(400).json({ error: `Error de sintaxis SQL. Verifique los casts de ENUMs. Mensaje: ${err.message}` });
        }
        if (err.code === '23503') {
            return res.status(400).json({ error: 'Llave foránea inválida. El cliente, artista o usuario creador no existen.' });
        }

        res.status(500).json({ error: 'Error interno: La transacción fue abortada.' });
    } finally {
        // 5. Liberar el cliente
        client.release();
    }
});

// PUT /api/citas/:id - Actualizar una cita
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const {
        id_artista,
        fecha_programada,
        duracion_estimada_minutos,
        total_estimado,
        estado,
        notas
    } = req.body;

    // Construcción dinámica de la consulta UPDATE
    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (id_artista !== undefined) {
        fields.push(`id_artista = $${paramIndex++}`);
        values.push(id_artista);
    }
    if (fecha_programada !== undefined) {
        fields.push(`fecha_programada = $${paramIndex++}`);
        values.push(fecha_programada);
    }
    if (duracion_estimada_minutos !== undefined) {
        fields.push(`duracion_estimada_minutos = $${paramIndex++}`);
        values.push(duracion_estimada_minutos);
    }
    if (total_estimado !== undefined) {
        fields.push(`total_estimado = $${paramIndex++}`);
        values.push(total_estimado);
    }
    if (estado !== undefined) {
        fields.push(`estado = $${paramIndex++}::estado_cita`);
        values.push(estado);
    }
    if (notas !== undefined) {
        fields.push(`notas = $${paramIndex++}`);
        values.push(notas);
    }

    if (fields.length === 0) {
        return res.status(400).json({ error: 'No se proporcionaron campos para actualizar.' });
    }

    values.push(id);
    const queryText = `
        UPDATE citas
        SET ${fields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `;

    try {
        const result = await db.query(queryText, values);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cita no encontrada.' });
        }

        res.status(200).json({
            message: 'Cita actualizada exitosamente.',
            cita: result.rows[0]
        });
    } catch (err) {
        console.error(`Error al actualizar cita ${id}:`, err);
        res.status(500).json({ error: 'Error al actualizar la cita.' });
    }
});

// DELETE /api/citas/:id - Eliminar una cita
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    
    // Nota: Debido a ON DELETE CASCADE en la base de datos, 
    // esto también eliminará las sesiones y citas_disenos relacionadas.
    const queryText = 'DELETE FROM citas WHERE id = $1 RETURNING id';

    try {
        const result = await db.query(queryText, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cita no encontrada.' });
        }

        res.status(200).json({ message: 'Cita eliminada exitosamente.' });
    } catch (err) {
        console.error(`Error al eliminar cita ${id}:`, err);
        res.status(500).json({ error: 'Error al eliminar la cita.' });
    }
});

module.exports = router;