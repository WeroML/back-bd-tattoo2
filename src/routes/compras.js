const express = require('express');
const { pool } = require('../db');
const router = express.Router();


// ----------------------------------------------------------------------
// POST /api/compras/registrar
// ----------------------------------------------------------------------
router.post('/registrar', async (req, res) => {
    const { 
        id_proveedor, 
        numero_factura, 
        total 
    } = req.body;

    // CORRECCIÓN: Si no envían usuario, usamos 21 (Admin) en lugar de 1
    const creado_por = req.body.creado_por || 21; 

    const { 
        id_material,      
        nuevo_material,   
        cantidad, 
        precio_unitario 
    } = req.body.detalle || {};

    // Validación básica
    if (!id_proveedor || !total || !cantidad || !precio_unitario) {
        return res.status(400).json({ error: 'Faltan datos obligatorios de la compra.' });
    }
    // Debe venir un ID o un objeto para crear
    if (!id_material && !nuevo_material) {
        return res.status(400).json({ error: 'Debes proporcionar un id_material o datos para nuevo_material.' });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN'); // INICIAR TRANSACCIÓN

        // ---------------------------------------------------------
        // PASO 1: GESTIÓN DEL MATERIAL (Actualizar o Crear)
        // ---------------------------------------------------------
        let finalMaterialId = id_material;

        if (id_material) {
            // A. CASO ACTUALIZAR (Material Existente)
            // Actualizamos precios y último proveedor. NO tocamos cantidad (el trigger lo hará).
            const updateMaterialQuery = `
                UPDATE materiales
                SET ultimo_precio_compra = $1,
                    ultimo_proveedor_id = $2
                WHERE id = $3
                RETURNING id;
            `;
            const updateResult = await client.query(updateMaterialQuery, [
                precio_unitario, 
                id_proveedor, 
                id_material
            ]);
            
            if (updateResult.rowCount === 0) {
                throw new Error(`El material con ID ${id_material} no existe.`);
            }

        } else {
            // B. CASO INSERTAR (Material Nuevo)
            if (!nuevo_material?.nombre) throw new Error("Nombre obligatorio para nuevo material.");

            const insertMaterialQuery = `
                INSERT INTO materiales (
                    codigo, nombre, descripcion, unidad, 
                    cantidad_existencia, -- IMPORTANTE: Iniciamos en 0, el trigger sumará la compra
                    precio_costo,        -- Costo inicial
                    ultimo_precio_compra, 
                    ultimo_proveedor_id,
                    activo, creado_en
                ) VALUES ($1, $2, $3, $4, 0, $5, $5, $6, true, NOW()) 
                RETURNING id;
            `;
            
            const insertValues = [
                nuevo_material.codigo || null,
                nuevo_material.nombre,
                nuevo_material.descripcion || 'Alta por primera compra',
                nuevo_material.unidad || 'pieza',
                precio_unitario,   // precio_costo inicial
                id_proveedor       // ultimo_proveedor_id
            ];

            const materialResult = await client.query(insertMaterialQuery, insertValues);
            finalMaterialId = materialResult.rows[0].id;
        }

        // ---------------------------------------------------------
        // PASO 2: REGISTRAR COMPRA (Cabecera)
        // ---------------------------------------------------------
        const insertCompraQuery = `
            INSERT INTO compras (id_proveedor, fecha_compra, numero_factura, total, recibido, creado_por)
            VALUES ($1, NOW(), $2, $3, true, $4)
            RETURNING id;
        `;
        const compraResult = await client.query(insertCompraQuery, [
            id_proveedor, 
            numero_factura, 
            total, 
            creado_por
        ]);
        const nuevaCompraId = compraResult.rows[0].id;

        // ---------------------------------------------------------
        // PASO 3: REGISTRAR DETALLE
        // ---------------------------------------------------------
        const insertDetalleQuery = `
            INSERT INTO compras_detalle (id_compra, id_material, cantidad, precio_unitario)
            VALUES ($1, $2, $3, $4);
        `;
        await client.query(insertDetalleQuery, [nuevaCompraId, finalMaterialId, cantidad, precio_unitario]);

        // ---------------------------------------------------------
        // PASO 4: MOVIMIENTO INVENTARIO (Trigger actualizará stock)
        // ---------------------------------------------------------
        const insertMovimientoQuery = `
            INSERT INTO movimientos_inventario (
                id_material, tipo_movimiento, cantidad, id_compra_relacionada, realizado_por, notas, fecha_movimiento
            )
            VALUES ($1, 'compra'::tipo_movimiento, $2, $3, $4, $5, NOW());
        `;
        
        const notasMovimiento = id_material 
            ? `Entrada por Compra #${nuevaCompraId}` 
            : `Alta inicial y entrada por Compra #${nuevaCompraId}`;

        await client.query(insertMovimientoQuery, [
            finalMaterialId, 
            cantidad, 
            nuevaCompraId, 
            creado_por, 
            notasMovimiento
        ]);

        await client.query('COMMIT');

        res.status(201).json({
            message: 'Compra registrada. Proveedor y precio actualizados en el material.',
            compra_id: nuevaCompraId,
            material_id: finalMaterialId
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error transaccional en compra:', err);
        
        if (err.code === '23503') {
             return res.status(400).json({ error: `Llave foránea inválida. Verifica que el proveedor (${id_proveedor}) o el usuario creador (${creado_por}) existan.` });
        }
        res.status(500).json({ error: `Error interno: ${err.message}` });
    } finally {
        client.release();
    }
});

module.exports = router;

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