export const NUMEROS_HABLADOS = {
  'cero': 0, 'un': 1, 'uno': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4,
  'cinco': 5, 'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9,
  'diez': 10, 'once': 11, 'doce': 12, 'trece': 13, 'catorce': 14,
  'quince': 15, 'dieciséis': 16, 'dieciseis': 16, 'diecisiete': 17,
  'dieciocho': 18, 'diecinueve': 19, 'veinte': 20,
  'veintiun': 21, 'veintiún': 21, 'veintiuno': 21, 'veintiuna': 21,
  'veintidós': 22, 'veintidos': 22, 'veintitrés': 23, 'veintitres': 23,
  'veinticuatro': 24, 'veinticinco': 25, 'veintiséis': 26, 'veintiseis': 26,
  'veintisiete': 27, 'veintiocho': 28, 'veintinueve': 29, 'treinta': 30,
  'cuarenta': 40, 'cincuenta': 50, 'sesenta': 60, 'setenta': 70,
  'ochenta': 80, 'noventa': 90, 'cien': 100, 'ciento': 100,
  'doscientos': 200, 'doscientas': 200, 'trescientos': 300, 'trescientas': 300,
  'cuatrocientos': 400, 'cuatrocientas': 400, 'quinientos': 500, 'quinientas': 500,
  'seiscientos': 600, 'seiscientas': 600, 'setecientos': 700, 'setecientas': 700,
  'ochocientos': 800, 'ochocientas': 800, 'novecientos': 900, 'novecientas': 900,
  'mil': 1000
};

export const ANCLAS_SECCION = [
  { id: 'signos', patrones: ['signos vitales', 'toma de signos', 'vitales', 'constantes vitales', 'parametros vitales', 'somatometria'] },
  { id: 'glasgow', patrones: ['glasgow', 'escala de coma', 'gcs', 'escala de glasgow', 'glascow'] },
  { id: 'primaria', patrones: ['evaluacion primaria', 'evaluacion inicial', 'revision primaria', 'evaluacion de la escena', 'valoracion primaria', 'valoracion inicial'] },
  { id: 'intervenciones', patrones: ['intervenciones', 'procedimientos', 'maniobras', 'tratamiento realizado', 'que se le hizo', 'manejo prehospitalario', 'acciones realizadas', 'se realizo lo siguiente'] },
  { id: 'motivo', patrones: ['motivo de urgencia', 'motivo de consulta', 'motivo principal', 'motivo de la llamada', 'motivo de atencion', 'el paciente presenta', 'el paciente refiere', 'acude por', 'acuden por', 'cuadro clinico', 'padecimiento actual'] },
  { id: 'lesiones', patrones: ['descripcion de lesion', 'descripcion de lesiones', 'lesiones', 'hallazgos', 'hallazgos de la exploracion', 'exploracion fisica'] },
  { id: 'demografia', patrones: ['datos del paciente', 'identificacion del paciente', 'ficha de identificacion'] },
  { id: 'antecedentes', patrones: ['antecedentes', 'antecedentes personales', 'antecedentes patologicos', 'historial medico'] },
  { id: 'destino', patrones: ['hospital destino', 'destino del paciente', 'traslado a', 'trasladamos a', 'trasladado a', 'nos dirigimos a', 'rumbo a'] }
];

export const SINONIMOS_SIGNOS = {
  fc: ['frecuencia cardiaca', 'fc', 'pulso', 'pulsaciones', 'latidos', 'latidos por minuto', 'ritmo cardiaco', 'taquicardia', 'bradicardia', 'taquicardico', 'taquicardica', 'bradicardico', 'bradicardica'],
  fr: ['frecuencia respiratoria', 'fr', 'respiraciones', 'respira', 'respirando', 'ventilaciones', 'ritmo respiratorio', 'taquipnea'],
  ta: ['tension arterial', 'presion arterial', 'tension', 'presion', 'ta', 'tensiones', 't a'],
  spo2: ['saturacion de oxigeno', 'saturacion periferica de oxigeno', 'saturacion periferica', 'saturacion', 'saturando', 'saturo', 'satura', 'spo2', 'sat', 'oximetria', 'saturometria', 'oxigenacion', 'pulsioximetria', 'oximetro', 'oxigeno en sangre'],
  temp: ['temperatura corporal', 'temperatura', 'temp'],
  glucemia: ['glucemia', 'glucosa', 'glucosa capilar', 'dextrostix', 'dextro', 'hgt', 'hemoglucotest', 'glucometria', 'glicemia', 'azucar', 'glucometro'],
  eva: ['eva', 'escala visual analoga', 'escala del dolor', 'escala de dolor', 'intensidad del dolor'],
  peso: ['peso', 'pesa', 'pesando']
};

export const ADJETIVOS_PULSO = ['filiforme', 'lleno', 'rapido', 'lento', 'debil', 'fuerte', 'regular', 'irregular', 'ritmico', 'arritmico', 'palpable', 'periferico', 'central', 'radial', 'carotideo'];

export const SECCIONES_URGENTES = ['motivo', 'signos', 'glasgow', 'lesiones'];

