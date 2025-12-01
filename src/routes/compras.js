// /routes/compras.js
const express = require('express');
const { pool } = require('../db');
const router = express.Router();

// -------------------------------------------------------------
// POST /api/compras/registrar - Registrar Compra, Detalle y Actualizar Stock
// -------------------------------------------------------------
router.post('/registrar', async (req, res) => {
    const {
        id_proveedor,
        numero_factura,
        total,
        creado_por
    } = req.body;

    // El detalle puede traer un ID (existente) O datos para crear uno nuevo
    const {
        id_material,      // Opcional (si existe)
        nuevo_material,   // Opcional (Objeto: { nombre, codigo, unidad, descripcion })
        cantidad,
        precio_unitario
    } = req.body.detalle || {};

    // Validación: Debe haber o un ID o un objeto de nuevo material
    if (!id_proveedor || !total || !creado_por || !cantidad || !precio_unitario) {
        return res.status(400).json({ error: 'Faltan campos generales de la compra.' });
    }
    if (!id_material && !nuevo_material) {
        return res.status(400).json({ error: 'Debes proporcionar un id_material (existente) o un objeto nuevo_material.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // INICIAR TRANSACCIÓN

        // ---------------------------------------------------------
        // PASO 1: DETERMINAR EL ID DEL MATERIAL (Actualizar o Insertar)
        // ---------------------------------------------------------
        let finalMaterialId = id_material;

        if (id_material) {
            // A. CASO ACTUALIZAR: El material ya existe, sumamos al stock
            // Usamos COALESCE para evitar errores si el stock actual fuera nulo
            const updateStockQuery = `
                UPDATE materiales
                SET cantidad_existencia = COALESCE(cantidad_existencia, 0) + $1,
                    ultimo_precio_compra = $2
                WHERE id = $3
                RETURNING id;
            `;
            const updateResult = await client.query(updateStockQuery, [cantidad, precio_unitario, id_material]);

            if (updateResult.rowCount === 0) {
                throw new Error(`El material con ID ${id_material} no existe.`);
            }

        } else {
            // B. CASO INSERTAR: Es un material nuevo
            // Validamos campos mínimos para crear material
            if (!nuevo_material.nombre) throw new Error("El nombre es obligatorio para un material nuevo.");

            const insertMaterialQuery = `
                INSERT INTO materiales (
                    codigo, nombre, descripcion, unidad, 
                    cantidad_existencia, -- Stock inicial = lo que compramos
                    precio_costo,        -- Costo inicial = precio de compra
                    ultimo_precio_compra, 
                    activo, creado_en
                ) VALUES ($1, $2, $3, $4, $5, $6, $6, true, NOW())
                RETURNING id;
            `;

            const insertValues = [
                nuevo_material.codigo || null,
                nuevo_material.nombre,
                nuevo_material.descripcion || 'Alta por primera compra',
                nuevo_material.unidad || 'pieza', // Default si falta
                cantidad,          // La cantidad comprada es el stock inicial
                precio_unitario    // El precio de compra es el costo inicial
            ];

            const materialResult = await client.query(insertMaterialQuery, insertValues);
            finalMaterialId = materialResult.rows[0].id; // <--- USAMOS ESTE NUEVO ID
        }

        // ---------------------------------------------------------
        // PASO 2: REGISTRAR LA COMPRA (Cabecera)
        // ---------------------------------------------------------
        const compraInsertQuery = `
            INSERT INTO compras (id_proveedor, fecha_compra, numero_factura, total, recibido, creado_por)
            VALUES ($1, NOW(), $2, $3, true, $4)
            RETURNING id;
        `;
        const compraResult = await client.query(compraInsertQuery, [id_proveedor, numero_factura || null, total, creado_por]);
        const nuevaCompraId = compraResult.rows[0].id;

        // ---------------------------------------------------------
        // PASO 3: REGISTRAR DETALLE DE COMPRA
        // ---------------------------------------------------------
        // (Nota: Eliminamos 'subtotal' del insert si es columna generada)
        const detalleInsertQuery = `
            INSERT INTO compras_detalle (id_compra, id_material, cantidad, precio_unitario)
            VALUES ($1, $2, $3, $4);
        `;
        await client.query(detalleInsertQuery, [nuevaCompraId, finalMaterialId, cantidad, precio_unitario]);

        // ---------------------------------------------------------
        // PASO 4: REGISTRAR MOVIMIENTO DE INVENTARIO
        // ---------------------------------------------------------
        const movimientoInsertQuery = `
            INSERT INTO movimientos_inventario (
                id_material, tipo_movimiento, cantidad, id_compra_relacionada, 
                realizado_por, notas, fecha_movimiento
            )
            VALUES ($1, 'compra'::tipo_movimiento, $2, $3, $4, $5, NOW());
        `;

        // Nota dinámica dependiendo si fue nuevo o existente
        const notaMovimiento = id_material
            ? `Entrada por Compra #${nuevaCompraId}`
            : `Alta inicial y entrada por Compra #${nuevaCompraId}`;

        await client.query(movimientoInsertQuery, [
            finalMaterialId, cantidad, nuevaCompraId, creado_por, notaMovimiento
        ]);

        await client.query('COMMIT'); // CONFIRMAR TRANSACCIÓN

        res.status(201).json({
            message: id_material ? 'Stock actualizado correctamente.' : 'Material creado y stock inicializado.',
            compra_id: nuevaCompraId,
            material_id: finalMaterialId,
            accion: id_material ? 'UPDATE' : 'INSERT'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error transaccional al registrar compra:', err);

        if (err.code === '23503') {
            return res.status(400).json({ error: 'Llave foránea inválida. Proveedor o usuario no existen.' });
        }
        res.status(500).json({ error: `Error interno: ${err.message}` });
    } finally {
        client.release();
    }
});

module.exports = router;