## Como ejecutar las imagenes de Docker, y en general, el proyecto en local. 

1. Verificar tener instalado Docker Desktop y PostgreSQL (verificar si se encuentra instalado en terminal con el comando psql). 

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