export const INTERVENCIONES = {
  oxigenoterapia: {
    etiqueta: 'Oxigenoterapia',
    admiteCon: true,
    sinonimos: ['oxigenoterapia', 'oxigeno suplementario', 'puntas nasales', 'canula nasal', 'bigoteras', 'lentes nasales', 'mascarilla con reservorio', 'mascarilla reservorio', 'mascarilla de oxigeno', 'mascarilla simple', 'mascarilla de alto flujo'],
    condicionados: ['oxigeno', 'o2', 'oxigenacion', 'oxigenado', 'oxigenada']
  },
  via_intravenosa: {
    etiqueta: 'Vía intravenosa',
    sinonimos: ['via intravenosa', 'canalizacion', 'canalizar', 'canalizado', 'canalizada', 'canalizamos', 'canalice', 'canalizo', 'venoclisis', 'acceso venoso', 'linea intravenosa', 'cateter intravenoso', 'cateter periferico', 'branula', 'punzocat', 'venoflex', 'via periferica', 'acceso periferico', 'acceso iv', 'via iv', 'vena periferica'],
    condicionados: ['cateter', 'iv', 'una via', 'via venosa', 'via venosa periferica']
  },
  acceso_intraoseo: {
    etiqueta: 'Acceso intraóseo',
    sinonimos: ['via intraosea', 'acceso intraoseo', 'intraoseo', 'intraosea', 'canalizacion intraosea', 'acceso io'],
    condicionados: []
  },
  soluciones: {
    etiqueta: 'Soluciones intravenosas',
    admiteCon: true,
    sinonimos: ['carga de liquidos', 'cargas de solucion', 'carga de solucion', 'bolo de solucion', 'bolo de liquidos', 'reanimacion con liquidos', 'reanimacion hidrica'],
    condicionados: ['solucion salina', 'solucion fisiologica', 'solucion hartmann', 'solucion glucosada', 'solucion', 'suero', 'suero fisiologico', 'ringer', 'ringer lactato', 'cloruro de sodio', 'hartmann', 'liquidos']
  },
  medicacion: {
    etiqueta: 'Medicación',
    sinonimos: ['analgesia', 'se medico', 'medicacion administrada', 'medicamento administrado'],
    condicionados: ['medicacion', 'medicamento', 'medicamentos']
  },
  intubacion: {
    etiqueta: 'Intubación',
    sinonimos: ['intubacion', 'intubacion orotraqueal', 'iot', 'intubar', 'intubado', 'intubada', 'intubamos', 'intube', 'intubo', 'tubo orotraqueal', 'tubo endotraqueal', 'sonda endotraqueal', 'secuencia rapida de intubacion', 'cricotiroidotomia', 'cricotirotomia'],
    condicionados: []
  },
  via_aerea_avanzada: {
    etiqueta: 'Manejo de vía aérea',
    sinonimos: ['canula orofaringea', 'canula de guedel', 'guedel', 'canula nasofaringea', 'mascara laringea', 'igel', 'i gel', 'dispositivo supraglotico', 'aspiracion de secreciones', 'aspiracion', 'aspiramos', 'aspirar', 'apertura de via aerea', 'abrimos via aerea', 'maniobra frente menton', 'maniobra de elevacion de menton', 'traccion mandibular', 'subluxacion de mandibula', 'maniobra de heimlich', 'heimlich', 'permeabilizamos', 'permeabilizar via aerea'],
    condicionados: []
  },
  ventilacion: {
    etiqueta: 'Ventilación asistida',
    sinonimos: ['ambu', 'bolsa valvula mascarilla', 'bvm', 'bolsa mascarilla', 'ventilacion asistida', 'ventilacion con ambu', 'ventilacion con bolsa', 'ventilacion con presion positiva', 'ventilador', 'ventilador mecanico', 'cpap', 'bipap'],
    condicionados: ['ventilacion', 'ventilar', 'ventilado', 'ventilada', 'ventilamos', 'ventilo', 'asistimos la ventilacion', 'asistimos ventilacion']
  },
  nebulizacion: {
    etiqueta: 'Nebulización',
    sinonimos: ['nebulizacion', 'nebulizar', 'nebulizado', 'nebulizada', 'nebulizamos', 'nebulizo', 'nebulizador', 'micronebulizacion'],
    condicionados: []
  },
  rcp: {
    etiqueta: 'RCP',
    sinonimos: ['rcp', 'reanimacion cardiopulmonar', 'reanimacion', 'masaje cardiaco', 'compresiones toracicas', 'compresiones', 'ciclos de rcp', 'resucitacion', 'resucitacion cardiopulmonar', 'retorno de la circulacion espontanea', 'rosc'],
    condicionados: []
  },
  desfibrilacion: {
    etiqueta: 'Desfibrilación',
    sinonimos: ['desfibrilacion', 'desfibrilar', 'desfibrilado', 'desfibrilamos', 'desfibrilador', 'dea', 'choque electrico', 'descarga electrica', 'cardioversion', 'cardioversion electrica', 'marcapasos transcutaneo', 'marcapaso transcutaneo'],
    condicionados: ['descarga', 'descargas']
  },
  inmovilizacion: {
    etiqueta: 'Inmovilización',
    sinonimos: ['inmovilizacion', 'inmovilizar', 'inmovilizado', 'inmovilizada', 'inmovilizamos', 'inmovilizo', 'inmovilizacion espinal', 'inmovilizacion de columna', 'collarin', 'collarin cervical', 'collar cervical', 'colarin', 'tabla rigida', 'tabla larga', 'tabla corta', 'tabla espinal', 'camilla rigida', 'camilla de cuchara', 'camilla tipo cuchara', 'ferula', 'ferulizacion', 'ferulizar', 'ferulizado', 'ferulizada', 'entablillado', 'entablillada', 'entablillar', 'entablillamos', 'inmovilizador lateral de cabeza', 'inmovilizadores laterales', 'ked', 'chaleco de extricacion', 'dispositivo de extricacion', 'asa de rescate', 'extricacion', 'fijacion de fractura', 'tirantes', 'cintas de sujecion', 'arana', 'pulpo', 'sabana de arrastre'],
    condicionados: []
  },
  control_hemorragia: {
    etiqueta: 'Control de hemorragia',
    sinonimos: ['control de hemorragia', 'control de sangrado', 'hemostasia', 'torniquete', 'presion directa', 'vendaje compresivo', 'apositos hemostaticos', 'gasa hemostatica', 'empaquetamiento de herida', 'compresion directa', 'pantalon neumatico antishock', 'pasg', 'faja pelvica', 'cinturon pelvico'],
    condicionados: []
  },
  vendaje: {
    etiqueta: 'Vendaje / curación',
    sinonimos: ['vendaje', 'vendar', 'vendado', 'vendada', 'vendamos', 'vendo', 'curacion', 'curamos', 'cubrimos la herida', 'cubrimos herida', 'aposito', 'apositos', 'gasa', 'gasas', 'compresa', 'compresas', 'limpieza de la herida', 'limpieza de herida', 'lavado de la herida', 'parche oclusivo', 'sello de torax', 'sello oclusivo', 'cubrimos con'],
    condicionados: []
  },
  monitoreo: {
    etiqueta: 'Monitoreo',
    admiteCon: true,
    sinonimos: ['monitoreo', 'monitorizacion', 'monitorizado', 'monitorizada', 'monitorizamos', 'monitorizo', 'monitoreamos', 'monitor cardiaco', 'electrocardiograma', 'ecg', 'ekg', 'doce derivaciones', '12 derivaciones', 'capnografia', 'monitoreo continuo', 'monitor de signos vitales', 'oximetro de pulso', 'oximetro'],
    condicionados: []
  },
  termorregulacion: {
    etiqueta: 'Control de temperatura',
    admiteCon: true,
    sinonimos: ['manta termica', 'cobertor termico', 'sabana termica', 'cubrimos con manta', 'abrigamos', 'abrigado', 'compresas frias', 'compresas calientes', 'medios fisicos', 'bolsas de hielo', 'hielo local', 'crioterapia', 'enfriamiento'],
    condicionados: ['manta', 'cobija', 'cobertor']
  },
  posicion: {
    etiqueta: 'Posición terapéutica',
    admiteCon: true,
    sinonimos: ['posicion fowler', 'posicion semifowler', 'semifowler', 'fowler', 'posicion lateral de seguridad', 'posicion de recuperacion', 'decubito lateral', 'trendelenburg', 'posicion antishock', 'elevacion de miembros inferiores', 'posicion semisentada'],
    condicionados: ['semisentado', 'semisentada', 'posicion']
  },
  descompresion_pleural: {
    etiqueta: 'Descompresión pleural',
    sinonimos: ['descompresion pleural', 'descompresion con aguja', 'descompresion toracica', 'toracocentesis', 'puncion pleural', 'descomprimimos', 'descomprimimos torax'],
    condicionados: []
  },
  atencion_parto: {
    etiqueta: 'Atención de parto',
    sinonimos: ['atencion de parto', 'atencion del parto', 'atendimos el parto', 'atendimos parto', 'parto en ambulancia', 'parto prehospitalario', 'corte de cordon', 'pinzamiento de cordon', 'alumbramiento', 'recien nacido atendido'],
    condicionados: []
  },
  sondeo: {
    etiqueta: 'Sondeo',
    sinonimos: ['sonda nasogastrica', 'sonda orogastrica', 'sonda vesical', 'sonda foley', 'sondeo', 'sondeo vesical'],
    condicionados: []
  },
  contencion: {
    etiqueta: 'Contención',
    sinonimos: ['contencion fisica', 'contencion mecanica', 'contencion verbal', 'sujecion', 'sujetamos', 'contuvimos', 'contenido fisicamente'],
    condicionados: []
  }
};

