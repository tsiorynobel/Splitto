import type { Page } from '@playwright/test';

export class GroupPage {
  constructor(private readonly page: Page) {}

  async addExpense(opts: {
    description: string;
    amount: number;
    paidBy: string;
    beneficiaries?: string[];
  }) {
    await this.page.getByRole('button', { name: 'Ajouter une dépense' }).click();

    const dialog = this.page.getByRole('dialog', { name: 'Ajouter une dépense' });

    await dialog.getByLabel('Description').fill(opts.description);
    await dialog.getByLabel('Montant').fill(String(opts.amount));
    await dialog.getByLabel('Payé par').selectOption({ label: opts.paidBy });

    if (opts.beneficiaries !== undefined) {
      const checkboxes = dialog.getByRole('checkbox');
      const count = await checkboxes.count();
      for (let i = 0; i < count; i++) {
        await checkboxes.nth(i).uncheck();
      }
      for (const name of opts.beneficiaries) {
        await dialog.getByRole('checkbox', { name }).check();
      }
    }

    await dialog.getByRole('button', { name: 'Ajouter' }).click();
  }

  expensesTable() {
    return this.page.getByRole('table', { name: 'Liste des dépenses' });
  }

  balancesTable() {
    return this.page.getByRole('table', { name: 'Soldes des membres' });
  }

  settlementsTable() {
    return this.page.getByRole('table', { name: 'Règlements' });
  }

  balanceCellForMember(memberId: string) {
    return this.page.getByTestId(`balance-${memberId}`);
  }

  memberBalanceRow(memberName: string) {
    return this.balancesTable()
      .getByRole('row')
      .filter({ hasText: memberName });
  }

  settlementRow(index: number) {
    return this.page.getByTestId(`settlement-row-${index}`);
  }

  async settleFirst() {
    await this.page
      .getByTestId('settlement-row-0')
      .getByRole('button', { name: 'Régler' })
      .click();
  }
}
