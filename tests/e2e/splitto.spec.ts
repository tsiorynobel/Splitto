import { test, expect } from '@playwright/test';
import { HomePage } from './pages/home.page';
import { GroupPage } from './pages/group.page';

test.beforeEach(async ({ page }) => {
  await page.request.post('/_test/reset');
  await page.goto('/');
});

test('créer un groupe avec 3 membres', async ({ page }) => {
  const home = new HomePage(page);

  await home.createGroup('Vacances 2024', 'EUR', [
    'Alice <alice@example.com>',
    'Bob <bob@example.com>',
    'Charlie <charlie@example.com>',
  ]);

  await expect(home.groupCard('Vacances 2024')).toBeVisible();
  await expect(home.groupCard('Vacances 2024')).toContainText('EUR');
});

test('ajouter une dépense dans un groupe', async ({ page }) => {
  const home = new HomePage(page);
  const groupPage = new GroupPage(page);

  await home.createGroup('Amis', 'EUR', [
    'Alice <alice@example.com>',
    'Bob <bob@example.com>',
  ]);

  await home.clickGroup('Amis');

  await groupPage.addExpense({
    description: 'Resto du midi',
    amount: 25,
    paidBy: 'Alice',
  });

  await expect(groupPage.expensesTable()).toContainText('Resto du midi');
  await expect(groupPage.expensesTable()).toContainText('25.00');
  await expect(groupPage.expensesTable()).toContainText('Alice');
});

test('voir les soldes corrects après une dépense de 30€ payée par Alice', async ({ page }) => {
  const home = new HomePage(page);
  const groupPage = new GroupPage(page);

  await home.createGroup('Trio', 'EUR', [
    'Alice <alice@example.com>',
    'Bob <bob@example.com>',
    'Charlie <charlie@example.com>',
  ]);

  await home.clickGroup('Trio');

  await groupPage.addExpense({
    description: 'Soirée',
    amount: 30,
    paidBy: 'Alice',
  });

  await expect(groupPage.memberBalanceRow('Alice')).toContainText('à recevoir');
  await expect(groupPage.memberBalanceRow('Alice')).toContainText('20.00');

  await expect(groupPage.memberBalanceRow('Bob')).toContainText('à payer');
  await expect(groupPage.memberBalanceRow('Bob')).toContainText('10.00');

  await expect(groupPage.memberBalanceRow('Charlie')).toContainText('à payer');
  await expect(groupPage.memberBalanceRow('Charlie')).toContainText('10.00');
});

test('marquer un règlement comme réglé le fait disparaître de la liste', async ({ page }) => {
  const home = new HomePage(page);
  const groupPage = new GroupPage(page);

  await home.createGroup('Weekend', 'EUR', [
    'Alice <alice@example.com>',
    'Bob <bob@example.com>',
  ]);

  await home.clickGroup('Weekend');

  await groupPage.addExpense({
    description: 'Courses',
    amount: 40,
    paidBy: 'Alice',
  });

  const settlementsTable = groupPage.settlementsTable();
  await expect(settlementsTable).toBeVisible();
  await expect(groupPage.settlementRow(0)).toBeVisible();

  await groupPage.settleFirst();

  await expect(groupPage.settlementRow(0)).not.toBeVisible();

  await expect(
    page.getByRole('alert').filter({ hasText: 'Règlement marqué comme effectué' }),
  ).toBeVisible();
});
