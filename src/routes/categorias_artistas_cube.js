// src/routes/categorias_artistas_cube.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/categorias_artistas_cube
router.get('/categorias_artistas_cube', async (req, res) => {
  try {
    const query = `
      SELECT
        cat.nombre AS categoria,
        MIN(u.nombre || ' ' || COALESCE(u.apellido, '')) AS artista,
        GROUPING(cat.nombre) AS g_categoria,
        GROUPING(a.id) AS g_artista,
        COUNT(d.id) AS total_disenos,
        COALESCE(SUM(d.precio_base), 0) AS total_precio
      FROM disenos d
      LEFT JOIN categorias_disenos cat ON cat.id = d.id_categoria
      LEFT JOIN artistas a ON a.id = d.creado_por
      LEFT JOIN usuarios u ON u.id = a.id_usuario
      GROUP BY CUBE (cat.nombre, a.id)
      ORDER BY
        cat.nombre NULLS LAST,
        MIN(u.nombre || ' ' || COALESCE(u.apellido, '')) NULLS LAST;
    `;

    const result = await pool.query(query);

    const data = result.rows.map((row) => {
      const gCat = Number(row.g_categoria);
      const gArt = Number(row.g_artista);

      let tipoFila = 'detalle';
      let categoria = row.categoria;
      let artista = row.artista;

      // 1 = es un TOTAL en ese nivel
      if (gCat === 1 && gArt === 1) {
        // TOTAL GENERAL
        tipoFila = 'total_general';
        categoria = 'TODAS LAS CATEGORÍAS';
        artista = 'TODOS LOS ARTISTAS';
      } else if (gCat === 1 && gArt === 0) {
        // TOTAL POR ARTISTA (todas las categorías)
        tipoFila = 'total_artista';
        categoria = 'TODAS LAS CATEGORÍAS';
      } else if (gCat === 0 && gArt === 1) {
        // TOTAL POR CATEGORÍA (todos los artistas)
        tipoFila = 'total_categoria';
        artista = 'TODOS LOS ARTISTAS';
      } else {
        // Detalle normal
        tipoFila = 'detalle';
      }

      return {
        categoria,
        artista,
        tipoFila,
        totalDisenos: Number(row.total_disenos),
        totalPrecio: Number(row.total_precio),
      };
    });

    res.json({
      message: 'Análisis de Categorías vs Artistas con CUBE (diseños)',
      data,
    });
  } catch (error) {
    console.error('Error en /api/categorias_artistas_cube:', error);
    res.status(500).json({
      message: 'Error al obtener el análisis de categorías vs artistas (CUBE)',
      error: error.message,
    });
  }
});

module.exports = router;
