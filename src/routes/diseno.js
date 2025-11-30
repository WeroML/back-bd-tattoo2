// /routes/disenos.js

const express = require('express');
const db = require('../db');
const router = express.Router();

// /routes/disenos.js (Añade esta ruta a tu archivo existente)

// -------------------------------------------------------------
// GET /api/disenos - Obtener el catálogo completo de diseños
// -------------------------------------------------------------
router.get('/', async (req, res) => {
    // Consulta para obtener diseños, uniendo con categorías para el nombre
    const queryText = `
        SELECT 
            d.id, 
            d.titulo, 
            d.descripcion, 
            d.url_imagen, 
            d.complejidad, 
            d.precio_base, 
            d.creado_por,
            d.creado_en,
            c.nombre AS nombre_categoria
        FROM disenos d
        JOIN categorias_disenos c ON d.id_categoria = c.id
        ORDER BY d.creado_en DESC;
    `;

    try {
        const result = await db.query(queryText);

        // Si no hay diseños, devuelve una lista vacía
        if (result.rows.length === 0) {
            return res.status(200).json([]);
        }

        res.status(200).json(result.rows);

    } catch (err) {
        console.error('Error al obtener el catálogo de diseños:', err);
        res.status(500).json({ error: 'Error interno del servidor al consultar diseños.' });
    }
});

// -------------------------------------------------------------
// GET /api/disenos/:id - Obtener un diseño por su ID
// -------------------------------------------------------------
router.get('/:id', async (req, res) => {
    const { id } = req.params;

    const queryText = `
        SELECT 
            d.id, d.titulo, d.descripcion, d.url_imagen, d.complejidad, 
            d.precio_base, d.creado_por, d.creado_en, c.nombre AS nombre_categoria
        FROM disenos d
        JOIN categorias_disenos c ON d.id_categoria = c.id
        WHERE d.id = $1;
    `;

    try {
        const result = await db.query(queryText, [id]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Diseño no encontrado.' });
        }

        res.status(200).json(result.rows[0]);

    } catch (err) {
        console.error(`Error al obtener diseño con ID ${id}:`, err);
        res.status(500).json({ error: 'Error al consultar el diseño específico.' });
    }
});

// -------------------------------------------------------------
// POST /api/disenos - Crear un nuevo diseño
// -------------------------------------------------------------
router.post('/', async (req, res) => {
    // 1. Desestructurar los datos de la petición
    const {
        titulo,
        descripcion,
        id_categoria,
        url_imagen,
        complejidad,
        precio_base,
        creado_por // Puede ser null si es un diseño provisional
    } = req.body;

    // 2. Validación básica
    if (!titulo || !id_categoria || !precio_base) {
        return res.status(400).json({ error: 'El título, la categoría y el precio base son obligatorios.' });
    }

    // 3. Consulta de inserción
    // Usamos $7 para 'creado_por' y NOW() para 'creado_en' (si se proporciona 'creado_por', si no, será NULL)
    const insertQuery = `
        INSERT INTO disenos (
            titulo, descripcion, id_categoria, url_imagen, complejidad, 
            precio_base, creado_por, creado_en
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
        RETURNING id, titulo, creado_por;
    `;

    const values = [
        titulo,
        descripcion || null,
        id_categoria,
        url_imagen || null,
        complejidad || 1, // Complejidad mínima por defecto
        precio_base,
        creado_por || null // Puede ser NULL, permitiendo el registro
    ];

    try {
        // 4. Ejecutar la inserción
        const result = await db.query(insertQuery, values);

        res.status(201).json({
            message: 'Diseño creado con éxito.',
            diseno: result.rows[0]
        });

    } catch (err) {
        console.error('Error al crear diseño:', err);
        if (err.code === '23503') {
            return res.status(400).json({ error: 'Llave foránea inválida. La categoría o el usuario creador no existen.' });
        }
        res.status(500).json({ error: 'Error interno del servidor al registrar el diseño.' });
    }
});

module.exports = router;