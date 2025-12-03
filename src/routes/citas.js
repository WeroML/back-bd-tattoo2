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

// PUT /api/citas/:id - Actualizar cita y procesar materiales si aplica
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { 
        fecha_programada, 
        total_estimado, 
        estado, 
        notas,
        materiales,   // <--- Array nuevo: [{ id, cantidad }, ...]
        usuario_id    // ID de quien hace la acción (para el historial)
    } = req.body;

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // 1. INICIAR TRANSACCIÓN

        // ---------------------------------------------------------------
        // A. ACTUALIZAR LA CITA
        // ---------------------------------------------------------------
        // (Al hacer esto, tu Trigger 'trg_actualizar_cita_cascada' se dispara
        // y actualiza la sesión a 'en_progreso' automáticamente)
        
        const updates = [];
        const values = [id];
        let idx = 2;

        if (fecha_programada) { updates.push(`fecha_programada = $${idx++}`); values.push(fecha_programada); }
        if (total_estimado)   { updates.push(`total_estimado = $${idx++}`); values.push(total_estimado); }
        if (estado)           { updates.push(`estado = $${idx++}::estado_cita`); values.push(estado); }
        if (notas)            { updates.push(`notas = $${idx++}`); values.push(notas); }

        if (updates.length === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No se enviaron campos para actualizar.' });
        }

        const updateQuery = `
            UPDATE citas 
            SET ${updates.join(', ')} 
            WHERE id = $1 
            RETURNING *;
        `;
        
        const citaResult = await client.query(updateQuery, values);

        if (citaResult.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Cita no encontrada.' });
        }

        // ---------------------------------------------------------------
        // B. PROCESAR MATERIALES (Solo si es 'en_progreso' y hay lista)
        // ---------------------------------------------------------------
        if (estado === 'en_progreso' && materiales && materiales.length > 0) {
            
            // 1. Obtener la sesión activa (que el Trigger acaba de actualizar/crear)
            const sesionQuery = `
                SELECT id FROM sesiones 
                WHERE id_cita = $1 
                ORDER BY creado_en DESC LIMIT 1;
            `;
            const sesionResult = await client.query(sesionQuery, [id]);
            
            if (sesionResult.rowCount === 0) {
                throw new Error("No se encontró una sesión activa para asignar los materiales.");
            }
            const idSesion = sesionResult.rows[0].id;
            const idUsuario = usuario_id || 1; // Fallback si no envían usuario

            // 2. Iterar sobre los materiales recibidos del Frontend
            for (const mat of materiales) {
                // mat tiene: { id: 5, cantidad: 2 }
                
                // a. Registrar Consumo (Movimiento Inventario)
                // OJO: Tu Trigger 'trg_validar_stock' saltará aquí si no hay suficiente
                const movQuery = `
                    INSERT INTO movimientos_inventario (
                        id_material, tipo_movimiento, cantidad, 
                        id_sesion_relacionada, realizado_por, 
                        notas, fecha_movimiento
                    ) VALUES (
                        $1, 'consumo'::tipo_movimiento, $2, 
                        $3, $4, 
                        'Consumo registrado desde Cita #' || $5, NOW()
                    );
                `;
                await client.query(movQuery, [
                    mat.id, mat.cantidad, idSesion, idUsuario, id
                ]);

                // b. Registrar Costo (Materiales Sesion)
                // Obtenemos precio actual para ser precisos
                const costoQuery = `
                    INSERT INTO materiales_sesion (
                        id_sesion, id_material, cantidad_usada, 
                        costo_unitario, notas
                    ) 
                    SELECT 
                        $1, $2, $3, 
                        precio_costo, -- Tomamos el precio de la tabla materiales
                        (SELECT nombre FROM materiales WHERE id = $2)
                    FROM materiales WHERE id = $2;
                `;
                await client.query(costoQuery, [idSesion, mat.id, mat.cantidad]);
            }
        }

        await client.query('COMMIT'); // CONFIRMAR CAMBIOS

        res.status(200).json({
            message: 'Cita actualizada y materiales procesados correctamente.',
            cita: citaResult.rows[0],
            materiales_procesados: materiales ? materiales.length : 0
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al actualizar cita:', err);
        
        // Manejo de errores específicos
        if (err.code === 'P0001') { // Código que definimos en tu Trigger de Stock
            return res.status(409).json({ 
                error: 'Stock Insuficiente', 
                detalle: err.message // El mensaje del trigger ("El material X solo tiene...")
            });
        }
        if (err.code === '22P02') {
             return res.status(400).json({ error: 'Tipo de dato inválido o valor de ENUM incorrecto.' });
        }
        
        res.status(500).json({ error: 'Error interno al actualizar la cita.' });
    } finally {
        client.release();
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