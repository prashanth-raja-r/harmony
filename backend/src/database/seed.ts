import 'dotenv/config';
import { DataSource } from 'typeorm';
import { Category } from '../entities/category.entity';

const SYSTEM_CATEGORIES = [
  { name: 'Food & Dining',     icon: '🍔', color: '#F59E0B' },
  { name: 'Groceries',         icon: '🛒', color: '#84CC16' },
  { name: 'Transport',         icon: '🚗', color: '#14B8A6' },
  { name: 'Shopping',          icon: '🛍️', color: '#8B5CF6' },
  { name: 'Entertainment',     icon: '🎬', color: '#EC4899' },
  { name: 'Health & Medical',  icon: '🏥', color: '#FB7185' },
  { name: 'Utilities',         icon: '⚡', color: '#F97316' },
  { name: 'Rent & Housing',    icon: '🏠', color: '#4F46E5' },
  { name: 'Education',         icon: '📚', color: '#0EA5E9' },
  { name: 'Personal Care',     icon: '💆', color: '#A78BFA' },
  { name: 'Travel',            icon: '✈️', color: '#06B6D4' },
  { name: 'Subscriptions',     icon: '📱', color: '#6366F1' },
  { name: 'Insurance',         icon: '🛡️', color: '#64748b' },
  { name: 'Investments',       icon: '📈', color: '#10B981' },
  { name: 'EMI / Loan',        icon: '🏦', color: '#EF4444' },
  { name: 'Miscellaneous',     icon: '💸', color: '#94A3B8' },
];

async function main() {
  const ds = new DataSource({
    type: 'postgres',
    url: process.env['DATABASE_URL'],
    entities: [Category],
    synchronize: false,
  });

  await ds.initialize();
  const repo = ds.getRepository(Category);

  console.log('Seeding system categories…');

  for (const cat of SYSTEM_CATEGORIES) {
    const id = `sys_${cat.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
    const existing = await repo.findOneBy({ id });
    if (existing) {
      await repo.update(id, { name: cat.name, icon: cat.icon, color: cat.color });
    } else {
      await repo.save(repo.create({ id, name: cat.name, icon: cat.icon, color: cat.color, isSystem: true }));
    }
    console.log(`  ✓ ${cat.icon} ${cat.name}`);
  }

  console.log(`\nDone — ${SYSTEM_CATEGORIES.length} system categories seeded.`);
  await ds.destroy();
}

main().catch(console.error);
