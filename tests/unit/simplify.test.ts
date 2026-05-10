import { describe, it, expect } from 'vitest';
import { simplifyDebts } from '../../src/domain/simplify';
import type { Balances } from '../../src/domain/types';

function totalSettled(settlements: ReturnType<typeof simplifyDebts>): number {
  return settlements.reduce((sum, s) => sum + s.amount, 0);
}

describe('simplifyDebts', () => {

  describe('aucune dette à régler', () => {
    it('retourne une liste vide pour des soldes vides', () => {
      expect(simplifyDebts({})).toHaveLength(0);
    });

    it('retourne une liste vide quand tous les soldes sont à zéro', () => {
      expect(simplifyDebts({ a: 0, b: 0, c: 0 })).toHaveLength(0);
    });

    it('retourne une liste vide quand il n\'y a que des créditeurs (aucun débiteur)', () => {
      expect(simplifyDebts({ a: 10, b: 5 })).toHaveLength(0);
    });

    it('retourne une liste vide quand il n\'y a que des débiteurs (aucun créditeur)', () => {
      expect(simplifyDebts({ a: -10, b: -5 })).toHaveLength(0);
    });
  });

  describe('cas simples (2 personnes)', () => {
    it('crée un seul règlement pour un créditeur et un débiteur', () => {
      const balances: Balances = { a: 10, b: -10 };
      const settlements = simplifyDebts(balances);

      expect(settlements).toHaveLength(1);
      expect(settlements[0]).toEqual({ from: 'b', to: 'a', amount: 10 });
    });

    it('utilise les noms complets comme identifiants (alice, bob)', () => {
      const balances: Balances = { alice: 10, bob: -10 };
      const settlements = simplifyDebts(balances);

      expect(settlements).toHaveLength(1);
      expect(settlements[0]).toEqual({ from: 'bob', to: 'alice', amount: 10 });
    });

    it('le tiers à solde nul n\'apparaît dans aucun règlement', () => {
      const balances: Balances = { a: 10, b: 0, c: -10 };
      const settlements = simplifyDebts(balances);

      expect(settlements).toHaveLength(1);
      expect(settlements[0]).toEqual({ from: 'c', to: 'a', amount: 10 });
    });
  });

  describe('simplification multi-personnes', () => {
    it('résout 4 personnes avec 2 règlements (un créditeur, deux débiteurs)', () => {
      const balances: Balances = { a: 30, b: -20, c: -10, d: 0 };
      const settlements = simplifyDebts(balances);

      expect(settlements).toHaveLength(2);
      expect(settlements.find((s) => s.from === 'b')).toEqual({ from: 'b', to: 'a', amount: 20 });
      expect(settlements.find((s) => s.from === 'c')).toEqual({ from: 'c', to: 'a', amount: 10 });
    });

    it('résout 4 personnes avec 2 créditeurs et 2 débiteurs en chaîne (3 règlements)', () => {
      const balances: Balances = { alice: 10, bob: 5, charlie: -8, dave: -7 };
      const settlements = simplifyDebts(balances);

      expect(settlements).toHaveLength(3);
      expect(totalSettled(settlements)).toBeCloseTo(15, 5);
      expect(settlements.every((s) => s.from !== s.to)).toBe(true);
    });

    it('un débiteur unique rembourse plusieurs créditeurs', () => {
      const balances: Balances = { a: 15, b: 5, c: -20 };
      const settlements = simplifyDebts(balances);

      expect(settlements).toHaveLength(2);
      expect(settlements.every((s) => s.from === 'c')).toBe(true);
      expect(totalSettled(settlements)).toBeCloseTo(20, 5);
    });

    it('un créditeur unique reçoit de plusieurs débiteurs', () => {
      const balances: Balances = { a: 20, b: -8, c: -12 };
      const settlements = simplifyDebts(balances);

      expect(settlements).toHaveLength(2);
      expect(settlements.every((s) => s.to === 'a')).toBe(true);
      expect(totalSettled(settlements)).toBeCloseTo(20, 5);
    });
  });

  describe('ordre glouton — sélection du plus grand en premier', () => {
    it('apparie le plus gros créditeur en premier', () => {
      const balances: Balances = { a: 30, b: 10, c: -40 };
      const settlements = simplifyDebts(balances);

      expect(settlements).toHaveLength(2);
      expect(settlements[0]).toEqual({ from: 'c', to: 'a', amount: 30 });
      expect(settlements[1]).toEqual({ from: 'c', to: 'b', amount: 10 });
    });

    it('apparie le plus gros débiteur en premier', () => {
      const balances: Balances = { a: 40, b: -30, c: -10 };
      const settlements = simplifyDebts(balances);

      expect(settlements).toHaveLength(2);
      expect(settlements[0]).toEqual({ from: 'b', to: 'a', amount: 30 });
      expect(settlements[1]).toEqual({ from: 'c', to: 'a', amount: 10 });
    });

    it('gère un paiement partiel : le créditeur non épuisé reçoit le règlement suivant', () => {
      const balances: Balances = { a: 20, b: 10, c: -30 };
      const settlements = simplifyDebts(balances);

      expect(settlements).toHaveLength(2);
      expect(settlements.find((s) => s.to === 'a')).toEqual({ from: 'c', to: 'a', amount: 20 });
      expect(settlements.find((s) => s.to === 'b')).toEqual({ from: 'c', to: 'b', amount: 10 });
    });
  });

  describe('invariant fondamental', () => {
    it('appliquer les règlements solde toutes les dettes à zéro', () => {
      const balances: Balances = { alice: 35, bob: -15, charlie: -12, dave: -8 };
      const settlements = simplifyDebts(balances);

      const result: Record<string, number> = { ...balances };
      for (const s of settlements) {
        result[s.from] = (result[s.from] ?? 0) + s.amount;
        result[s.to]   = (result[s.to]   ?? 0) - s.amount;
      }

      for (const val of Object.values(result)) {
        expect(val).toBeCloseTo(0, 5);
      }
    });
  });

  describe('invariants sur les montants', () => {
    it('arrondit les montants au centime (2 décimales)', () => {
      const balances: Balances = { a: 33.33, b: -16.67, c: -16.66 };
      const settlements = simplifyDebts(balances);

      expect(settlements).toHaveLength(2);
      expect(totalSettled(settlements)).toBeCloseTo(33.33, 1);
      for (const s of settlements) {
        expect(Number.isFinite(s.amount)).toBe(true);
        expect(s.amount).toBeGreaterThan(0);
      }
    });

    it('tous les montants sont strictement positifs', () => {
      const balances: Balances = { x: 50, y: -30, z: -20 };
      const settlements = simplifyDebts(balances);

      for (const s of settlements) {
        expect(s.amount).toBeGreaterThan(0);
      }
    });

    it('la somme des règlements égale la somme des créances', () => {
      const balances: Balances = { a: 100, b: -40, c: -35, d: -25 };
      const settlements = simplifyDebts(balances);

      expect(totalSettled(settlements)).toBeCloseTo(100, 2);
    });

    it('les champs from et to sont toujours des identifiants non vides', () => {
      const balances: Balances = { alice: 10, bob: -10 };
      const settlements = simplifyDebts(balances);

      for (const s of settlements) {
        expect(s.from).toBeTruthy();
        expect(s.to).toBeTruthy();
      }
    });

    it('aucun règlement n\'est émis d\'un membre vers lui-même', () => {
      const balances: Balances = { a: 50, b: -20, c: -30 };
      const settlements = simplifyDebts(balances);

      for (const s of settlements) {
        expect(s.from).not.toBe(s.to);
      }
    });

    it('les balances inférieures à EPSILON sont traitées comme nulles', () => {
      expect(simplifyDebts({ a: 0.004, b: -0.004 })).toHaveLength(0);
    });

    it('une balance exactement égale à EPSILON (0.005) est ignorée côté créditeur', () => {
      expect(simplifyDebts({ a: 0.005, b: -0.01 })).toHaveLength(0);
    });

    it('une balance négative entre 0 et -EPSILON est ignorée côté débiteur', () => {
      expect(simplifyDebts({ a: 0.01, b: -0.004 })).toHaveLength(0);
    });

    it('une balance exactement égale à -EPSILON est ignorée côté débiteur', () => {
      expect(simplifyDebts({ a: 0.01, b: -0.005 })).toHaveLength(0);
    });
  });

  describe('ordre glouton — sélection à égalité', () => {
    it('à soldes égaux, le premier créditeur inséré est sélectionné en premier', () => {
      const settlements = simplifyDebts({ a: 10, b: 10, c: -20 });

      expect(settlements).toHaveLength(2);
      expect(settlements[0].to).toBe('a');
      expect(settlements[1].to).toBe('b');
    });
  });
});
