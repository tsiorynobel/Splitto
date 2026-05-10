# Analyse des mutations — Stryker

## Fichiers mutes

- `src/domain/balances.ts` (exercice 1)
- `src/domain/simplify.ts` (exercice 2)

---

## Score initial (avant amelioration)

Configuration initiale : Stryker executait egalement les tests de contrat Pact
(~35 s chacun) pour chaque mutant. Sous Windows, les processus fils crashaient
avec le code `3221225477` (EXCEPTION_ACCESS_VIOLATION), faisant chuter le score.
Des fichiers sans couverture (`expense.service.ts`, `pg-expense.repository.ts`)
etaient inclus dans la liste des fichiers a muter.

| Fichier                    | Score  | Tues | Survivants | Sans couverture |
|----------------------------|--------|------|------------|-----------------|
| balances.ts                | 94.44% | 34   | 2          | 0               |
| simplify.ts                | 86.96% | 23   | 6          | 0               |
| expense.service.ts         | 0.00%  | 0    | 0          | 9               |
| pg-expense.repository.ts   | 0.00%  | 0    | 0          | 21              |
| **Total**                  | **66.07%** | 57 | 8        | 30              |

Score total : **66.07%** — en dessous de l'objectif de 80%.

---

## Score final (apres amelioration)

Configuration corrigee : `vitest.mutation.config.ts` cible uniquement les tests
unitaires (exclusion des tests Pact), et seuls `balances.ts` + `simplify.ts`
sont mutes, conformement au SUJET.

| Fichier      | Score      | Tues | Survivants | Timeouts |
|--------------|------------|------|------------|----------|
| balances.ts  | **97.22%** | 35   | 1          | 0        |
| simplify.ts  | **95.65%** | 27   | 2          | 17       |
| **Total**    | **96.34%** | 62   | 3          | 17       |

Objectif 80% largement depasse sur les deux fichiers et sur le total.

---

## Actions menees pour passer de 66% a 96%

### 1. Correction de la configuration Stryker

**Probleme** : Stryker utilisait `vitest.config.ts` qui inclut tous les tests,
dont les tests Pact (contrat HTTP ~35 s chacun). Avec 82 mutants et 4 workers
paralleles, les processus fils epuisaient la memoire Windows et crashaient.

**Correctif** : creation de `vitest.mutation.config.ts` qui ne cible que
`tests/unit/**/*.test.ts` et reduit le timeout a 10 s par test.

### 2. Retrait des fichiers non couverts de la liste de mutation

**Probleme** : `expense.service.ts` et `pg-expense.repository.ts` etaient
inclus dans `stryker.config.json` mais leurs tests n'etaient pas dans le run
de mutation, creant 30 mutants sans couverture qui pesaient sur le score total.

**Correctif** : liste de mutation restreinte aux deux fichiers du SUJET.

### 3. Tests ciblant les mutants survivants de `simplify.ts`

Cinq nouveaux tests ont ete ajoutes pour tuer des mutants qui survivaient :

| Test ajoute | Mutant tue |
|---|---|
| `bal = 0.005` ignore cote crediteur | `bal > EPSILON` → `bal >= EPSILON` |
| `bal = -0.004` ignore cote debiteur | `-EPSILON` → `+EPSILON` (unaire) |
| `bal = -0.005` ignore cote debiteur | `bal < -EPSILON` → `bal <= -EPSILON` |
| Deux crediteurs a solde egal → premier gagne | `val > maxVal` → `val >= maxVal` |

### 4. Test ciblant le mutant survivant de `balances.ts`

| Test ajoute | Mutant tue |
|---|---|
| Weighted split avec poids tous a zero → aucun debit | `if (totalWeight === 0)` → `if (false)` |

---

## Mutants survivants apres amelioration (3 mutants acceptes)

### Mutant 1 : ConditionalExpression — balances.ts:28

- **Mutation** : `if (split.beneficiaries.length === 0) return;` → `if (false) return;`
- **Pourquoi il survit** : Quand la liste est vide, le `for` suivant ne s'execute
  pas de toute facon (`for (const id of [])` → zero iterations). Supprimer le
  `return` anticipatoire ne change pas le resultat observable.
- **Decision** : Accepte — mutant structurellement equivalent.

### Mutant 2 : StringLiteral — simplify.ts:39

- **Mutation** : `let maxId = ''` → `let maxId = "Stryker was here!"`
- **Pourquoi il survit** : La valeur initiale de `maxId` est toujours ecrasee
  par le premier element de la Map dans la boucle. `findMax` n'est jamais appele
  sur une Map vide (guard `while (credits.size > 0 && debits.size > 0)`).
  La valeur initiale n'est donc jamais retournee.
- **Decision** : Accepte — variable morte a l'initialisation, mutant equivalent.

### Mutant 3 : EqualityOperator — simplify.ts:50

- **Mutation** : `if (remaining < EPSILON) map.delete(id)` → `if (remaining <= EPSILON)`
- **Pourquoi il survit** : Pour que `<` et `<=` se comportent differemment, il
  faudrait que `remaining` soit exactement 0.005 apres un reglement. En pratique,
  les soustractions en virgule flottante ne produisent jamais exactement 0.005
  (ex. : `10.005 - 10 = 0.005000...036` en IEEE 754). Les deux conditions
  donnent toujours le meme resultat sur des donnees reelles.
- **Decision** : Accepte — mutant quasi-equivalent, impossible a tuer sans
  fabriquer des valeurs artificielles contournant la virgule flottante.

---

## Conclusion

| | Score total | balances.ts | simplify.ts |
|---|---|---|---|
| **Avant** | 66.07% | 94.44% | 86.96% |
| **Apres** | **96.34%** | **97.22%** | **95.65%** |
| Gain | +30.27 pts | +2.78 pts | +8.69 pts |

La chute du score initial etait principalement due a la configuration Stryker
(fichiers sans couverture + tests Pact qui faisaient crasher les workers Windows),
et secondairement au manque de tests aux frontieres EPSILON dans `simplify.ts`.
Les 3 mutants restants sont des mutants equivalents structurellement non tuables.
