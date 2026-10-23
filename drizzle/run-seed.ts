import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { db } from '../api/src/db';
import { schools } from './schema';
import { seedCorePillars } from './seed';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '..', '.env') });

async function main() {
  console.log('=== AnySchool Database Seed ===\n');

  // Create or find test school
  let school = await db.query.schools.findFirst();

  if (!school) {
    const [newSchool] = await db.insert(schools).values({
      name: 'Demo Academy',
      slug: 'demo-academy',
      plan: 'starter',
      status: 'active',
    }).returning();
    school = newSchool;
    console.log(`Created school: ${school.name} (${school.id})`);
  } else {
    console.log(`Found existing school: ${school.name} (${school.id})`);
  }

  // Seed core pillars
  await seedCorePillars(school.id);

  console.log('\n=== Seed complete! ===');
  process.exit(0);
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
