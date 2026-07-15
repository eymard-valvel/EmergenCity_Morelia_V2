// backend/routes/nlp.js
const express = require('express');
const router = express.Router();
const { parseMedicalText } = require('../services/medicalParser');

router.post('/parse', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Texto vacío' });
        }

        console.log('📝 Procesando texto con parser local...');
        const result = parseMedicalText(text);
        console.log('✅ Datos extraídos:', Object.keys(result));
        res.json(result);
    } catch (error) {
        console.error('❌ Error en NLP:', error);
        res.status(500).json({
            error: 'Error al procesar el texto',
            details: error.message
        });
    }
});

module.exports = router;