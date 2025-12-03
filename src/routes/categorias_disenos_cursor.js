// routes/categorias_disenos_cursor.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /categorias_disenos_cursor
// Llama a la función PL/pgSQL cursor_categoria_disenos()
router.get('/categorias_disenos_cursor', async (req, res) => {
  try {
    const query = `
      SELECT *
      FROM cursor_categoria_disenos();
    `;

    const result = await pool.query(query);

    // Normalizamos los nombres para el frontend
    const data = result.rows.map((row) => ({
      categoria: row.categoria,
      totalDisenos: Number(row.total_disenos),
    }));

    res.json({
      ok: true,
      categorias: data,
    });
  } catch (error) {
    console.error('Error en /categorias_disenos_cursor:', error);
    res.status(500).json({
      ok: false,
      message: 'Error al obtener categorías y total de diseños desde el cursor',
      error: error.message,
    });
  }
});

module.exports = router;