export const FARMACOS = [
  { nombre: 'Adrenalina', sinonimos: ['adrenalina', 'epinefrina'] },
  { nombre: 'Atropina', sinonimos: ['atropina'] },
  { nombre: 'Amiodarona', sinonimos: ['amiodarona'] },
  { nombre: 'Lidocaína', sinonimos: ['lidocaina'] },
  { nombre: 'Adenosina', sinonimos: ['adenosina'] },
  { nombre: 'Naloxona', sinonimos: ['naloxona', 'narcan'] },
  { nombre: 'Morfina', sinonimos: ['morfina'] },
  { nombre: 'Fentanilo', sinonimos: ['fentanilo', 'fentanil'] },
  { nombre: 'Ketorolaco', sinonimos: ['ketorolaco', 'ketorolaco', 'toradol'] },
  { nombre: 'Paracetamol', sinonimos: ['paracetamol', 'acetaminofen'] },
  { nombre: 'Metamizol', sinonimos: ['metamizol', 'dipirona'] },
  { nombre: 'Diclofenaco', sinonimos: ['diclofenaco'] },
  { nombre: 'Tramadol', sinonimos: ['tramadol'] },
  { nombre: 'Ketamina', sinonimos: ['ketamina'] },
  { nombre: 'Midazolam', sinonimos: ['midazolam'] },
  { nombre: 'Diazepam', sinonimos: ['diazepam'] },
  { nombre: 'Haloperidol', sinonimos: ['haloperidol'] },
  { nombre: 'Ondansetrón', sinonimos: ['ondansetron'] },
  { nombre: 'Metoclopramida', sinonimos: ['metoclopramida'] },
  { nombre: 'Salbutamol', sinonimos: ['salbutamol'] },
  { nombre: 'Bromuro de ipratropio', sinonimos: ['ipratropio', 'bromuro de ipratropio'] },
  { nombre: 'Nitroglicerina', sinonimos: ['nitroglicerina'] },
  { nombre: 'Isosorbida', sinonimos: ['isosorbida', 'isosorbide'] },
  { nombre: 'Ácido acetilsalicílico', sinonimos: ['aspirina', 'acido acetilsalicilico'] },
  { nombre: 'Clopidogrel', sinonimos: ['clopidogrel'] },
  { nombre: 'Furosemida', sinonimos: ['furosemida'] },
  { nombre: 'Hidrocortisona', sinonimos: ['hidrocortisona'] },
  { nombre: 'Dexametasona', sinonimos: ['dexametasona'] },
  { nombre: 'Difenhidramina', sinonimos: ['difenhidramina'] },
  { nombre: 'Glucosa al 50%', sinonimos: ['glucosa al 50', 'dextrosa al 50', 'dextrosa', 'solucion glucosada al 50'] },
  { nombre: 'Glucagón', sinonimos: ['glucagon'] },
  { nombre: 'Sulfato de magnesio', sinonimos: ['sulfato de magnesio'] },
  { nombre: 'Bicarbonato de sodio', sinonimos: ['bicarbonato'] },
  { nombre: 'Captopril', sinonimos: ['captopril'] },
  { nombre: 'Labetalol', sinonimos: ['labetalol'] },
  { nombre: 'Hioscina', sinonimos: ['hioscina', 'buscapina'] },
  { nombre: 'Loratadina', sinonimos: ['loratadina'] },
  { nombre: 'Oxitocina', sinonimos: ['oxitocina'] },
  { nombre: 'Ácido tranexámico', sinonimos: ['acido tranexamico'] },
  { nombre: 'Enoxaparina', sinonimos: ['enoxaparina'] }
];

export const MEDICAMENTOS_HABITUALES = [
  'metformina', 'glibenclamida', 'glimepirida', 'sitagliptina', 'insulina', 'losartan', 'enalapril', 'captopril', 'amlodipino',
  'telmisartan', 'valsartan', 'atenolol', 'metoprolol', 'carvedilol', 'propranolol', 'furosemida', 'espironolactona',
  'hidroclorotiazida', 'aspirina', 'acido acetilsalicilico', 'clopidogrel', 'warfarina', 'rivaroxaban', 'apixaban',
  'omeprazol', 'ranitidina', 'salbutamol', 'budesonida', 'levotiroxina', 'carbamazepina', 'fenitoina', 'valproato',
  'levetiracetam', 'sertralina', 'fluoxetina', 'alprazolam', 'clonazepam', 'diazepam', 'paracetamol', 'ibuprofeno',
  'naproxeno', 'diclofenaco', 'tramadol', 'atorvastatina', 'simvastatina', 'pravastatina', 'digoxina', 'nifedipino',
  'isosorbide', 'nitroglicerina', 'prednisona', 'litio', 'risperidona', 'haloperidol', 'amitriptilina', 'tamsulosina'
];

