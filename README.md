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
