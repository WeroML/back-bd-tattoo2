// /routes/artistas.js
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const router = express.Router();
const saltRounds = 10;

// GET /api/artistas
router.get('/', async (req, res) => {
    const queryText = `
        SELECT 
            a.id, a.biografia, a.especialidades, a.tarifa_hora, a.activo, 
            u.nombre_usuario, u.correo
        FROM artistas a
        JOIN usuarios u ON a.id_usuario = u.id
        ORDER BY u.nombre_usuario ASC
    `;
    try {
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener artistas:', err);
        res.status(500).json({ error: 'Error al consultar la tabla artistas.' });
    }
});

// -------------------------------------------------------------
// POST /api/artistas/registro - Registrar usuario y perfil de artista
// -------------------------------------------------------------
router.post('/registro', async (req, res) => {
    // 1. Desestructurar el cuerpo de la petición (usa la estructura JSON que te proporcioné)
    const { usuario, artista_perfil } = req.body;
    
    // 2. Validaciones básicas
    if (!usuario || !artista_perfil || !usuario.nombre_usuario || !usuario.contrasena || !usuario.correo || !artista_perfil.especialidades) {
        return res.status(400).json({ error: 'Faltan campos obligatorios en el objeto "usuario" o "artista_perfil".' });
    }
    
    // Forzamos el rol del artista a ID 2 (asumiendo que así está configurado en tu tabla roles)
    usuario.id_rol = 2; 

    // Usaremos un cliente de DB para manejar transacciones
    const client = await db.pool.connect(); 

    try {
        // 3. INICIAR TRANSACCIÓN: Asegura que si una parte falla, la otra se revierta (ROLLBACK).
        await client.query('BEGIN');

        // A. Hashear Contraseña
        const hashedPassword = await bcrypt.hash(usuario.contrasena, saltRounds);

        // B. Insertar en USUARIOS y obtener el ID generado
        const userInsertQuery = `
            INSERT INTO usuarios (
                id_rol, nombre_usuario, nombre, apellido, correo, telefono, contrasena_hash, activo
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, TRUE)
            RETURNING id, nombre_usuario; 
        `;
        const userValues = [
            usuario.id_rol,
            usuario.nombre_usuario,
            usuario.nombre || null,
            usuario.apellido || null,
            usuario.correo,
            usuario.telefono || null,
            hashedPassword
        ];
        
        const userResult = await client.query(userInsertQuery, userValues);
        const nuevoUsuarioId = userResult.rows[0].id; // <--- ID GENERADO

        // C. Insertar en ARTISTAS usando el ID del usuario
        const artistaInsertQuery = `
            INSERT INTO artistas (
                id_usuario, biografia, especialidades, tarifa_hora, porcentaje_comision, activo
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id;
        `;
        const artistaValues = [
            nuevoUsuarioId, // <--- Usamos el ID del usuario
            artista_perfil.biografia || null,
            artista_perfil.especialidades,
            artista_perfil.tarifa_hora || null,
            artista_perfil.porcentaje_comision || null,
            artista_perfil.activo === undefined ? true : artista_perfil.activo 
        ];

        await client.query(artistaInsertQuery, artistaValues);

        // 4. CONFIRMAR TRANSACCIÓN: Si todo fue bien, guardar los cambios permanentemente.
        await client.query('COMMIT');

        res.status(201).json({
            message: 'Artista registrado exitosamente.',
            usuario_id: nuevoUsuarioId,
            nombre_usuario: userResult.rows[0].nombre_usuario
        });

    } catch (err) {
        // 5. REVERTIR TRANSACCIÓN: Si algo falló (ej. nombre_usuario duplicado), deshacer ambas inserciones.
        await client.query('ROLLBACK');
        console.error('Error durante el registro del artista:', err);

        // Manejar error de unicidad (nombre_usuario o correo duplicado)
        if (err.code === '23505') { 
            return res.status(409).json({ error: 'El nombre de usuario o correo ya está en uso.' });
        }
        res.status(500).json({ error: 'Error interno del servidor al registrar el artista.' });
    } finally {
        // 6. Liberar el cliente de la base de datos para que regrese al pool
        client.release();
    }
});

module.exports = router;