export const ENFERMEDADES = [
  { etiqueta: 'Diabetes mellitus', sinonimos: ['diabetes', 'diabetico', 'diabetica', 'dm2', 'dm 2', 'dm1', 'diabetes mellitus', 'insulinodependiente', 'insulino dependiente'] },
  { etiqueta: 'Hipertensión arterial', sinonimos: ['hipertension', 'hipertenso', 'hipertensa', 'has', 'hta'] },
  { etiqueta: 'Cardiopatía', sinonimos: ['cardiopata', 'cardiopatia', 'problemas del corazon', 'problema del corazon', 'enfermedad del corazon', 'cardiopatia isquemica', 'infarto previo', 'iam previo', 'infarto anterior', 'antecedente de infarto', 'marcapasos', 'valvulopatia'] },
  { etiqueta: 'Insuficiencia cardiaca', sinonimos: ['insuficiencia cardiaca', 'icc'] },
  { etiqueta: 'Epilepsia', sinonimos: ['epilepsia', 'epileptico', 'epileptica', 'convulsivo', 'convulsiva', 'crisis convulsivas previas'] },
  { etiqueta: 'Asma', sinonimos: ['asma', 'asmatico', 'asmatica'] },
  { etiqueta: 'EPOC', sinonimos: ['epoc', 'enfisema', 'bronquitis cronica', 'enfermedad pulmonar obstructiva'] },
  { etiqueta: 'Insuficiencia renal', sinonimos: ['insuficiencia renal', 'irc', 'dializado', 'dializada', 'hemodialisis', 'dialisis', 'problemas de rinon', 'enfermedad renal'] },
  { etiqueta: 'Evento vascular cerebral previo', sinonimos: ['evc previo', 'evc', 'embolia cerebral', 'trombosis cerebral', 'derrame cerebral previo', 'antecedente de derrame'] },
  { etiqueta: 'Cáncer', sinonimos: ['cancer', 'oncologico', 'oncologica', 'quimioterapia', 'radioterapia'] },
  { etiqueta: 'Hipotiroidismo', sinonimos: ['hipotiroidismo', 'hipotiroideo', 'hipertiroidismo', 'problemas de tiroides'] },
  { etiqueta: 'Obesidad', sinonimos: ['obesidad', 'obeso', 'obesa', 'sobrepeso'] },
  { etiqueta: 'Enfermedad hepática', sinonimos: ['cirrosis', 'hepatitis', 'higado graso', 'enfermedad del higado'] },
  { etiqueta: 'VIH', sinonimos: ['vih', 'sida'] },
  { etiqueta: 'Tuberculosis', sinonimos: ['tuberculosis'] },
  { etiqueta: 'Trastorno psiquiátrico', sinonimos: ['depresion', 'esquizofrenia', 'bipolar', 'ansiedad', 'trastorno psiquiatrico', 'psiquiatrico', 'psiquiatrica'] },
  { etiqueta: 'Alcoholismo / adicciones', sinonimos: ['alcoholismo', 'alcoholico', 'alcoholica', 'toxicomania', 'adicciones', 'adicto', 'adicta', 'drogadiccion', 'consume drogas', 'tabaquismo', 'fumador', 'fumadora'] },
  { etiqueta: 'Anemia', sinonimos: ['anemia', 'anemico', 'anemica'] },
  { etiqueta: 'Enfermedad gástrica', sinonimos: ['gastritis', 'ulcera gastrica', 'ulcera', 'colitis', 'reflujo'] },
  { etiqueta: 'Migraña', sinonimos: ['migrana', 'jaqueca'] },
  { etiqueta: 'Artritis', sinonimos: ['artritis', 'artrosis', 'osteoporosis'] },
  { etiqueta: 'Trastorno de coagulación', sinonimos: ['hemofilia', 'trastorno de coagulacion', 'anticoagulado', 'anticoagulada'] }
];

export const SINTOMAS = [
  'dolor', 'duele', 'dolor toracico', 'dolor de pecho', 'opresion', 'mareo', 'mareos', 'vertigo', 'nausea', 'nauseas', 'vomito', 'vomitos',
  'fiebre', 'calentura', 'disnea', 'dificultad para respirar', 'dificultad respiratoria', 'falta de aire', 'ahogo', 'se ahoga',
  'convulsion', 'convulsiones', 'convulsionando', 'crisis convulsiva', 'sincope', 'desmayo', 'se desmayo', 'desvanecimiento',
  'perdida de conocimiento', 'perdida del estado de alerta', 'perdio el conocimiento', 'perdio el estado de alerta', 'inconsciente', 'no responde',
  'sangrado', 'hemorragia', 'cefalea', 'palpitaciones', 'debilidad', 'hormigueo', 'adormecimiento', 'parestesias', 'sudoracion', 'diaforesis',
  'sudor frio', 'tos', 'diarrea', 'crisis', 'infarto', 'angina', 'evento vascular', 'trabajo de parto', 'contracciones', 'intoxicacion', 'intoxicado', 'intoxicada',
  'sobredosis', 'ingesta de', 'ingirio', 'mordedura', 'picadura', 'quemadura', 'atragantamiento', 'se atraganto', 'ahogamiento', 'electrocutado', 'electrocutada',
  'descarga electrica', 'caida', 'se cayo', 'golpe', 'golpeado', 'golpeada', 'lesionado', 'lesionada', 'accidente', 'choque', 'atropellado', 'atropellada',
  'agresion', 'agredido', 'agredida', 'herido', 'herida', 'lesion', 'trauma', 'traumatismo', 'sangra', 'sangrando', 'dolor abdominal', 'dolor de cabeza', 'cefalalgia',
  'dificultad para hablar', 'habla arrastrada', 'desviacion de la comisura', 'paralisis', 'cuadro de', 'agitado', 'agitada', 'agitacion', 'alucinaciones', 'idea suicida', 'intento suicida',
  'reaccion alergica', 'alergia', 'urticaria', 'edema', 'hinchazon', 'inflamacion', 'tos con sangre', 'hemoptisis', 'hematemesis', 'melena', 'rectorragia', 'dolor lumbar',
  'fractura', 'luxacion', 'esguince', 'amputacion', 'quemado', 'quemada', 'asfixia', 'paro', 'paro cardiorrespiratorio', 'paro cardiaco', 'en paro'
];

export const LESIONES = [
  'herida', 'heridas', 'laceracion', 'laceraciones', 'fractura', 'fracturas', 'luxacion', 'esguince', 'contusion', 'contusiones', 'hematoma', 'hematomas',
  'equimosis', 'excoriacion', 'excoriaciones', 'abrasion', 'abrasiones', 'quemadura', 'quemaduras', 'amputacion', 'amputado', 'deformidad', 'edema', 'inflamacion',
  'hemorragia', 'sangrado activo', 'trauma', 'traumatismo', 'traumatismo craneoencefalico', 'tce', 'politraumatizado', 'politraumatizada', 'perforacion', 'avulsion', 'evisceracion',
  'crepitacion', 'herida por arma', 'herida por proyectil', 'herida por arma blanca', 'herida por arma de fuego', 'impacto de proyectil', 'eritema', 'ampollas', 'flictenas',
  'escoriaciones', 'escoriacion', 'raspones', 'raspon', 'cortada', 'corte', 'cortadura', 'mordedura', 'picadura', 'otorragia', 'epistaxis', 'hemotorax', 'neumotorax',
  'volet costal', 'dolor a la palpacion', 'dolor a la movilizacion', 'limitacion funcional', 'impotencia funcional', 'exposicion osea', 'fractura expuesta', 'hundimiento', 'pupilas anisocoricas',
  'tiraje', 'cianosis', 'palidez', 'sudoracion profusa', 'trauma de craneo', 'trauma toracico', 'trauma abdominal', 'trauma de pelvis'
];

