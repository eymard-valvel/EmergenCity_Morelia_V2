import {
  NUMEROS_HABLADOS,
  ANCLAS_SECCION,
  COMANDOS,
  ABREVIACIONES,
  CORRECCIONES_FONETICAS,
  SECCIONES_URGENTES,
  INTERVENCIONES,
  FARMACOS,
  MEDICAMENTOS_HABITUALES,
  ENFERMEDADES,
  SINTOMAS,
  LESIONES,
  MECANISMOS,
  DISPARADORES,
  VERBOS_ACCION,
  APOYOS_CON,
  EXCLUSIONES_INTERVENCION,
  EVENTOS_TIEMPO,
  TIPOS_URGENCIA,
  EVALUACION,
  EXPLORACION,
  PALABRAS_HALLAZGO,
  SEXO,
  PALABRAS_NOMBRE_STOP,
  NOMBRE_CONECTORES,
  SINONIMOS_SIGNOS,
  ADJETIVOS_PULSO,
  LIMITES_CLAUSULA
} from './glosario';

const GLASGOW_BREAKDOWN = {
  3: { ocular: 1, verbal: 1, motor: 1 },
  4: { ocular: 1, verbal: 1, motor: 2 },
  5: { ocular: 1, verbal: 2, motor: 2 },
  6: { ocular: 2, verbal: 2, motor: 2 },
  7: { ocular: 2, verbal: 2, motor: 3 },
  8: { ocular: 2, verbal: 3, motor: 3 },
  9: { ocular: 3, verbal: 3, motor: 3 },
  10: { ocular: 3, verbal: 3, motor: 4 },
  11: { ocular: 3, verbal: 4, motor: 4 },
  12: { ocular: 4, verbal: 4, motor: 4 },
  13: { ocular: 4, verbal: 4, motor: 5 },
  14: { ocular: 4, verbal: 5, motor: 5 },
  15: { ocular: 4, verbal: 5, motor: 6 }
};

export const sinAcentos = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const norm = (s) => sinAcentos(String(s).toLowerCase());
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function plano(texto) {
  let r = '';
  for (let i = 0; i < texto.length; i++) {
    const d = sinAcentos(texto[i].toLowerCase());
    r += d.length === 1 ? d : texto[i];
  }
  return r;
}

const alternativa = (lista) =>
  [...new Set(lista.map(norm))]
    .sort((a, b) => b.length - a.length)
    .map((x) => esc(x).replace(/ +/g, '\\s+'))
    .join('|');

const reLista = (lista, flags = 'g') => new RegExp(`\\b(?:${alternativa(lista)})\\b`, flags);
const compactar = (s) => s.replace(/\s+/g, ' ').trim();

const NUM = Object.fromEntries(Object.entries(NUMEROS_HABLADOS).map(([k, v]) => [norm(k), v]));
const PUNT_FINAL = /[,.;:!?]+$/;

function claseNumero(v) {
  if (v === 1000) return 'mil';
  if (v >= 100) return 'centena';
  if (v >= 20 && v % 10 === 0) return 'decena';
  if (v >= 10) return 'especial';
  return 'unidad';
}

function leerNumero(tk, i) {
  let miles = 0;
  let resto = 0;
  let estado = 0;
  let j = i;
  let punt = '';
  while (j < tk.length) {
    if (punt) break;
    const limpio = tk[j].replace(PUNT_FINAL, '');
    const v = NUM[limpio];
    if (v === undefined) {
      if (estado === 2 && limpio === 'y' && j + 1 < tk.length) {
        const sig = tk[j + 1].replace(PUNT_FINAL, '');
        const vs = NUM[sig];
        if (vs !== undefined && vs >= 1 && vs <= 9) {
          resto += vs;
          estado = 3;
          punt = tk[j + 1].slice(sig.length);
          j += 2;
          continue;
        }
      }
      break;
    }
    const clase = claseNumero(v);
    if (clase === 'mil') {
      if (miles) break;
      miles = (resto || 1) * 1000;
      resto = 0;
      estado = 0;
    } else if (clase === 'centena') {
      if (estado !== 0) break;
      resto += v;
      estado = 1;
    } else if (clase === 'decena') {
      if (estado > 1) break;
      resto += v;
      estado = 2;
    } else if (clase === 'especial') {
      if (estado > 1) break;
      resto += v;
      estado = 3;
    } else {
      if (estado > 1) break;
      resto += v;
      estado = 3;
    }
    punt = tk[j].slice(limpio.length);
    j++;
  }
  return { valor: miles + resto, consumidos: j - i, punt };
}

function convertirNumeros(t) {
  const tk = t.split(/\s+/).filter(Boolean);
  const out = [];
  let i = 0;
  while (i < tk.length) {
    const { valor, consumidos, punt } = leerNumero(tk, i);
    if (consumidos > 0) {
      out.push(String(valor) + punt);
      i += consumidos;
    } else {
      out.push(tk[i]);
      i++;
    }
  }
  return out.join(' ');
}

const CORRECCIONES = Object.entries(CORRECCIONES_FONETICAS)
  .map(([k, v]) => [norm(k), v])
  .sort((a, b) => b[0].length - a[0].length)
  .map(([k, v]) => [new RegExp(`(?<![a-z0-9])${esc(k).replace(/ +/g, '\\s+')}(?![a-z0-9])`, 'g'), v]);

const ABREV_MAPA = Object.fromEntries(Object.entries(ABREVIACIONES).map(([k, v]) => [norm(k), v]));
const RE_ABREV = reLista(Object.keys(ABREVIACIONES), 'g');

function aplicarCorrecciones(t) {
  let r = t;
  for (const [re, destino] of CORRECCIONES) r = r.replace(re, destino);
  return r;
}

function expandirAbreviaciones(t) {
  return t.replace(RE_ABREV, (m) => ABREV_MAPA[m.replace(/\s+/g, ' ')] || m);
}

function prepararNumerico(planoTexto) {
  let t = compactar(planoTexto);
  t = aplicarCorrecciones(t);
  t = expandirAbreviaciones(t);
  t = convertirNumeros(t);
  t = t
    .replace(/(\d+)\s+(?:punto|coma)\s+(\d+)/g, '$1.$2')
    .replace(/(\d+)\s+y\s+medio\b/g, '$1.5')
    .replace(/(\d{2}),(\d)(?!\d)/g, '$1.$2');
  return compactar(t);
}

export function normalizarTexto(textoOriginal) {
  return prepararNumerico(plano(String(textoOriginal || '').normalize('NFC')));
}

const REL =
  '(?:\\s+(?:de|en|a|al|es|esta|estaba|marca|marcando|con|fue|tiene|aproximadamente|aprox|aproximado|aproximada|como|cerca\\s+de|casi|unos|alrededor\\s+de|del|corporal|capilar|periferica|periferico)){0,3}\\s*[:=]?\\s*';

const KW = Object.fromEntries(Object.entries(SINONIMOS_SIGNOS).map(([k, v]) => [k, alternativa(v)]));
const ADJ_PULSO = alternativa(ADJETIVOS_PULSO);

const RE_FC = [
  new RegExp(`\\b(?:${KW.fc})\\b(?:\\s+(?:${ADJ_PULSO}))?${REL}(\\d{2,3})\\b`, 'g'),
  /\b(\d{2,3})\s*(?:lpm|latidos(?:\s+por\s+minuto)?|pulsaciones(?:\s+por\s+minuto)?)\b/g
];
const RE_FR = [
  new RegExp(`\\b(?:${KW.fr})\\b${REL}(\\d{1,2})\\b`, 'g'),
  /\b(\d{1,2})\s*(?:rpm|respiraciones(?:\s+por\s+minuto)?|ventilaciones(?:\s+por\s+minuto)?)\b/g
];
const RE_TA = [
  new RegExp(`\\b(?:${KW.ta})\\b${REL}(\\d{1,3})\\s*(?:\\/|sobre|entre|por|con|y|a|,|\\s)\\s*(\\d{1,3})\\b`, 'g'),
  /\b(\d{2,3})\s*(?:\/|sobre|entre)\s*(\d{2,3})\b/g
];
const RE_SPO2 = [
  new RegExp(`\\b(?:${KW.spo2})\\b${REL}(\\d{2,3})\\b`, 'g'),
  /\b(\d{2,3})\s*(?:por\s+ciento|%)?\s*(?:de\s+|en\s+)?(?:saturacion|saturando|sat)\b/g
];
const RE_TEMP = [
  new RegExp(`\\b(?:${KW.temp})\\b${REL}(\\d{2}(?:\\.\\d)?)(?!\\d)`, 'g'),
  /\b(\d{2}(?:\.\d)?)\s*(?:grados|°|º)/g,
  /\b(?:febril|fiebre|hipertermia|hipotermia)(?:\s+(?:de|a|en))?\s+(\d{2}(?:\.\d)?)(?!\d)/g
];
const RE_TEMP_ESPACIO = new RegExp(`\\b(?:${KW.temp})\\b${REL}(\\d{2})\\s+(\\d)(?!\\d)`, 'g');
const RE_GLU = [
  new RegExp(`\\b(?:${KW.glucemia})\\b${REL}(\\d{2,3})\\b`, 'g'),
  /\b(\d{2,3})\s*(?:mg\s*\/\s*dl|mg\s+dl|miligramos\s+(?:por\s+)?decilitro)/g
];
const RE_EVA = [
  new RegExp(`\\b(?:${KW.eva})\\b${REL}(\\d{1,2})\\b`, 'g'),
  /\b(?:dolor|intensidad)\s+(?:de\s+)?(?:intensidad\s+)?(\d{1,2})\s*(?:\/|sobre|de|entre)\s*10\b/g,
  /\b(\d{1,2})\s*(?:\/|sobre|de|entre)\s*10\s+(?:de\s+)?dolor\b/g
];
const RE_PESO = [
  new RegExp(`\\b(?:${KW.peso})\\b${REL}(\\d{2,3}(?:\\.\\d)?)\\s*(?:kg|kilos|kilogramos)?\\b`, 'g'),
  /\b(\d{2,3})\s*(?:kg|kilos|kilogramos)\b/g
];

