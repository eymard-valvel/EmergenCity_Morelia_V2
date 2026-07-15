const express = require('express');
const router = express.Router();
const { extractMedicalEntities } = require('../services/huggingFaceNLP');

router.post('/parse', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Texto vacío' });
        }

        console.log('📝 Procesando texto con Hugging Face API...');
        const result = await extractMedicalEntities(text);
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