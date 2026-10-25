## Como ejecutar las imagenes de Docker, y en general, el proyecto en local. 

1. Verificar tener instalado Docker Desktop y PostgreSQL (verificar si se encuentra instalado en terminal con el comando psql). 
IMPORTANTE: Borrar la carpeta /node_modules dentro de la carpeta ECMorelia-Back, para que se instalen las dependencias desde cero a la imagen. 

2. Ejecutar el comando en la carpeta principal del proyecto: 
```bash
docker compose build
docker compose up -d
```
Verificar tambien si la creación de los volúmenes es correcta en Docker Desktop. 

3. (Opcional) Para verificar si se puede acceder a la BD, ejecutar el siguiente comando en terminal: 
```bash
psql -h localhost -p 5432 -U posgres -d ecmorelia_db
```
Verificar la creación de las tablas con: 
```bash
\c
```
La contraseña es 1234 (perdón por la tardanza). 

---

## Reporte de despliegue (Vercel)

### 1) Frontend → Vercel
- **Carpeta del proyecto:** `ECMorelia-Front` (no usar la raíz del repo).
- **Framework Preset:** Vite. **Root Directory:** `ECMorelia-Front/`.
- **Build Command:** `npm run build` (hace `tsc && vite build`, salida en `dist/`). **Install Command:** `npm install`.
- **Variables de entorno** (dashboard de Vercel → Settings → Environment Variables; los `.env` locales están gitignored y NO llegan solos):
  - `VITE_API=https://<backend-rest>.onrender.com` — **SIN `/api`**: las rutas del backend son `/auth`, `/hospital`, `/operador`, `/reporte-prehospitalario`, etc.
  - `VITE_WS_URL=wss://<backend-ws>.onrender.com/ws`
- Verificar antes de pushear que `npm run build` pase en local (el paso `tsc` puede marcar errores de tipos en producción).

### 2) Backend → Render (dos servicios + Postgres) [O donde se encuentre desplegado ahorita]
- **Base de datos:** Render Postgres (o Neon). Tomar la cadena de conexión y usarla como `DATABASE_URL` en los dos servicios. Correr las migraciones: `npx prisma migrate deploy`.
- **Servicio REST + Auth (main.js):** Root `ECMorelia-Back/`. **Start Command:** `node main.js` (NO `npm start`, que es nodemon). Env: `DATABASE_URL`, `SECRET=<clave-para-JWT>`.
- **Servicio WebSocket mejorado (websocket-server.js):** Root `ECMorelia-Back/`. **Start Command:** `node websocket-server.js`. Env: `DATABASE_URL`, `MAPBOX_TOKEN` (lo usa el geocoding de rutas).

### 3) Cambios de código necesarios antes de desplegar
1. **`websocket-server.js` (línea ~1137):** usa `const PORT = process.env.WS_PORT || 3002;`. Render solo reenvía tráfico al puerto `process.env.PORT`, así que hay que cambiarlo a `const PORT = process.env.PORT || 3002;` (si no, el WS nunca recibe tráfico desde fuera).
2. **`prisma/seed.js`:** está roto — usa `prisma.tipoLesion` y el modelo es `tipo_lesion`. Corregirlo antes de ejecutar `npm run seed` en producción.
3. **No commitear `.env`:** revisar `.gitignore`; las credenciales van solo en los dashboards (Vercel/Render).

### 4) Verificación del flujo desplegado
1. Login con cada rol → `POST https://<backend-rest>.onrender.com/auth/login/:role` responde 200.
2. Hospital conectado ve la lista de ambulancias y el Operador ve los hospitales en el drawer "Trasladar".
3. **Ojo:** el estado de ambulancias/hospitales vive en memoria del proceso WebSocket; todos los clientes deben apuntar al **mismo** `VITE_WS_URL` (un solo servidor), o las listas saldrán vacías/duplicadas. 

---

## Módulo de Procesamiento de Lenguaje Natural (PLN/NLP)

El módulo de PLN se encuentra distribuido entre el frontend y backend del proyecto, con un enfoque híbrido (reglas locales + enriquecimiento opcional con modelos ML en cliente).

### Arquitectura General

