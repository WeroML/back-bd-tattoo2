// /routes/materiales.js

const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// -------------------------------------------------------------------
// POST /api/materiales/inventario - Log 'en_progreso', consumo y costo
// -------------------------------------------------------------------
router.post('/inventario', async (req, res) => {
    // id_sesion: Es el ID del log anterior (estado 'confirmada')
    const { id_sesion, realizado_por } = req.body;

    if (!id_sesion || !realizado_por) {
        return res.status(400).json({ error: 'id_sesion y realizado_por son campos obligatorios.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // 1. INICIAR TRANSACCIÓN

        // ---------------------------------------------------------
        // A. OBTENER DATOS DE LA SESIÓN ANTERIOR
        // ---------------------------------------------------------
        const currentSesionQuery = `
            SELECT id_cita, numero_sesion, fecha_programada, duracion_minutos, monto_cobrado, estado
            FROM sesiones WHERE id = $1 LIMIT 1;
        `;
        const currentResult = await client.query(currentSesionQuery, [id_sesion]);

        if (currentResult.rowCount === 0) {
            throw new Error("Sesión previa no encontrada.");
        }
        const prevSesion = currentResult.rows[0];

        if (prevSesion.estado !== 'confirmada') {
            throw new Error("La sesión debe estar en estado 'confirmada' para iniciar el progreso.");
        }

        // ---------------------------------------------------------
        // B. CREAR NUEVA SESIÓN (Log 'en_progreso')
        // ---------------------------------------------------------
        const newSesionQuery = `
            INSERT INTO sesiones (
                id_cita, numero_sesion, fecha_programada, duracion_minutos, 
                monto_cobrado, estado, inicio_real, creado_en
            ) VALUES ($1, $2, $3, $4, $5, 'en_progreso'::estado_sesion, NOW(), NOW())
            RETURNING id;
        `;
        const newSesionResult = await client.query(newSesionQuery, [
            prevSesion.id_cita,
            prevSesion.numero_sesion,
            prevSesion.fecha_programada,
            prevSesion.duracion_minutos,
            prevSesion.monto_cobrado
        ]);

        const newSesionId = newSesionResult.rows[0].id; // <--- ID para vincular materiales

        const updateCitaQuery = `
            UPDATE citas
            SET estado = 'en_progreso'::estado_cita
            WHERE id = $1;
        `;
        await client.query(updateCitaQuery, [prevSesion.id_cita]);

        // C. DEFINIR Y REGISTRAR MOVIMIENTOS_INVENTARIO (Consumo)
        const consumoQuery = `
            INSERT INTO movimientos_inventario (
                id_material, tipo_movimiento, cantidad, id_sesion_relacionada, 
                realizado_por, notas, fecha_movimiento
            )
            SELECT
                sm.id AS id_material,
                'consumo'::tipo_movimiento, 
                FLOOR(RANDOM() * 3 + 1)::numeric AS cantidad, 
                $1 AS id_sesion_relacionada,
                $2 AS realizado_por,
                
                -- FIX FINAL: Cadena estática para evitar conflicto text/bigint
                'consumo sesion' AS notas, 
                
                NOW()
            
            FROM (
                (SELECT id, descripcion FROM materiales WHERE id IN (2, 3, 4, 9))
                UNION ALL
                (SELECT id, descripcion FROM materiales WHERE id NOT IN (2, 3, 4, 9) ORDER BY RANDOM() LIMIT 5)
            ) AS sm
            
            RETURNING id, id_material, cantidad; 
        `;

        const movimientosResult = await client.query(consumoQuery, [newSesionId, realizado_por]);

        // Mapeo para facilitar el siguiente paso (normalizamos nombres)
        const materialesUsados = movimientosResult.rows.map(row => ({
            id_material: row.id_material,
            cantidad_usada: row.cantidad
        }));

        // ---------------------------------------------------------
        // D. REGISTRAR MATERIALES_SESION (Costos)
        // ---------------------------------------------------------
        // Construimos el INSERT múltiple dinámicamente
        const insertsValues = materialesUsados.map(item => {
            const precioQuery = `(SELECT precio_costo FROM materiales WHERE id = ${item.id_material} LIMIT 1)`;

            return `(
                ${newSesionId}, 
                ${item.id_material}, 
                ${item.cantidad_usada}, 
                ${precioQuery}::numeric, 
                (SELECT quote_literal(descripcion) FROM materiales WHERE id = ${item.id_material} LIMIT 1)
            )`;
        }).join(', ');

        const finalSesionMaterialesQuery = `
            INSERT INTO materiales_sesion (
                id_sesion, id_material, cantidad_usada, costo_unitario, notas 
                -- ELIMINAMOS 'subtotal'
            ) VALUES ${insertsValues}
        `;

        await client.query(finalSesionMaterialesQuery);

        // ---------------------------------------------------------
        // CONFIRMAR TRANSACCIÓN
        // ---------------------------------------------------------
        await client.query('COMMIT');

        res.status(201).json({
            message: 'Sesión iniciada y materiales descontados correctamente.',
            sesion_anterior_id: id_sesion,
            sesion_actual_id: newSesionId,
            estado_actual: 'en_progreso',
            materiales_registrados: materialesUsados.length
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error en proceso de inventario/sesión:', err);

        // Manejo de errores controlados
        if (err.message === "Sesión previa no encontrada." || err.message.includes("estado 'confirmada'")) {
            return res.status(404).json({ error: err.message });
        }

        res.status(500).json({ error: 'Error interno del servidor al procesar la solicitud.' });
    } finally {
        client.release();
    }
});


module.exports = router;