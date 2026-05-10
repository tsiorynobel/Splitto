import { describe, it, expect } from 'vitest';
import { computeBalances } from '../../src/domain/balances';
import type { Group, Expense, Member } from '../../src/domain/types';

function makeGroup(memberIds: string[]): Group {
  const members: Member[] = memberIds.map((id) => ({
    id,
    name: id.charAt(0).toUpperCase() + id.slice(1),
    email: `${id}@test.com`,
  }));
  return { id: 'group-1', name: 'Groupe test', currency: 'EUR', members };
}

let expenseCounter = 0;

function makeExpense(overrides: Partial<Expense> & Pick<Expense, 'split'>): Expense {
  return {
    id: `exp-${++expenseCounter}`,
    groupId: 'group-1',
    description: 'Dépense test',
    amount: 30,
    currency: 'EUR',
    paidBy: 'alice',
    paidAt: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}

function sumBalances(balances: Record<string, number>): number {
  return Object.values(balances).reduce((acc, b) => acc + b, 0);
}

describe('computeBalances', () => {

  describe('sans dépenses', () => {
    it('initialise tous les membres à 0 quand il n\'y a aucune dépense', () => {
      const group = makeGroup(['alice', 'bob', 'charlie']);
      expect(computeBalances(group, [])).toEqual({ alice: 0, bob: 0, charlie: 0 });
    });

    it('retourne un objet vide pour un groupe sans membres', () => {
      const group = makeGroup([]);
      expect(computeBalances(group, [])).toEqual({});
    });
  });

  describe("split 'equal'", () => {
    it('cas 2 — payeur inclus comme bénéficiaire : net positif pour lui', () => {
      const group = makeGroup(['alice', 'bob', 'charlie']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 30,
          paidBy: 'alice',
          split: { mode: 'equal', beneficiaries: ['alice', 'bob', 'charlie'] },
        }),
      ]);

      expect(balances.alice).toBeCloseTo(20, 5);
      expect(balances.bob).toBeCloseTo(-10, 5);
      expect(balances.charlie).toBeCloseTo(-10, 5);
    });

    it('cas 3 — payeur PAS bénéficiaire : crédité du montant total', () => {
      const group = makeGroup(['alice', 'bob', 'charlie']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 30,
          paidBy: 'alice',
          split: { mode: 'equal', beneficiaries: ['bob', 'charlie'] },
        }),
      ]);

      expect(balances.alice).toBeCloseTo(30, 5);
      expect(balances.bob).toBeCloseTo(-15, 5);
      expect(balances.charlie).toBeCloseTo(-15, 5);
    });

    it('cas limite — seul bénéficiaire = le payeur : solde net nul', () => {
      const group = makeGroup(['alice', 'bob']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 50,
          paidBy: 'alice',
          split: { mode: 'equal', beneficiaries: ['alice'] },
        }),
      ]);

      expect(balances.alice).toBeCloseTo(0, 5);
      expect(balances.bob).toBeCloseTo(0, 5);
    });

    it('cas limite — liste de bénéficiaires vide : aucun effet sur les soldes', () => {
      const group = makeGroup(['alice', 'bob']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 30,
          paidBy: 'alice',
          split: { mode: 'equal', beneficiaries: [] },
        }),
      ]);

      expect(balances.alice).toBeCloseTo(30, 5);
      expect(balances.bob).toBeCloseTo(0, 5);
    });
  });

  describe("split 'weighted'", () => {
    it('cas 5 — répartit selon les poids (3:2:1)', () => {
      const group = makeGroup(['alice', 'bob', 'charlie']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 60,
          paidBy: 'alice',
          split: { mode: 'weighted', weights: { alice: 3, bob: 2, charlie: 1 } },
        }),
      ]);

      expect(balances.alice).toBeCloseTo(30, 5);
      expect(balances.bob).toBeCloseTo(-20, 5);
      expect(balances.charlie).toBeCloseTo(-10, 5);
      expect(sumBalances(balances)).toBeCloseTo(0, 5);
    });

    it('cas limite — poids tous identiques : équivalent à equal', () => {
      const group = makeGroup(['alice', 'bob']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 40,
          paidBy: 'alice',
          split: { mode: 'weighted', weights: { alice: 1, bob: 1 } },
        }),
      ]);

      expect(balances.alice).toBeCloseTo(20, 5);
      expect(balances.bob).toBeCloseTo(-20, 5);
    });
  });

  describe("split 'percentage'", () => {
    it('cas 6 — 100€ entre 3 personnes avec arrondis (33.33 + 33.33 + 33.34)', () => {
      const group = makeGroup(['alice', 'bob', 'charlie']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 100,
          paidBy: 'alice',
          split: {
            mode: 'percentage',
            percentages: { alice: 33.33, bob: 33.33, charlie: 33.34 },
          },
        }),
      ]);

      expect(balances.alice).toBeCloseTo(66.67, 1);
      expect(balances.bob).toBeCloseTo(-33.33, 1);
      expect(balances.charlie).toBeCloseTo(-33.34, 1);
    });

    it('cas limite — pourcentages ne sommant pas à 100 : comportement documenté', () => {
      const group = makeGroup(['alice', 'bob', 'charlie']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 100,
          paidBy: 'alice',
          split: {
            mode: 'percentage',
            percentages: { alice: 40, bob: 40 },
          },
        }),
      ]);

      expect(balances.alice).toBeCloseTo(60, 5);
      expect(balances.bob).toBeCloseTo(-40, 5);
      expect(balances.charlie).toBeCloseTo(0, 5);
      expect(sumBalances(balances)).toBeCloseTo(20, 5);
    });
  });

  describe('plusieurs dépenses', () => {
    it('cas 4 — cumul de deux dépenses equal qui se compensent partiellement', () => {
      const group = makeGroup(['alice', 'bob', 'charlie']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 30, paidBy: 'alice',
          split: { mode: 'equal', beneficiaries: ['alice', 'bob', 'charlie'] },
        }),
        makeExpense({
          amount: 30, paidBy: 'bob',
          split: { mode: 'equal', beneficiaries: ['alice', 'bob', 'charlie'] },
        }),
      ]);

      expect(balances.alice).toBeCloseTo(10, 5);
      expect(balances.bob).toBeCloseTo(10, 5);
      expect(balances.charlie).toBeCloseTo(-20, 5);
      expect(sumBalances(balances)).toBeCloseTo(0, 5);
    });

    it('mix des trois modes de split : somme des soldes reste nulle', () => {
      const group = makeGroup(['alice', 'bob', 'charlie']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 90, paidBy: 'alice',
          split: { mode: 'equal', beneficiaries: ['alice', 'bob', 'charlie'] },
        }),
        makeExpense({
          amount: 60, paidBy: 'bob',
          split: { mode: 'weighted', weights: { alice: 1, bob: 2, charlie: 1 } },
        }),
        makeExpense({
          amount: 50, paidBy: 'charlie',
          split: { mode: 'percentage', percentages: { alice: 50, bob: 25, charlie: 25 } },
        }),
      ]);

      expect(sumBalances(balances)).toBeCloseTo(0, 5);
    });
  });

  describe('cas limites', () => {
    describe('membre supprimé qui figure dans une vieille dépense', () => {
      it('payeur ET bénéficiaire : son solde net reste positif', () => {
        // charlie est supprimé du groupe mais était payeur et bénéficiaire
        // crédit +30, débit 30/3 = 10 → net +20
        const group = makeGroup(['alice', 'bob']);
        const balances = computeBalances(group, [
          makeExpense({
            amount: 30,
            paidBy: 'charlie',
            split: { mode: 'equal', beneficiaries: ['alice', 'bob', 'charlie'] },
          }),
        ]);

        expect(balances.charlie).toBeCloseTo(20, 5);
        expect(balances.alice).toBeCloseTo(-10, 5);
        expect(balances.bob).toBeCloseTo(-10, 5);
        expect(sumBalances(balances)).toBeCloseTo(0, 5);
      });

      it('uniquement payeur (non bénéficiaire) : crédité du montant total', () => {
        // charlie est supprimé et n'est PAS bénéficiaire de sa propre dépense
        // crédit +30, débit 0 → net +30
        const group = makeGroup(['alice', 'bob']);
        const balances = computeBalances(group, [
          makeExpense({
            amount: 30,
            paidBy: 'charlie',
            split: { mode: 'equal', beneficiaries: ['alice', 'bob'] },
          }),
        ]);

        expect(balances.charlie).toBeCloseTo(30, 5);
        expect(balances.alice).toBeCloseTo(-15, 5);
        expect(balances.bob).toBeCloseTo(-15, 5);
        expect(sumBalances(balances)).toBeCloseTo(0, 5);
      });

      it('uniquement bénéficiaire (non payeur) : débité de sa quote-part', () => {
        // charlie est supprimé mais figure encore dans le split d'une dépense d'alice
        // alice : crédit +30, débit 30/3 = 10 → net +20
        // charlie : débit 30/3 = 10 → net -10
        const group = makeGroup(['alice', 'bob']);
        const balances = computeBalances(group, [
          makeExpense({
            amount: 30,
            paidBy: 'alice',
            split: { mode: 'equal', beneficiaries: ['alice', 'bob', 'charlie'] },
          }),
        ]);

        expect(balances.alice).toBeCloseTo(20, 5);
        expect(balances.bob).toBeCloseTo(-10, 5);
        expect(balances.charlie).toBeCloseTo(-10, 5);
        expect(sumBalances(balances)).toBeCloseTo(0, 5);
      });

      it('membre supprimé dans un split weighted : débité selon son poids', () => {
        // charlie supprimé, poids 2 sur 6 au total → 60 * 2/6 = 20
        const group = makeGroup(['alice', 'bob']);
        const balances = computeBalances(group, [
          makeExpense({
            amount: 60,
            paidBy: 'alice',
            split: { mode: 'weighted', weights: { alice: 2, bob: 2, charlie: 2 } },
          }),
        ]);

        expect(balances.alice).toBeCloseTo(40, 5);
        expect(balances.bob).toBeCloseTo(-20, 5);
        expect(balances.charlie).toBeCloseTo(-20, 5);
        expect(sumBalances(balances)).toBeCloseTo(0, 5);
      });

      it('membre supprimé dans un split percentage : débité de son pourcentage', () => {
        // charlie supprimé, 20 % de 100 € → -20
        const group = makeGroup(['alice', 'bob']);
        const balances = computeBalances(group, [
          makeExpense({
            amount: 100,
            paidBy: 'alice',
            split: {
              mode: 'percentage',
              percentages: { alice: 40, bob: 40, charlie: 20 },
            },
          }),
        ]);

        expect(balances.alice).toBeCloseTo(60, 5);
        expect(balances.bob).toBeCloseTo(-40, 5);
        expect(balances.charlie).toBeCloseTo(-20, 5);
        expect(sumBalances(balances)).toBeCloseTo(0, 5);
      });
    });

    it('weighted split avec tous les poids à zéro : aucun débit appliqué', () => {
      const group = makeGroup(['alice', 'bob']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 60,
          paidBy: 'alice',
          split: { mode: 'weighted', weights: { alice: 0, bob: 0 } },
        }),
      ]);

      expect(balances.alice).toBeCloseTo(60, 5);
      expect(balances.bob).toBeCloseTo(0, 5);
    });

    it('dépense de 0€ : autorisée, aucun effet sur les soldes', () => {
      const group = makeGroup(['alice', 'bob']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 0, paidBy: 'alice',
          split: { mode: 'equal', beneficiaries: ['alice', 'bob'] },
        }),
      ]);

      expect(balances.alice).toBeCloseTo(0, 5);
      expect(balances.bob).toBeCloseTo(0, 5);
    });

    it('groupe avec 10 membres (split equal)', () => {
      const memberIds = Array.from({ length: 10 }, (_, i) => `m${i}`);
      const group = makeGroup(memberIds);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 100,
          paidBy: 'm0',
          split: { mode: 'equal', beneficiaries: memberIds },
        }),
      ]);

      expect(balances['m0']).toBeCloseTo(90, 5);
      for (let i = 1; i < 10; i++) {
        expect(balances[`m${i}`]).toBeCloseTo(-10, 5);
      }
      expect(sumBalances(balances)).toBeCloseTo(0, 5);
    });
  });

  describe('invariant : somme des soldes ≈ 0', () => {
    it('est respecté pour un split equal', () => {
      const group = makeGroup(['a', 'b', 'c', 'd']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 73.50, paidBy: 'a',
          split: { mode: 'equal', beneficiaries: ['a', 'b', 'c', 'd'] },
        }),
      ]);
      expect(sumBalances(balances)).toBeCloseTo(0, 5);
    });

    it('est respecté pour un split weighted', () => {
      const group = makeGroup(['a', 'b', 'c']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 99.99, paidBy: 'b',
          split: { mode: 'weighted', weights: { a: 7, b: 2, c: 1 } },
        }),
      ]);
      expect(sumBalances(balances)).toBeCloseTo(0, 5);
    });

    it('est respecté pour un split percentage sommant exactement à 100', () => {
      const group = makeGroup(['a', 'b', 'c']);
      const balances = computeBalances(group, [
        makeExpense({
          amount: 120, paidBy: 'c',
          split: { mode: 'percentage', percentages: { a: 50, b: 25, c: 25 } },
        }),
      ]);
      expect(sumBalances(balances)).toBeCloseTo(0, 5);
    });
  });
});
