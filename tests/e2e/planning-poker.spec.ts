import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const accessToken = 'access-token-for-e2e-32-chars';

async function frenchContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'] });
}

async function login(page: Page): Promise<void> {
  await page.getByLabel('Jeton d’accès').fill(accessToken);
  await page.getByRole('button', { name: 'Entrer en gare' }).click();
}

async function join(page: Page, name: string, role: 'voter' | 'observer', avatarKey: string): Promise<void> {
  await page.getByLabel('Prénom ou pseudo').fill(name);
  await page.locator(`.avatar-choice input[value="${avatarKey}"]`).check({ force: true });
  const roleName = role === 'voter' ? 'Je vote' : 'J’observe';
  await page.locator('.role-choice label').filter({ hasText: roleName }).click();
  await expect(page.getByRole('radio', { name: roleName })).toBeChecked();
  await page.getByRole('button', { name: /Monter à bord/ }).click();
  await expect(page.getByRole('heading', { name: 'Autour de la table' })).toBeVisible();
}

async function startStory(page: Page, title: string): Promise<void> {
  await page.getByLabel('Titre ou lien de la user story').fill(title);
  await page.getByRole('button', { name: /Lancer le vote/ }).click();
  await expect(page.locator('.story-ticket-label').getByText('User story en cours')).toBeVisible();
  await expect(page.locator('.poker-table-shell')).toBeVisible();
}

async function vote(page: Page, value: string): Promise<void> {
  await page.locator(`[data-estimate-value="${value}"]`).click();
  await expect(page.getByText('Votre carte est posée.', { exact: false })).toBeVisible();
}

async function revealAndFinalize(page: Page, finalValue: string): Promise<void> {
  await page.getByRole('button', { name: /Révéler les cartes/ }).click();
  await expect(page.getByRole('heading', { name: 'Toutes les cartes sur table' })).toBeVisible();
  await page.getByLabel('Estimation finale').fill(finalValue);
  await page.getByRole('button', { name: /Valider et continuer/ }).click();
  await expect(page.getByLabel('Titre ou lien de la user story')).toBeVisible();
}

test('un chef de bord, deux votants et un observateur parcourent trois estimations', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const adminContext = await frenchContext(browser);
    contexts.push(adminContext);
    const admin = await adminContext.newPage();
    await admin.goto('/');
    await login(admin);
    await admin.getByRole('button', { name: 'Nouvelle salle' }).click();
    await admin.getByLabel('Nom de la salle').fill('Équipe Étoile');
    await expect(admin.getByLabel('Thème')).toHaveValue('classic');
    await admin.locator('.modal-card').getByLabel('Jeu de cartes').selectOption('fibonacci');
    await admin.getByRole('button', { name: 'Créer la salle' }).click();
    await join(admin, 'Camille', 'observer', 'train');
    const roomPath = new URL(admin.url()).pathname;

    await admin.getByRole('button', { name: /Copier le lien/ }).click();
    await expect(admin.getByRole('button', { name: /Invitation copiée/ })).toBeVisible();
    const invitationUrl = await admin.evaluate(() => navigator.clipboard.readText());
    const invitation = new URL(invitationUrl);
    expect(invitation.pathname).toBe(roomPath);
    expect(new URLSearchParams(invitation.hash.slice(1)).get('token')).toBe(accessToken);

    const aliceContext = await frenchContext(browser);
    contexts.push(aliceContext);
    const alice = await aliceContext.newPage();
    await alice.goto(invitationUrl);
    await expect(alice.getByLabel('Prénom ou pseudo')).toBeVisible();
    expect(new URL(alice.url()).hash).toBe('');
    await join(alice, 'Alice', 'voter', 'rocket');
    await expect(alice.getByRole('button', { name: /Copier le lien/ })).toHaveCount(0);

    const bobContext = await frenchContext(browser);
    contexts.push(bobContext);
    const bob = await bobContext.newPage();
    await bob.goto(invitationUrl);
    await join(bob, 'Bob', 'voter', 'robot');

    const observerContext = await frenchContext(browser);
    contexts.push(observerContext);
    const observer = await observerContext.newPage();
    await observer.goto(invitationUrl);
    await join(observer, 'Noa', 'observer', 'pirate');

    await startStory(admin, 'EXP-101 — paiement en un clic');
    await expect(admin.locator('.poker-seat')).toHaveCount(4);
    await expect(admin.locator('.table-vote-card.voted')).toHaveCount(0);
    await expect(admin.locator('.start-story').getByLabel('Jeu de cartes')).toHaveCount(0);
    await vote(alice, '5');
    await expect(admin.locator('.table-vote-card.voted')).toHaveCount(1);
    await vote(bob, '5');
    await expect(admin.locator('.table-vote-card.voted')).toHaveCount(2);
    await admin.getByRole('button', { name: /Révéler les cartes/ }).click();
    await expect(admin.getByRole('status').filter({ hasText: 'Même destination' })).toBeVisible();
    await expect(observer.getByRole('heading', { name: 'Même destination !' })).toBeVisible();
    await expect(admin.locator('.table-center-mark strong')).toHaveText('5');
    await expect(admin.locator('.table-vote-card.is-revealed .card-front')).toHaveText(['5', '5']);
    await expect(admin.locator('.celebration')).toBeHidden({ timeout: 6_000 });
    await admin.getByLabel('Estimation finale').fill('5');
    await admin.getByRole('button', { name: /Valider et continuer/ }).click();
    await expect(admin.getByLabel('Titre ou lien de la user story')).toBeVisible();

    await startStory(admin, 'https://example.test/stories/EXP-102');
    await expect(admin.locator('.story-reference')).toHaveAttribute('href', 'https://example.test/stories/EXP-102');
    await vote(alice, '3');
    await vote(bob, '8');
    await admin.getByRole('button', { name: /Révéler les cartes/ }).click();
    await expect(admin.getByText('5.5', { exact: true })).toBeVisible();
    await admin.getByLabel('Estimation finale').fill('à découper');
    await admin.getByRole('button', { name: /Valider et continuer/ }).click();
    await expect(admin.getByLabel('Titre ou lien de la user story')).toBeVisible();

    await startStory(admin, 'Story à affiner — besoin de précisions métier');
    await vote(alice, 'abstain');
    await revealAndFinalize(admin, 'À préciser');

    await expect(admin.locator('.history-list details')).toHaveCount(3);
    await expect(admin.getByText('À préciser', { exact: true })).toBeVisible();
    await expect(observer.getByText('Le chef de bord prépare la prochaine user story.')).toBeVisible();
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
