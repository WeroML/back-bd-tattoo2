// /routes/clientes.js
const express = require('express');
const db = require('../db/index'); // Importa nuestra utilidad de consulta a DB
const router = express.Router();

// 1. GET /api/clientes - Obtener todos los clientes
router.get('/', async (req, res) => {
    try {
        const queryText = `
            SELECT id, nombre, apellido, correo, telefono, fecha_nacimiento 
            FROM clientes 
            ORDER BY id ASC
        `;
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener todos los clientes:', err.message);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});

// 2. GET /api/clientes/:id - Obtener un cliente por su ID
router.get('/:id', async (req, res) => {
    const { id } = req.params; // Capturamos el ID de la URL
    
    // Consulta para obtener la información de cliente, incluyendo datos médicos sensibles
    const queryText = `
        SELECT * FROM clientes 
        WHERE id = $1
    `;
    
    try {
        const result = await db.query(queryText, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cliente no encontrado.' });
        }
        
        res.status(200).json(result.rows[0]);
    } catch (err) {
        console.error(`Error al obtener cliente ${id}:`, err.message);
        res.status(500).json({ error: 'Error interno del servidor.' });
    }
});


module.exports = router;