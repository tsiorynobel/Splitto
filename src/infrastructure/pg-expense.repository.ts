import type { Pool } from 'pg';
import type { Expense, ExpenseSplit } from '../domain/types';
import type { ExpenseRepository } from '../ports/expense.repository';

export class PgExpenseRepository implements ExpenseRepository {
  constructor(private readonly pool: Pool) {}

  async save(expense: Expense): Promise<void> {
    await this.pool.query(
      `INSERT INTO expenses
         (id, group_id, description, amount, currency, paid_by, paid_at,
          split_mode, split_data, category, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        expense.id,
        expense.groupId,
        expense.description,
        expense.amount,
        expense.currency,
        expense.paidBy,
        expense.paidAt,
        expense.split.mode,
        JSON.stringify(expense.split),
        expense.category ?? null,
        expense.createdAt,
      ],
    );
  }

  async findById(id: string): Promise<Expense | null> {
    const { rows } = await this.pool.query(
      'SELECT * FROM expenses WHERE id = $1',
      [id],
    );
    return rows.length === 0 ? null : rowToExpense(rows[0]);
  }

  async findByGroupId(groupId: string): Promise<Expense[]> {
    const { rows } = await this.pool.query(
      'SELECT * FROM expenses WHERE group_id = $1 ORDER BY paid_at DESC',
      [groupId],
    );
    return rows.map(rowToExpense);
  }

  async findInDateRange(groupId: string, from: Date, to: Date): Promise<Expense[]> {
    const { rows } = await this.pool.query(
      `SELECT * FROM expenses
       WHERE group_id = $1 AND paid_at >= $2 AND paid_at <= $3
       ORDER BY paid_at ASC`,
      [groupId, from, to],
    );
    return rows.map(rowToExpense);
  }
}

function rowToExpense(row: Record<string, unknown>): Expense {
  return {
    id: row.id as string,
    groupId: row.group_id as string,
    description: row.description as string,
    amount: Number(row.amount),
    currency: row.currency as Expense['currency'],
    paidBy: row.paid_by as string,
    paidAt: new Date(row.paid_at as string),
    split: row.split_data as ExpenseSplit,
    createdAt: new Date(row.created_at as string),
    category: row.category != null ? (row.category as string) : undefined,
  };
}
