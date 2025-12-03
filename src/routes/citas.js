// /routes/citas.js
const express = require('express');
const db = require('../db');
const { pool } = require('../db');
const router = express.Router();

// GET /api/citas/resumen/:id - Obtener el resumen completo de UNA cita específica
router.get('/resumen/:id', async (req, res) => {
    const { id } = req.params; // Aquí capturas el '139' de la URL

    try {
        const queryText = `
            SELECT * FROM vista_detalles_citas 
            WHERE id_cita = $1;
        `;
        
        const result = await pool.query(queryText, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cita no encontrada.' });
        }

        res.json(result.rows[0]);

    } catch (err) {
        console.error('Error al obtener el resumen de la cita:', err);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

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

// PUT /api/citas/:id - Actualización simplificada (El Trigger maneja la lógica de negocio)
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { 
        fecha_programada, 
        total_estimado, 
        estado, 
        notas 
    } = req.body;

    try {
        // 1. Construcción dinámica de la consulta (Solo actualizamos lo que envías)
        const updates = [];
        const values = [id];
        let idx = 2; // El $1 es el id

        if (fecha_programada) { 
            updates.push(`fecha_programada = $${idx++}`); 
            values.push(fecha_programada); 
        }
        if (total_estimado) { 
            updates.push(`total_estimado = $${idx++}`); 
            values.push(total_estimado); 
        }
        if (estado) { 
            // Hacemos cast explícito al ENUM
            updates.push(`estado = $${idx++}::estado_cita`); 
            values.push(estado); 
        }
        if (notas) { 
            updates.push(`notas = $${idx++}`); 
            values.push(notas); 
        }

        // Validación: Si no mandan nada, no hacemos nada
        if (updates.length === 0) {
            return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
        }

        // 2. Ejecutar el UPDATE
        // Al ejecutarse esto, PostgreSQL disparará automáticamente tu función 'propagar_cambios_cita'
        const updateQuery = `
            UPDATE citas 
            SET ${updates.join(', ')} 
            WHERE id = $1 
            RETURNING *;
        `;
        
        const result = await pool.query(updateQuery, values);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Cita no encontrada.' });
        }

        // 3. Responder
        res.status(200).json({
            message: 'Cita actualizada correctamente.',
            cita: result.rows[0],
            nota_tecnica: 'Los cambios relacionados (sesiones/diseños) fueron procesados automáticamente por la base de datos.'
        });

    } catch (err) {
        console.error('Error al actualizar cita:', err);
        
        // Manejo de errores de ENUM
        if (err.code === '22P02') {
             return res.status(400).json({ error: 'Tipo de dato inválido o valor de ENUM incorrecto.' });
        }
        
        res.status(500).json({ error: 'Error interno al actualizar la cita.' });
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