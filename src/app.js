// RUTA: /src/app.js
const express = require('express');

// Importar rutas
const clientesRouter = require('./routes/clientes');
const artistasRouter = require('./routes/artistas');
const citasRouter = require('./routes/citas');
const inventarioRouter = require('./routes/inventario');
const pagosRouter = require('./routes/pagos');
const sesionesRouter = require('./routes/sesiones');
const citasDisenosRouter = require('./routes/citas_disenos');
const disenosRouter = require('./routes/disenos');
const materialesRouter = require('./routes/materiales');
const usuariosRouter = require('./routes/usuarios');
const proveedoresRouter = require('./routes/proveedores');
const materialesSesionRouter = require('./routes/materiales_sesion');
const comprasRouter = require('./routes/compras');
const movimientosInventarioRouter = require('./routes/movimientos_inventario');

const app = express();

// Middlewares
// lectura en formato JSON
app.use(express.json());

// Definir rutas (Endpoints)
// Todas las rutas de API - prefijo '/api'
app.use('/api/clientes', clientesRouter);
app.use('/api/usuarios', usuariosRouter);
app.use('/api/artistas', artistasRouter);
app.use('/api/citas', citasRouter);
app.use('/api/inventario', inventarioRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/sesiones', sesionesRouter);
app.use('/api/disenos', disenosRouter);
app.use('/api/citas_disenos', citasDisenosRouter);
app.use('/api/materiales', materialesRouter);
app.use('/api/proveedores', proveedoresRouter);
app.use('/api/materiales_sesion', materialesSesionRouter);
app.use('/api/compras', comprasRouter);
app.use('/api/movimientos_inventario', movimientosInventarioRouter);

// Ruta de prueba 
app.get('/', (req, res) => {
    res.send('Tattoo Studio Backend está activo.');
});

module.exports = app;