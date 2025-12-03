const express = require('express');
// CORRECCIÓN: Importamos 'pool' correctamente
const { pool } = require('../db'); 
const router = express.Router();

// -------------------------------------------------------------
// GET /api/inventario/materiales
// -------------------------------------------------------------
router.get('/materiales', async (req, res) => {
    try {
        const queryText = `
            SELECT 
                id, 
                codigo, 
                nombre, 
                descripcion, 
                unidad, 
                cantidad_existencia, 
                nivel_reorden, 
                precio_costo, 
                activo, 
                ultimo_precio_compra,  -- Precio sugerido
                ultimo_proveedor_id    -- <--- INDISPENSABLE para autocompletado en compras
            FROM materiales 
            WHERE activo = true 
            ORDER BY nombre ASC;
        `;
        const result = await pool.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener materiales:', err);
        res.status(500).json({ error: 'Error al obtener materiales' });
    }
});

// -------------------------------------------------------------
// GET /api/inventario/inventario-bajo (Reporte de escasez)
// -------------------------------------------------------------
router.get('/inventario-bajo', async (req, res) => {
    try {
        // Consultamos directamente la vista SQL
        const queryText = 'SELECT * FROM vista_materiales_faltantes ORDER BY cantidad_existencia ASC;';
        
        const result = await pool.query(queryText); // Usamos pool.query
        
        res.status(200).json({
            mensaje: result.rowCount > 0 ? 'Se encontraron materiales con stock bajo.' : 'Inventario saludable.',
            total_items: result.rowCount,
            materiales: result.rows
        });

    } catch (err) {
        console.error('Error al obtener reporte de inventario bajo:', err);
        res.status(500).json({ error: 'Error interno al generar el reporte.' });
    }
});

// -------------------------------------------------------------
// GET /api/inventario/compras
// -------------------------------------------------------------
router.get('/compras', async (req, res) => {
    const queryText = `
        SELECT id, id_proveedor, fecha_compra, numero_factura, total, recibido 
        FROM compras 
        ORDER BY fecha_compra DESC
    `;
    try {
        const result = await pool.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener compras:', err);
        res.status(500).json({ error: 'Error al consultar la tabla compras.' });
    }
});

// -------------------------------------------------------------
// POST /api/inventario/materiales (Crear productos nuevos)
// -------------------------------------------------------------
router.post('/materiales', async (req, res) => {
    const { nombre, codigo, cantidad_existencia, nivel_reorden, precio_costo } = req.body;
    
    // Validación simple
    if (!nombre || !codigo) {
        return res.status(400).json({ error: 'Nombre y Código son obligatorios' });
    }

    try {
        const query = `
            INSERT INTO materiales (nombre, codigo, cantidad_existencia, nivel_reorden, precio_costo, activo, creado_en) 
            VALUES ($1, $2, $3, $4, $5, true, NOW()) 
            RETURNING *
        `;
        const values = [
            nombre, 
            codigo, 
            cantidad_existencia || 0, 
            nivel_reorden || 5, 
            precio_costo || 0
        ];
        
        const result = await pool.query(query, values);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Error al crear material:', err);
        // Manejo de duplicados (código único)
        if (err.code === '23505') {
            return res.status(409).json({ error: 'El código de material ya existe.' });
        }
        res.status(500).json({ error: err.message });
    }
});

// -------------------------------------------------------------
// GET /api/inventario/materiales/:id - Obtener material por ID
// -------------------------------------------------------------
router.get('/materiales/:id', async (req, res) => {
    const { id } = req.params;
    
    // Validación de ID numérico
    if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

    const queryText = `SELECT * FROM materiales WHERE id = $1`;
    
    try {
        const result = await pool.query(queryText, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Material no encontrado.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener material por ID:', err);
        res.status(500).json({ error: 'Error al consultar el material.' });
    }
});

// -------------------------------------------------------------
// GET /api/inventario/materiales/codigo/:codigo
// -------------------------------------------------------------
router.get('/materiales/codigo/:codigo', async (req, res) => {
    const { codigo } = req.params;
    const queryText = `SELECT * FROM materiales WHERE codigo = $1`;
    
    try {
        const result = await pool.query(queryText, [codigo]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Material no encontrado.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error al obtener material por código:', err);
        res.status(500).json({ error: 'Error al consultar el material.' });
    }
});

// -------------------------------------------------------------
// PUT /api/inventario/materiales/:id - Actualizar material
// -------------------------------------------------------------
router.put('/materiales/:id', async (req, res) => {
    const { id } = req.params;
    const { nombre, codigo, cantidad_existencia, nivel_reorden, precio_costo, activo } = req.body;

    const fields = [];
    const values = [];
    let paramIndex = 1;

    if (nombre !== undefined) { fields.push(`nombre = $${paramIndex++}`); values.push(nombre); }
    if (codigo !== undefined) { fields.push(`codigo = $${paramIndex++}`); values.push(codigo); }
    if (cantidad_existencia !== undefined) { fields.push(`cantidad_existencia = $${paramIndex++}`); values.push(cantidad_existencia); }
    if (nivel_reorden !== undefined) { fields.push(`nivel_reorden = $${paramIndex++}`); values.push(nivel_reorden); }
    if (precio_costo !== undefined) { fields.push(`precio_costo = $${paramIndex++}`); values.push(precio_costo); }
    if (activo !== undefined) { fields.push(`activo = $${paramIndex++}`); values.push(activo); }

    if (fields.length === 0) {
        return res.status(400).json({ error: 'No se proporcionaron campos para actualizar.' });
    }

    values.push(id);
    const queryText = `
        UPDATE materiales
        SET ${fields.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
    `;

    try {
        const result = await pool.query(queryText, values);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Material no encontrado.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error('Error al actualizar material:', err);
        res.status(500).json({ error: 'Error al actualizar el material.' });
    }
});

// -------------------------------------------------------------
// DELETE /api/inventario/materiales/:id - Eliminar material (Soft Delete)
// -------------------------------------------------------------
router.delete('/materiales/:id', async (req, res) => {
    const { id } = req.params;
    const queryText = 'UPDATE materiales SET activo = false WHERE id = $1 RETURNING id';

    try {
        const result = await pool.query(queryText, [id]);
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Material no encontrado.' });
        }
        res.status(200).json({ message: 'Material desactivado exitosamente.' });
    } catch (err) {
        console.error('Error al eliminar material:', err);
        res.status(500).json({ error: 'Error al eliminar el material.' });
    }
});

// -------------------------------------------------------------
// GET /api/inventario/reporte-proveedores
// -------------------------------------------------------------
router.get('/reporte-proveedores', async (req, res) => {
  try {
    const query = `
      SELECT 
        p.nombre AS proveedor,
        COUNT(DISTINCT m.id) AS variedad_productos,
        COALESCE(SUM(cd.cantidad), 0) AS total_unidades_compradas,
        MAX(c.fecha_compra) AS ultima_compra
      FROM proveedores p
      JOIN compras c ON p.id = c.id_proveedor
      JOIN compras_detalle cd ON c.id = cd.id_compra
      JOIN materiales m ON cd.id_material = m.id
      GROUP BY p.nombre
      ORDER BY total_unidades_compradas DESC;
    `;
    
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error('Error en reporte proveedores:', err);
    res.status(500).json({ error: 'Error al generar reporte agrupado.' });
  }
});

module.exports = router;