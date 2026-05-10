import type { Balances, Settlement } from './types';

const EPSILON = 0.005;

export function simplifyDebts(balances: Balances): Settlement[] {
  const { credits, debits } = splitBySign(balances);
  const settlements: Settlement[] = [];

  while (credits.size > 0 && debits.size > 0) {
    const [creditorId, creditAmount] = findMax(credits);
    const [debtorId, debtAmount]     = findMax(debits);

    const amount = roundCents(Math.min(creditAmount, debtAmount));
    settlements.push({ from: debtorId, to: creditorId, amount });

    updateMap(credits, creditorId, creditAmount - amount);
    updateMap(debits,  debtorId,   debtAmount  - amount);
  }

  return settlements;
}

function splitBySign(balances: Balances): {
  credits: Map<string, number>;
  debits:  Map<string, number>;
} {
  const credits = new Map<string, number>();
  const debits  = new Map<string, number>();

  for (const [id, bal] of Object.entries(balances)) {
    if (bal > EPSILON)  credits.set(id,  bal);
    if (bal < -EPSILON) debits.set(id, -bal);
  }

  return { credits, debits };
}

function findMax(map: Map<string, number>): [string, number] {
  let maxId  = '';
  let maxVal = -Infinity;

  for (const [id, val] of map) {
    if (val > maxVal) { maxVal = val; maxId = id; }
  }

  return [maxId, maxVal];
}

function updateMap(map: Map<string, number>, id: string, remaining: number): void {
  if (remaining < EPSILON) map.delete(id);
  else map.set(id, remaining);
}

function roundCents(amount: number): number {
  return Math.round(amount * 100) / 100;
}
