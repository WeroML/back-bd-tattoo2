const express = require('express');
const db = require('../db');
const router = express.Router();

// -------------------------------------------------------------
// GET /api/reportes/cita/:id
// Obtiene el detalle completo de una cita uniendo 4 tablas.
// Uso: Generación de PDF en el frontend.
// -------------------------------------------------------------
router.get('/cita/:id', async (req, res) => {
    const { id } = req.params;

    const queryText = `
        SELECT 
            -- Datos de la Cita (Tabla 1)
            c.id AS folio,
            c.fecha_programada,
            c.estado,
            c.total_estimado,
            c.notas AS notas_cita,
            
            -- Datos del Cliente (Tabla 2)
            cl.nombre AS cliente_nombre,
            cl.apellido AS cliente_apellido,
            cl.correo AS cliente_correo,
            
            -- Datos del Artista (Tabla 3 + Tabla 4)
            -- Unimos Artistas con Usuarios para sacar el nombre real
            u.nombre AS artista_nombre,
            u.apellido AS artista_apellido,
            a.especialidades AS artista_especialidad

        FROM citas c
        JOIN clientes cl ON c.id_cliente = cl.id
        JOIN artistas a ON c.id_artista = a.id
        JOIN usuarios u ON a.id_usuario = u.id
        
        WHERE c.id = $1;
    `;

    try {
        const result = await db.query(queryText, [id]);
        
        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Cita no encontrada para reporte.' });
        }

        res.status(200).json(result.rows[0]);

    } catch (err) {
        console.error('Error al generar reporte de cita:', err);
        res.status(500).json({ error: 'Error interno al consultar reporte.' });
    }
});

// -------------------------------------------------------------
// GET /api/reportes/dashboard/proximas
// Obtiene las próximas 5 citas urgentes con nombres reales.
// Uso: Widget "Próximas Citas" en el Dashboard.
// -------------------------------------------------------------
router.get('/dashboard/proximas', async (req, res) => {
    const queryText = `
        SELECT 
            c.id,
            c.fecha_programada,
            c.estado,
            -- Concatenamos nombre y apellido del cliente para mostrarlo bonito
            cl.nombre || ' ' || COALESCE(cl.apellido, '') AS cliente_nombre,
            -- Obtenemos nombre del artista desde usuarios
            u.nombre AS artista_nombre
        FROM citas c
        JOIN clientes cl ON c.id_cliente = cl.id
        JOIN artistas a ON c.id_artista = a.id
        JOIN usuarios u ON a.id_usuario = u.id
        
        -- Filtros: Citas futuras o de hoy, que no estén terminadas ni canceladas
        WHERE c.fecha_programada >= CURRENT_DATE
        AND c.estado NOT IN ('completada', 'cancelada')
        
        ORDER BY c.fecha_programada ASC
        LIMIT 5;
    `;

    try {
        const result = await db.query(queryText);
        res.status(200).json(result.rows);
    } catch (err) {
        console.error('Error al obtener reporte de próximas citas:', err);
        res.status(500).json({ error: 'Error interno.' });
    }
});

// -------------------------------------------------------------
// GET /api/reportes/financiero-rollup
// Uso de ROLLUP para generar subtotales por Mes y Totales Generales
// -------------------------------------------------------------
router.get('/financiero-rollup', async (req, res) => {
    try {
        const queryText = `
            SELECT 
                -- Formateamos fecha a 'YYYY-MM' (Mes)
                TO_CHAR(p.fecha_pago, 'YYYY-MM') AS mes,
                
                -- Nombre del artista
                u.nombre_usuario AS artista,
                
                -- Suma de ingresos
                SUM(p.monto) AS total_ingresos,
                
                -- Conteo de citas pagadas
                COUNT(p.id) AS cantidad_citas

            FROM pagos p
            JOIN citas c ON p.id_cita = c.id
            JOIN artistas a ON c.id_artista = a.id
            JOIN usuarios u ON a.id_usuario = u.id
            
            WHERE p.estado = 'pagado'
            
            -- AQUÍ ESTÁ LA MAGIA DEL ROLLUP
            -- Agrupa por Mes y luego por Artista.
            -- Genera:
            -- 1. Filas normales (Mes + Artista)
            -- 2. Subtotales por Mes (Mes + NULL Artista)
            -- 3. Gran Total (NULL Mes + NULL Artista)
            GROUP BY ROLLUP(TO_CHAR(p.fecha_pago, 'YYYY-MM'), u.nombre_usuario)
            
            ORDER BY mes DESC NULLS LAST, artista ASC NULLS LAST;
        `;

        const result = await db.query(queryText);
        res.status(200).json(result.rows);

    } catch (err) {
        console.error('Error en reporte ROLLUP:', err);
        res.status(500).json({ error: 'Error al generar reporte financiero.' });
    }
});

module.exports = router;