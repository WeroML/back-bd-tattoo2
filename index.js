// index.js
require('dotenv').config(); // ⬅️ Cargamos las variables de .env primero
const app = require('./src/app');

// Importamos el pool de la DB solo para asegurar que se inicialice y se conecte.
// (La función query del pool ya se importa en las rutas)
const { pool } = require('./src/db/index'); // (Puedes comentar esta línea si no necesitas el pool aquí)

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Servidor Express listo en http://localhost:${port}`);
    console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
});