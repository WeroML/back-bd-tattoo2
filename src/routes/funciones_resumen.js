const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /api/reportes/funciones-resumen
router.get('/funciones-resumen', async (req, res) => {
    // Capturamos el año de la URL, o usamos 2025 por defecto para tus pruebas
    const { anio } = req.query;
    const yearToQuery = anio || 2025; 

    try {
        const queryText = `
            SELECT 
                -- Calculamos el Promedio de Ingresos Mensual
                (
                    SELECT COALESCE(ROUND(AVG(suma_mensual), 2), 0)
                    FROM (
                        SELECT SUM(monto) as suma_mensual
                        FROM pagos
                        -- Filtramos por el año seleccionado (2025)
                        WHERE EXTRACT(YEAR FROM fecha_pago) = $1
                        GROUP BY EXTRACT(MONTH FROM fecha_pago)
                    ) as subquery
                ) AS promedio_ingresos_mensual
        `;

        const result = await pool.query(queryText, [yearToQuery]);
        
        // Convertimos a número para asegurar que el JSON vaya correcto
        const data = result.rows[0] || {};
        res.json({
            promedio_ingresos_mensual: Number(data.promedio_ingresos_mensual || 0)
        });

    } catch (err) {
        console.error('Error en funciones resumen:', err);
        res.status(500).json({ error: 'Error al calcular estadísticas' });
    }
});

module.exports = router;
