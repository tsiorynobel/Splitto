import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PgExpenseRepository } from '../../src/infrastructure/pg-expense.repository';
import type { Expense } from '../../src/domain/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATION_PATH = join(__dirname, '../../migrations/001-initial.sql');

function makeExpense(overrides: Partial<Expense> = {}): Expense {
  return {
    id: 'exp-001',
    groupId: 'grp-001',
    description: 'Restaurant',
    amount: 60,
    currency: 'EUR',
    paidBy: 'member-alice',
    paidAt: new Date('2024-03-15T12:00:00Z'),
    split: {
      mode: 'equal',
      beneficiaries: ['member-alice', 'member-bob', 'member-charlie'],
    },
    createdAt: new Date('2024-03-15T12:01:00Z'),
    ...overrides,
  };
}

let container: StartedPostgreSqlContainer;
let pool: Pool;
let repo: PgExpenseRepository;

beforeAll(async () => {
  container = await new PostgreSqlContainer('postgres:16-alpine').start();
  pool = new Pool({ connectionString: container.getConnectionUri() });

  const migration = readFileSync(MIGRATION_PATH, 'utf8');
  await pool.query(migration);

  await pool.query(
    `INSERT INTO groups (id, name, currency) VALUES
      ('grp-001', 'Vacances', 'EUR'),
      ('grp-002', 'Bureau', 'EUR')`,
  );
  await pool.query(
    `INSERT INTO members (id, group_id, name, email) VALUES
      ('member-alice',   'grp-001', 'Alice',   'alice@test.com'),
      ('member-bob',     'grp-001', 'Bob',     'bob@test.com'),
      ('member-charlie', 'grp-001', 'Charlie', 'charlie@test.com'),
      ('member-dave',    'grp-002', 'Dave',    'dave@test.com')`,
  );

  repo = new PgExpenseRepository(pool);
}, 90_000);

afterAll(async () => {
  await pool.end();
  await container.stop();
});

beforeEach(async () => {
  await pool.query('TRUNCATE expenses CASCADE');
});

describe('PgExpenseRepository', () => {
  it('save() puis findById() retourne une expense avec les mêmes valeurs', async () => {
    const expense = makeExpense({ category: 'Food' });

    await repo.save(expense);
    const found = await repo.findById(expense.id);

    expect(found).not.toBeNull();
    expect(found!.id).toBe(expense.id);
    expect(found!.groupId).toBe(expense.groupId);
    expect(found!.description).toBe(expense.description);
    expect(found!.amount).toBe(expense.amount);
    expect(found!.currency).toBe(expense.currency);
    expect(found!.paidBy).toBe(expense.paidBy);
    expect(found!.paidAt.toISOString()).toBe(expense.paidAt.toISOString());
    expect(found!.split).toEqual(expense.split);
    expect(found!.category).toBe(expense.category);
  });

  it('findById() retourne null pour un id inexistant', async () => {
    const found = await repo.findById('inexistant');
    expect(found).toBeNull();
  });

  it('findByGroupId() retourne uniquement les expenses du groupe demandé', async () => {
    const expenseGrp1a = makeExpense({ id: 'exp-grp1-a', groupId: 'grp-001' });
    const expenseGrp1b = makeExpense({
      id: 'exp-grp1-b',
      groupId: 'grp-001',
      paidAt: new Date('2024-03-16T12:00:00Z'),
    });
    const expenseGrp2 = makeExpense({
      id: 'exp-grp2',
      groupId: 'grp-002',
      paidBy: 'member-dave',
      split: { mode: 'equal', beneficiaries: ['member-dave'] },
    });

    await repo.save(expenseGrp1a);
    await repo.save(expenseGrp1b);
    await repo.save(expenseGrp2);

    const expenses = await repo.findByGroupId('grp-001');

    expect(expenses).toHaveLength(2);
    expect(expenses.every((e) => e.groupId === 'grp-001')).toBe(true);

    const expenseGrp2FromDB = await repo.findByGroupId('grp-002');
    expect(expenseGrp2FromDB).toHaveLength(1);
    expect(expenseGrp2FromDB[0].id).toBe('exp-grp2');
  });

  it('findInDateRange() retourne les expenses dans la plage (bornes incluses)', async () => {
    const jan = makeExpense({ id: 'exp-jan', paidAt: new Date('2024-01-15T12:00:00Z') });
    const feb = makeExpense({ id: 'exp-feb', paidAt: new Date('2024-02-01T12:00:00Z') });
    const mar = makeExpense({ id: 'exp-mar', paidAt: new Date('2024-03-15T12:00:00Z') });

    await repo.save(jan);
    await repo.save(feb);
    await repo.save(mar);

    const results = await repo.findInDateRange(
      'grp-001',
      new Date('2024-01-01T00:00:00Z'),
      new Date('2024-02-28T23:59:59Z'),
    );

    expect(results).toHaveLength(2);
    const ids = results.map((e) => e.id);
    expect(ids).toContain('exp-jan');
    expect(ids).toContain('exp-feb');
    expect(ids).not.toContain('exp-mar');
  });

  it('findInDateRange() inclut les bornes exactes', async () => {
    const exact = makeExpense({ id: 'exp-exact', paidAt: new Date('2024-01-15T00:00:00Z') });
    await repo.save(exact);

    const results = await repo.findInDateRange(
      'grp-001',
      new Date('2024-01-15T00:00:00Z'),
      new Date('2024-01-15T00:00:00Z'),
    );

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('exp-exact');
  });

  it('rejette un doublon avec la contrainte UNIQUE (group_id, paid_at, amount, paid_by)', async () => {
    const expense = makeExpense();
    await repo.save(expense);

    const duplicate = makeExpense({ id: 'exp-duplicate' });
    await expect(repo.save(duplicate)).rejects.toThrow();
  });

  it('rollback proprement quand une transaction échoue à mi-parcours', async () => {
    const expense1 = makeExpense({ id: 'exp-tx-1' });
    const expense2 = makeExpense({ id: 'exp-tx-2' });

    const client = await pool.connect();
    let caughtError: Error | null = null;

    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO expenses
           (id, group_id, description, amount, currency, paid_by, paid_at, split_mode, split_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          expense1.id, expense1.groupId, expense1.description, expense1.amount,
          expense1.currency, expense1.paidBy, expense1.paidAt, expense1.split.mode,
          JSON.stringify(expense1.split), expense1.createdAt,
        ],
      );
      await client.query(
        `INSERT INTO expenses
           (id, group_id, description, amount, currency, paid_by, paid_at, split_mode, split_data, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          expense2.id, expense2.groupId, expense2.description, expense2.amount,
          expense2.currency, expense2.paidBy, expense2.paidAt, expense2.split.mode,
          JSON.stringify(expense2.split), expense2.createdAt,
        ],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      caughtError = err as Error;
    } finally {
      client.release();
    }

    expect(caughtError).not.toBeNull();

    const found1 = await repo.findById(expense1.id);
    const found2 = await repo.findById(expense2.id);
    expect(found1).toBeNull();
    expect(found2).toBeNull();
  });

  it('findByGroupId() retourne un tableau vide pour un groupe sans dépenses', async () => {
    const expenses = await repo.findByGroupId('grp-001');
    expect(expenses).toHaveLength(0);
  });

  it('sauvegarde correctement une expense sans category', async () => {
    const expense = makeExpense({ id: 'exp-no-cat' });

    await repo.save(expense);
    const found = await repo.findById('exp-no-cat');

    expect(found).not.toBeNull();
    expect(found!.category).toBeUndefined();
  });
});
