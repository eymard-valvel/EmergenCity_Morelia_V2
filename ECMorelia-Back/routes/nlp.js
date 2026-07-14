const express = require('express');
const router = express.Router();
const nlpParser = require('../services/nlpParser');

router.post('/parse', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'Texto vacío' });
    }
    const parsed = nlpParser.parse(text);
    res.json(parsed);
  } catch (error) {
    console.error('Error en NLP:', error);
    res.status(500).json({ error: 'Error al procesar el texto' });
  }
});

module.exports = router;