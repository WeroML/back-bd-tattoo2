// /routes/usuarios.js
const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { pool } = require('../db'); // Importar pool directamente
const router = express.Router();

// GET /api/usuarios
router.get('/', async (req, res) => {
    const queryText = `
        SELECT id, nombre_usuario, nombre, apellido, correo, activo, creado_en 
        FROM usuarios 
        ORDER BY id_rol, nombre_usuario ASC
    `;
    try {
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener todos los usuarios:', err);
        res.status(500).json({ error: 'Error al consultar la tabla usuarios.' });
    }
});

// POST /api/usuarios/registro - Crear un nuevo usuario (y artista si id_rol = 2)
router.post('/registro', async (req, res) => {
    const {
        id_rol,
        nombre_usuario,
        nombre,
        apellido,
        correo,
        telefono,
        contrasena_hash,
        // Datos opcionales para artistas (solo si id_rol = 2)
        biografia,
        especialidades,
        tarifa_hora,
        porcentaje_comision
    } = req.body;

    // Validar campos requeridos
    if (!id_rol || !nombre_usuario || !nombre || !apellido || !correo || !contrasena_hash) {
        return res.status(400).json({ 
            error: 'Faltan campos requeridos: id_rol, nombre_usuario, nombre, apellido, correo, contrasena_hash' 
        });
    }

    const client = await pool.connect();

    try {
        await client.query('BEGIN');

        // 1. Insertar usuario
        const insertUsuarioQuery = `
            INSERT INTO usuarios (
                id_rol, nombre_usuario, nombre, apellido, correo, telefono, contrasena_hash, activo
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
            RETURNING *
        `;
        const usuarioResult = await client.query(insertUsuarioQuery, [
            id_rol,
            nombre_usuario,
            nombre,
            apellido,
            correo,
            telefono || null,
            contrasena_hash
        ]);

        const nuevoUsuario = usuarioResult.rows[0];

        // 2. Si el rol es artista (id_rol = 2), insertar en tabla artistas
        let nuevoArtista = null;
        if (parseInt(id_rol) === 2) {
            const insertArtistaQuery = `
                INSERT INTO artistas (
                    id_usuario, biografia, especialidades, tarifa_hora, porcentaje_comision, activo
                ) VALUES ($1, $2, $3, $4, $5, true)
                RETURNING *
            `;
            const artistaResult = await client.query(insertArtistaQuery, [
                nuevoUsuario.id,
                biografia || null,
                especialidades || null,
                tarifa_hora || null,
                porcentaje_comision || null
            ]);
            nuevoArtista = artistaResult.rows[0];
        }

        await client.query('COMMIT');

        // Responder con los datos creados
        res.status(201).json({
            mensaje: 'Usuario creado exitosamente',
            usuario: nuevoUsuario,
            ...(nuevoArtista && { artista: nuevoArtista })
        });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error('Error al crear usuario:', err);
        res.status(500).json({ error: 'Error al crear el usuario.', detalle: err.message });
    } finally {
        client.release();
    }
});

// GET /api/usuarios/roles
router.get('/roles', async (req, res) => {
    const queryText = `
        SELECT id, nombre, descripcion FROM roles ORDER BY id ASC
    `;
    try {
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener roles:', err);
        res.status(500).json({ error: 'Error al consultar la tabla roles.' });
    }
});

// POST /api/usuarios/login - Login de usuario
// /routes/usuarios.js

router.post('/login', async (req, res) => {
    // 1. Capturamos un solo campo como 'identificador' (puede ser usuario o correo)
    const { identificador, contrasena } = req.body;

    // Validación básica: El identificador y la contraseña son obligatorios
    if (!identificador || !contrasena) {
        return res.status(400).json({ error: 'Identificador (usuario o correo) y contraseña son obligatorios.' });
    }

    try {
        // 2. Buscar usuario por nombre de usuario O correo electrónico
        // Usamos el operador OR en la cláusula WHERE para la búsqueda flexible.
        const queryText = `
            SELECT id, nombre_usuario, nombre, apellido, correo, contrasena_hash, id_rol, activo
            FROM usuarios
            WHERE nombre_usuario = $1 OR correo = $1
        `;
        // Nota: Ambos lados de la OR usan $1, ya que solo necesitamos un valor de entrada (identificador)
        const result = await db.query(queryText, [identificador]);

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        const usuario = result.rows[0];

        // 3. Verificar si el usuario está activo
        if (!usuario.activo) {
            return res.status(403).json({ error: 'Usuario inactivo.' });
        }

        // 4. Comparar contraseña con bcrypt
        const passwordMatch = await bcrypt.compare(contrasena, usuario.contrasena_hash);

        if (!passwordMatch) {
            return res.status(401).json({ error: 'Credenciales inválidas.' });
        }

        // 5. Login exitoso - remover hash antes de enviar
        const { contrasena_hash, ...usuarioSinPassword } = usuario;

        res.status(200).json({
            message: 'Login exitoso.',
            usuario: usuarioSinPassword
        });
    } catch (err) {
        console.error('Error en login:', err);
        res.status(500).json({ error: 'Error al procesar el login.' });
    }
});

module.exports = router;