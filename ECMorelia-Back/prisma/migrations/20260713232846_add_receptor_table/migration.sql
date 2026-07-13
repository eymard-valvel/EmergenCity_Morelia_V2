-- CreateTable
CREATE TABLE "receptor" (
    "id" SERIAL NOT NULL,
    "nombre" VARCHAR(50),
    "licencia_medica" VARCHAR(50),
    "password" VARCHAR(72),

    CONSTRAINT "receptor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receptor_licencia_medica_key" ON "receptor"("licencia_medica");
