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

        // CORRECCIÓN: Usamos el operador ternario para asegurar que si el valor es NULL, 
        // se mantiene NULL para la inserción, asumiendo que las columnas son NULLABLES.
        const sesionValues = [
            nuevaCitaId,
            numero_sesion_inicial,
            fecha_programada,
            duracion_estimada_minutos, // <-- Si es NULL, se mantiene NULL
            total_estimado,            // <-- Si es NULL, se mantiene NULL
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
        // 4. REVERTIR TRANSACCIÓN si algo falla (ej. FK, tipo de dato)
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

module.exports = router;