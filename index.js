require('dotenv').config(); 
const app = require('./src/app'); // Importamos la app ya configurada
const { pool } = require('./src/db/index'); // Conexión a DB

const port = process.env.PORT || 3000;

// Verificar conexión a DB antes de arrancar
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Error al conectar con la Base de Datos:', err);
    } else {
        console.log('✅ Base de Datos conectada:', res.rows[0].now);
        
        // Arrancar el servidor solo si la DB responde
        app.listen(port, () => {
            console.log(`🚀 Servidor Express listo en http://localhost:${port}`);
            console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
        });
    }
});