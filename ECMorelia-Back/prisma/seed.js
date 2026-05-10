const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed...');

  // 1. Estados del Paciente
  // Usamos createMany para insertar el array completo de una sola vez

  // 2. Tipos de Lesión
  await prisma.tipoLesion.createMany({
    data: [
      { descripcion: 'Hemorragia' },
      { descripcion: 'Contusión' },
      { descripcion: 'Abrasión' },
      { descripcion: 'Herida' },
      { descripcion: 'Fractura' },
      { descripcion: 'Quemadura' },
      { descripcion: 'Alteración en la sensibilidad' },
      { descripcion: 'Alteración en la movilidad' },
      { descripcion: 'Dolor' },
      { descripcion: 'Otro' },
    ],
    skipDuplicates: true,
  });

  console.log('Datos de las tablas de catálogo insertados correctamente.');
}

main()
  .catch((e) => {
    console.error('Error en el seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });