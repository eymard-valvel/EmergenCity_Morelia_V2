const express = require('express');
const router = express.Router();
const { parseMedicalText } = require('../services/medicalParser');

function normalizarSalidaParaFrontend(parsed, textoOriginal) {
    const texto = (textoOriginal || '').toString();
    const textoNormalizado = texto
        .replace(/\s+/g, ' ')
        .replace(/[.,;](?=\s|$)/g, ',')
        .trim()
        .toLowerCase();

    const secciones = {};

    if (parsed.paciente && (parsed.paciente.nombre || parsed.paciente.edad || parsed.paciente.sexo)) {
        secciones.demografia = {
            nombre: parsed.paciente.nombre || '',
            edad: parsed.paciente.edad === '' ? null : parsed.paciente.edad,
            sexo: parsed.paciente.sexo || ''
        };
    }

    if (parsed.signos_vitales) {
        const sv = {};
        const mapeo = {
            frecuencia_cardiaca: 'frecuencia_cardiaca',
            frecuencia_respiratoria: 'frecuencia_respiratoria',
            tension_arterial: 'tension_arterial',
            saturacion_oxigeno: 'saturacion_oxigeno',
            temperatura: 'temperatura'
        };
        for (const [k, v] of Object.entries(mapeo)) {
            if (parsed.signos_vitales[k] !== undefined && parsed.signos_vitales[k] !== '') {
                if (k === 'temperatura') {
                    const num = parseFloat(parsed.signos_vitales[k]);
                    sv[k] = isNaN(num) ? parsed.signos_vitales[k] : num;
                } else if (k === 'tension_arterial') {
                    sv[k] = parsed.signos_vitales[k];
                } else {
                    const num = parseInt(parsed.signos_vitales[k], 10);
                    sv[k] = isNaN(num) ? parsed.signos_vitales[k] : num;
                }
            }
        }
        if (Object.keys(sv).length > 0) {
            secciones.signos = sv;
        }
    }

    if (parsed.glasgow) {
        const g = {};
        for (const k of ['ocular', 'verbal', 'motor', 'total']) {
            if (parsed.glasgow[k] !== undefined && parsed.glasgow[k] !== null) {
                g[k] = parsed.glasgow[k];
            }
        }
        if (Object.keys(g).length > 0) {
            secciones.glasgow = g;
        }
    }

    if (parsed.motivo_urgencia && parsed.motivo_urgencia.trim()) {
        secciones.motivo = { motivo_urgencia: parsed.motivo_urgencia.trim() };
    }

    if (parsed.descripcion_lesion && parsed.descripcion_lesion.trim()) {
        secciones.lesiones = { descripcion_lesion: parsed.descripcion_lesion.trim() };
    }

    if (Array.isArray(parsed.intervenciones) && parsed.intervenciones.length > 0) {
        secciones.intervenciones = parsed.intervenciones
            .filter(iv => iv && iv.tipo_intervencion)
            .map(iv => ({
                tipo_intervencion: iv.tipo_intervencion,
                descripcion: iv.descripcion || '',
                hora_intervencion: iv.hora_intervencion || ''
            }));
    }

    const seccionesCompletas = [];
    const urgentes = ['motivo', 'signos', 'glasgow', 'lesiones'];
    for (const id of urgentes) {
        const sec = secciones[id];
        if (!sec) continue;
        const tieneDatos = Object.values(sec).some(v =>
            v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0)
        );
        if (tieneDatos) seccionesCompletas.push(id);
    }

    return {
        secciones,
        acciones: [],
        seccionesCompletas,
        textoNormalizado,
        textoOriginal: texto,
        nlpFuentes: ['backend-medicalParser'],
        paciente: parsed.paciente,
        signos_vitales: parsed.signos_vitales,
        glasgow: parsed.glasgow,
        motivo_urgencia: parsed.motivo_urgencia,
        descripcion_lesion: parsed.descripcion_lesion,
        intervenciones: parsed.intervenciones || [],
        hallazgos_escena: parsed.hallazgos_escena || texto
    };
}

router.post('/parse', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text || !text.trim()) {
            return res.status(400).json({ error: 'Texto vacío' });
        }
        console.log('📝 Procesando con parser final...');
        const result = parseMedicalText(text);
        console.log('✅ Extraído:', {
            motivo: result.motivo_urgencia ? result.motivo_urgencia.substring(0, 50) : '',
            lesion: result.descripcion_lesion ? result.descripcion_lesion.substring(0, 50) : '',
            signos: result.signos_vitales,
            glasgow: result.glasgow,
            intervenciones: (result.intervenciones || []).map(i => i.tipo_intervencion)
        });
        const normalizado = normalizarSalidaParaFrontend(result, text);
        res.json(normalizado);
    } catch (error) {
        console.error('❌ Error:', error);
        res.status(500).json({
            error: 'Error al procesar el texto',
            details: error.message
        });
    }
});

module.exports = router;