export const MECANISMOS = [
  'mecanismo de lesion', 'mecanismo de trauma', 'mecanismo', 'se cayo', 'se cayeron', 'cayo de', 'caida de', 'caida desde', 'caida a nivel', 'caida de su propia altura', 'resbalo', 'tropezo', 'se precipito',
  'se lanzo', 'choque', 'choco', 'colision', 'colisiono', 'volcadura', 'volcaron', 'se volco', 'accidente vehicular', 'accidente automovilistico', 'accidente de transito', 'accidente en moto', 'accidente motociclistico', 'derrapo',
  'fue atropellado', 'fue atropellada', 'atropellado', 'atropellada', 'atropello', 'impacto', 'fue impactado', 'fue impactada', 'agresion', 'fue agredido', 'fue agredida', 'riña', 'pelea', 'golpeado con', 'golpeada con',
  'herida por arma', 'lesion por', 'quemadura por', 'electrocutado', 'electrocutada', 'se electrocuto', 'ahogamiento', 'sumersion', 'aplastamiento', 'atrapado', 'atrapada', 'aprisionado', 'aprisionada', 'explosion', 'derrumbe', 'proyectil', 'disparo', 'balazo', 'puñalada', 'punalada', 'cuchillada', 'mordida por', 'mordedura de', 'picadura de', 'intoxicacion por', 'inhalo', 'inhalacion de', 'ingirio', 'ingesta de'
];

export const DISPARADORES = {
  motivo: [
    'motivo de urgencia', 'motivo de consulta', 'motivo principal', 'motivo de la llamada', 'motivo de atencion', 'acude por', 'acuden por', 'acudimos por', 'acudimos a', 'nos llaman por',
    'refiere', 'refiere que', 'manifiesta', 'se queja de', 'se queja', 'presenta', 'presentando', 'cursa con', 'cursando con', 'con cuadro de', 'cuadro clinico de', 'cuadro de', 'inicia con', 'inicio con',
    'comienza con', 'comenzo con', 'dice que', 'comenta que', 'padecimiento actual', 'se encuentra con', 'se encontro con', 'lo encontramos con', 'la encontramos con', 'es atendido por', 'es atendida por',
    'atendemos por', 'atendemos a paciente con', 'paciente con', 'paciente que', 'se reporta', 'reportan', 'nos reportan', 'reporte de'
  ],
  diagnostico: [
    'diagnostico presuntivo', 'diagnostico probable', 'diagnostico clinico', 'diagnostico', 'impresion diagnostica', 'impresion clinica', 'sospecha de', 'sospecha diagnostica', 'sospechamos', 'sospecho',
    'probable', 'probablemente', 'posible', 'posiblemente', 'compatible con', 'cuadro compatible con'
  ],
  necesidades: [
    'se requiere', 'requiere', 'requerimos', 'necesita', 'necesitamos', 'se necesita', 'solicitamos', 'solicito', 'se solicita', 'favor de preparar', 'preparar', 'preparen', 'alisten', 'alistar', 'necesidades'
  ],
  alergias: ['alergico a', 'alergica a', 'alergias', 'alergia a', 'alergia', 'es alergico', 'es alergica', 'alergico', 'alergica'],
  medicamentos: [
    'medicamentos', 'medicacion habitual', 'medicacion de base', 'medicamentos habituales', 'esta tomando', 'toma medicamento', 'toma medicamentos', 'toma', 'ingiere', 'tratamiento con', 'en tratamiento con',
    'bajo tratamiento con', 'se medica con', 'tratamiento habitual', 'tratamiento de base', 'se inyecta'
  ],
  antecedentes: [
    'antecedentes de importancia', 'antecedentes patologicos', 'antecedentes personales', 'antecedentes medicos', 'antecedentes', 'historial medico', 'historia clinica', 'tiene antecedente de', 'cuenta con antecedente de',
    'con antecedente de', 'enfermedades previas', 'padece', 'es paciente', 'enfermedades cronicas', 'cronico degenerativo', 'cronico degenerativa'
  ],
  ultima_comida: ['ultima comida', 'ultima ingesta', 'ultimo alimento', 'ultima alimentacion', 'ingesta de alimentos', 'comio', 'desayuno', 'almorzo', 'ceno', 'comida fue', 'ayuno', 'en ayunas', 'sin comer'],
  destino: [
    'hospital destino', 'destino del paciente', 'traslado a', 'trasladamos a', 'trasladamos al', 'trasladado a', 'trasladado al', 'trasladada a', 'trasladada al', 'llevamos a', 'llevamos al', 'vamos a', 'vamos al',
    'rumbo a', 'rumbo al', 'con destino a', 'con destino al', 'nos dirigimos a', 'nos dirigimos al', 'conducimos a', 'conducimos al', 'ingresa a', 'ingresamos a', 'ingresamos al', 'se traslada a', 'se traslada al',
    'se lleva a', 'se lleva al', 'destino', 'hospital receptor', 'unidad receptora'
  ],
  riesgos: ['riesgos en escena', 'riesgos en la escena', 'riesgo en escena', 'riesgo en la escena', 'riesgos de la escena', 'peligros en escena', 'peligros en la escena', 'peligro en escena', 'escena insegura', 'escena con riesgo', 'riesgos', 'peligros'],
  acompanante: ['acompanante', 'lo acompana', 'la acompana', 'acompanado por', 'acompanado de', 'acompanada por', 'acompanada de', 'familiar responsable', 'familiar que lo acompana', 'familiar que la acompana'],
  nombre: ['se llama', 'de nombre', 'nombre es', 'su nombre es', 'nombre del paciente', 'nombre', 'responde al nombre de', 'identificado como', 'identificada como', 'le llaman', 'dice llamarse', 'dice llamarse', 'respondiendo al nombre de', 'llamado', 'llamada'],
  medico_recibe: ['recibe el doctor', 'recibe la doctora', 'recibe el medico', 'recibe la medica', 'recibe doctor', 'recibe doctora', 'medico que recibe', 'medico receptor', 'recibe el dr', 'recibe la dra', 'lo recibe el doctor', 'la recibe la doctora', 'lo recibe el medico', 'lo recibe el dr', 'la recibe la dra', 'entregamos al doctor', 'entregamos a la doctora', 'entregamos al medico', 'entregamos con el doctor', 'entregamos con la doctora', 'entregamos con el medico']
};

export const LIMITES_CLAUSULA = [
  'ademas', 'tambien', 'posteriormente', 'despues', 'luego', 'entonces', 'mientras', 'pero', 'observamos', 'notamos', 'encontramos', 'valoramos', 'revisamos',
  'exploramos', 'se observa', 'se aprecia', 'se nota', 'a la exploracion', 'tiene', 'tenia', 'lleva', 'le tomamos', 'tomamos', 'nos vamos', 'vamonos',
  'nos dirigimos', 'llegamos', 'salimos', 'ya estamos', 'estamos', 'hola', 'buenas', 'buenos dias', 'buenas tardes', 'buenas noches', 'lo atendimos', 'la atendimos',
  'lo valoramos', 'la valoramos', 'le preguntamos', 'nos dice', 'nos comenta', 'nos refiere', 'su familiar', 'sus familiares', 'testigos', 'segun testigos', 'segun familiares'
];

