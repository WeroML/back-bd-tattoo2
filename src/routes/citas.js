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

// /routes/citas.js - POST /generar (Simplificado)

router.post('/generar', async (req, res) => {
    const { 
        id_cliente, id_artista, fecha_programada, 
        duracion_estimada_minutos, total_estimado, notas, creado_por 
    } = req.body;

    // Validación básica...

    const client = await pool.connect();

    try {
        // Solo necesitamos insertar la CITA. 
        // El Trigger 'trg_audit_citas_a_sesiones' creará la sesión automáticamente.
        
        const citaInsertQuery = `
            INSERT INTO citas (
                id_cliente, id_artista, fecha_programada, duracion_estimada_minutos, 
                total_estimado, estado, creado_por, notas
            ) VALUES ($1, $2, $3, $4, $5, 'programada'::estado_cita, $6, $7)
            RETURNING id, creado_en; 
        `;
        
        const values = [
            id_cliente, id_artista, fecha_programada, 
            duracion_estimada_minutos || null, 
            total_estimado || null, 
            creado_por, 
            notas || 'Cita generada por API'
        ];
        
        const result = await client.query(citaInsertQuery, values);
        
        res.status(201).json({
            message: 'Cita creada con éxito (Sesión generada automáticamente por DB).',
            cita_id: result.rows[0].id
        });

    } catch (err) {
        console.error('Error al generar cita:', err);
        res.status(500).json({ error: 'Error interno.' });
    } finally {
        client.release();
    }
});
// /routes/citas.js

// PUT /api/citas/:id
router.put('/:id', async (req, res) => {
    const { id } = req.params;
    const { 
        fecha_programada, 
        total_estimado, 
        estado, 
        notas,
        materiales,   
        usuario_id    
    } = req.body;

    const client = await pool.connect();

    try {
        // ===============================================================
        // CASO 1: CANCELACIÓN (Delega a la función PL/SQL)
        // ===============================================================
        if (estado === 'cancelada') {
            const motivoCancelacion = notas || 'Cancelación solicitada vía API';
            const usuarioCancelacion = usuario_id || 1; // Fallback ID admin

            // Llamamos a la función que creamos en el Paso 2
            const cancelQuery = `SELECT cancelar_cita_con_reembolso($1, $2, $3) AS resultado`;
            const cancelResult = await client.query(cancelQuery, [id, motivoCancelacion, usuarioCancelacion]);
            
            return res.status(200).json(cancelResult.rows[0].resultado);
        }

        // ===============================================================
        // CASO 2: ACTUALIZACIÓN NORMAL (Transacción manual)
        // ===============================================================
        await client.query('BEGIN'); 

        // A. Construir UPDATE dinámico para la tabla CITAS
        const updates = [];
        const values = [id];
        let idx = 2;

        if (fecha_programada) { updates.push(`fecha_programada = $${idx++}`); values.push(fecha_programada); }
        if (total_estimado)   { updates.push(`total_estimado = $${idx++}`); values.push(total_estimado); }
        if (estado)           { updates.push(`estado = $${idx++}::estado_cita`); values.push(estado); }
        if (notas)            { updates.push(`notas = $${idx++}`); values.push(notas); }

        // Si no hay nada que actualizar en la cita y tampoco materiales, error.
        if (updates.length === 0 && (!materiales || materiales.length === 0)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'No hay datos para actualizar.' });
        }

        let citaActualizada = null;

        if (updates.length > 0) {
            const updateQuery = `
                UPDATE citas 
                SET ${updates.join(', ')} 
                WHERE id = $1 
                RETURNING *;
            `;
            const result = await client.query(updateQuery, values);
            
            if (result.rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ error: 'Cita no encontrada.' });
            }
            citaActualizada = result.rows[0];
        }

        // B. PROCESAR MATERIALES (Solo si pasa a 'en_progreso')
        // El Trigger de la BD ya habrá creado/actualizado la sesión al hacer el UPDATE arriba
        if (estado === 'en_progreso' && materiales && materiales.length > 0) {
            
            // Buscar la sesión activa más reciente
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
            const idUsuario = usuario_id || 1; 

            for (const mat of materiales) {
                // 1. Registrar Consumo (Movimiento Inventario)
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
                await client.query(movQuery, [mat.id, mat.cantidad, idSesion, idUsuario, id]);

                // 2. Registrar Costo (Materiales Sesion)
                // Omitimos 'subtotal' ya que es columna generada
                const costoQuery = `
                    INSERT INTO materiales_sesion (
                        id_sesion, id_material, cantidad_usada, 
                        costo_unitario, notas
                    ) 
                    SELECT 
                        $1, $2, $3, 
                        precio_costo, 
                        (SELECT nombre FROM materiales WHERE id = $2)
                    FROM materiales WHERE id = $2;
                `;
                await client.query(costoQuery, [idSesion, mat.id, mat.cantidad]);
            }
        }

        await client.query('COMMIT'); 

        res.status(200).json({
            message: 'Actualización exitosa.',
            cita: citaActualizada,
            materiales_procesados: materiales ? materiales.length : 0
        });

    } catch (err) {
        // Solo hacemos rollback si la transacción manual estaba abierta
        if (estado !== 'cancelada') {
            await client.query('ROLLBACK');
        }
        
        console.error('Error al actualizar cita:', err);
        
        if (err.code === 'P0001') { 
            return res.status(409).json({ error: 'Stock Insuficiente', detalle: err.message });
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