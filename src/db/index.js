// /db/index.js
const { Pool } = require('pg');

// Las variables de entorno ya deben estar cargadas por index.js

const isProduction = process.env.NODE_ENV === 'production';

// --- CONFIGURACIÓN AJUSTADA PARA USAR VARIABLES INDIVIDUALES DEL .ENV ---
const connectionConfig = {
    // Lectura directa de las variables individuales
    user: process.env.PGUSER,
    host: process.env.PGHOST,
    database: process.env.PGDATABASE, // Asegúrate de tener PGDATABASE en tu .env
    password: process.env.PGPASSWORD, // Asegúrate de tener PGPASSWORD en tu .env
    port: process.env.PGPORT || 5432, // Puerto por defecto es 5432

    // Configuración SSL/TLS requerida para Render (producción)
    ssl: isProduction ? {
        rejectUnauthorized: false
    } : false,
};
// ------------------------------------------------------------------------

// Crea el Pool de Conexiones
const pool = new Pool(connectionConfig);

// Prueba de conexión y manejo de errores (útil para depuración)
pool.on('connect', () => {
    console.log('✅ Conectado a la base de datos PostgreSQL usando credenciales separadas.');
});

pool.on('error', (err) => {
    console.error('❌ Error fatal en el pool de la DB:', err);
    // Si la conexión falla al inicio, puedes forzar la salida para revisar la configuración.
    // process.exit(-1);
});

// Exportar el pool y la función query
module.exports = {
    query: (text, params) => pool.query(text, params),
    pool,
};