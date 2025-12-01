const express = require('express');
const db = require('../db');
const { pool } = require('../db');

const router = express.Router();

// GET /api/sesiones
router.get('/', async (req, res) => {
    const queryText = `
        SELECT id, id_cita, numero_sesion, fecha_programada, inicio_real, monto_cobrado, estado
        FROM sesiones 
        ORDER BY fecha_programada DESC
    `;
    try {
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener sesiones:', err);
        res.status(500).json({ error: 'Error al consultar la tabla sesiones.' });
    }
});

// GET /api/sesiones/:id
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    const queryText = `
        SELECT id, id_cita, numero_sesion, fecha_programada, inicio_real, monto_cobrado, estado
        FROM sesiones 
        WHERE id = $1
    `;
    try {
        const result = await db.query(queryText, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sesión no encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener sesión:', err);
        res.status(500).json({ error: 'Error al consultar la tabla sesiones.' });
    }
});

// -------------------------------------------------------------
// GET /api/sesiones/:id_cita - Obtener el historial completo de logs de sesión
// -------------------------------------------------------------
router.get('/:id_cita', async (req, res) => {
    const { id_cita } = req.params;

    try {
        const queryText = `
            SELECT *
            FROM sesiones
            WHERE id_cita = $1
            ORDER BY numero_sesion ASC, creado_en ASC; -- Ordenado por sesión y cronología
        `;
        const result = await pool.query(queryText, [id_cita]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No se encontró historial de sesiones para esta cita.' });
        }

        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener historial de sesión:', err);
        res.status(500).json({ error: 'Error interno al consultar el historial.' });
    }
});

// -------------------------------------------------------------
// POST /api/sesiones/log - Registrar nuevo log de sesión
// -------------------------------------------------------------
router.post('/log', async (req, res) => {
    // 1. Datos de la nueva solicitud
    const {
        id_cita,
        numero_sesion,
        estado_nuevo, // Ej: 'en_descanso', 'reinicio_trabajo', 'finalizada'
        monto_cobrado_opcional,
        notas
    } = req.body;

    if (!id_cita || !numero_sesion || !estado_nuevo) {
        return res.status(400).json({ error: 'id_cita, numero_sesion y estado_nuevo son obligatorios.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 2. OBTENER DATOS DEL ÚLTIMO LOG
        const lastLogQuery = `
            SELECT fecha_programada, duracion_minutos, monto_cobrado, inicio_real
            FROM sesiones
            WHERE id_cita = $1 AND numero_sesion = $2
            ORDER BY creado_en DESC
            LIMIT 1;
        `;
        const lastLogResult = await client.query(lastLogQuery, [id_cita, numero_sesion]);

        if (lastLogResult.rowCount === 0) {
            throw new Error(`No se encontró el log de la Sesión ${numero_sesion} para la Cita ${id_cita}.`);
        }

        const prevLog = lastLogResult.rows[0];

        // 3. INSERTAR EL NUEVO LOG DE SESIÓN
        const insertLogQuery = `
            INSERT INTO sesiones (
                id_cita, numero_sesion, fecha_programada, inicio_real, fin_real, 
                duracion_minutos, monto_cobrado, estado, notas, creado_en
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8::estado_sesion, $9, NOW()
            )
            RETURNING id;
        `;

        const isCompleted = estado_nuevo === 'completada' || estado_nuevo === 'cancelada' || estado_nuevo === 'no_asistio';

        const logValues = [
            id_cita,
            numero_sesion,
            prevLog.fecha_programada,
            prevLog.inicio_real,
            isCompleted ? NOW() : null, // Fin real solo si es un estado final
            prevLog.duracion_minutos,
            prevLog.monto_cobrado + (monto_cobrado_opcional || 0), // Sumar monto opcional
            estado_nuevo,
            notas || `Cambio de estado a ${estado_nuevo}`
        ];

        const result = await client.query(insertLogQuery, logValues);
        const newLogId = result.rows[0].id;


        // ---------------------------------------------------------
        // 4. ACTUALIZAR EL ESTADO DE LA CITA MAESTRA (AÑADIDO)
        // ---------------------------------------------------------
        const updateCitaQuery = `
            UPDATE citas
            SET estado = $1::estado_cita
            WHERE id = $2;
        `;

        // Se actualiza el estado de la cita al nuevo estado de la sesión
        await client.query(updateCitaQuery, [estado_nuevo, id_cita]);


        await client.query('COMMIT');

        res.status(201).json({
            message: `Log de estado '${estado_nuevo}' registrado. Cita actualizada.`,
            sesion_log_id: newLogId,
            id_cita: id_cita,
            nuevo_estado_cita: estado_nuevo
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al registrar nuevo log de sesión:', err);
        // Manejar error de tipo (ENUM)
        if (err.code === '42883') {
            return res.status(400).json({ error: `El estado '${estado_nuevo}' no existe en el ENUM de citas o sesiones.` });
        }
        res.status(500).json({ error: 'Error interno al registrar el evento de sesión.' });
    } finally {
        client.release();
    }
});


module.exports = router;
