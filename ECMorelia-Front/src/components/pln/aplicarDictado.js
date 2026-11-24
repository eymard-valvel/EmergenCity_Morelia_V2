const vacio = (v) => v === '' || v === null || v === undefined;
const mismo = (a, b) => String(a ?? '') === String(b ?? '');
const leer = (obj, ruta) => ruta.reduce((o, k) => (o === null || o === undefined ? undefined : o[k]), obj);
const normTxt = (s) => String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const PALABRAS_HOSPITAL_IGNORADAS = new Set(['hospital', 'de', 'del', 'la', 'el', 'los', 'las', 'clinica', 'centro', 'medico', 'unidad']);

function componer(base, nuevo) {
  if (!base) return nuevo;
  const nb = normTxt(base);
  const nn = normTxt(nuevo);
  if (nb.includes(nn)) return base;
  if (nn.includes(nb)) return nuevo;
  return /[.;:]$/.test(base.trim()) ? `${base.trim()} ${nuevo}` : `${base.trim()}. ${nuevo}`;
}

function emparejarHospital(texto, hospitales) {
  if (!texto || !Array.isArray(hospitales) || hospitales.length === 0) return null;
  const tokens = normTxt(texto)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !PALABRAS_HOSPITAL_IGNORADAS.has(t));
  if (tokens.length === 0) return null;
  const candidatos = hospitales.filter((h) => {
    const nombre = normTxt(h.nombre || '');
    return tokens.every((t) => nombre.includes(t));
  });
  if (candidatos.length === 1) return candidatos[0].id;
  return null;
}

function claveIntervencion(i, n) {
  if (i.clave === 'medicacion') return `med:${normTxt(i.descripcion).replace(/[\d.].*$/, '').trim()}#${n}`;
  return `${i.clave || normTxt(i.tipo_intervencion)}#${n}`;
}

export function aplicarCambios(reporte, cambios, nuevas) {
  const r = { ...reporte };
  for (const { ruta, valor } of cambios) {
    let actual = r;
    for (let i = 0; i < ruta.length - 1; i++) {
      const k = ruta[i];
      actual[k] = Array.isArray(actual[k]) ? [...actual[k]] : { ...actual[k] };
      actual = actual[k];
    }
    actual[ruta[ruta.length - 1]] = valor;
  }
  if (nuevas && nuevas.length) r.intervenciones = [...(r.intervenciones || []), ...nuevas];
  return r;
}

