// /routes/pagos.js
const express = require('express');
const db = require('../db');
const router = express.Router();
const { pool } = require('../db');


// GET /api/pagos
router.get('/', async (req, res) => {
    const queryText = `
        SELECT id, id_cliente, id_cita, monto, metodo, fecha_pago, referencia 
        FROM pagos 
        ORDER BY fecha_pago DESC
    `;
    try {
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener pagos:', err);
        res.status(500).json({ error: 'Error al consultar la tabla pagos.' });
    }
});


// -------------------------------------------------------------------
// POST /api/pagos - Registrar pago y COMPLETAR cita/sesión
// -------------------------------------------------------------------
router.post('/', async (req, res) => {
    const {
        id_cita,
        metodo, // 'efectivo', 'tarjeta', 'transferencia'
        referencia,
        notas, // Nota opcional del cliente/usuario
        creado_por
    } = req.body;

    if (!id_cita || !metodo || !creado_por) {
        return res.status(400).json({ error: 'id_cita, metodo y creado_por son obligatorios.' });
    }

    // Definimos la nota unificada para todos los registros
    const notaFinal = notas || 'Proceso finalizado y pagado correctamente.';

    // Generar duración aleatoria mayor a 100 minutos (entre 101 y 300)
    const duracionFinal = Math.floor(Math.random() * 200) + 101;

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // 1. INICIAR TRANSACCIÓN

        // ---------------------------------------------------------
        // A. OBTENER INFORMACIÓN DE LA CITA Y SESIÓN ACTIVA
        // ---------------------------------------------------------
        const datosQuery = `
            SELECT 
                c.id AS id_cita, 
                c.id_cliente, 
                c.total_estimado, 
                s.numero_sesion,
                s.fecha_programada,
                s.inicio_real
            FROM citas c
            JOIN sesiones s ON c.id = s.id_cita
            WHERE c.id = $1
            ORDER BY s.creado_en DESC 
            LIMIT 1;
        `;

        const datosResult = await client.query(datosQuery, [id_cita]);

        if (datosResult.rowCount === 0) {
            throw new Error("Cita no encontrada o sin sesiones previas.");
        }

        const datos = datosResult.rows[0];
        const montoFinal = datos.total_estimado;

        // ---------------------------------------------------------
        // B. ACTUALIZAR LA CITA (Completada + Duración + Notas)
        // ---------------------------------------------------------
        const updateCitaQuery = `
            UPDATE citas
            SET estado = 'completada'::estado_cita,
                duracion_estimada_minutos = $1,
                notas = $2 -- Actualizamos la nota de la cita también
            WHERE id = $3
            RETURNING id;
        `;
        await client.query(updateCitaQuery, [duracionFinal, notaFinal, id_cita]);


        // ---------------------------------------------------------
        // C. CREAR LOG DE SESIÓN FINAL ('completada' + Notas)
        // ---------------------------------------------------------
        const insertSesionQuery = `
            INSERT INTO sesiones (
                id_cita, numero_sesion, fecha_programada, 
                inicio_real, fin_real, 
                duracion_minutos, monto_cobrado, estado, notas, creado_en
            ) VALUES (
                $1, $2, $3, 
                $4, NOW(), 
                $5, $6, 
                'completada'::estado_sesion, 
                $7, -- Usamos la notaFinal aquí también
                NOW()
            )
            RETURNING id;
        `;

        const sesionValues = [
            id_cita,
            datos.numero_sesion,
            datos.fecha_programada,
            datos.inicio_real,
            duracionFinal,
            montoFinal,
            notaFinal // <-- Nota unificada
        ];

        await client.query(insertSesionQuery, sesionValues);


        // ---------------------------------------------------------
        // D. INSERTAR PAGO (+ Notas)
        // ---------------------------------------------------------
        const insertPagoQuery = `
            INSERT INTO pagos (
                id_cliente, id_cita, monto, metodo, estado, 
                fecha_pago, referencia, notas, creado_por
            ) VALUES (
                $1, $2, $3, $4::metodo_pago, 'pagado', 
                NOW(), $5, $6, $7
            )
            RETURNING id;
        `;

        const pagoValues = [
            datos.id_cliente,
            id_cita,
            montoFinal,
            metodo,
            referencia || null,
            notaFinal, // <-- Nota unificada
            creado_por
        ];

        const pagoResult = await client.query(insertPagoQuery, pagoValues);


        await client.query('COMMIT'); // 5. CONFIRMAR TRANSACCIÓN

        res.status(201).json({
            message: 'Pago registrado, Cita y Sesión actualizadas con la nota de cierre.',
            pago_id: pagoResult.rows[0].id,
            cita_id: id_cita,
            estado_nuevo: 'completada',
            nota_registrada: notaFinal
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error transaccional en pagos:', err);

        if (err.code === '22P02') {
            return res.status(400).json({ error: 'Error en valores ENUM. Verifique los datos.' });
        }

        res.status(500).json({ error: 'Error interno del servidor al procesar el pago.' });
    } finally {
        client.release();
    }
});

module.exports = router;