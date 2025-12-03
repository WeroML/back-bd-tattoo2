// RUTA: /src/app.js
const express = require('express');
const cors = require('cors'); // <--- 1. AGREGAR ESTA IMPORTACIÓN

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
const reportesRouter = require('./routes/reportes');
const funcionesResumenRoutes = require('./routes/funciones_resumen');
const artistasCitasSecuenciaRouter = require('./routes/artistas_citas_secuencia');
const categoriasArtistasCubeRouter = require('./routes/categorias_artistas_cube');
const categoriasRouter = require('./routes/categorias');
const app = express();

// Middlewares
// lectura en formato JSON
app.use(cors()); // <--- 2. AGREGAR ESTO AQUÍ (Antes de las rutas y del json)
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
app.use('/api/reportes', reportesRouter);
app.use('/api', funcionesResumenRoutes);
app.use('/api', artistasCitasSecuenciaRouter);
app.use('/api', categoriasArtistasCubeRouter);
app.use('/api/categorias', categoriasRouter);

// Ruta de prueba 
app.get('/', (req, res) => {
    res.send('Tattoo Studio Backend está activo.');
});

module.exports = app;