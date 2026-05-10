import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExpenseService } from '../../src/domain/expense.service';
import type { ExpenseRepository } from '../../src/ports/expense.repository';
import type { EmailNotifier } from '../../src/ports/notifier';
import type { Clock } from '../../src/ports/clock';
import type { IdGenerator } from '../../src/ports/id-generator';
import type { Logger } from '../../src/ports/logger';
import type { Expense, CreateExpenseInput } from '../../src/domain/types';

// ─── DUMMY ──────────────────────────────────────────────────────────────────
const dummyLogger: Logger = {
  info: () => {},
  error: () => {},
};

// ─── STUB ────────────────────────────────────────────────────────────────────
const FIXED_DATE = new Date('2024-06-01T12:00:00.000Z');
const FIXED_ID = 'expense-test-001';

const stubClock: Clock = {
  now: () => FIXED_DATE,
};

const stubIdGen: IdGenerator = {
  next: () => FIXED_ID,
};

// ─── FAKE ────────────────────────────────────────────────────────────────────
class FakeExpenseRepository implements ExpenseRepository {
  private readonly store = new Map<string, Expense>();

  async save(expense: Expense): Promise<void> {
    this.store.set(expense.id, expense);
  }

  async findById(id: string): Promise<Expense | null> {
    return this.store.get(id) ?? null;
  }

  async findByGroupId(groupId: string): Promise<Expense[]> {
    return [...this.store.values()].filter((e) => e.groupId === groupId);
  }

  async findInDateRange(groupId: string, from: Date, to: Date): Promise<Expense[]> {
    return [...this.store.values()].filter(
      (e) => e.groupId === groupId && e.paidAt >= from && e.paidAt <= to,
    );
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  get(id: string): Expense | undefined {
    return this.store.get(id);
  }
}

// ─── SPY ─────────────────────────────────────────────────────────────────────
class SpyNotifier implements EmailNotifier {
  readonly calls: { groupId: string; message: string }[] = [];

  async notifyGroupMembers(groupId: string, message: string): Promise<void> {
    this.calls.push({ groupId, message });
  }

  wasCalledWith(groupId: string): boolean {
    return this.calls.some((c) => c.groupId === groupId);
  }

  callCount(): number {
    return this.calls.length;
  }
}

// ─── MOCK ─────────────────────────────────────────────────────────────────────
function createMockNotifier() {
  const notifyGroupMembers = vi.fn<(groupId: string, message: string) => Promise<void>>().mockResolvedValue(undefined);
  const mock: EmailNotifier = { notifyGroupMembers };
  return { mock, notifyGroupMembers };
}

const baseInput: CreateExpenseInput = {
  groupId: 'group-42',
  description: 'Dîner au restaurant',
  amount: 90,
  currency: 'EUR',
  paidBy: 'member-alice',
  paidAt: new Date('2024-05-31'),
  split: { mode: 'equal', beneficiaries: ['member-alice', 'member-bob', 'member-charlie'] },
};

describe('ExpenseService.create()', () => {
  let fakeRepo: FakeExpenseRepository;
  let spyNotifier: SpyNotifier;

  beforeEach(() => {
    fakeRepo = new FakeExpenseRepository();
    spyNotifier = new SpyNotifier();
  });

  it('retourne une expense avec les bonnes valeurs', async () => {
    const service = new ExpenseService(fakeRepo, spyNotifier, stubClock, stubIdGen, dummyLogger);
    const expense = await service.create(baseInput);

    expect(expense.id).toBe(FIXED_ID);
    expect(expense.createdAt).toEqual(FIXED_DATE);
    expect(expense.description).toBe(baseInput.description);
    expect(expense.amount).toBe(baseInput.amount);
    expect(expense.groupId).toBe(baseInput.groupId);
    expect(expense.paidBy).toBe(baseInput.paidBy);
  });

  it('sauvegarde l\'expense dans le repository (FAKE)', async () => {
    const service = new ExpenseService(fakeRepo, spyNotifier, stubClock, stubIdGen, dummyLogger);
    await service.create(baseInput);

    expect(fakeRepo.has(FIXED_ID)).toBe(true);
    expect(fakeRepo.get(FIXED_ID)?.amount).toBe(90);
  });

  it('notifie les membres quand amount >= 100 (SPY)', async () => {
    const service = new ExpenseService(fakeRepo, spyNotifier, stubClock, stubIdGen, dummyLogger);
    await service.create({ ...baseInput, amount: 100 });

    expect(spyNotifier.callCount()).toBe(1);
    expect(spyNotifier.wasCalledWith('group-42')).toBe(true);
  });

  it('ne notifie PAS quand amount < 100 (SPY)', async () => {
    const service = new ExpenseService(fakeRepo, spyNotifier, stubClock, stubIdGen, dummyLogger);
    await service.create({ ...baseInput, amount: 99.99 });

    expect(spyNotifier.callCount()).toBe(0);
  });

  it('notifie avec le bon message et le bon groupId (MOCK)', async () => {
    const { mock, notifyGroupMembers } = createMockNotifier();
    const service = new ExpenseService(fakeRepo, mock, stubClock, stubIdGen, dummyLogger);
    await service.create({ ...baseInput, amount: 150, description: 'Grande fête' });

    expect(notifyGroupMembers).toHaveBeenCalledOnce();
    expect(notifyGroupMembers).toHaveBeenCalledWith(
      'group-42',
      expect.stringContaining('Grande fête'),
    );
  });

  it('loggue la création de l\'expense (SPY sur Logger)', async () => {
    const spyLogger: Logger = {
      info: vi.fn(),
      error: vi.fn(),
    };
    const service = new ExpenseService(fakeRepo, spyNotifier, stubClock, stubIdGen, spyLogger);
    await service.create(baseInput);

    expect(spyLogger.info).toHaveBeenCalledOnce();
    expect(spyLogger.info).toHaveBeenCalledWith(expect.stringContaining(FIXED_ID));
  });

  it('appelle idGen.next() une seule fois par création', async () => {
    const spyIdGen: IdGenerator = {
      next: vi.fn().mockReturnValue('generated-id'),
    };
    const service = new ExpenseService(fakeRepo, spyNotifier, stubClock, spyIdGen, dummyLogger);
    await service.create(baseInput);

    expect(spyIdGen.next).toHaveBeenCalledOnce();
  });
});
