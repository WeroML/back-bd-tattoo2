const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// -------------------------------------------------------------
// GET /api/materiales_sesion - Obtener todos los registros
// (Opcional: puedes filtrar por ?id_sesion=X en la query string)
// -------------------------------------------------------------
router.get('/', async (req, res) => {
    // Capturamos ambos parámetros
    const { id_sesion, id_material } = req.query;

    try {
        let queryText = `
            SELECT 
                ms.id,
                ms.id_sesion,
                ms.id_material,
                m.nombre AS nombre_material,
                m.codigo,
                m.unidad,
                ms.cantidad_usada,
                ms.costo_unitario,
                ms.subtotal,
                ms.notas
            FROM materiales_sesion ms
            JOIN materiales m ON ms.id_material = m.id
            WHERE 1=1 
        `; // Usamos WHERE 1=1 para facilitar la concatenación de ANDs

        const params = [];
        let paramCounter = 1;

        // Filtro por Sesión
        if (id_sesion) {
            queryText += ` AND ms.id_sesion = $${paramCounter}`;
            params.push(id_sesion);
            paramCounter++;
        }

        // Filtro por Material (NUEVO)
        if (id_material) {
            queryText += ` AND ms.id_material = $${paramCounter}`;
            params.push(id_material);
            paramCounter++;
        }

        queryText += ' ORDER BY ms.id DESC;';

        const result = await pool.query(queryText, params);
        res.status(200).json(result.rows);

    } catch (err) {
        console.error('Error al obtener materiales de sesión:', err);
        res.status(500).json({ error: 'Error interno al consultar los materiales.' });
    }
});
// -------------------------------------------------------------
// POST /api/materiales_sesion - Registrar material manualmente
// -------------------------------------------------------------
router.post('/', async (req, res) => {
    const { id_sesion, id_material, cantidad_usada, notas, realizado_por } = req.body;

    if (!id_sesion || !id_material || !cantidad_usada || !realizado_por) {
        return res.status(400).json({ error: 'id_sesion, id_material, cantidad_usada y realizado_por son obligatorios.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // 1. INICIAR TRANSACCIÓN

        // 1. OBTENER COSTO Y DESCRIPCIÓN del material
        const materialResult = await client.query(
            `SELECT precio_costo, descripcion FROM materiales WHERE id = $1`, [id_material]
        );

        if (materialResult.rowCount === 0) {
            throw new Error('Material ID no válido.');
        }

        const materialData = materialResult.rows[0];
        const costoUnitario = materialData.precio_costo;
        const notasMovimiento = notas || `Consumo manual para sesión ${id_sesion}. Material: ${materialData.descripcion}`;

        // 2. INSERTAR en materiales_sesion (Registro de Costo)
        const msInsertQuery = `
            INSERT INTO materiales_sesion (id_sesion, id_material, cantidad_usada, costo_unitario, notas)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id;
        `;
        const msValues = [id_sesion, id_material, cantidad_usada, costoUnitario, notasMovimiento];
        const msResult = await client.query(msInsertQuery, msValues);


        // 3. INSERTAR en movimientos_inventario (Registro de Consumo/Stock "PUT")
        const miInsertQuery = `
            INSERT INTO movimientos_inventario (id_material, tipo_movimiento, cantidad, id_sesion_relacionada, realizado_por, notas, fecha_movimiento)
            VALUES ($1, 'consumo'::tipo_movimiento, $2, $3, $4, $5, NOW());
        `;
        const miValues = [
            id_material,
            cantidad_usada,
            id_sesion,
            realizado_por,
            notasMovimiento
        ];
        await client.query(miInsertQuery, miValues);


        await client.query('COMMIT'); // 4. COMMIT

        res.status(201).json({
            message: 'Costo registrado y stock descontado exitosamente.',
            registro_costo_id: msResult.rows[0].id,
            movimiento_tipo: 'consumo'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error transaccional al registrar material:', err);

        if (err.code === '23503') {
            return res.status(400).json({ error: 'Llave foránea inválida. Verifique ID de sesión, material o usuario.' });
        }
        if (err.message.includes('ID no válido')) {
            return res.status(404).json({ error: err.message });
        }

        res.status(500).json({ error: 'Error interno: Transacción abortada.' });
    } finally {
        client.release();
    }
});


// /routes/movimientos_inventario.js

// ... (rutas GET y POST existentes) ...

// -------------------------------------------------------------
// GET /api/movimientos_inventario/buscar - Búsqueda por ID de Relación
// Parámetros: id_compra, id_sesion, id_material
// -------------------------------------------------------------
router.get('/buscar', async (req, res) => {
    // Capturamos los IDs que vienen como query parameters
    const { id_compra, id_sesion, id_material } = req.query;

    // Validación: Se requiere al menos un parámetro de búsqueda
    if (!id_compra && !id_sesion && !id_material) {
        return res.status(400).json({ error: 'Se requiere proporcionar al menos uno de los siguientes IDs: id_compra, id_sesion, o id_material.' });
    }

    try {
        let queryText = `
            SELECT 
                mi.id,
                mi.tipo_movimiento,
                mi.cantidad,
                mi.fecha_movimiento,
                m.nombre AS nombre_material, 
                u.nombre_usuario AS realizado_por_usuario,
                mi.id_compra_relacionada,
                mi.id_sesion_relacionada,
                mi.notas
            FROM movimientos_inventario mi
            JOIN materiales m ON mi.id_material = m.id
            LEFT JOIN usuarios u ON mi.realizado_por = u.id 
            WHERE 1=1 
        `;

        const params = [];
        let paramIndex = 1;

        // 1. Filtro por ID de Compra
        if (id_compra) {
            queryText += ` AND mi.id_compra_relacionada = $${paramIndex}`;
            params.push(id_compra);
            paramIndex++;
        }

        // 2. Filtro por ID de Sesión Relacionada
        if (id_sesion) {
            queryText += ` AND mi.id_sesion_relacionada = $${paramIndex}`;
            params.push(id_sesion);
            paramIndex++;
        }

        // 3. Filtro por ID de Material
        if (id_material) {
            queryText += ` AND mi.id_material = $${paramIndex}`;
            params.push(id_material);
            paramIndex++;
        }

        queryText += ` ORDER BY mi.fecha_movimiento DESC;`;

        const result = await pool.query(queryText, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'No se encontraron movimientos para los criterios especificados.' });
        }

        res.status(200).json(result.rows);

    } catch (err) {
        console.error('Error al buscar movimientos por ID:', err);
        res.status(500).json({ error: 'Error interno del servidor al realizar la búsqueda.' });
    }
});

// /routes/materiales_sesion.js

// ... (rutas POST y GET / existentes) ...

// -------------------------------------------------------------
// GET /api/materiales_sesion/:id_sesion - Obtener materiales por ID de Sesión
// -------------------------------------------------------------
router.get('/:id_sesion', async (req, res) => {
    // 1. Capturamos el ID de la sesión desde los parámetros de la URL
    const { id_sesion } = req.params;

    try {
        const queryText = `
            SELECT 
                ms.id,
                ms.id_sesion,
                ms.id_material,
                m.nombre AS nombre_material, -- Nombre del material
                m.unidad,
                ms.cantidad_usada,
                ms.costo_unitario,
                ms.subtotal,
                ms.notas
            FROM materiales_sesion ms
            JOIN materiales m ON ms.id_material = m.id
            WHERE ms.id_sesion = $1
            ORDER BY ms.id DESC;
        `;

        const result = await pool.query(queryText, [id_sesion]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: `No se encontraron materiales registrados para la Sesión ID ${id_sesion}.` });
        }

        res.status(200).json(result.rows);

    } catch (err) {
        console.error(`Error al obtener materiales para la sesión ${id_sesion}:`, err);
        res.status(500).json({ error: 'Error interno al consultar los materiales de la sesión.' });
    }
});


// -------------------------------------------------------------
// GET /api/materiales_sesion/:id_cita/materiales - Obtener costos de materiales por ID de Cita
// -------------------------------------------------------------
router.get('/cita/:id_cita', async (req, res) => {
    const { id_cita } = req.params; // Capturamos el ID de la Cita

    try {
        const queryText = `
            SELECT
                ms.id_sesion,
                m.nombre AS nombre_material,
                ms.cantidad_usada,
                ms.costo_unitario,
                ms.subtotal,
                ms.notas
            FROM materiales_sesion ms
            JOIN sesiones s ON ms.id_sesion = s.id
            JOIN materiales m ON ms.id_material = m.id
            WHERE s.id_cita = $1
            ORDER BY ms.id_sesion, ms.id;
        `;

        const result = await pool.query(queryText, [id_cita]);

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: `No se encontró consumo de materiales para la Cita ID ${id_cita}.`
            });
        }

        res.status(200).json(result.rows);

    } catch (err) {
        console.error(`Error al buscar materiales por Cita ID ${id_cita}:`, err);
        res.status(500).json({ error: 'Error interno al consultar costos de materiales.' });
    }
});



module.exports = router;