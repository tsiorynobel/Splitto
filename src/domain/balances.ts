import type { Group, Expense, Balances, ExpenseSplit } from './types';

export function computeBalances(group: Group, expenses: Expense[]): Balances {
  const balances: Balances = {};

  for (const member of group.members) {
    balances[member.id] = 0;
  }

  for (const expense of expenses) {
    credit(balances, expense.paidBy, expense.amount);
    debitSplit(balances, expense.amount, expense.split);
  }

  return balances;
}

function credit(balances: Balances, memberId: string, amount: number): void {
  balances[memberId] = (balances[memberId] ?? 0) + amount;
}

function debit(balances: Balances, memberId: string, amount: number): void {
  balances[memberId] = (balances[memberId] ?? 0) - amount;
}

function debitSplit(balances: Balances, amount: number, split: ExpenseSplit): void {
  if (split.mode === 'equal') {
    if (split.beneficiaries.length === 0) return;
    const share = amount / split.beneficiaries.length;
    for (const id of split.beneficiaries) {
      debit(balances, id, share);
    }
    return;
  }

  if (split.mode === 'weighted') {
    const totalWeight = Object.values(split.weights).reduce((sum, w) => sum + w, 0);
    if (totalWeight === 0) return;
    for (const [id, weight] of Object.entries(split.weights)) {
      debit(balances, id, (amount * weight) / totalWeight);
    }
    return;
  }

  for (const [id, pct] of Object.entries(split.percentages)) {
    debit(balances, id, (amount * pct) / 100);
  }
}
