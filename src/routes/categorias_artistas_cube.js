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
        u.nombre || ' ' || COALESCE(u.apellido, '') AS artista,
        GROUPING(cat.nombre) AS g_categoria,
        GROUPING(u.nombre || ' ' || COALESCE(u.apellido, '')) AS g_artista,
        COUNT(DISTINCT c.id) AS total_citas,
        COALESCE(SUM(p.monto), 0) AS total_monto
      FROM citas c
      JOIN citas_disenos cd ON cd.id_cita = c.id
      JOIN disenos d ON d.id = cd.id_diseno
      JOIN categorias_disenos cat ON cat.id = d.id_categoria
      JOIN artistas a ON c.id_artista = a.id
      JOIN usuarios u ON a.id_usuario = u.id
      LEFT JOIN pagos p 
        ON p.id_cita = c.id
        AND p.estado = 'pagado'
      -- Si quieres solo citas completadas, descomenta:
      -- WHERE c.estado = 'completada'
      GROUP BY CUBE (
        cat.nombre,
        u.nombre || ' ' || COALESCE(u.apellido, '')
      )
      ORDER BY
        cat.nombre NULLS LAST,
        artista NULLS LAST;
    `;

    const result = await pool.query(query);

    const data = result.rows.map((row) => {
      let tipoFila = 'detalle';
      let categoria = row.categoria;
      let artista = row.artista;

      const gCat = Number(row.g_categoria);
      const gArt = Number(row.g_artista);

      // 1 = columna agrupada (TOTAL a ese nivel)
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
        // Detalle: categoría + artista específicos
        tipoFila = 'detalle';
      }

      return {
        categoria,
        artista,
        tipoFila,
        totalCitas: Number(row.total_citas),
        totalMonto: Number(row.total_monto),
      };
    });

    res.json({
      message: 'Análisis de Categorías vs. Artistas con CUBE',
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
