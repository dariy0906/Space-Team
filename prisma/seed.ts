import { PrismaClient } from '@prisma/client';
import { seedDemo } from '../scripts/seed-demo';

const db = new PrismaClient();

seedDemo(db)
  .then((summary) => console.log('Seed complete:', JSON.stringify(summary)))
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
