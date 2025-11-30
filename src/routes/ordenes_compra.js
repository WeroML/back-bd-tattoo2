const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// GET /api/ordenes_compra - Listar órdenes de compra
router.get('/', async (req, res) => {
    try {
        const query = `
            SELECT c.*, p.nombre as nombre_proveedor, u.nombre_usuario as creado_por_usuario
            FROM compras c
            JOIN proveedores p ON c.id_proveedor = p.id
            LEFT JOIN usuarios u ON c.creado_por = u.id
            ORDER BY c.fecha_compra DESC
        `;
        const result = await pool.query(query);
        res.json(result.rows);
    } catch (err) {
        console.error('Error al obtener órdenes de compra:', err);
        res.status(500).json({ error: 'Error al obtener órdenes de compra' });
    }
});

// GET /api/ordenes_compra/:id - Obtener detalle de una orden
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Obtener cabecera
        const compraQuery = `
            SELECT c.*, p.nombre as nombre_proveedor, u.nombre_usuario as creado_por_usuario
            FROM compras c
            JOIN proveedores p ON c.id_proveedor = p.id
            LEFT JOIN usuarios u ON c.creado_por = u.id
            WHERE c.id = $1
        `;
        const compraResult = await pool.query(compraQuery, [id]);

        if (compraResult.rows.length === 0) {
            return res.status(404).json({ error: 'Orden de compra no encontrada' });
        }

        // Obtener detalles
        const detallesQuery = `
            SELECT cd.*, m.nombre as nombre_material, m.codigo
            FROM compras_detalle cd
            JOIN materiales m ON cd.id_material = m.id
            WHERE cd.id_compra = $1
        `;
        const detallesResult = await pool.query(detallesQuery, [id]);

        const orden = compraResult.rows[0];
        orden.detalles = detallesResult.rows;

        res.json(orden);
    } catch (err) {
        console.error('Error al obtener detalle de orden:', err);
        res.status(500).json({ error: 'Error al obtener detalle de orden' });
    }
});

// POST /api/ordenes_compra - Crear nueva orden de compra
router.post('/', async (req, res) => {
    const { id_proveedor, creado_por, numero_factura, notas, items } = req.body;
    // items: [{ id_material, cantidad, precio_unitario }]

    if (!id_proveedor || !items || items.length === 0) {
        return res.status(400).json({ error: 'Faltan datos requeridos (proveedor o items)' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Crear la orden de compra (cabecera)
        const insertCompraQuery = `
            INSERT INTO compras (id_proveedor, creado_por, numero_factura, notas, total)
            VALUES ($1, $2, $3, $4, 0)
            RETURNING id
        `;
        const compraResult = await client.query(insertCompraQuery, [
            id_proveedor, 
            creado_por, 
            numero_factura, 
            notas
        ]);
        const idCompra = compraResult.rows[0].id;

        let totalOrden = 0;

        // 2. Insertar detalles
        for (const item of items) {
            const { id_material, cantidad, precio_unitario } = item;
            
            const insertDetalleQuery = `
                INSERT INTO compras_detalle (id_compra, id_material, cantidad, precio_unitario)
                VALUES ($1, $2, $3, $4)
                RETURNING subtotal
            `;
            const detalleResult = await client.query(insertDetalleQuery, [
                idCompra, id_material, cantidad, precio_unitario
            ]);
            
            // El subtotal se calcula automáticamente en la BD, pero lo recuperamos para sumar al total
            totalOrden += parseFloat(detalleResult.rows[0].subtotal);
        }

        // 3. Actualizar el total de la orden
        await client.query('UPDATE compras SET total = $1 WHERE id = $2', [totalOrden, idCompra]);

        await client.query('COMMIT');

        res.status(201).json({ 
            message: 'Orden de compra creada exitosamente', 
            id_compra: idCompra,
            total: totalOrden
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al crear orden de compra:', err);
        res.status(500).json({ error: 'Error al crear orden de compra' });
    } finally {
        client.release();
    }
});

// PUT /api/ordenes_compra/:id/recibir - Marcar orden como recibida y actualizar inventario
router.put('/:id/recibir', async (req, res) => {
    const { id } = req.params;
    const { recibido_por } = req.body; // ID del usuario que recibe

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Verificar estado actual
        const checkQuery = 'SELECT recibido FROM compras WHERE id = $1 FOR UPDATE';
        const checkResult = await client.query(checkQuery, [id]);

        if (checkResult.rows.length === 0) {
            throw new Error('Orden de compra no encontrada');
        }
        if (checkResult.rows[0].recibido) {
            throw new Error('Esta orden ya ha sido recibida');
        }

        // 2. Obtener detalles para procesar inventario
        const detallesQuery = 'SELECT * FROM compras_detalle WHERE id_compra = $1';
        const detallesResult = await client.query(detallesQuery, [id]);

        for (const item of detallesResult.rows) {
            // A. Registrar movimiento de inventario
            const movQuery = `
                INSERT INTO movimientos_inventario (
                    id_material, tipo_movimiento, cantidad, id_compra_relacionada, realizado_por, notas
                ) VALUES ($1, 'compra', $2, $3, $4, 'Recepción de orden de compra')
            `;
            await client.query(movQuery, [
                item.id_material, 
                item.cantidad, 
                id, 
                recibido_por
            ]);

            // B. Actualizar stock y último precio en tabla materiales
            const updateMaterialQuery = `
                UPDATE materiales 
                SET cantidad_existencia = cantidad_existencia + $1,
                    ultimo_precio_compra = $2
                WHERE id = $3
            `;
            await client.query(updateMaterialQuery, [
                item.cantidad, 
                item.precio_unitario, 
                item.id_material
            ]);
        }

        // 3. Marcar compra como recibida
        await client.query('UPDATE compras SET recibido = true WHERE id = $1', [id]);

        await client.query('COMMIT');
        res.json({ message: 'Orden recibida e inventario actualizado correctamente' });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al recibir orden:', err);
        res.status(err.message === 'Orden de compra no encontrada' || err.message === 'Esta orden ya ha sido recibida' ? 400 : 500)
           .json({ error: err.message || 'Error al procesar recepción' });
    } finally {
        client.release();
    }
});

module.exports = router;