function ultimoValido(patrones, texto, validar) {
  let mejor = null;
  for (const re of patrones) {
    for (const m of texto.matchAll(re)) {
      const v = validar(m);
      if (v !== null && v !== undefined && (mejor === null || m.index >= mejor.pos)) mejor = { valor: v, pos: m.index };
    }
  }
  return mejor ? mejor.valor : null;
}

const enRango = (n, min, max) => (n >= min && n <= max ? n : null);

function validarTA(a, b) {
  let s = parseInt(a, 10);
  let d = parseInt(b, 10);
  if (s < 30 && d < 20) {
    s *= 10;
    d *= 10;
  }
  if (s >= 50 && s <= 280 && d >= 20 && d <= 180 && s > d) return { s, d };
  return null;
}

const RE_ACOMP_INV = /\b(madre|padre|mama|papa|esposa|esposo|hijo|hija|hermano|hermana|familiar|amigo|amiga|vecino|vecina|pareja|abuela|abuelo|tio|tia|novio|novia|companero|companera|esposos|familiares)\s+(?:de\s+el\s+|del\s+paciente\s+)?(?:lo|la|los|le)\s+acompana(?:n)?\b/;

function extraerAcompanante(ctx) {
  const inv = RE_ACOMP_INV.exec(ctx.tl);
  if (inv) {
    const palabra = ctx.original.slice(inv.index, inv.index + inv[1].length);
    return { texto: palabra.charAt(0).toUpperCase() + palabra.slice(1).toLowerCase(), disparador: { ini: inv.index }, fin: inv.index + inv[0].length };
  }
  return spansDeDisparadores(ctx, DISPARADORES.acompanante, { max: 80 })[0] || null;
}

function extraerSignosVitales(tn) {
  const r = {};

  const fc = ultimoValido(RE_FC, tn, (m) => enRango(parseInt(m[1], 10), 20, 250));
  if (fc !== null) r.frecuencia_cardiaca = fc;

  const fr = ultimoValido(RE_FR, tn, (m) => enRango(parseInt(m[1], 10), 4, 70));
  if (fr !== null) r.frecuencia_respiratoria = fr;

  const ta = ultimoValido(RE_TA, tn, (m) => validarTA(m[1], m[2]));
  if (ta) {
    r.tension_arterial = `${ta.s}/${ta.d}`;
    r.pam = Math.round((ta.s + 2 * ta.d) / 3);
  }

  const spo2 = ultimoValido(RE_SPO2, tn, (m) => enRango(parseInt(m[1], 10), 40, 100));
  if (spo2 !== null) r.saturacion_oxigeno = spo2;

  let temp = ultimoValido(RE_TEMP, tn, (m) => enRango(parseFloat(m[1]), 30, 43));
  if (temp === null) {
    temp = ultimoValido([RE_TEMP_ESPACIO], tn, (m) => {
      const entero = parseInt(m[1], 10);
      return entero >= 34 && entero <= 42 ? parseFloat(`${m[1]}.${m[2]}`) : null;
    });
  }
  if (temp !== null) r.temperatura = temp;

  const glu = ultimoValido(RE_GLU, tn, (m) => enRango(parseInt(m[1], 10), 10, 800));
  if (glu !== null) r.glucemia = glu;

  const eva = ultimoValido(RE_EVA, tn, (m) => enRango(parseInt(m[1], 10), 0, 10));
  if (eva !== null) r.eva = eva;

  return r;
}

const RE_GLASGOW_TOTAL = new RegExp(
  `\\b(?:glasgow|escala\\s+de\\s+coma(?:\\s+de\\s+glasgow)?|gcs)\\b${REL}(\\d{1,2})(?:\\s*(?:,|y|con|-|\\/)?\\s*(\\d)\\s*(?:,|y|con|-|\\/)?\\s*(\\d))?(?!\\d)`,
  'g'
);
const RE_GL_OCULAR = new RegExp(`\\b(?:apertura\\s+ocular|ocular|ojos)\\b${REL}(\\d)\\b`, 'g');
const RE_GL_VERBAL = new RegExp(`\\b(?:respuesta\\s+verbal|verbal)\\b${REL}(\\d)\\b`, 'g');
const RE_GL_MOTOR = new RegExp(`\\b(?:respuesta\\s+motora|respuesta\\s+motor|motora|motor)\\b${REL}(\\d)\\b`, 'g');

function extraerGlasgow(tn) {
  const r = {};
  const oc = ultimoValido([RE_GL_OCULAR], tn, (m) => enRango(parseInt(m[1], 10), 1, 4));
  const ve = ultimoValido([RE_GL_VERBAL], tn, (m) => enRango(parseInt(m[1], 10), 1, 5));
  const mo = ultimoValido([RE_GL_MOTOR], tn, (m) => enRango(parseInt(m[1], 10), 1, 6));
  if (oc !== null) r.ocular = oc;
  if (ve !== null) r.verbal = ve;
  if (mo !== null) r.motor = mo;

  let total = null;
  for (const m of tn.matchAll(RE_GLASGOW_TOTAL)) {
    const a = parseInt(m[1], 10);
    const b = m[2] !== undefined ? parseInt(m[2], 10) : null;
    const c = m[3] !== undefined ? parseInt(m[3], 10) : null;
    if (a >= 1 && a <= 4 && b !== null && c !== null && b >= 1 && b <= 5 && c >= 1 && c <= 6) {
      r.ocular = a;
      r.verbal = b;
      r.motor = c;
      total = a + b + c;
    } else if (a >= 3 && a <= 15) {
      total = a;
    }
  }

  if (r.ocular !== undefined && r.verbal !== undefined && r.motor !== undefined) {
    r.total = r.ocular + r.verbal + r.motor;
  } else if (total !== null) {
    r.total = total;
    if (r.ocular === undefined && r.verbal === undefined && r.motor === undefined) {
      const br = GLASGOW_BREAKDOWN[total];
      if (br) Object.assign(r, br);
    }
  }
  return r;
}

const RE_HORA_DOSPUNTOS = /\b(\d{1,2}):(\d{2})\b/;
const CONECTOR_HORA = '(?:a\\s+las?|alas|las|hora|siendo\\s+las|a\\s+eso\\s+de\\s+las|como\\s+a\\s+las|aproximadamente\\s+a\\s+las|a\\s+la)';
const RE_HORA_MIN = new RegExp(`\\b${CONECTOR_HORA}\\s+(\\d{1,2})\\s*(?:horas?|hrs?)?\\s*(?:con|y)?\\s*(\\d{2})\\s*(?:minutos|min|hrs|horas)?\\b`);
const RE_HORA_MEDIA = new RegExp(`\\b${CONECTOR_HORA}\\s+(\\d{1,2})\\s+y\\s+media\\b`);
const RE_HORA_CUARTO = new RegExp(`\\b${CONECTOR_HORA}\\s+(\\d{1,2})\\s+y\\s+cuarto\\b`);
const RE_HORA_MENOS_CUARTO = new RegExp(`\\b${CONECTOR_HORA}\\s+(\\d{1,2})\\s+menos\\s+cuarto\\b`);
const RE_HORA_MENOS = new RegExp(`\\b${CONECTOR_HORA}\\s+(\\d{1,2})\\s+menos\\s+(\\d{1,2})\\b`);
const RE_HORA_PUNTO = new RegExp(`\\b${CONECTOR_HORA}\\s+(\\d{1,2})\\s*(?:horas?|hrs?|en\\s+punto)?(?!\\s*[:\\d])`);
const RE_PERIODO = /^\s*(?:de\s+la\s+(manana|madrugada|tarde|noche)|(am|pm|a\.\s?m\.?|p\.\s?m\.?))/;