export const VERBOS_ACCION = [
  'administramos', 'administro', 'administre', 'administrado', 'administrada', 'colocamos', 'coloque', 'coloco', 'colocado', 'colocada', 'realizamos', 'realizo', 'realice', 'realizado', 'realizada',
  'aplicamos', 'aplico', 'apliqué', 'aplique', 'aplicado', 'aplicada', 'pusimos', 'puso', 'pongo', 'puse', 'brindamos', 'brindo', 'brinde', 'iniciamos', 'inicio', 'inicie', 'instalamos', 'instalo', 'instale', 'instalado', 'instalada',
  'canalizamos', 'canalizo', 'canalice', 'inmovilizamos', 'inmovilizo', 'inmovilice', 'intubamos', 'intubo', 'intube', 'ventilamos', 'ventilo', 'ventile', 'monitorizamos', 'monitorizo', 'monitoreamos',
  'dimos', 'dio', 'di', 'damos', 'ministramos', 'ministro', 'ministre', 'ministrado', 'tomamos', 'efectuamos', 'efectuo', 'hicimos', 'hizo', 'hice', 'aspiramos', 'aspiro', 'cubrimos', 'cubrio', 'cubri',
  'vendamos', 'vende', 'controlamos', 'controle', 'controlo', 'detuvimos', 'comprimimos', 'pasamos', 'pase', 'nebulizamos', 'nebulizo', 'descomprimimos', 'atendimos', 'asistimos', 'mantenemos', 'manejamos', 'manejo', 'manejado',
  'aplicandole', 'administrandole', 'poniendole', 'colocandole', 'dandole', 'paso', 'pasaron', 'ponemos', 'colocan', 'aplican', 'administran', 'inyectamos', 'inyecto', 'inyecte',
  'se inicio', 'se realizo', 'se coloco', 'se administro', 'se aplico', 'se canalizo', 'se inmovilizo', 'se intubo', 'se ventilo', 'se monitorizo', 'se ministro', 'se brindo', 'se instalo', 'se puso', 'se dio', 'se tomo', 'se pasaron'
];

export const APOYOS_CON = ['con', 'bajo', 'recibe', 'recibio', 'recibiendo', 'mediante', 'usando', 'en'];

export const EXCLUSIONES_INTERVENCION = [
  'sin', 'falta de', 'necesita', 'requiere', 'requirio', 'ameritaria', 'amerita', 'se sugiere', 'sugiero', 'esperar', 'alergico a', 'alergica a', 'alergia a', 'toma', 'tomando', 'ingiere', 'antecedente',
  'no se le', 'no se', 'no le', 'sin necesidad de', 'se descarta', 'descarta', 'hipoxia', 'deficit de', 'carece de', 'quiere', 'solicita', 'pide', 'solicito', 'solicitamos', 'preparar', 'preparen', 'alisten'
];

export const EVENTOS_TIEMPO = {
  activacion: ['activacion', 'nos activaron', 'nos activo', 'nos activan', 'nos despacharon', 'nos despacho', 'recibimos el llamado', 'recibimos la llamada', 'recibimos el reporte', 'se nos asigno', 'nos asignaron', 'despacho', 'hora de llamada', 'hora del llamado', 'hora de activacion'],
  salida_base: ['salida de base', 'salimos de base', 'salimos de la base', 'salida de la base', 'salimos de la estacion', 'salida de estacion', 'hora de salida de base'],
  llegada_escena: ['llegada a escena', 'llegada a la escena', 'llegamos a escena', 'llegamos a la escena', 'arribo a escena', 'arribo a la escena', 'arribamos a escena', 'arribamos a la escena', 'llegamos al lugar', 'llegada al lugar', 'arribamos al lugar', 'arribo al lugar', 'en escena a las', 'en sitio a las', 'llegamos al sitio', 'hora de llegada a escena'],
  primer_contacto: ['primer contacto', 'contacto con el paciente', 'contacto con paciente', 'contacto paciente', 'abordamos al paciente', 'abordaje del paciente', 'hicimos contacto', 'hora de contacto', 'hora del primer contacto', 'tuvimos contacto con el paciente'],
  salida_escena: ['salida de escena', 'salida de la escena', 'salimos de escena', 'salimos de la escena', 'inicio de traslado', 'inicio del traslado', 'iniciamos traslado', 'iniciamos el traslado', 'salimos del lugar', 'salida del lugar', 'salimos con el paciente', 'hora de salida de escena'],
  llegada_hospital: ['llegada al hospital', 'llegamos al hospital', 'arribo al hospital', 'arribamos al hospital', 'llegamos a urgencias', 'llegada a urgencias', 'llegamos a la clinica', 'llegamos al destino', 'ingreso al hospital', 'hora de llegada al hospital'],
  entrega_paciente: ['entrega del paciente', 'entrega de paciente', 'entregamos al paciente', 'entregamos paciente', 'se entrego al paciente', 'paciente entregado', 'entrega a urgencias', 'hora de entrega'],
  liberacion_unidad: ['liberacion de la unidad', 'liberacion de unidad', 'unidad liberada', 'liberamos la unidad', 'nos liberamos', 'unidad disponible', 'quedamos disponibles', 'salimos del hospital', 'hora de liberacion']
};

export const TIPOS_URGENCIA = [
  { valor: 'Motociclista lesionado', patrones: ['motociclista', 'motocicleta', 'en moto', 'accidente de moto', 'accidente en moto', 'motonetista', 'derrapo en moto', 'derrape de moto', 'se cayo de la moto', 'se cayo de su moto', 'scooter', 'moto'] },
  { valor: 'Atropellamiento', patrones: ['atropellado', 'atropellada', 'atropellamiento', 'atropello', 'fue arrollado', 'fue arrollada', 'arrollado por', 'peaton'] },
  { valor: 'Accidente vehicular', patrones: ['accidente vehicular', 'accidente automovilistico', 'accidente de transito', 'accidente en carretera', 'choque', 'choco', 'colision', 'volcadura', 'se volco', 'volcaron', 'accidente en auto', 'accidente de auto', 'accidente automovilistico', 'impacto vehicular', 'carambola', 'automovil', 'camioneta', 'vehiculo'] },
  { valor: 'Caída', patrones: ['caida', 'se cayo', 'cayo de', 'cayo desde', 'resbalo', 'tropezo', 'se precipito', 'caida de su propia altura', 'caida de altura', 'se desplomo', 'rodo por', 'rodo de'] },
  { valor: 'Agresión', patrones: ['agresion', 'agredido', 'agredida', 'golpeado', 'golpeada', 'golpiza', 'puñalada', 'punalada', 'cuchillada', 'arma blanca', 'arma de fuego', 'balazo', 'disparo', 'herida por proyectil', 'rina', 'riña', 'pelea', 'asalto', 'asaltado', 'asaltada', 'violencia', 'lesion por arma', 'apunalado', 'apunalada', 'baleado', 'baleada'] },
  { valor: 'Persona inconsciente', patrones: ['inconsciente', 'perdio el conocimiento', 'perdida de conocimiento', 'perdida del estado de alerta', 'perdio el estado de alerta', 'desmayo', 'se desmayo', 'sincope', 'desvanecimiento', 'se desvanecio', 'no responde', 'sin respuesta', 'inconsciencia', 'no reacciona', 'no reactivo', 'no reactiva'] }
];

