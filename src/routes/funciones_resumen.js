const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// GET /funciones_resumen
router.get('/funciones_resumen', async (req, res) => {
	try {

		// SUM → Ingresos Anuales
        const querySum = `
            SELECT 
                COALESCE(SUM(monto), 0) AS total_ingresos_anuales
            FROM pagos
            WHERE estado = 'pagado'
            AND date_trunc('year', fecha_pago) = date_trunc('year', now());
        `;

		// AVG → Promedio de Pago Anual
        const queryAvg = `
            SELECT 
                COALESCE(AVG(monto), 0) AS promedio_pago_anual
            FROM pagos
            WHERE estado = 'pagado'
            AND date_trunc('year', fecha_pago) = date_trunc('year', now());
        `;

		// DECODE / CASE → Clasificación de pagos por monto
        const queryDecode = `
            SELECT
                CASE
                    WHEN monto >= 5000 THEN 'alto'
                    WHEN monto BETWEEN 1000 AND 4999 THEN 'medio'
                    ELSE 'bajo'
                END AS categoria,
                COUNT(*) AS cantidad
            FROM pagos
            WHERE estado = 'pagado'
            GROUP BY categoria
            ORDER BY categoria;
        `;

		// Ejecutar procesamientos en paralelo
		const [sumResult, avgResult, decodeResult] = await Promise.all([
			pool.query(querySum),
			pool.query(queryAvg),
			pool.query(queryDecode),
		]);

		// Respuesta final
		res.json({
			sum: {
				totalIngresosAnuales: Number(sumResult.rows[0].total_ingresos_anuales)
			},
			avg: {
				promedioPagoAnual: Number(avgResult.rows[0].promedio_pago_anual)
			},
			decode: {
				clasificacionPagos: decodeResult.rows.map(r => ({
					categoria: r.categoria,
					cantidad: Number(r.cantidad)
				}))
			}
		});

	} catch (error) {
		console.error('Error en /funciones_resumen:', error);
		res.status(500).json({
			message: 'Error al obtener funciones del resumen',
			error: error.message
		});
	}
});

module.exports = router;
