import type { Page } from '@playwright/test';

export class HomePage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  async reset() {
    await this.page.request.post('/_test/reset');
  }

  async openNewGroupDialog() {
    await this.page.getByRole('button', { name: 'Nouveau groupe' }).click();
  }

  async createGroup(name: string, currency: string, members: string[]) {
    await this.openNewGroupDialog();

    const dialog = this.page.getByRole('dialog', { name: 'Créer un groupe' });

    await dialog.getByLabel('Nom du groupe').fill(name);

    const currencySelect = dialog.getByLabel('Devise');
    await currencySelect.selectOption(currency);

    const membersText = members.join('\n');
    await dialog.getByLabel(/Membres/).fill(membersText);

    await dialog.getByRole('button', { name: 'Créer' }).click();
  }

  groupCard(name: string) {
    return this.page.getByRole('listitem').filter({ hasText: name });
  }

  async clickGroup(name: string) {
    await this.groupCard(name).click();
  }

  async navigateHome() {
    await this.page.getByRole('button', { name: 'Accueil' }).click();
  }
}
