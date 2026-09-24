// src/pln/glosario.js
// Diccionario médico-operativo. Todo el conocimiento lingüístico del
// sistema vive aquí: sinónimos, anclas de sección y comandos.

// Números hablados a dígitos. Se aplican en la normalización.
export const NUMEROS_HABLADOS = {
  'cero': 0, 'uno': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4,
  'cinco': 5, 'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9,
  'diez': 10, 'once': 11, 'doce': 12, 'trece': 13, 'catorce': 14,
  'quince': 15, 'dieciséis': 16, 'dieciseis': 16, 'diecisiete': 17,
  'dieciocho': 18, 'diecinueve': 19, 'veinte': 20,
  'veintiuno': 21, 'veintidós': 22, 'veintidos': 22, 'veintitrés': 23,
  'veintitres': 23, 'veinticuatro': 24, 'veinticinco': 25,
  'veintiséis': 26, 'veintiseis': 26, 'veintisiete': 27,
  'veintiocho': 28, 'veintinueve': 29, 'treinta': 30,
  'cuarenta': 40, 'cincuenta': 50, 'sesenta': 60, 'setenta': 70,
  'ochenta': 80, 'noventa': 90, 'cien': 100, 'ciento': 100,
  'doscientos': 200, 'trescientos': 300, 'cuatrocientos': 400,
  'quinientos': 500, 'seiscientos': 600, 'setecientos': 700,
  'ochocientos': 800, 'novecientos': 900, 'mil': 1000
};

// Anclas de sección. Ordenadas de mayor a menor prioridad para evitar
// colisiones (por ejemplo, "signos vitales" antes que "signos").
export const ANCLAS_SECCION = [
  { id: 'signos',        patrones: ['signos vitales', 'toma de signos', 'vitales'] },
  { id: 'glasgow',       patrones: ['glasgow', 'escala de coma', 'gcs', 'escala de glasgow'] },
  { id: 'primaria',      patrones: ['evaluacion primaria', 'evaluacion inicial', 'revision primaria', 'evaluacion de la escena'] },
  { id: 'intervenciones', patrones: ['intervenciones', 'procedimientos', 'maniobras', 'tratamiento realizado', 'que se le hizo'] },
  { id: 'motivo',        patrones: ['motivo de urgencia', 'motivo de consulta', 'motivo principal', 'el paciente presenta', 'el paciente refiere', 'acude por'] },
  { id: 'lesiones',      patrones: ['descripcion de lesion', 'descripcion de lesiones', 'lesiones', 'hallazgos'] },
  { id: 'demografia',    patrones: ['datos del paciente', 'identificacion del paciente', 'paciente'] },
  { id: 'destino',       patrones: ['hospital destino', 'destino del paciente', 'traslado a'] }
];

// Secciones cuya captura es prioritaria. Cuando estas están completas,
// el sistema ofrece enviar una versión urgente.
export const SECCIONES_URGENTES = ['motivo', 'signos', 'glasgow', 'lesiones'];

