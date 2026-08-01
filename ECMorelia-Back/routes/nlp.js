const express = require('express');
const router = express.Router();
const { parseMedicalText } = require('../services/medicalParser');

router.post('/parse', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Texto vacío' });
        }
        console.log('📝 Procesando con parser final...');
        const result = parseMedicalText(text);
        console.log('✅ Extraído:', {
            motivo: result.motivo_urgencia.substring(0, 50),
            lesion: result.descripcion_lesion.substring(0, 50),
            signos: result.signos_vitales,
            glasgow: result.glasgow,
            intervenciones: result.intervenciones.map(i => i.tipo_intervencion)
        });
        res.json(result);
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            error: 'Error al procesar el texto',
            details: error.message
        });
    }
});

module.exports = router;