function formatoHora(h, m) {
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function resolverPeriodo(h, m, periodoTexto, ahora) {
  const periodo = periodoTexto ? periodoTexto.replace(/[\s.]/g, '') : '';
  if (h > 24 || m > 59) return null;
  if (h === 24) h = 0;
  if (periodo === 'tarde' || periodo === 'noche' || periodo === 'pm') {
    if (h < 12) h += 12;
    else if (h === 12 && periodo === 'noche') h = 0;
  } else if (periodo === 'manana' || periodo === 'madrugada' || periodo === 'am') {
    if (h === 12) h = 0;
  } else if (h >= 1 && h <= 12) {
    const actual = ahora.getHours() * 60 + ahora.getMinutes();
    const candidatas = [h % 12, (h % 12) + 12].map((x) => x * 60 + m);
    const dist = (a) => Math.min(Math.abs(a - actual), 1440 - Math.abs(a - actual));
    const mejor = dist(candidatas[0]) <= dist(candidatas[1]) ? candidatas[0] : candidatas[1];
    h = Math.floor(mejor / 60);
  }
  return formatoHora(h, m);
}

function buscarHora(fragmento, ahora) {
  const t = fragmento;
  const candidatos = [];
  const agregar = (re, fn) => {
    const m = re.exec(t);
    if (m) candidatos.push({ pos: m.index, fin: m.index + m[0].length, ...fn(m) });
  };
  agregar(RE_HORA_DOSPUNTOS, (m) => ({ h: parseInt(m[1], 10), m: parseInt(m[2], 10) }));
  agregar(RE_HORA_MIN, (m) => ({ h: parseInt(m[1], 10), m: parseInt(m[2], 10) }));
  agregar(RE_HORA_MEDIA, (m) => ({ h: parseInt(m[1], 10), m: 30 }));
  agregar(RE_HORA_CUARTO, (m) => ({ h: parseInt(m[1], 10), m: 15 }));
  agregar(RE_HORA_MENOS_CUARTO, (m) => ({ h: (parseInt(m[1], 10) + 23) % 24, m: 45 }));
  agregar(RE_HORA_MENOS, (m) => ({ h: (parseInt(m[1], 10) + 23) % 24, m: 60 - parseInt(m[2], 10) }));
  agregar(RE_HORA_PUNTO, (m) => ({ h: parseInt(m[1], 10), m: 0 }));
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => a.pos - b.pos || b.fin - a.fin);
  const c = candidatos[0];
  const per = RE_PERIODO.exec(t.slice(c.fin));
  return resolverPeriodo(c.h, c.m, per ? per[1] || per[2] : '', ahora);
}

const SEXO_M = reLista(SEXO.M);
const SEXO_F = reLista(SEXO.F);
const RE_SEXO_TODOS = reLista([...SEXO.M, ...SEXO.F]);
const SET_SEXO_M = new Set(SEXO.M.map(norm));
const RE_NO_SEXO_PREVIO = /\b(?:hospital|de\s+la|del|clinica|centro)\s*$/;

function extraerSexo(tl) {
  let explicito = null;
  let primero = null;
  for (const m of tl.matchAll(RE_SEXO_TODOS)) {
    const antes = tl.slice(Math.max(0, m.index - 14), m.index);
    if (RE_NO_SEXO_PREVIO.test(antes)) continue;
    const valor = SET_SEXO_M.has(m[0].replace(/\s+/g, ' ')) ? 'M' : 'F';
    if (primero === null) primero = valor;
    if (explicito === null && /\b(?:paciente|sexo|genero)\s*(?:de\s+)?$/.test(antes)) explicito = valor;
  }
  return explicito || primero;
}

const NO_EDAD_SIG = '(?!\\s*(?:\\/|sobre|por|lpm|rpm|kg|kilos|grados|dias|horas|minutos|meses|semanas|%|mg|ml|puntos|litros|veces))';
const RE_EDAD_ANTES_SEXO = new RegExp(
  `\\b(?:masculino|femenino|masculina|femenina|hombre|mujer|varon|senor|senora|nino|nina|paciente|joven|adolescente|anciano|anciana|persona|adulto|adulta)\\s+(?:de\\s+)?(?:aproximadamente\\s+|aprox\\s+|como\\s+)?(\\d{1,3})(\\s*(?:anos|ano))?\\b${NO_EDAD_SIG}`,
  'g'
);
const RE_EDAD_ANOS = /\b(\d{1,3})\s*(?:anos|ano)\b/g;
const RE_EDAD_PALABRA = /\bedad\s+(?:aproximada\s+|aprox\s+)?(?:de\s+|es\s+|:)?(\d{1,3})\b(?!\s*(?:dias|meses|semanas))/g;
const RE_EDAD_TIENE = new RegExp(`\\b(?:tiene|cuenta\\s+con)\\s+(\\d{1,3})\\b${NO_EDAD_SIG}(?!\\s*anos)`, 'g');
const RE_EDAD_BEBE = /\b(?:bebe|bebita|bebito|lactante|recien\s+nacido|menor|nino|nina|infante)\s+(?:de\s+)?(\d{1,2})\s*(?:meses|mes|semanas|dias)\b/g;
const RE_ANTES_HISTORIA = /(?:hace|durante|desde|por|lleva|llevan|cumpl\w*|ya)\s+(?:como\s+|casi\s+|mas\s+de\s+)?$/;

function extraerEdad(tn) {
  for (const m of tn.matchAll(RE_EDAD_ANTES_SEXO)) {
    const v = parseInt(m[1], 10);
    if (v >= 0 && v <= (m[2] ? 120 : 110)) return v;
  }
  for (const m of tn.matchAll(RE_EDAD_ANOS)) {
    const antes = tn.slice(Math.max(0, m.index - 20), m.index);
    if (RE_ANTES_HISTORIA.test(antes)) continue;
    const v = parseInt(m[1], 10);
    if (v >= 0 && v <= 120) return v;
  }
  for (const m of tn.matchAll(RE_EDAD_PALABRA)) {
    const v = parseInt(m[1], 10);
    if (v >= 0 && v <= 120) return v;
  }
  for (const m of tn.matchAll(RE_EDAD_TIENE)) {
    const v = parseInt(m[1], 10);
    if (v >= 1 && v <= 110) return v;
  }
  for (const m of tn.matchAll(RE_EDAD_BEBE)) {
    if (parseInt(m[1], 10) >= 0) return 0;
  }
  return null;
}