// Vocabulario médico. Cada entrada mapea una clave interna a los
// sinónimos que el paramédico puede usar al dictar.
export const VOCABULARIO = {
  // Signos vitales
  frecuencia_cardiaca: [
    'frecuencia cardiaca', 'frecuencia cardíaca', 'fc', 'pulso',
    'pulsaciones', 'latidos por minuto', 'lpm', 'latido'
  ],
  frecuencia_respiratoria: [
    'frecuencia respiratoria', 'fr', 'respiraciones por minuto',
    'rpm', 'respiraciones', 'respiracion'
  ],
  tension_arterial: [
    'tension arterial', 'tensión arterial', 'presion arterial',
    'presión arterial', 'ta', 'presion', 'tensión', 'tension'
  ],
  saturacion_oxigeno: [
    'saturacion de oxigeno', 'saturación de oxígeno', 'spo2',
    'saturacion', 'saturación', 'oximetria', 'oximetría',
    'sat o dos', 'saturacion de o2', 'saturometria'
  ],
  temperatura: [
    'temperatura', 'temp', 'grados centigrados', 'grados centígrados',
    'grados celsius'
  ],
  glucemia: [
    'glucemia', 'glucosa', 'glucosa capilar', 'dextrostix', 'dextro'
  ],
  peso: ['peso', 'pesa', 'kilogramos', 'kilos'],
  talla: ['talla', 'mide', 'estatura'],

  // Glasgow
  glasgow_total: [
    'glasgow', 'escala de glasgow', 'gcs', 'total de glasgow'
  ],
  glasgow_ocular: ['ocular', 'apertura ocular', 'ojos'],
  glasgow_verbal: ['verbal', 'respuesta verbal'],
  glasgow_motor: ['motor', 'respuesta motora'],

  // Demografía
  edad: ['años', 'año', 'edad', 'de edad'],
  sexo: ['masculino', 'femenino', 'hombre', 'mujer', 'varón', 'varon'],

  // Intervenciones
  oxigenoterapia: [
    'oxigenoterapia', 'oxigeno', 'oxígeno', 'o2', 'mascarilla',
    'puntas nasales', 'canula nasal', 'cánula nasal', 'mascarilla con reservorio'
  ],
  via_intravenosa: [
    'via intravenosa', 'vía intravenosa', 'iv', 'cateter', 'catéter',
    'suero', 'solucion', 'solución', 'venoclisis', 'acceso venoso'
  ],
  intubacion: [
    'intubacion', 'intubación', 'intubar', 'tubo orotraqueal',
    'tqt', 'sonda endotraqueal'
  ],
  ventilacion: [
    'ventilacion', 'ventilación', 'ventilar', 'ambu',
    'bolsa valvula mascarilla', 'bvm', 'bolsa mascarilla'
  ],
  rcp: [
    'rcp', 'reanimacion', 'reanimación', 'masaje cardiaco',
    'compresiones', 'compresiones toracicas', 'compresiones torácicas'
  ],
  desfibrilacion: [
    'desfibrilacion', 'desfibrilación', 'desfibrilar', 'choque',
    'descarga', 'dea'
  ],
  inmovilizacion: [
    'inmovilizacion', 'inmovilización', 'inmovilizar', 'ferula',
    'férula', 'tabla rigida', 'tabla rígida', 'collar cervical',
    'asa de rescate'
  ],
  vendaje: ['vendaje', 'vendar', 'gasa', 'compresa', 'aposito'],
  medicacion: [
    'medicacion', 'medicación', 'medicar', 'analgesia', 'analgesico',
    'analgésico', 'morfina', 'adrenalina', 'epinefrina', 'midazolam',
    'naloxona', 'atropina', 'solucion salina'
  ],

  // Estado de conciencia
  consciente: ['consciente', 'alerta', 'despierto', 'orientado'],
  inconsciente: ['inconsciente', 'no responde', 'sin respuesta', 'no reactivo'],
  confuso: ['confuso', 'desorientado', 'somnoliento'],

  // Estados clínicos
  via_aerea_libre: ['via aerea libre', 'vía aérea libre', 'via aerea permeable'],
  via_aerea_comprometida: ['via aerea comprometida', 'vía aérea comprometida', 'obstruccion'],
  respira_adecuada: ['respiracion adecuada', 'respiración adecuada', 'ventilacion adecuada'],
  respira_dificultosa: ['respiracion dificultosa', 'respiración dificultosa', 'dificultad respiratoria']
};

// Comandos de voz. Al detectarlos, el parser los devuelve como acciones.
export const COMANDOS = {
  enviar_urgente: [
    'envia urgente', 'envía urgente', 'manda urgente',
    'datos urgentes', 'envia reporte urgente', 'envía reporte urgente'
  ],
  enviar_completo: [
    'envia reporte', 'envía reporte', 'envia informe', 'envía informe',
    'manda el reporte', 'envia completo', 'envía completo',
    'manda informe', 'envia todo', 'envía todo'
  ],
  detener_captura: [
    'alto', 'detente', 'stop', 'terminar', 'termina grabacion',
    'termina grabación', 'fin de captura'
  ],
  limpiar: ['limpia', 'borra todo', 'reinicia captura', 'reinicia']
};

// Expansión de abreviaciones en el texto hablado.
export const ABREVIACIONES = {
  'ta': 'tension arterial',
  'fc': 'frecuencia cardiaca',
  'fr': 'frecuencia respiratoria',
  'spo2': 'saturacion de oxigeno',
  'sat o dos': 'saturacion de oxigeno',
  'gcs': 'glasgow',
  'iv': 'via intravenosa',
  'rcp': 'reanimacion cardiopulmonar',
  'bvm': 'ventilacion con bolsa mascarilla',
  'dea': 'desfibrilador externo automatico'
};

// Unidades que el reconocimiento de voz suele distorsionar.
export const CORRECCIONES_FONETICAS = {
  'espacio dos': 'spo2',
  's p o dos': 'spo2',
  'sat dos': 'spo2',
  'saturacion dos': 'spo2',
  'o dos': 'o2',
  'ochenta sobre ciento veinte': '120/80',
  'ciento veinte sobre ochenta': '120/80',
  'doce por ocho': '120/80',
  'ciento diez sobre setenta': '110/70',
  'noventa sobre sesenta': '90/60'
};