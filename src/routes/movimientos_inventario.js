const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// -------------------------------------------------------------
// GET /api/movimientos_inventario - Obtener el historial de movimientos
// Permite filtrar por material o tipo de movimiento usando query parameters
// -------------------------------------------------------------
router.get('/', async (req, res) => {
    // Capturamos filtros opcionales de la URL
    const { id_material, tipo_movimiento } = req.query;

    try {
        let queryText = `
            SELECT 
                mi.id,
                mi.tipo_movimiento,
                mi.cantidad,
                mi.fecha_movimiento,
                m.nombre AS nombre_material, -- Nombre legible del material
                u.nombre_usuario AS realizado_por_usuario, -- Quién realizó el movimiento
                mi.id_compra_relacionada,
                mi.id_sesion_relacionada,
                mi.notas
            FROM movimientos_inventario mi
            JOIN materiales m ON mi.id_material = m.id
            LEFT JOIN usuarios u ON mi.realizado_por = u.id -- LEFT JOIN por si 'realizado_por' es NULL
            WHERE 1=1 -- Cláusula para facilitar la adición de filtros
        `;

        const params = [];
        let paramIndex = 1;

        // 1. FILTRO por ID de Material
        if (id_material) {
            queryText += ` AND mi.id_material = $${paramIndex}`;
            params.push(id_material);
            paramIndex++;
        }

        // 2. FILTRO por Tipo de Movimiento (compra, consumo, ajuste, etc.)
        if (tipo_movimiento) {
            // Usamos un cast explícito para buscar contra el ENUM
            queryText += ` AND mi.tipo_movimiento = $${paramIndex}::tipo_movimiento`;
            params.push(tipo_movimiento);
            paramIndex++;
        }

        queryText += ` ORDER BY mi.fecha_movimiento DESC;`;

        const result = await pool.query(queryText, params);

        res.status(200).json(result.rows);

    } catch (err) {
        console.error('Error al obtener movimientos de inventario:', err);
        // Error común: Valor de ENUM incorrecto
        if (err.code === '42883' || err.code === '22P02') {
            return res.status(400).json({ error: `El tipo de movimiento '${tipo_movimiento}' es inválido.` });
        }
        res.status(500).json({ error: 'Error interno del servidor al consultar el inventario.' });
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


module.exports = router;