export const EVALUACION = {
  via_aerea: {
    'Libre': ['via aerea libre', 'via aerea permeable', 'via aerea abierta', 'via aerea sin obstruccion', 'via aerea sin compromiso', 'vias aereas libres', 'vias aereas permeables', 'permeable', 'libre de secreciones', 'habla con claridad', 'habla fluida'],
    'Comprometida': ['via aerea comprometida', 'via aerea obstruida', 'via aerea con obstruccion', 'via aerea no permeable', 'vias aereas comprometidas', 'obstruccion de via aerea', 'obstruccion de la via aerea', 'obstruccion', 'obstruida', 'estridor', 'cuerpo extrano', 'sangre en via aerea', 'secreciones en via aerea', 'via aerea con sangre', 'via aerea con secreciones', 'lengua caida', 'se atraganto', 'atragantamiento', 'sin via aerea', 'broncoaspiracion', 'edema de glotis']
  },
  ventilacion: {
    'Adecuada': ['ventilacion adecuada', 'respiracion adecuada', 'ventila bien', 'ventilando bien', 'respira bien', 'respira adecuadamente', 'respiracion normal', 'respira normal', 'respiracion espontanea', 'ventilacion espontanea', 'ventilacion espontanea adecuada', 'buena ventilacion', 'buena entrada de aire', 'murmullo vesicular presente', 'campos pulmonares limpios', 'sin dificultad respiratoria', 'no presenta dificultad respiratoria', 'sin datos de dificultad respiratoria'],
    'Dificultosa': ['ventilacion dificultosa', 'respiracion dificultosa', 'dificultad respiratoria', 'dificultad para respirar', 'dificultad al respirar', 'respira con dificultad', 'disnea', 'falta de aire', 'se ahoga', 'ahogo', 'tiraje', 'aleteo nasal', 'estertores', 'sibilancias', 'respiracion agonica', 'respiracion superficial', 'respiracion rapida', 'respiracion lenta', 'taquipnea', 'bradipnea', 'apnea', 'sin respiracion', 'no respira', 'respiracion ausente', 'ventilacion inadecuada', 'respiracion inadecuada', 'uso de musculos accesorios', 'cianosis']
  },
  circulacion_pulso: {
    'Periférico': ['pulso periferico', 'pulso radial', 'pulso radial presente', 'pulso distal', 'pulsos distales presentes', 'pulsos perifericos presentes', 'pulso palpable', 'pulsos palpables'],
    'Central': ['pulso central', 'pulso carotideo', 'pulso carotideo presente', 'solo pulso central', 'pulso femoral', 'solo pulso carotideo', 'solo se palpa pulso carotideo', 'pulso radial ausente'],
    'Ausente': ['sin pulso', 'pulso ausente', 'ausencia de pulso', 'no tiene pulso', 'no hay pulso', 'no se palpa pulso', 'sin pulso central', 'pulso no palpable', 'pulsos ausentes', 'paro cardiorrespiratorio', 'paro cardiaco', 'asistolia']
  }
};

export const EXPLORACION = {
  cabeza: ['cabeza', 'craneo', 'cara', 'pupilas', 'ojos', 'oidos', 'nariz', 'boca', 'cuero cabelludo', 'cuello', 'region cervical'],
  torax: ['torax', 'pecho', 'costillas', 'campos pulmonares', 'ruidos respiratorios', 'ruidos cardiacos', 'region toracica', 'parrilla costal', 'esternon', 'clavicula', 'hemitorax'],
  abdomen: ['abdomen', 'abdominal', 'vientre', 'pelvis', 'region abdominal', 'flancos', 'epigastrio', 'hipogastrio', 'region lumbar', 'columna', 'genitales'],
  extremidades: ['extremidades', 'extremidad', 'miembros', 'miembro', 'brazo', 'brazos', 'pierna', 'piernas', 'mano', 'manos', 'pie', 'pies', 'muneca', 'tobillo', 'rodilla', 'hombro', 'codo', 'muslo', 'antebrazo', 'dedos', 'extremidades superiores', 'extremidades inferiores']
};

export const PALABRAS_HALLAZGO = [
  'sin alteraciones', 'sin alteracion', 'normal', 'normales', 'integro', 'integra', 'integros', 'sin lesiones', 'sin lesion', 'sin datos', 'crepitacion', 'dolor', 'rigido', 'rigida', 'distendido', 'distendida',
  'blando', 'blanda', 'depresible', 'equimosis', 'herida', 'heridas', 'deformidad', 'hematoma', 'edema', 'simetrico', 'simetrica', 'simetricos', 'asimetria', 'asimetrico', 'isocoricas', 'anisocoricas', 'reactivas', 'reflejo',
  'murmullo', 'ruidos', 'enfisema', 'crepitan', 'fractura', 'luxacion', 'contusion', 'laceracion', 'excoriacion', 'quemadura', 'sangrado', 'hemorragia', 'limitacion', 'movilidad', 'llenado capilar', 'pulso', 'pulsos',
  'palidez', 'cianosis', 'inflamacion', 'inflamada', 'inflamado', 'deformada', 'deformado', 'exposicion', 'perforacion', 'laceracion', 'sensibilidad', 'sin movilidad', 'con movilidad', 'peristalsis', 'timpanismo', 'resistencia', 'defensa', 'rebote', 'hundimiento', 'abultamiento', 'dolor a la palpacion'
];

export const SEXO = {
  M: ['masculino', 'masculina', 'hombre', 'varon', 'senor', 'nino', 'adolescente masculino', 'joven masculino', 'caballero', 'anciano', 'varoncito'],
  F: ['femenino', 'femenina', 'mujer', 'senora', 'nina', 'adolescente femenina', 'joven femenina', 'dama', 'anciana', 'embarazada', 'gestante', 'senorita', 'ninita']
};

export const PALABRAS_NOMBRE_STOP = [
  'masculino', 'femenino', 'masculina', 'femenina', 'de', 'del', 'anos', 'ano', 'tiene', 'edad', 'con', 'que', 'refiere', 'presenta', 'es', 'se', 'sexo', 'y', 'en', 'el', 'la', 'los', 'las', 'a', 'un', 'una',
  'desconocido', 'desconocida', 'conocido', 'conocida', 'paciente', 'hombre', 'mujer', 'masculinos', 'cuenta', 'cursa', 'fue', 'esta', 'estaba', 'su', 'sus', 'no', 'sin', 'al', 'por', 'para', 'llegamos', 'nos', 'lo', 'le'
];

export const NOMBRE_CONECTORES = ['de', 'del', 'la', 'las', 'los', 'y', 'san', 'santa'];

