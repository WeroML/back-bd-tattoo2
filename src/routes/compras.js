const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// ----------------------------------------------------------------------
// POST /api/compras/registrar
// ----------------------------------------------------------------------
router.post('/registrar', async (req, res) => {
    const {
        id_proveedor,
        numero_factura
    } = req.body;

    const creado_por = req.body.creado_por || null;

    const {
        id_material,
        cantidad,
        precio_unitario
    } = req.body.detalle || {};

    if (!id_proveedor || !numero_factura || !id_material || !cantidad || !precio_unitario) {
        return res.status(400).json({ error: 'Faltan datos obligatorios.' });
    }

    const client = await pool.connect();

    try {
        // PASO 0: Verificar Proveedor
        const provCheck = await client.query('SELECT id FROM proveedores WHERE id = $1', [id_proveedor]);
        if (provCheck.rowCount === 0) {
            return res.status(400).json({ error: `El proveedor seleccionado no existe.` });
        }

        await client.query('BEGIN');

        // 1. Calcular total
        const totalCalculado = Number(cantidad) * Number(precio_unitario);

        // 2. Actualizar Stock
        const updateStockQuery = `
            UPDATE materiales
            SET cantidad_existencia = cantidad_existencia + $1,
                ultimo_precio_compra = $2
            WHERE id = $3
            RETURNING id;
        `;
        const stockResult = await client.query(updateStockQuery, [cantidad, precio_unitario, id_material]);

        if (stockResult.rowCount === 0) {
            throw new Error(`El material seleccionado no existe.`);
        }

        // 3. Insertar Compra
        const insertCompraQuery = `
            INSERT INTO compras (id_proveedor, fecha_compra, numero_factura, total, recibido, creado_por)
            VALUES ($1, NOW(), $2, $3, true, $4)
            RETURNING id;
        `;
        const compraResult = await client.query(insertCompraQuery, [
            id_proveedor, 
            numero_factura, 
            totalCalculado, 
            creado_por
        ]);
        const nuevaCompraId = compraResult.rows[0].id;

        // 4. Insertar Detalle
        const insertDetalleQuery = `
            INSERT INTO compras_detalle (id_compra, id_material, cantidad, precio_unitario)
            VALUES ($1, $2, $3, $4);
        `;
        await client.query(insertDetalleQuery, [nuevaCompraId, id_material, cantidad, precio_unitario]);

        // 5. Registrar en Historial
        const insertMovimientoQuery = `
            INSERT INTO movimientos_inventario (
                id_material, tipo_movimiento, cantidad, id_compra_relacionada, realizado_por, notas, fecha_movimiento
            )
            VALUES ($1, 'compra', $2, $3, $4, $5, NOW());
        `;
        const notas = `Entrada por Compra #${nuevaCompraId}`;
        
        await client.query(insertMovimientoQuery, [
            id_material, 
            cantidad, 
            nuevaCompraId, 
            creado_por, 
            notas
        ]);

        await client.query('COMMIT');

        res.status(201).json({ message: 'Compra registrada correctamente.' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error:', err);
        
        if (err.code === '23502' && err.column === 'creado_por') {
             return res.status(500).json({ error: 'Tu base de datos exige un usuario obligatoriamente.' });
        }

        res.status(500).json({ error: `Error al procesar: ${err.message}` });
    } finally {
        client.release();
    }
});

// ----------------------------------------------------------------------
// GET /api/compras - Listado con descripción de productos
// ----------------------------------------------------------------------
router.get('/', async (req, res) => {
    try {
        // Usamos una subconsulta SQL para traer los nombres de los materiales
        // concatenados por si hay más de uno.
        const query = `
            SELECT 
                c.id, 
                c.fecha_compra, 
                c.numero_factura, 
                c.total, 
                c.recibido,
                p.nombre as nombre_proveedor,
                (
                    SELECT string_agg(m.nombre, ', ')
                    FROM compras_detalle cd
                    JOIN materiales m ON cd.id_material = m.id
                    WHERE cd.id_compra = c.id
                ) as descripcion_productos
            FROM compras c
            LEFT JOIN proveedores p ON c.id_proveedor = p.id
            ORDER BY c.fecha_compra DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error listando compras:', err);
        res.status(500).json({ error: 'Error al listar compras' });
    }
});

module.exports = router;