- **Frontend:** `ECMorelia-Front/src/components/pln/` (parser local, BERT en cliente, orquestador, componentes de voz)
- **Backend:** `ECMorelia-Back/services/{medicalParser,nlpParser}.js` y `ECMorelia-Back/routes/nlp.js` (endpoint `/api/nlp/parse` para enriquecimiento)

### Tecnologías Utilizadas

#### Frontend (`ECMorelia-Front/`)

| Tecnología/Librería | Versión | Uso | Tipo |
|---|---|---|---|
| [@huggingface/transformers](https://huggingface.co/docs/transformers.js) | `^4.3.1` | Ejecución de modelos BERT/Transformers directamente en el navegador (Transformers.js). Permite inferencia local sin enviar texto completo a APIs externas. | Cliente (in-browser ML) |
| [compromise](https://github.com/spencermountain/compromise) | `^14.16.0` | NLP ligero basado en reglas para análisis gramatical/lingüístico. | Cliente/General |
| Parser Local Propio (reglas) | N/A | Sistema basado en glosario médico, anclas de sección, normalización fonética, conversión de números hablados a dígitos, expansión de abreviaciones. | Propietario/Reglas |

**Modelos BERT utilizados (cargados vía Transformers.js desde HuggingFace Hub):**

| Modelo | Tarea | Propósito |
|---|---|---|
| [Xenova/distilbert-base-multilingual-cased-sentiments-student](https://huggingface.co/Xenova/distilbert-base-multilingual-cased-sentiments-student) | `text-classification` (sentimiento) | Análisis de tono/emocional del dictado paramédico |
| [Xenova/multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small) | `feature-extraction` (embeddings/similitud) | Clasificación semántica por sección y detección de comandos por similitud coseno |
| [Xenova/bert-base-multilingual-cased-ner-hrl](https://huggingface.co/Xenova/bert-base-multilingual-cased-ner-hrl) | `token-classification` (NER) | Extracción de entidades (personas, ubicaciones, organizaciones, fechas). Se desactiva en conexiones lentas/dispositivos ligeros |

#### Backend (`ECMorelia-Back/`)

| Tecnología/Librería | Versión | Uso | Tipo |
|---|---|---|---|
| [compromise](https://github.com/spencermountain/compromise) | `^14.16.0` | Soporte para parsing NLP en el servidor. | Servidor |
| Parser Contextual Propio | N/A | `medicalParser.js` con lógica heurística avanzada para extracción estructurada (paciente, signos vitales, Glasgow, motivo, lesiones, intervenciones). `nlpParser.js` como parser alternativo. | Propietario/Reglas |

**Endpoint:** `POST /api/nlp/parse` (montado en `main.js` como `/api/nlp`)

### Flujo de Procesamiento

1. **Normalización local (siempre):** Conversión de números hablados, correcciones fonéticas, expansión de abreviaciones, limpieza de texto
2. **División por secciones:** Detección por anclas semánticas (motivo, signos vitales, Glasgow, lesiones, intervenciones, demografía, destino)
3. **Extracción estructurada:** Regex/heurísticas para extraer valores numéricos, escalas, entidades médicas
4. **Enriquecimiento opcional:** Si el backend responde (`/api/nlp/parse`) se fusionan resultados; si no, continúa con parser local
5. **Enriquecimiento BERT (cliente, opcional):** Si habilitado y dispositivo lo permite, ejecuta análisis de sentimiento, similitud semántica, NER y comandos semánticos en el navegador

### Características de Optimización

- **Ejecución local primero:** El parser basado en reglas siempre funciona sin conexión
- **Adaptativo:** Detecta `navigator.connection`, `saveData`, `deviceMemory` para deshabilitar modelos pesados en clientes ligeros
- **Almacenamiento de preferencia:** `localStorage` (`emergencity_bert`) para habilitar/deshabilitar BERT
- **Timeouts y fallbacks:** Llamadas al backend con timeout de 2.5s, degradación silenciosa si fallan
- **Modelos quantizados/Xenova:** Los modelos de Transformers.js usados son versiones optimizadas para ejecución en navegador

### Análisis Económico: APIs/Plataformas con Pago vs Alternativas

#### Estado Actual

**No se detectaron claves de API de pago activas en el código fuente.** La arquitectura actual utiliza mayoritariamente:
- **Modelos open-source ejecutados localmente** (Transformers.js descargando desde HuggingFace Hub - los modelos son públicos)
- **Parsers basados en reglas** (sin costo por llamada)
- **Endpoint propio en backend** (sin terceros pagos)

**Consideraciones sobre costos si se mantienen así:**
- **HuggingFace Hub (descarga de modelos):** Los modelos Xenova son públicos. La primera carga descarga pesos al navegador (caché del navegador). **Sin costo directo por inferencia** si se autoalojan los modelos.
- **Ancho de banda:** Descarga inicial de modelos (~50-150MB total según modelos) por cliente. Reutilizable por caché.
- **Hosting backend/frontend:** Costos ya existentes en Render/Vercel independientemente de NLP.

#### Riesgos Económicos si se Migrara a APIs Comerciales

| Servicio | Modelo/Tarifa (referencial) | Ventajas | Desventajas Económicas |
|---|---|---|---|
| [OpenAI API](https://openai.com/api/pricing/) (GPT-4o/GPT-4o-mini) | Por 1K tokens (input/output) | Muy preciso para extracción médica, comprensión contextual, menos reglas a mantener | **Alto costo a escala** (miles de dictados/mes). Requiere envío de PHI a terceros (cumplimiento). Necesita API key y monitoreo de gasto. |
| [Google Cloud Natural Language](https://cloud.google.com/natural-language/pricing) | Por 1K unidades | Robusto, buena integración, NER general | Costo por llamada, menos especializado en terminología prehospitalaria mexicana. Puede requerir customización. |
| [Azure AI Language](https://azure.microsoft.com/pricing/details/cognitive-services/language-service/) | Por texto procesado | Buen ecosistema Azure, opciones de cumplimiento | Precios por volumen, requiere suscripción Azure, menos flexible para formatos médicos custom. |
| [Anthropic Claude API](https://www.anthropic.com/pricing) | Por tokens | Buen razonamiento, contexto largo | Similar a OpenAI: costo por uso, envío a terceros, latencia variable. |
| [Groq](https://console.groq.com/pricing) / [Together AI](https://www.together.ai/pricing) | Por tokens | Inferencia rápida, modelos open-source accesibles por API | Aún de pago por uso. Dependencia de proveedor. Costos pueden escalar. |

#### Alternativas Recomendadas (Sin/Costo Reducido)

| Alternativa | Implementación | Ventajas | Desventajas |
|---|---|---|---|
| [Transformers.js](https://huggingface.co/docs/transformers.js) (actual) | Mantener modelos en cliente | **Sin costo por inferencia**, funciona offline, datos no salen del navegador, escalable sin costo marginal | Mayor carga inicial, limitado por recursos del dispositivo, requiere optimización para móvil |
| [Ollama](https://ollama.com/) + modelo local | Autoalojar en servidor propio (on-prem/VPS) | Sin costo por llamada, control total de datos, sin depender de terceros para inferencia | Requiere GPU/recursos en servidor, costos de infraestructura fija, mantenimiento de modelos |
| [HuggingFace Inference API](https://huggingface.co/inference-api) | Usar API gratuita con rate limits o plan pago | Fácil, muchos modelos médicos disponibles | Límites gratuitos, latencia, datos pasan por terceros, puede volverse pago con volumen alto |
| [Whisper.cpp](https://github.com/ggml-org/whisper.cpp) / [Vosk](https://alphacephei.com/vosk/) | STT local (si se añade transcripción) | Transcripción sin costo, offline | Requiere integración, modelos locales consumen recursos |
| [spaCy](https://spacy.io/) + [scispaCy](https://github.com/allenai/scispacy) | Servidor Python o Node.js | Robusto, extensible, open-source, sin costo por uso | Requiere servidor con recursos, setup más complejo, modelos pueden ser pesados |

### Recomendaciones para el Proyecto

- **Mantener enfoque híbrido actual:** El parser basado en reglas es ideal para terminología prehospitalaria estructurada (signos vitales, Glasgow) y tiene **costo cero**.
- **Optimizar Transformers.js:** Considerar autoalojar los mode