export function aplicarDictado(reporte, secciones, estado, opciones) {
  const { sesion, hora, ahora, hospitales, hospitalBloqueado } = opciones;
  if (estado.sesion !== sesion) {
    estado.sesion = sesion;
    estado.campos = {};
    estado.glasgow = '';
    estado.interv = new Map();
  }

  const cambios = [];

  const poner = (ruta, nuevo, tipo = 'valor') => {
    if (vacio(nuevo)) return;
    const clave = ruta.join('.');
    const actual = leer(reporte, ruta);

    if (tipo === 'texto') {
      if (!estado.campos[clave]) estado.campos[clave] = { base: vacio(actual) ? '' : String(actual), aplicado: null };
      const rec = estado.campos[clave];
      if (rec.aplicado !== null && !mismo(actual, rec.aplicado)) return;
      const compuesto = componer(rec.base, nuevo);
      if (!mismo(actual, compuesto)) cambios.push({ ruta, valor: compuesto });
      rec.aplicado = compuesto;
      return;
    }

    const rec = estado.campos[clave];
    if (tipo === 'vacio' && !rec && !vacio(actual)) return;
    if (tipo === 'una_vez' && rec) return;
    if (rec && !mismo(actual, rec.aplicado)) return;
    if (!mismo(actual, nuevo)) cambios.push({ ruta, valor: nuevo });
    estado.campos[clave] = { aplicado: nuevo };
  };

  const s = secciones.signos;
  if (s) {
    const antes = cambios.length;
    poner(['seccionI', 'fc'], s.frecuencia_cardiaca);
    poner(['seccionI', 'fr'], s.frecuencia_respiratoria);
    poner(['seccionI', 'ta'], s.tension_arterial);
    poner(['seccionI', 'pam'], s.pam);
    poner(['seccionI', 'spo2'], s.saturacion_oxigeno);
    poner(['seccionI', 'temp'], s.temperatura);
    poner(['seccionI', 'glucemia'], s.glucemia);
    poner(['seccionI', 'eva'], s.eva);
    if (cambios.length > antes) poner(['seccionI', 'hora_toma'], hora);
  }

  const d = secciones.demografia;
  if (d) {
    poner(['seccionD', 'nombre'], d.nombre);
    poner(['seccionD', 'edad'], d.edad);
    poner(['seccionD', 'sexo'], d.sexo);
    poner(['seccionD', 'peso'], d.peso);
    poner(['seccionD', 'telefono'], d.telefono);
    poner(['seccionD', 'acompanante'], d.acompanante);
    poner(['seccionD', 'paciente_identificado'], d.paciente_identificado);
  }

  if (secciones.motivo) {
    poner(['seccionF', 'motivo_principal'], secciones.motivo.motivo_urgencia, 'texto');
    poner(['seccionF', 'tipo_urgencia'], secciones.motivo.tipo_urgencia, 'vacio');
  }
  if (secciones.mecanismo) poner(['seccionG', 'mecanismo'], secciones.mecanismo.mecanismo, 'texto');
  if (secciones.lesiones) poner(['seccionH', 'lesiones_exposicion'], secciones.lesiones.descripcion_lesion, 'texto');

  const ev = secciones.evaluacion;
  if (ev) {
    poner(['seccionH', 'via_aerea'], ev.via_aerea);
    poner(['seccionH', 'ventilacion'], ev.ventilacion);
    poner(['seccionH', 'circulacion_pulso'], ev.circulacion_pulso);
  }

  const ex = secciones.exploracion;
  if (ex) for (const k of ['cabeza', 'torax', 'abdomen', 'extremidades']) poner(['seccionK', k], ex[k], 'texto');

  const an = secciones.antecedentes;
  if (an) {
    poner(['seccionE', 'alergias'], an.alergias, 'texto');
    poner(['seccionE', 'medicamentos'], an.medicamentos, 'texto');
    poner(['seccionE', 'enfermedades'], an.enfermedades, 'texto');
    poner(['seccionE', 'ultima_comida'], an.ultima_comida);
    poner(['seccionE', 'embarazo'], an.embarazo);
  }

  if (secciones.tiempos) for (const [campo, valor] of Object.entries(secciones.tiempos)) poner(['seccionB', campo], valor);

  if (secciones.diagnostico) {
    poner(['seccionN', 'diagnostico_presuntivo'], secciones.diagnostico.diagnostico_presuntivo, 'texto');
    poner(['seccionN', 'necesidades'], secciones.diagnostico.necesidades, 'texto');
  }

  let hospitalId = null;
  const dest = secciones.destino;
  if (dest) {
    if (dest.eta_hora) poner(['seccionN', 'eta'], dest.eta_hora, 'una_vez');
    else if (dest.eta_minutos) {
      const t = new Date(ahora.getTime() + dest.eta_minutos * 60000);
      poner(['seccionN', 'eta'], `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`, 'una_vez');
    }
    poner(['seccionOP', 'area_receptora'], dest.area_receptora);
    poner(['seccionOP', 'estado_final'], dest.estado_final);
    poner(['seccionOP', 'medico_recibe'], dest.medico_recibe);
    if (dest.texto && !hospitalBloqueado) hospitalId = emparejarHospital(dest.texto, hospitales);
  }

  if (secciones.escena) poner(['riesgos_escena'], secciones.escena.riesgos_escena, 'vacio');

  const existentes = reporte.intervenciones || [];
  const nuevas = [];
  if (Array.isArray(secciones.intervenciones)) {
    const conteo = {};
    for (const i of secciones.intervenciones) {
      const base = claveIntervencion(i, 0).replace(/#0$/, '');
      conteo[base] = (conteo[base] || 0) + 1;
      const llave = `${base}#${conteo[base]}`;
      const previo = estado.interv.get(llave);

      if (previo) {
        if (!mismo(previo.descripcion, i.descripcion) && i.descripcion) {
          const idx = existentes.findIndex((e) => (e.clave || '') === i.clave && mismo(e.descripcion, previo.descripcion));
          if (idx >= 0) cambios.push({ ruta: ['intervenciones', idx, 'descripcion'], valor: i.descripcion });
          previo.descripcion = i.descripcion;
        }
        continue;
      }

      const repetida = existentes.some(
        (e) => (e.clave || normTxt(e.tipo_intervencion)) === (i.clave || normTxt(i.tipo_intervencion)) && normTxt(e.descripcion || '') === normTxt(i.descripcion || '')
      );
      estado.interv.set(llave, { descripcion: i.descripcion });
      if (repetida) continue;
      nuevas.push({
        clave: i.clave,
        tipo_intervencion: i.tipo_intervencion,
        descripcion: i.descripcion || '',
        hora_intervencion: i.hora_intervencion || hora
      });
    }
  }

  let glasgow = null;
  const g = secciones.glasgow;
  if (g && g.ocular && g.verbal && g.motor) {
    const llave = `${g.ocular}-${g.verbal}-${g.motor}`;
    if (llave !== estado.glasgow) {
      estado.glasgow = llave;
      glasgow = { ocular: g.ocular, verbal: g.verbal, motor: g.motor };
    }
  }

  return { cambios, intervenciones: nuevas, glasgow, hospitalId, total: cambios.length + nuevas.length };
}