export const VOCABULARIO = {
  frecuencia_cardiaca: [
    'frecuencia cardiaca', 'frecuencia cardíaca', 'fc', 'pulso', 'pulsaciones', 'latidos por minuto', 'lpm', 'latido', 'latidos', 'ritmo cardiaco', 'taquicardia', 'bradicardia', 'taquicardico', 'bradicardico'
  ],
  frecuencia_respiratoria: [
    'frecuencia respiratoria', 'fr', 'respiraciones por minuto', 'rpm', 'respiraciones', 'respiracion', 'ventilaciones por minuto', 'ritmo respiratorio', 'taquipnea'
  ],
  tension_arterial: [
    'tension arterial', 'tensión arterial', 'presion arterial', 'presión arterial', 'ta', 'presion', 'tensión', 'tension', 'tensiones', 'presion alta', 'presion baja', 'hipotension', 'hipertension'
  ],
  saturacion_oxigeno: [
    'saturacion de oxigeno', 'saturación de oxígeno', 'spo2', 'saturacion', 'saturación', 'oximetria', 'oximetría', 'sat o dos', 'saturacion de o2', 'saturometria', 'saturando', 'oxigenacion', 'pulsioximetria', 'oximetro'
  ],
  temperatura: ['temperatura', 'temp', 'grados centigrados', 'grados centígrados', 'grados celsius', 'febril', 'fiebre', 'afebril', 'hipotermia', 'hipertermia'],
  glucemia: ['glucemia', 'glucosa', 'glucosa capilar', 'dextrostix', 'dextro', 'hgt', 'hemoglucotest', 'glucometria', 'glicemia', 'azucar', 'dextrostick', 'destrostix'],
  dolor_eva: ['eva', 'escala visual analoga', 'escala del dolor', 'escala de dolor', 'intensidad del dolor'],
  peso: ['peso', 'pesa', 'kilogramos', 'kilos', 'kg'],
  talla: ['talla', 'mide', 'estatura'],
  glasgow_total: ['glasgow', 'escala de glasgow', 'gcs', 'total de glasgow', 'glascow'],
  glasgow_ocular: ['ocular', 'apertura ocular', 'ojos'],
  glasgow_verbal: ['verbal', 'respuesta verbal'],
  glasgow_motor: ['motor', 'respuesta motora', 'motora'],
  edad: ['años', 'año', 'edad', 'de edad'],
  sexo: ['masculino', 'femenino', 'hombre', 'mujer', 'varón', 'varon'],
  ...Object.fromEntries(Object.entries(INTERVENCIONES).map(([clave, def]) => [clave, [...def.sinonimos, ...def.condicionados]])),
  oxigenoterapia: [...INTERVENCIONES.oxigenoterapia.sinonimos, ...INTERVENCIONES.oxigenoterapia.condicionados, 'oxígeno', 'mascarilla', 'puntas nasales', 'cánula nasal'],
  consciente: ['consciente', 'alerta', 'despierto', 'orientado', 'orientada', 'despierta', 'conectado', 'conectada'],
  inconsciente: ['inconsciente', 'no responde', 'sin respuesta', 'no reactivo', 'no reactiva', 'estuporoso', 'estuporosa', 'comatoso', 'comatosa'],
  confuso: ['confuso', 'confusa', 'desorientado', 'desorientada', 'somnoliento', 'somnolienta', 'letargico', 'letargica', 'agitado', 'agitada', 'combativo', 'combativa'],
  via_aerea_libre: ['via aerea libre', 'vía aérea libre', 'via aerea permeable'],
  via_aerea_comprometida: ['via aerea comprometida', 'vía aérea comprometida', 'obstruccion'],
  respira_adecuada: ['respiracion adecuada', 'respiración adecuada', 'ventilacion adecuada'],
  respira_dificultosa: ['respiracion dificultosa', 'respiración dificultosa', 'dificultad respiratoria']
};

export const COMANDOS = {
  enviar_urgente: [
    'envia urgente', 'envía urgente', 'manda urgente', 'datos urgentes', 'envia reporte urgente', 'envía reporte urgente',
    'manda reporte urgente', 'mandar urgente', 'enviar urgente', 'enviar reporte urgente', 'envio urgente', 'envia los datos urgentes',
    'manda los datos urgentes', 'envia informacion urgente', 'manda informacion urgente', 'envia la version urgente', 'reporte urgente',
    'envia datos urgentes', 'manda datos urgentes', 'mandar reporte urgente', 'urgente al hospital', 'envia urgente al hospital'
  ],
  enviar_completo: [
    'envia reporte', 'envía reporte', 'envia informe', 'envía informe', 'manda el reporte', 'envia completo', 'envía completo',
    'manda informe', 'envia todo', 'envía todo', 'manda completo', 'manda todo', 'enviar reporte', 'enviar informe', 'enviar completo',
    'mandar reporte', 'mandar informe', 'envia hoja de atencion', 'manda hoja de atencion', 'enviar hoja de atencion', 'reporte completo',
    'envia el reporte completo', 'manda el reporte completo', 'envia el reporte', 'manda reporte', 'envia hoja', 'manda hoja', 'envia el informe'
  ],
  detener_captura: [
    'alto', 'detente', 'stop', 'terminar', 'termina grabacion', 'termina grabación', 'fin de captura', 'detener captura', 'detener dictado',
    'fin del dictado', 'termina dictado', 'termina el dictado', 'deten el dictado', 'para de grabar', 'deja de grabar', 'finalizar dictado', 'fin dictado', 'listo es todo', 'eso es todo'
  ],
  limpiar: ['limpia', 'borra todo', 'reinicia captura', 'reinicia', 'borra dictado', 'borra el dictado', 'limpia dictado', 'limpia el dictado', 'empieza de nuevo', 'comienza de nuevo', 'reinicia dictado', 'reinicia el dictado']
};

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
  'dea': 'desfibrilador externo automatico',
  'hgt': 'glucemia',
  'pam': 'presion arterial media'
};

export const CORRECCIONES_FONETICAS = {
  'espacio dos': 'spo2',
  's p o dos': 'spo2',
  'es pe o dos': 'spo2',
  'sp o dos': 'spo2',
  'sp o2': 'spo2',
  'sat dos': 'spo2',
  'sat o2': 'spo2',
  'saturacion dos': 'spo2',
  'ochenta sobre ciento veinte': '120/80',
  'ciento veinte sobre ochenta': '120/80',
  'doce por ocho': '120/80',
  'ciento diez sobre setenta': '110/70',
  'noventa sobre sesenta': '90/60',
  'glascow': 'glasgow',
  'glasco': 'glasgow',
  'glasgo': 'glasgow',
  'glas cow': 'glasgow',
  'glass cow': 'glasgow',
  'glasgou': 'glasgow',
  'clascow': 'glasgow',
  'gas cow': 'glasgow',
  'dextro stix': 'dextrostix',
  'dextro stick': 'dextrostix',
  'destrostix': 'dextrostix',
  'dextrostick': 'dextrostix',
  'hemo gluco test': 'hemoglucotest',
  'hemogluco test': 'hemoglucotest',
  'efe ce': 'fc',
  'efe erre': 'fr',
  'e v a': 'eva',
  'gece ese': 'gcs',
  'ge ce ese': 'gcs'
};