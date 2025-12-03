// src/routes/artistas_citas_secuencia.js
const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/artistas_citas_secuencia
router.get('/artistas_citas_secuencia', async (req, res) => {
  try {
    const query = `
      SELECT
        nextval('seq_artista_cita') AS consecutivo,
        a.id AS id_artista,
        u.nombre || ' ' || COALESCE(u.apellido, '') AS nombre_artista,
        c.id AS id_cita,
        c.fecha_programada,
        c.estado
      FROM citas c
      JOIN artistas a ON c.id_artista = a.id
      JOIN usuarios u ON a.id_usuario = u.id
      ORDER BY a.id, c.fecha_programada;
    `;

    const result = await pool.query(query);

    const data = result.rows.map((row) => ({
      consecutivo: Number(row.consecutivo),
      idArtista: Number(row.id_artista),
      nombreArtista: row.nombre_artista,
      idCita: Number(row.id_cita),
      fechaProgramada: row.fecha_programada,
      estado: row.estado,
    }));

    res.json({
      message: 'Listado de artistas y sus citas con secuencia generada',
      data,
    });
  } catch (error) {
    console.error('Error en /api/artistas_citas_secuencia:', error);
    res.status(500).json({
      message: 'Error al obtener artistas y citas con secuencia',
      error: error.message,
    });
  }
});

module.exports = router;
