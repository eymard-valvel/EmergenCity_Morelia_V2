// backend/routes/nlp.js
const express = require('express');
const router = express.Router();
const { parseMedicalText } = require('../services/localMedicalNER');

router.post('/parse', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Texto vacío' });
        }

        console.log('📝 Procesando texto con NER local...');
        const startTime = Date.now();
        
        const result = await parseMedicalText(text);
        
        const elapsed = Date.now() - startTime;
        console.log(`✅ Procesado en ${elapsed}ms`);
        
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