const SET_NOMBRE_STOP = new Set(PALABRAS_NOMBRE_STOP.map(norm));
const SET_NOMBRE_CONECTOR = new Set(NOMBRE_CONECTORES.map(norm));
const RE_DISP_NOMBRE = reLista(DISPARADORES.nombre);
const RE_NOMBRE_CAPITAL = /\b(?:[Pp]aciente|[Ss]e[ñn]or|[Ss]e[ñn]ora|[Jj]oven)\s+((?:[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)(?:\s+(?:(?:de|del|la|las|los)\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){0,3})/;

const tituloNombre = (palabras) =>
  palabras
    .map((p) => (SET_NOMBRE_CONECTOR.has(norm(p)) ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join(' ');

function leerNombreDesde(original, desde) {
  const resto = original.slice(desde).replace(/^\s*(?:es|:)?\s*/i, '');
  const tokens = resto.split(/\s+/).filter(Boolean);
  const palabras = [];
  for (let i = 0; i < tokens.length && palabras.length < 8; i++) {
    const t = tokens[i];
    const limpio = t.replace(/[.,;:!?]+$/, '');
    const n = norm(limpio);
    if (!/^[a-zñ'-]+$/i.test(sinAcentos(limpio)) || limpio.length < 2) break;
    if (SET_NOMBRE_CONECTOR.has(n) && palabras.length > 0) {
      if (/[.,;:!?]$/.test(t)) break;
      let k = i + 1;
      while (k < tokens.length && SET_NOMBRE_CONECTOR.has(norm(tokens[k].replace(/[.,;:!?]+$/, '')))) k++;
      const sig = tokens[k] ? norm(tokens[k].replace(/[.,;:!?]+$/, '')) : '';
      if (sig && !SET_NOMBRE_STOP.has(sig) && /^[a-zñ]+$/.test(sig)) {
        for (let q = i; q < k; q++) palabras.push(tokens[q]);
        i = k - 1;
        continue;
      }
      break;
    }
    if (SET_NOMBRE_STOP.has(n)) break;
    palabras.push(limpio);
    if (/[.,;:!?]$/.test(t)) break;
  }
  while (palabras.length && SET_NOMBRE_CONECTOR.has(norm(palabras[palabras.length - 1]))) palabras.pop();
  return palabras.length ? { texto: tituloNombre(palabras), palabras: palabras.length } : null;
}

function extraerNombre(ctx) {
  const { original, tl } = ctx;
  let hallado = null;
  for (const m of tl.matchAll(RE_DISP_NOMBRE)) {
    const antes = tl.slice(Math.max(0, m.index - 6), m.index);
    if (/\bno\s*$/.test(antes)) continue;
    const r = leerNombreDesde(original, m.index + m[0].length);
    if (r) hallado = { texto: r.texto, ini: m.index, fin: m.index + m[0].length + 1 };
  }
  if (hallado) return hallado;
  const mc = RE_NOMBRE_CAPITAL.exec(original);
  if (mc) {
    const r = leerNombreDesde(original, mc.index + mc[0].indexOf(mc[1]));
    if (r && !SET_NOMBRE_STOP.has(norm(mc[1].split(/\s+/)[0]))) return { texto: r.texto, ini: mc.index, fin: mc.index + mc[0].length };
  }
  return null;
}

const RE_TELEFONO = /\b(?:telefono|celular|cel|tel|numero\s+de\s+contacto|numero\s+de\s+telefono|whatsapp)\b[^0-9]{0,25}((?:\d[\s-]*){10,13})/;
const RE_NO_IDENTIFICADO =
  /\b(?:paciente|persona|masculino|femenino)\s+(?:desconocid[oa]|no\s+identificad[oa]|sin\s+identificar|sin\s+identificacion)|se\s+desconoce\s+(?:su\s+)?(?:nombre|identidad)|nombre\s+desconocido|no\s+se\s+identifica|sin\s+datos\s+de\s+identificacion|no\s+porta\s+identificacion/;

function extraerTelefono(tn) {
  const m = RE_TELEFONO.exec(tn);
  if (!m) return null;
  let digitos = m[1].replace(/\D/g, '');
  if (digitos.length === 12 && digitos.startsWith('52')) digitos = digitos.slice(2);
  return digitos.length === 10 ? digitos : null;
}

const STOP_LIMITE_IZQ = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'que', 'con', 'por', 'para', 'a', 'al', 'es', 'fue', 'esta', 'y', 'e', 'paciente', 'refiere', 'presenta', 'se', 'le', 'lo', 'su', 'sus', 'estan', 'son']);
const STOP_LIMITE_DER = new Set(['de', 'del', 'la', 'el', 'los', 'las', 'un', 'una', 'unos', 'unas', 'y', 'e', 'o', 'u', 'en', 'con', 'que', 'por', 'para', 'a', 'al', 'se', 'le', 'lo', 'su', 'sus', 'es', 'paciente', 'pero', 'ya', 'tambien', 'ademas', 'entonces', 'luego', 'despues', 'si', 'mas', 'como', 'cuando', 'ahora', 'este', 'esta', 'sin']);

function limpiarSpan(texto) {
  let t = texto.replace(/^[\s:,;\-–—.]+/, '').replace(/[\s,;:\-–—.]+$/, '');
  let tk = t.split(/\s+/).filter(Boolean);
  const base = (x) => plano(x.replace(/[.,;:!?]+$/g, ''));
  while (tk.length && STOP_LIMITE_IZQ.has(base(tk[0]))) tk.shift();
  while (tk.length && STOP_LIMITE_DER.has(base(tk[tk.length - 1]))) tk.pop();
  t = tk.join(' ').replace(/[\s,;:\-–—.]+$/, '');
  if (t.length < 2) return '';
  return t.charAt(0).toUpperCase() + t.slice(1);
}

function minuscula(t) {
  return /^[A-ZÁÉÍÓÚÑ][a-záéíóúñ]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}

function unirSpans(textos) {
  const salida = [];
  for (const t of textos) {
    if (!t) continue;
    const n = norm(t);
    if (salida.some((s) => norm(s).includes(n))) continue;
    for (let i = salida.length - 1; i >= 0; i--) if (n.includes(norm(salida[i]))) salida.splice(i, 1);
    salida.push(t);
  }
  return salida.map((t, i) => (i === 0 ? t : minuscula(t))).join(', ');
}

const patronesLimite = () => {
  const anclas = ANCLAS_SECCION.flatMap((a) => a.patrones).filter((p) => !['lesiones', 'hallazgos'].includes(p));
  const interv = Object.values(INTERVENCIONES).flatMap((d) => [...d.sinonimos, ...d.condicionados]);
  const eventos = Object.values(EVENTOS_TIEMPO).flat();
  const disp = Object.values(DISPARADORES).flat();
  const signos = Object.values(SINONIMOS_SIGNOS).flat();
  const extra = ['niega', 'niegan', 'eta', 'tiempo estimado de llegada', 'tiempo de llegada', 'llegamos en', 'llegaremos en', 'via aerea', 'vias aereas', 'estable', 'grave'];
  return [...anclas, ...interv, ...eventos, ...disp, ...signos, ...VERBOS_ACCION, ...SEXO.M, ...SEXO.F, ...extra, ...LIMITES_CLAUSULA, 'glasgow', 'gcs', 'escala de coma', 'ocular', 'verbal'];
};

const RE_REGION_LIMITE = reLista(['cabeza', 'torax', 'abdomen', 'extremidades', 'cuello', 'pelvis', 'columna']);
const RE_PREP_ANTES_REGION = /\b(?:en|de|del|al|a|la|el|las|los|por|con|sin|hacia|sobre)\s*$/;

const RE_LIMITES = reLista(patronesLimite());
const RE_PUNTUACION = /[.;]\s|[.;]$|\n/;

function crearContexto(rawText) {
  const original = String(rawText).normalize('NFC');
  const tl = plano(original);
  const limites = [];
  for (const m of tl.matchAll(RE_LIMITES)) limites.push(m.index);
  for (const m of tl.matchAll(RE_REGION_LIMITE)) {
    if (!RE_PREP_ANTES_REGION.test(tl.slice(Math.max(0, m.index - 12), m.index))) limites.push(m.index);
  }
  limites.sort((a, b) => a - b);
  return { original, tl, limites };
}

function spanDesde(ctx, fin, max = 200) {
  const { original, limites } = ctx;
  let corte = Math.min(original.length, fin + max);
  for (const l of limites) {
    if (l >= fin) {
      corte = Math.min(corte, l);
      break;
    }
  }
  const resto = original.slice(fin, corte);
  const p = RE_PUNTUACION.exec(resto);
  if (p) corte = fin + p.index;
  return { ini: fin, fin: corte, texto: limpiarSpan(original.slice(fin, corte)) };
}

function disparadores(ctx, lista, filtro) {
  const re = reLista(lista);
  const res = [];
  for (const m of ctx.tl.matchAll(re)) {
    if (filtro && !filtro(m, ctx)) continue;
    res.push({ ini: m.index, fin: m.index + m[0].length, clave: m[0] });
  }
  return res;
}

const solapa = (a, b) => a.ini < b.fin && b.ini < a.fin;

function spansDeDisparadores(ctx, lista, opciones = {}) {
  const { filtro, max = 200, minPalabras = 1 } = opciones;
  const out = [];
  for (const d of disparadores(ctx, lista, filtro)) {
    const s = spanDesde(ctx, d.fin, max);
    if (s.texto && s.texto.split(/\s+/).length >= minPalabras) out.push({ ...s, disparador: d });
  }
  return out;
}

const reSintomas = reLista(SINTOMAS);
const reLesiones = reLista(LESIONES);
const reMecanismos = reLista(MECANISMOS);
const RE_CLINICO = reLista([...SINTOMAS, ...LESIONES, ...MECANISMOS], '');
const RE_CHOQUE_NO = /^\s+(?:electrico|hipovolemico|septico|anafilactico|cardiogenico|neurogenico|termico|insulinico|diabetico|de\s+punta)/;
const RE_CHOQUE_ANTES = /(?:sala\s+de|area\s+de|cuarto\s+de|dimos|damos|aplicamos|aplique|segundo|primer|otro|un|uno)\s*$/;

function descartarChoque(m, ctx) {
  if (norm(m[0]) !== 'choque') return true;
  const despues = ctx.tl.slice(m.index + m[0].length, m.index + m[0].length + 20);
  const antes = ctx.tl.slice(Math.max(0, m.index - 14), m.index);
  return !RE_CHOQUE_NO.test(despues) && !RE_CHOQUE_ANTES.test(antes);
}

const reTiposUrgencia = TIPOS_URGENCIA.map((t) => ({ valor: t.valor, re: reLista(t.patrones) }));

function clasificarUrgencia(ctx) {
  for (const t of reTiposUrgencia) {
    for (const m of ctx.tl.matchAll(t.re)) {
      if (descartarChoque(m, ctx)) return t.valor;
    }
  }
  return null;
}

const RE_SOLO_EVA = /^dolor\s+(?:de\s+|intensidad\s+)?\w+\s+(?:de|sobre|entre|\/)\s+(?:diez|10)$/;

function extraerMotivo(ctx, ocupados) {
  const explicitos = spansDeDisparadores(ctx, DISPARADORES.motivo, { max: 220 }).filter(
    (s) => (RE_CLINICO.test(norm(s.texto)) || s.texto.split(/\s+/).length >= 3) && !RE_SOLO_EVA.test(norm(s.texto))
  );
  if (explicitos.length > 0) return { spans: explicitos, texto: unirSpans(explicitos.map((s) => s.texto).slice(0, 3)) };

  const sintomas = [];
  for (const m of ctx.tl.matchAll(reSintomas)) {
    const marco = { ini: m.index, fin: m.index + m[0].length };
    if (ocupados.some((o) => solapa(o, marco))) continue;
    if (sintomas.some((s) => m.index >= s.ini && m.index < s.fin)) continue;
    if (norm(m[0]) === 'choque' && !descartarChoque(m, ctx)) continue;
    const s = spanDesde(ctx, m.index, 160);
    if (s.texto && !RE_SOLO_EVA.test(norm(s.texto))) sintomas.push({ ...s, ini: m.index });
  }
  const elegidos = sintomas.slice(0, 3);
  return { spans: elegidos, texto: unirSpans(elegidos.map((s) => s.texto)) };
}

const RE_ANTES_LESION_NO = /(?:limpieza|lavado|curacion|curamos|cubrimos|cubrir|vendamos|suturamos|sutura|sobre)\s+(?:de\s+)?(?:la\s+|el\s+|las\s+|los\s+)?$/;

function extraerLesiones(ctx, ocupados) {
  const anclas = ANCLAS_SECCION.find((a) => a.id === 'lesiones').patrones;
  const candidatos = [];
  for (const s of spansDeDisparadores(ctx, anclas, { max: 200 })) candidatos.push({ ini: s.ini, fin: s.fin, texto: s.texto });
  for (const m of ctx.tl.matchAll(reLesiones)) {
    const marco = { ini: m.index, fin: m.index + m[0].length };
    if (ocupados.some((o) => solapa(o, marco))) continue;
    const antes = ctx.tl.slice(Math.max(0, m.index - 22), m.index);
    if (RE_ANTES_LESION_NO.test(antes)) continue;
    const s = spanDesde(ctx, m.index, 140);
    if (s.texto) candidatos.push({ ini: m.index, fin: s.fin, texto: s.texto });
  }
  candidatos.sort((a, b) => a.ini - b.ini || b.fin - a.fin);
  const sel = [];
  for (const c of candidatos) {
    if (sel.some((s) => c.ini >= s.ini && c.fin <= s.fin)) continue;
    if (sel.some((s) => c.ini < s.fin && s.ini < c.fin)) continue;
    sel.push(c);
  }
  const top = sel.slice(0, 4);
  return { spans: top, texto: unirSpans(top.map((s) => s.texto)) };
}

function extraerMecanismo(ctx, ocupados) {
  const explicito = spansDeDisparadores(ctx, ['mecanismo de lesion', 'mecanismo de trauma', 'mecanismo'], { max: 200 });
  if (explicito.length > 0) return { spans: explicito, texto: unirSpans(explicito.map((s) => s.texto).slice(0, 2)) };
  const candidatos = [];
  for (const m of ctx.tl.matchAll(reMecanismos)) {
    if (!descartarChoque(m, ctx)) continue;
    const marco = { ini: m.index, fin: m.index + m[0].length };
    if (ocupados.some((o) => solapa(o, marco))) continue;
    if (candidatos.some((c) => m.index >= c.ini && m.index < c.fin)) continue;
    const s = spanDesde(ctx, m.index, 140);
    if (s.texto) candidatos.push({ ini: m.index, fin: s.fin, texto: s.texto });
  }
  const top = candidatos.slice(0, 2);
  return { spans: top, texto: unirSpans(top.map((s) => s.texto)) };
}

const RE_NIEGA_ALERGIA =
  /\b(?:niega|niegan|sin|ninguna|negadas?|desconoce|no\s+(?:tiene|presenta|refiere|cuenta\s+con|es))\s+(?:\w+\s+){0,2}alergi(?:a|as|co|ca)\b|\balergias?\s+(?:negadas?|ninguna|desconocidas?|no\s+conocidas?|no\s+referidas?)|\bniega\s+alergias?\b|\bno\s+es\s+alergic[oa]\b/;
const RE_NIEGA_MEDICAMENTO =
  /\b(?:niega\s+(?:tomar\s+|consumir\s+)?medicamentos?|no\s+(?:esta\s+)?tomando\s+(?:ningun\s+)?medicamentos?|no\s+toma\s+(?:ningun\s+)?medicamentos?|sin\s+medicamentos?|no\s+refiere\s+medicamentos?|ningun\s+medicamento|no\s+toma\s+nada)\b/;
const RE_NIEGA_ANTECEDENTES =
  /\b(?:niega\s+(?:antecedentes|enfermedades)|sin\s+antecedentes|ningun\s+antecedente|sin\s+enfermedades|antecedentes\s+negados|aparentemente\s+sano|aparentemente\s+sana|previamente\s+sano|previamente\s+sana|sin\s+antecedentes\s+de\s+importancia)\b/;
const RE_TOMA_NO_MED = /^\s+(?:de|del)\s+(?:signos|glucosa|presion|temperatura|muestra|frecuencia|constantes|tension|saturacion|pulso|decisiones|mando)/;
const RE_SUFIJO_MED = /\b\w{4,}(?:formina|sartan|pril|dipino|statina|pam|lam|zepam|azol|prazol|mida|olol|xaban|farina|gliptina|glitazona|cilina|micina|floxacino|ina|ona)\b/;
const RE_MED_HABITUAL = reLista(MEDICAMENTOS_HABITUALES, '');
const DISP_MED_FUERTES = new Set(['medicamentos', 'medicacion habitual', 'medicacion de base', 'medicamentos habituales', 'tratamiento con', 'en tratamiento con', 'bajo tratamiento con', 'se medica con', 'tratamiento habitual', 'tratamiento de base', 'toma medicamento', 'toma medicamentos']);

function extraerAlergias(ctx) {
  if (RE_NIEGA_ALERGIA.test(ctx.tl)) return { texto: 'Niega alergias', ini: -1, fin: -1 };
  const spans = spansDeDisparadores(ctx, DISPARADORES.alergias, { max: 120 }).filter((s) => !/^(?:negad|ningun|desconoc)/.test(norm(s.texto)));
  if (!spans.length) return null;
  const s = spans[0];
  const corte = new RegExp(`\\b(?:${alternativa(ENFERMEDADES.flatMap((e) => e.sinonimos))})\\b`).exec(norm(s.texto));
  let texto = s.texto;
  if (corte) texto = limpiarSpan(texto.slice(0, corte.index));
  if (!texto) return null;
  return { texto, ini: s.disparador.ini, fin: s.disparador.fin + Math.max(1, texto.length) };
}

function extraerMedicamentos(ctx) {
  if (RE_NIEGA_MEDICAMENTO.test(ctx.tl)) return { texto: 'Niega medicamentos', rangos: [] };
  const spans = spansDeDisparadores(ctx, DISPARADORES.medicamentos, {
    max: 160,
    filtro: (m, c) => !RE_TOMA_NO_MED.test(c.tl.slice(m.index + m[0].length, m.index + m[0].length + 24))
  }).filter((s) => {
    const fuerte = DISP_MED_FUERTES.has(norm(s.disparador.clave).replace(/\s+/g, ' '));
    const n = norm(s.texto);
    return fuerte || RE_MED_HABITUAL.test(n) || RE_SUFIJO_MED.test(n);
  });
  if (!spans.length) return null;
  const rangos = spans.map((s) => ({ ini: s.disparador.ini, fin: s.fin }));
  return { texto: unirSpans(spans.map((s) => s.texto).slice(0, 2)), rangos };
}

const ENFERMEDADES_RE = ENFERMEDADES.map((e) => ({ etiqueta: e.etiqueta, re: reLista(e.sinonimos) }));
const TODAS_ENFERMEDADES = reLista(ENFERMEDADES.flatMap((e) => e.sinonimos), '');
const RE_NEGACION_PREVIA = /(?:niega|sin|descarta|ni|no\s+(?:tiene|refiere|presenta|padece|es|cuenta\s+con))\s+(?:\w+\s+){0,2}$/;

function extraerEnfermedades(ctx, rangosExcluir) {
  if (RE_NIEGA_ANTECEDENTES.test(ctx.tl)) return { texto: 'Niega antecedentes', rangos: [] };
  const etiquetas = [];
  const spansAnt = spansDeDisparadores(ctx, DISPARADORES.antecedentes, { max: 220 });
  const hallados = [];
  for (const e of ENFERMEDADES_RE) {
    for (const m of ctx.tl.matchAll(e.re)) {
      const marco = { ini: m.index, fin: m.index + m[0].length };
      if (rangosExcluir.some((o) => solapa(o, marco))) continue;
      const antes = ctx.tl.slice(Math.max(0, m.index - 30), m.index);
      if (RE_NEGACION_PREVIA.test(antes)) continue;
      if (!etiquetas.includes(e.etiqueta)) {
        etiquetas.push(e.etiqueta);
        hallados.push(marco);
      }
    }
  }
  const extras = [];
  for (const s of spansAnt) {
    for (const parte of s.texto.split(/,|\s+y\s+|\s+e\s+/)) {
      const p = limpiarSpan(parte);
      if (!p || p.length < 4) continue;
      const np = norm(p);
      if (TODAS_ENFERMEDADES.test(np)) continue;
      if (/^(?:de|del)?\s*(?:importancia|ninguno|ninguna)/.test(np)) continue;
      if (!extras.includes(p)) extras.push(p);
    }
  }
  const todo = [...etiquetas, ...extras];
  if (!todo.length) return null;
  return { texto: todo.join(', '), rangos: spansAnt.map((s) => ({ ini: s.disparador.ini, fin: s.fin })).concat(hallados) };
}

const RE_EMBARAZO_SI = /\b(?:embarazada|gestante|primigesta|multigesta|cursa\s+con\s+embarazo|semanas\s+de\s+gestacion|gesta\s+\d|con\s+embarazo|trabajo\s+de\s+parto)\b/;
const RE_EMBARAZO_NO = /\b(?:no\s+(?:esta\s+)?embarazada|niega\s+embarazo|sin\s+embarazo|descarta\s+embarazo|no\s+hay\s+embarazo|no\s+cursa\s+con\s+embarazo|no\s+gestante)\b/;
const RE_COMIDA =
  /\b(?:ultima\s+(?:comida|ingesta(?:\s+de\s+alimentos)?|alimentacion)|ultimo\s+alimento|comio|desayuno|almorzo|ceno|comida\s+fue|ingirio\s+alimentos)\b[^.;]{0,25}?\b(hace\s+\w+(?:\s+y\s+\w+)?\s+(?:horas?|minutos?|dias?)|a\s+las\s+\w+(?:\s+\w+){0,2}(?:\s+de\s+la\s+(?:manana|tarde|noche))?|en\s+ayunas|ayuno)/;
const RE_AYUNO = /\b(?:en\s+ayunas|ayuno(?:\s+de\s+\w+\s+horas)?|sin\s+comer\s+desde[^.;]{0,25})/;

function extraerUltimaComida(ctx) {
  let m = RE_COMIDA.exec(ctx.tl);
  if (m) {
    const ini = m.index + m[0].length - m[1].length;
    return limpiarSpan(ctx.original.slice(ini, ini + m[1].length));
  }
  m = RE_AYUNO.exec(ctx.tl);
  if (m) return limpiarSpan(ctx.original.slice(m.index, m.index + m[0].length));
  return null;
}

const RE_HOSPITAL = /\b(?:hospital|clinica|imss|issste|cruz\s+roja|centro\s+(?:medico|de\s+salud)|hgz|hgr|hgo|urgencias|general|civil|infantil|regional|angeles|star|unidad|sanatorio|medica|ceam|cenaprece)\b/;
const RE_ETA = [
  /\b(?:eta|tiempo\s+estimado\s+de\s+llegada|tiempo\s+de\s+llegada|llegada\s+estimada|tiempo\s+estimado)\b(?:\s+(?:de|en|a|es|:))*\s*(\d{1,3})\s*(?:min|minutos)\b/,
  /\b(?:llegamos|llegaremos|llegando|arribamos|arribaremos|estamos)\s+(?:en|a)\s+(\d{1,3})\s*(?:min|minutos)\b/,
  /\b(?:a|en)\s+(\d{1,3})\s*(?:min|minutos)\s+(?:del|de|para)\s+(?:el\s+)?(?:hospital|destino|llegar)\b/,
  /\beta\s*(?:de|en)?\s*(\d{1,2})(?!\d|\s*:)/
];
const RE_ETA_HORA = /\beta\b[^.;]{0,15}/;
const RE_AREA_CHOQUE = /\b(?:sala\s+de\s+choque|area\s+de\s+choque|cuarto\s+de\s+choque|a\s+choque|pasa\s+a\s+choque|reanimacion\s+area)\b/;
const RE_AREA_TOCO = /\b(?:tococirugia|toco|sala\s+de\s+partos?|labor\s+y\s+parto|sala\s+de\s+expulsion|ginecologia)\b/;
const RE_AREA_URGENCIAS = /\b(?:a\s+urgencias|area\s+de\s+urgencias|sala\s+de\s+urgencias|urgencias\s+adultos|triage|triaje)\b/;
const RE_ESTADO_FINAL = /\b(?:estado\s+final|condicion\s+final|se\s+entrega|entregamos|entrega|llega|llego|queda|quedo)\b[^.;]{0,25}?\b(estable|grave|critico|critica|delicado|delicada|reservado|reservada|inestable)\b/;

const RE_HOSPITAL_LIBRE = /\b(?:hospital\s+(?:general|civil|infantil|regional|de\s+la\s+mujer|de\s+especialidades|de\s+zona|angeles|star\s+medica|psiquiatrico|naval|militar|juarez|de\s+gineco\w*|\w+\s+(?:morelia|michoacan))|cruz\s+roja|imss|issste|pemex|sedena|clinica\s+\w+)\b/g;
const RE_ANTES_LLEGADA = /(?:llegamos|llegada|llegar|arribo|arribamos|salimos|salida|ingreso|ingresamos|entrega|entregamos)\s+(?:al|a)\s*$/;

function extraerDestino(ctx, tn, ahora) {
  const out = {};
  const ocupados = [];
  const hospitales = spansDeDisparadores(ctx, DISPARADORES.destino, { max: 90 }).filter((s) => {
    const n = norm(s.texto);
    return n.split(/\s+/).length <= 10 && RE_HOSPITAL.test(n);
  });
  if (hospitales.length) {
    const s = hospitales[hospitales.length - 1];
    out.texto = s.texto;
    ocupados.push({ ini: s.disparador.ini, fin: s.fin });
  }
  if (!out.texto) {
    let libre = null;
    for (const m of ctx.tl.matchAll(RE_HOSPITAL_LIBRE)) {
      if (RE_ANTES_LLEGADA.test(ctx.tl.slice(Math.max(0, m.index - 16), m.index))) continue;
      libre = { ini: m.index, fin: m.index + m[0].length };
    }
    if (libre) {
      out.texto = limpiarSpan(ctx.original.slice(libre.ini, libre.fin));
      ocupados.push(libre);
    }
  }
  for (const re of RE_ETA) {
    const m = re.exec(tn);
    if (m) {
      const v = parseInt(m[1], 10);
      if (v >= 1 && v <= 240) {
        out.eta_minutos = v;
        break;
      }
    }
  }
  const eh = RE_ETA_HORA.exec(tn);
  if (eh) {
    const h = buscarHora(eh[0], ahora);
    if (h) out.eta_hora = h;
  }
  if (RE_AREA_CHOQUE.test(ctx.tl)) out.area_receptora = 'Choque';
  else if (RE_AREA_TOCO.test(ctx.tl)) out.area_receptora = 'Tococirugía';
  else if (RE_AREA_URGENCIAS.test(ctx.tl)) out.area_receptora = 'Urgencias';
  const ef = RE_ESTADO_FINAL.exec(ctx.tl);
  if (ef) {
    const e = ef[1];
    out.estado_final = e === 'estable' ? 'Estable' : e.startsWith('critic') ? 'Crítico' : 'Grave';
  }
  const med = [];
  for (const d of disparadores(ctx, DISPARADORES.medico_recibe)) {
    const r = leerNombreDesde(ctx.original, d.fin);
    if (r) med.push({ texto: r.texto, ini: d.ini, fin: d.fin + r.texto.length + 1 });
  }
  if (med.length) {
    out.medico_recibe = med[med.length - 1].texto;
    ocupados.push({ ini: med[med.length - 1].ini, fin: med[med.length - 1].fin });
  }
  return { datos: out, ocupados };
}

const FILTRO_DIAGNOSTICO = (m, c) => !/\bno\s+(?:es\s+)?$/.test(c.tl.slice(Math.max(0, m.index - 6), m.index));

function extraerTiempos(tn, ahora) {
  const eventos = [];
  for (const [campo, lista] of Object.entries(EVENTOS_TIEMPO)) {
    for (const m of tn.matchAll(reLista(lista))) eventos.push({ campo, ini: m.index, fin: m.index + m[0].length });
  }
  eventos.sort((a, b) => a.ini - b.ini);
  const out = {};
  eventos.forEach((e, i) => {
    const siguiente = eventos[i + 1] ? eventos[i + 1].ini : tn.length;
    let ventana = tn.slice(e.fin, Math.min(siguiente, e.fin + 55));
    const p = RE_PUNTUACION.exec(ventana);
    if (p) ventana = ventana.slice(0, p.index);
    const h = buscarHora(ventana, ahora);
    if (h) out[e.campo] = h;
  });
  return out;
}

const MAPA_EVALUACION = Object.fromEntries(
  Object.entries(EVALUACION).map(([campo, valores]) => {
    const mapa = {};
    for (const [valor, sinonimos] of Object.entries(valores)) for (const s of sinonimos) mapa[norm(s)] = valor;
    return [campo, { mapa, re: reLista(Object.values(valores).flat()) }];
  })
);

function extraerEvaluacion(ctx) {
  const out = {};
  for (const [campo, { mapa, re }] of Object.entries(MAPA_EVALUACION)) {
    let ultimo = null;
    for (const m of ctx.tl.matchAll(re)) ultimo = mapa[m[0].replace(/\s+/g, ' ')] || ultimo;
    if (ultimo) out[campo] = ultimo;
  }
  return out;
}

const REGIONES = Object.entries(EXPLORACION).map(([region, lista]) => ({ region, re: reLista(lista) }));
const RE_HALLAZGO = reLista(PALABRAS_HALLAZGO, '');
const RE_PREPOSICION_ANTES = /\b(?:en|de|del|al|a|la|el|las|los|por|con|sin|hacia|sobre)\s*$/;

function extraerExploracion(ctx) {
  const marcas = [];
  for (const { region, re } of REGIONES) {
    for (const m of ctx.tl.matchAll(re)) marcas.push({ region, ini: m.index, fin: m.index + m[0].length });
  }
  marcas.sort((a, b) => a.ini - b.ini);
  const out = {};
  marcas.forEach((mk, i) => {
    const antes = ctx.tl.slice(Math.max(0, mk.ini - 12), mk.ini);
    if (RE_PREPOSICION_ANTES.test(antes)) return;
    const siguiente = marcas.slice(i + 1).find((x) => x.ini >= mk.fin && x.region !== mk.region);
    const s = spanDesde(ctx, mk.fin, 120);
    let fin = s.fin;
    if (siguiente && siguiente.ini < fin) fin = siguiente.ini;
    const texto = limpiarSpan(ctx.original.slice(mk.fin, fin));
    if (!texto || !RE_HALLAZGO.test(norm(texto))) return;
    out[mk.region] = out[mk.region] ? unirSpans([out[mk.region], texto]) : texto;
  });
  return out;
}

const DEF_INTERV = Object.entries(INTERVENCIONES).map(([clave, def]) => ({
  clave,
  etiqueta: def.etiqueta,
  admiteCon: !!def.admiteCon,
  directo: def.sinonimos.length ? reLista(def.sinonimos) : null,
  condicionado: def.condicionados.length ? reLista(def.condicionados) : null
}));
const DEF_FARMACOS = FARMACOS.map((f) => ({ nombre: f.nombre, re: reLista(f.sinonimos) }));
const RE_VERBO = new RegExp(`\\b(?:${alternativa(VERBOS_ACCION)})\\b`);
const RE_EXCLUSION = new RegExp(`\\b(?:${alternativa(EXCLUSIONES_INTERVENCION)})\\b(?:\\s+\\w+){0,2}\\s*$`);
const RE_APOYO = new RegExp(`\\b(?:${alternativa(APOYOS_CON)})\\s+(?:\\w+\\s+){0,1}$`);
const UNIDADES =
  '(mg|mcg|miligramos?|microgramos?|ml|mililitros?|cc|gr|g|gramos?|litros?|lts?|l|joules|j|ciclos|minutos|ampolletas?|tabletas?|puffs|disparos|descargas?|unidades)';
const RE_CANT_DESPUES = new RegExp(`^(?:\\s+[a-z]+){0,2}[\\s,]*(?:a|de|con|por|al|en|:)?\\s*(?:unos\\s+)?(\\d+(?:\\.\\d+)?)\\s*${UNIDADES}\\b(?:\\s*(?:por\\s+minuto|x\\s*min\\w*|\\/\\s*min))?`);
const RE_CANT_ANTES = new RegExp(`(\\d+(?:\\.\\d+)?)\\s*${UNIDADES}\\s*(?:por\\s+minuto\\s+)?(?:de|del)?\\s*$`);
const RE_DOSIS_DESPUES = new RegExp(`^[\\s,]*(?:a|de|con|por|al|en|:)?\\s*(?:unos\\s+)?\\d+(?:\\.\\d+)?\\s*${UNIDADES}\\b`);

const ETIQUETA_UNIDAD = {
  mg: 'mg', miligramo: 'mg', miligramos: 'mg', mcg: 'mcg', microgramo: 'mcg', microgramos: 'mcg', ml: 'mL', mililitro: 'mL', mililitros: 'mL', cc: 'mL',
  g: 'g', gr: 'g', gramo: 'g', gramos: 'g', litro: 'L/min', litros: 'L/min', lt: 'L/min', lts: 'L/min', l: 'L/min', joules: 'J', j: 'J', ciclos: 'ciclos',
  minutos: 'min', ampolleta: 'ampolleta(s)', ampolletas: 'ampolleta(s)', tableta: 'tableta(s)', tabletas: 'tableta(s)', puffs: 'puffs', disparos: 'disparos',
  descarga: 'descarga(s)', descargas: 'descarga(s)', unidades: 'U'
};

function formatoCantidad(valor, unidad) {
  return `${valor} ${ETIQUETA_UNIDAD[unidad] || unidad}`;
}

function cantidadCerca(ctx, ini, fin) {
  const despues = prepararNumerico(ctx.tl.slice(fin, fin + 40));
  let m = RE_CANT_DESPUES.exec(despues);
  if (m) return formatoCantidad(m[1], m[2]);
  const antes = prepararNumerico(ctx.tl.slice(Math.max(0, ini - 30), ini));
  m = RE_CANT_ANTES.exec(antes);
  if (m) return formatoCantidad(m[1], m[2]);
  return '';
}

function horaCerca(ctx, fin, ahora) {
  let corte = Math.min(ctx.tl.length, fin + 45);
  for (const l of ctx.limites) {
    if (l > fin + 1) {
      corte = Math.min(corte, l);
      break;
    }
  }
  const ventana = prepararNumerico(ctx.tl.slice(fin, corte));
  return buscarHora(ventana, ahora) || '';
}

function rangosSeccion(ctx, id) {
  const anclas = [];
  for (const a of ANCLAS_SECCION) {
    for (const m of ctx.tl.matchAll(reLista(a.patrones))) anclas.push({ id: a.id, ini: m.index, fin: m.index + m[0].length });
  }
  anclas.sort((a, b) => a.ini - b.ini);
  const rangos = [];
  anclas.forEach((a, i) => {
    if (a.id !== id) return;
    const sig = anclas.slice(i + 1).find((x) => x.id !== id);
    rangos.push({ ini: a.fin, fin: sig ? sig.ini : Math.min(ctx.tl.length, a.fin + 500) });
  });
  return rangos;
}

const RE_FORMA_VERBAL = /^(?:canaliz|inmoviliz|intub|ventil|monitor|nebuliz|descomprim|vend|desfibril|entablill|ferulizar|aspir|sujet|contuv|permeabiliz|abrimos|atendimos|curamos|cubrimos|abrigamos|compresion|compresiones|hemostasia)/;

function extraerIntervenciones(ctx, ocupados, ahora) {
  const secciones = rangosSeccion(ctx, 'intervenciones');
  const candidatos = [];
  for (const d of DEF_INTERV) {
    if (d.directo) for (const m of ctx.tl.matchAll(d.directo)) candidatos.push({ def: d, m, ini: m.index, fin: m.index + m[0].length, directo: true });
    if (d.condicionado) for (const m of ctx.tl.matchAll(d.condicionado)) candidatos.push({ def: d, m, ini: m.index, fin: m.index + m[0].length, directo: false });
  }
  for (const f of DEF_FARMACOS) {
    for (const m of ctx.tl.matchAll(f.re)) candidatos.push({ farmaco: f, m, ini: m.index, fin: m.index + m[0].length, directo: false });
  }
  candidatos.sort((a, b) => a.ini - b.ini || b.fin - b.ini - (a.fin - a.ini) || (b.directo ? 1 : 0) - (a.directo ? 1 : 0));

  const aceptados = [];
  for (const c of candidatos) {
    if (aceptados.some((a) => solapa(a, c))) continue;
    if (ocupados.some((o) => solapa(o, c))) continue;
    const antes = ctx.tl.slice(Math.max(0, c.ini - 70), c.ini);
    const antesCorto = ctx.tl.slice(Math.max(0, c.ini - 28), c.ini);
    if (RE_EXCLUSION.test(antesCorto)) continue;
    if (c.def && norm(c.m[0]) === 'una via' && /^\s*(?:aerea|respiratoria)/.test(ctx.tl.slice(c.fin, c.fin + 12))) continue;
    const enSeccion = secciones.some((r) => c.ini >= r.ini && c.ini <= r.fin);
    const tramo = antes.split(/[.;]\s/).pop();
    const conVerbo = RE_VERBO.test(tramo);
    let ok = c.directo || enSeccion || conVerbo;
    if (!ok && c.def && c.def.admiteCon) ok = RE_APOYO.test(antesCorto);
    if (!ok && c.farmaco) {
      const dosis = RE_DOSIS_DESPUES.test(prepararNumerico(ctx.tl.slice(c.fin, c.fin + 40)));
      ok = dosis;
    }
    if (!ok) continue;
    aceptados.push(c);
  }

  const brutos = aceptados.map((c) => {
    const cantidad = cantidadCerca(ctx, c.ini, c.fin);
    const textoOriginal = RE_FORMA_VERBAL.test(norm(ctx.original.slice(c.ini, c.fin))) ? '' : limpiarSpan(ctx.original.slice(c.ini, c.fin));
    const hora = horaCerca(ctx, c.fin, ahora);
    if (c.farmaco) {
      return { clave: 'medicacion', tipo_intervencion: 'Medicación', descripcion: [c.farmaco.nombre, cantidad].filter(Boolean).join(' '), hora_intervencion: hora, ini: c.ini, fin: c.fin, esFarmaco: true };
    }
    const igualEtiqueta = norm(textoOriginal) === norm(c.def.etiqueta) || ['una via', 'via', 'iv', 'cateter', 'via venosa'].includes(norm(textoOriginal));
    const descripcion = [igualEtiqueta ? '' : textoOriginal, cantidad].filter(Boolean).join(', ');
    return { clave: c.def.clave, tipo_intervencion: c.def.etiqueta, descripcion, hora_intervencion: hora, ini: c.ini, fin: c.fin, esFarmaco: false };
  });

  const fusionados = [];
  for (const b of brutos) {
    const previo = !b.esFarmaco ? [...fusionados].reverse().find((f) => f.clave === b.clave && !f.esFarmaco) : null;
    if (previo && b.ini - previo.fin <= 60) {
      const partes = [previo.descripcion, b.descripcion].filter(Boolean);
      previo.descripcion = unirSpans(partes);
      previo.fin = b.fin;
      previo.hora_intervencion = previo.hora_intervencion || b.hora_intervencion;
    } else {
      fusionados.push({ ...b });
    }
  }

  const vistos = new Set();
  const salida = [];
  for (const f of fusionados) {
    const llave = `${f.clave}|${norm(f.descripcion)}`;
    if (vistos.has(llave)) continue;
    vistos.add(llave);
    salida.push({ clave: f.clave, tipo_intervencion: f.tipo_intervencion, descripcion: f.descripcion, hora_intervencion: f.hora_intervencion });
  }
  return salida;
}

const RE_RIESGO_NEGATIVO = /^(?:ninguno|ninguna|sin\s+riesgos?|no\s+hay|no\s+existe|segura|escena\s+segura)/;

function extraerRiesgos(ctx) {
  if (/\bescena\s+segura\b/.test(ctx.tl) && !/\bescena\s+insegura\b/.test(ctx.tl)) return { texto: '', rangos: [] };
  const spans = spansDeDisparadores(ctx, DISPARADORES.riesgos, { max: 160 }).filter((s) => !RE_RIESGO_NEGATIVO.test(norm(s.texto)));
  if (!spans.length) return { texto: '', rangos: [] };
  return { texto: spans[0].texto, rangos: spans.map((s) => ({ ini: s.disparador.ini, fin: s.fin })) };
}

const FRASES_COMANDO = Object.fromEntries(
  Object.entries(COMANDOS).map(([accion, frases]) => [accion, [...new Set(frases.map(norm))]])
);
const COMANDOS_PUROS = new Set(['detener_captura', 'limpiar']);
const RELLENO_COMANDO = /\b(?:por\s+favor|ahora|gracias|ya|ok|okey|oye|asistente|sistema|favor\s+de|porfa|y)\b/g;

export function detectarComandos(textoNormalizado) {
  const t = norm(textoNormalizado);
  const acciones = [];
  for (const [accion, frases] of Object.entries(FRASES_COMANDO)) {
    for (const frase of frases) {
      if (new RegExp(`\\b${esc(frase).replace(/ +/g, '\\s+')}\\b`).test(t)) {
        acciones.push(accion);
        break;
      }
    }
  }
  return [...new Set(acciones)];
}

export function detectarComandoEnFrase(frase) {
  const t = compactar(norm(frase).replace(/[.,;:!?¿¡]/g, ' '));
  if (!t) return [];
  const sinRelleno = compactar(t.replace(RELLENO_COMANDO, ' '));
  const palabras = sinRelleno.split(' ').length;
  const acciones = [];
  for (const [accion, frases] of Object.entries(FRASES_COMANDO)) {
    for (const f of frases) {
      const nf = f.split(' ').length;
      const termina = sinRelleno === f || sinRelleno.endsWith(` ${f}`);
      const puro = sinRelleno === f || (palabras <= nf + 1 && sinRelleno.includes(f));
      if (COMANDOS_PUROS.has(accion) ? puro : termina || puro) {
        acciones.push(accion);
        break;
      }
    }
  }
  const unicas = [...new Set(acciones)];
  return unicas.includes('enviar_urgente') ? unicas.filter((a) => a !== 'enviar_completo') : unicas;
}

const tieneDatos = (sec) =>
  Object.values(sec).some((v) => v !== '' && v !== null && v !== undefined && !(Array.isArray(v) && v.length === 0));

function agregarSiHay(destino, clave, valor) {
  if (valor !== null && valor !== undefined && valor !== '') destino[clave] = valor;
}

export function parseTextLocal(rawText, opciones = {}) {
  if (!rawText || !String(rawText).trim()) {
    return { secciones: {}, acciones: [], seccionesCompletas: [], textoNormalizado: '', textoOriginal: '', nlpFuentes: ['local'] };
  }

  const ahora = opciones.ahora || new Date();
  const ctx = crearContexto(rawText);
  const tn = prepararNumerico(ctx.tl);
  const acciones = detectarComandos(tn);
  const secciones = {};

  const signos = extraerSignosVitales(tn);
  if (Object.keys(signos).length) secciones.signos = signos;

  const glasgow = extraerGlasgow(tn);
  if (Object.keys(glasgow).length) secciones.glasgow = glasgow;

  const ocupados = [];
  const alergias = extraerAlergias(ctx);
  if (alergias && alergias.ini >= 0) ocupados.push({ ini: alergias.ini, fin: alergias.fin });
  const medicamentos = extraerMedicamentos(ctx);
  if (medicamentos) ocupados.push(...medicamentos.rangos);
  const comida = extraerUltimaComida(ctx);
  const nombre = extraerNombre(ctx);
  if (nombre) ocupados.push({ ini: nombre.ini, fin: nombre.fin });
  const acomp = extraerAcompanante(ctx);
  if (acomp) ocupados.push({ ini: acomp.disparador.ini, fin: acomp.fin });
  const destino = extraerDestino(ctx, tn, ahora);
  ocupados.push(...destino.ocupados);
  const riesgos = extraerRiesgos(ctx);
  ocupados.push(...riesgos.rangos);
  const diagnosticos = spansDeDisparadores(ctx, DISPARADORES.diagnostico, { max: 160, filtro: FILTRO_DIAGNOSTICO, minPalabras: 1 });
  ocupados.push(...diagnosticos.map((s) => ({ ini: s.disparador.ini, fin: s.fin })));
  const necesidades = spansDeDisparadores(ctx, DISPARADORES.necesidades, { max: 140, minPalabras: 1 }).filter((s) => !/^(?:oxigeno|collarin)$/.test(norm(s.texto)) || true);
  ocupados.push(...necesidades.map((s) => ({ ini: s.disparador.ini, fin: s.fin })));
  const enfermedades = extraerEnfermedades(ctx, ocupados);
  if (enfermedades) ocupados.push(...enfermedades.rangos);

  const demografia = {};
  const sexo = extraerSexo(ctx.tl);
  agregarSiHay(demografia, 'sexo', sexo);
  const edad = extraerEdad(tn);
  if (edad !== null) demografia.edad = edad;
  if (nombre) demografia.nombre = nombre.texto;
  const peso = ultimoValido(RE_PESO, tn, (m) => enRango(parseFloat(m[1]), 2, 250));
  if (peso !== null) demografia.peso = peso;
  agregarSiHay(demografia, 'telefono', extraerTelefono(tn));
  if (acomp) agregarSiHay(demografia, 'acompanante', acomp.texto);
  if (RE_NO_IDENTIFICADO.test(ctx.tl)) demografia.paciente_identificado = 'No';
  if (Object.keys(demografia).length) secciones.demografia = demografia;

  const motivo = extraerMotivo(ctx, ocupados);
  const tipoUrgencia = clasificarUrgencia(ctx);
  const sec = {};
  agregarSiHay(sec, 'motivo_urgencia', motivo.texto);
  agregarSiHay(sec, 'tipo_urgencia', motivo.texto || tipoUrgencia ? tipoUrgencia || 'Otro' : null);
  if (Object.keys(sec).length) secciones.motivo = sec;

  const mecanismo = extraerMecanismo(ctx, ocupados);
  if (mecanismo.texto) secciones.mecanismo = { mecanismo: mecanismo.texto };

  const lesiones = extraerLesiones(ctx, ocupados);
  if (lesiones.texto) secciones.lesiones = { descripcion_lesion: lesiones.texto };

  const evaluacion = extraerEvaluacion(ctx);
  if (Object.keys(evaluacion).length) secciones.evaluacion = evaluacion;

  const exploracion = extraerExploracion(ctx);
  if (Object.keys(exploracion).length) secciones.exploracion = exploracion;

  const antecedentes = {};
  if (alergias) antecedentes.alergias = alergias.texto;
  if (medicamentos) antecedentes.medicamentos = medicamentos.texto;
  if (enfermedades) antecedentes.enfermedades = enfermedades.texto;
  agregarSiHay(antecedentes, 'ultima_comida', comida);
  if (RE_EMBARAZO_NO.test(ctx.tl)) antecedentes.embarazo = 'No';
  else if (RE_EMBARAZO_SI.test(ctx.tl)) antecedentes.embarazo = 'Sí';
  if (Object.keys(antecedentes).length) secciones.antecedentes = antecedentes;

  const intervenciones = extraerIntervenciones(ctx, ocupados, ahora);
  if (intervenciones.length) secciones.intervenciones = intervenciones;

  const tiempos = extraerTiempos(tn, ahora);
  if (Object.keys(tiempos).length) secciones.tiempos = tiempos;

  const diag = {};
  if (diagnosticos.length) diag.diagnostico_presuntivo = unirSpans(diagnosticos.map((s) => s.texto).slice(0, 2));
  if (necesidades.length) diag.necesidades = unirSpans(necesidades.map((s) => s.texto).slice(0, 2));
  if (Object.keys(diag).length) secciones.diagnostico = diag;

  if (Object.keys(destino.datos).length) secciones.destino = destino.datos;
  if (riesgos.texto) secciones.escena = { riesgos_escena: riesgos.texto };

  const seccionesCompletas = SECCIONES_URGENTES.filter((id) => secciones[id] && tieneDatos(secciones[id]));

  return { secciones, acciones, seccionesCompletas, textoNormalizado: tn, textoOriginal: rawText, nlpFuentes: ['local'] };
}