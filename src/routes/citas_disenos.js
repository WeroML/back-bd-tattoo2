// /routes/citas_disenos.js
const express = require('express');
const db = require('../db');
const { pool } = require('../db');
const router = express.Router();


// GET /api/citas
router.get('/', async (req, res) => {
    const queryText = `
        SELECT id, id_cita, id_diseno, cantidad, notas 
        FROM citas_disenos 
        ORDER BY creado_en DESC
    `;
    try {
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener citas:', err);
        res.status(500).json({ error: 'Error al consultar la tabla citas.' });
    }
});

// POST /api/citas
router.post('/', async (req, res) => {
    const { id_cita, id_diseno, cantidad, notas } = req.body;

    // Variables de estado y rol
    const estado_confirmado = 'confirmada';
    const numero_sesion_inicial = 1;
    const monto_cobrado_inicial = 0.00; // Según lo solicitado: 0 en la sesión de confirmación

    // Conectar el cliente para la transacción
    const client = await pool.connect();

    try {
        // 1. INICIAR TRANSACCIÓN
        await client.query('BEGIN');

        // A. INSERTAR EN citas_disenos (Registro del diseño)
        const disenoInsertQuery = `
            INSERT INTO citas_disenos (id_cita, id_diseno, cantidad, notas)
            VALUES ($1, $2, $3, $4)
            RETURNING id_cita;
        `;
        await client.query(disenoInsertQuery, [id_cita, id_diseno, cantidad, notas || null]);

        // B. OBTENER DATOS DE LA CITA para la sesión
        const citaSelectQuery = `
            SELECT fecha_programada, duracion_estimada_minutos
            FROM citas
            WHERE id = $1;
        `;
        const citaResult = await client.query(citaSelectQuery, [id_cita]);

        if (citaResult.rowCount === 0) {
            throw new Error("Cita no encontrada.");
        }

        const { fecha_programada, duracion_estimada_minutos } = citaResult.rows[0];

        // C. ACTUALIZAR CITAS (Cambiar estado a 'confirmada')
        const citaUpdateQuery = `
            UPDATE citas
            SET estado = $1::estado_cita
            WHERE id = $2;
        `;
        await client.query(citaUpdateQuery, [estado_confirmado, id_cita]);


        // D. INSERTAR EN SESIONES (Crear registro de estado 'confirmada' con monto 0)
        const sesionInsertQuery = `
            INSERT INTO sesiones (
                id_cita, numero_sesion, fecha_programada, duracion_minutos, monto_cobrado, estado, creado_en
            ) VALUES ($1, $2, $3, $4, $5, $6::estado_sesion, NOW())
            RETURNING id;
        `;

        const sesionValues = [
            id_cita,
            numero_sesion_inicial,
            fecha_programada,
            duracion_estimada_minutos,
            monto_cobrado_inicial, // Se inserta 0.00 según lo solicitado
            estado_confirmado,     // Estado 'confirmada'
        ];

        const sesionResult = await client.query(sesionInsertQuery, sesionValues);

        // 2. CONFIRMAR TRANSACCIÓN
        await client.query('COMMIT');

        res.status(201).json({
            message: 'Diseño asignado y Cita confirmada con éxito.',
            cita_id: id_cita,
            sesion_registro_id: sesionResult.rows[0].id
        });

    } catch (err) {
        // 3. REVERTIR TRANSACCIÓN
        await client.query('ROLLBACK');
        console.error('Error transaccional al asignar diseño:', err);

        if (err.message === "Cita no encontrada.") {
            return res.status(404).json({ error: err.message });
        }
        if (err.code === '23503') {
            return res.status(400).json({ error: 'Llave foránea inválida. La cita o el diseño no existen.' });
        }

        res.status(500).json({ error: 'Error interno: La transacción fue abortada.' });
    } finally {
        client.release();
    }
});

module.exports = router;
