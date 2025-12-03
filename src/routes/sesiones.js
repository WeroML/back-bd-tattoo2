const express = require('express');
// CORRECCIÓN: Importación única y limpia del pool
const { pool } = require('../db'); 

const router = express.Router();

// =================================================================
// 1. RUTAS ESTÁTICAS Y DE BÚSQUEDA (Deben ir PRIMERO)
// =================================================================

// GET /api/sesiones - Obtener todas las sesiones (Útil para depuración o admin)
router.get('/', async (req, res) => {
    const queryText = `
        SELECT id, id_cita, numero_sesion, fecha_programada, inicio_real, monto_cobrado, estado
        FROM sesiones 
        ORDER BY fecha_programada DESC
        LIMIT 50; 
    `;
    try {
        const result = await pool.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener sesiones:', err);
        res.status(500).json({ error: 'Error al consultar la tabla sesiones.' });
    }
});

// GET /api/sesiones/busqueda - Usa la función PL/SQL para filtrado avanzado
// ESTA RUTA DEBE IR ANTES DE /:id
router.get('/busqueda', async (req, res) => {
    const { id_cita, estado, id_artista, id_cliente } = req.query;

    try {
        const params = [
            id_cita || null,
            estado || null,
            id_artista || null,
            id_cliente || null
        ];

        // Llamada a la función SQL que creamos
        const queryText = `SELECT * FROM fn_buscar_sesiones($1, $2, $3, $4)`;
        const result = await pool.query(queryText, params);
        
        res.status(200).json(result.rows);

    } catch (err) {
        console.error('Error buscando sesiones:', err);
        res.status(500).json({ error: 'Error al consultar sesiones con filtros.' });
    }
});

// POST /api/sesiones/log - Registrar nuevo log de sesión (Transaccional)
router.post('/log', async (req, res) => {
    const { 
        id_cita, 
        numero_sesion, 
        estado_nuevo, 
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
        
        const isCompleted = ['completada', 'cancelada', 'no_asistio'].includes(estado_nuevo);
        
        const logValues = [
            id_cita,
            numero_sesion,
            prevLog.fecha_programada,
            prevLog.inicio_real, 
            isCompleted ? NOW() : null, 
            prevLog.duracion_minutos,
            prevLog.monto_cobrado + (monto_cobrado_opcional || 0), 
            estado_nuevo,
            notas || `Cambio de estado a ${estado_nuevo}`
        ];

        const result = await client.query(insertLogQuery, logValues);
        const newLogId = result.rows[0].id;

        // 4. ACTUALIZAR EL ESTADO DE LA CITA MAESTRA
        const updateCitaQuery = `
            UPDATE citas
            SET estado = $1::estado_cita
            WHERE id = $2;
        `;
        
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
        
        if (err.code === '42883' || err.code === '22P02') {
             return res.status(400).json({ error: `El estado '${estado_nuevo}' no es válido para el ENUM.` });
        }
        
        res.status(500).json({ error: 'Error interno al registrar el evento de sesión.' });
    } finally {
        client.release();
    }
});

// =================================================================
// 3. RUTAS DINÁMICAS (POR ID - Deben ir AL FINAL)
// =================================================================

// GET /api/sesiones/historial/:id_cita 
// (Renombrada a 'historial' para evitar conflicto con buscar por ID de sesión)
router.get('/historial/:id_cita', async (req, res) => {
    const { id_cita } = req.params;

    try {
        const queryText = `
            SELECT * FROM sesiones
            WHERE id_cita = $1
            ORDER BY numero_sesion ASC, creado_en ASC;
        `;
        const result = await pool.query(queryText, [id_cita]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'No se encontró historial para esta cita.' });
        }
        
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener historial:', err);
        res.status(500).json({ error: 'Error interno.' });
    }
});

// GET /api/sesiones/:id - Obtener una sesión específica por su ID único (PK)
// Esta ruta "atrapa" cualquier cosa que no coincida con las anteriores, por eso va al final.
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    
    // VALIDACIÓN DE SEGURIDAD: Si no es un número, retornar error 400
    // Esto previene el error "invalid input syntax for type bigint" si alguien escribe texto
    if (isNaN(id)) {
        return res.status(400).json({ error: 'El ID de la sesión debe ser numérico.' });
    }

    const queryText = `
        SELECT * FROM sesiones WHERE id = $1
    `;
    try {
        const result = await pool.query(queryText, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Sesión no encontrada.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener sesión:', err);
        res.status(500).json({ error: 'Error al consultar la tabla sesiones.' });
    }
});

module.exports = router;