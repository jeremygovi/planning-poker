import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const accessToken = 'access-token-for-e2e-32-chars';

async function frenchContext(browser: Browser): Promise<BrowserContext> {
  return browser.newContext({ locale: 'fr-FR', permissions: ['clipboard-read', 'clipboard-write'] });
}

async function setupProfile(page: Page, name: string, avatarKey: string): Promise<void> {
  await page.getByLabel('Prénom ou pseudo').fill(name);
  await page.locator(`.profile-avatar-choice input[value="${avatarKey}"]`).check({ force: true });
  await page.getByRole('button', { name: 'Enregistrer le profil' }).click();
}

async function login(page: Page, name: string, avatarKey: string): Promise<void> {
  await page.getByLabel('Jeton d’accès').fill(accessToken);
  await page.getByRole('button', { name: 'Entrer en gare' }).click();
  await setupProfile(page, name, avatarKey);
}

async function join(page: Page, role: 'voter' | 'observer'): Promise<void> {
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

test('tous les participants pilotent les manches tandis que seuls les votants posent une carte', async ({ browser }) => {
  const contexts: BrowserContext[] = [];
  try {
    const camilleContext = await frenchContext(browser);
    contexts.push(camilleContext);
    const camille = await camilleContext.newPage();
    await camille.goto('/');
    await login(camille, 'Camille', 'train');
    await camille.getByRole('button', { name: 'Nouvelle salle' }).click();
    await camille.getByLabel('Nom de la salle').fill('Équipe Étoile');
    await expect(camille.getByLabel('Thème')).toHaveValue('classic');
    await camille.locator('.modal-card').getByLabel('Jeu de cartes').selectOption('fibonacci');
    await camille.getByRole('button', { name: 'Créer la salle' }).click();
    await join(camille, 'observer');
    const roomPath = new URL(camille.url()).pathname;

    await camille.getByRole('button', { name: /Copier le lien/ }).click();
    await expect(camille.getByRole('button', { name: /Invitation copiée/ })).toBeVisible();
    const invitationUrl = await camille.evaluate(() => navigator.clipboard.readText());
    const invitation = new URL(invitationUrl);
    expect(invitation.pathname).toBe(roomPath);
    expect(new URLSearchParams(invitation.hash.slice(1)).get('token')).toBe(accessToken);

    const aliceContext = await frenchContext(browser);
    contexts.push(aliceContext);
    const alice = await aliceContext.newPage();
    await alice.goto(invitationUrl);
    await expect(alice.getByLabel('Prénom ou pseudo')).toBeVisible();
    expect(new URL(alice.url()).hash).toBe('');
    await setupProfile(alice, 'Alice', 'rocket');
    await join(alice, 'voter');
    await expect(alice.getByRole('button', { name: /Copier le lien/ })).toBeVisible();

    const bobContext = await frenchContext(browser);
    contexts.push(bobContext);
    const bob = await bobContext.newPage();
    await bob.goto(invitationUrl);
    await setupProfile(bob, 'Bob', 'robot');
    await join(bob, 'voter');

    const observerContext = await frenchContext(browser);
    contexts.push(observerContext);
    const observer = await observerContext.newPage();
    await observer.goto(invitationUrl);
    await setupProfile(observer, 'Noa', 'pirate');
    await join(observer, 'observer');

    await alice.getByRole('button', { name: 'Modifier mon profil' }).click();
    await alice.getByLabel('Prénom ou pseudo').fill('Alicia');
    await alice.locator('.profile-avatar-choice input[value="owl"]').check({ force: true });
    const avatarPng = await alice.locator('.profile-card').screenshot({ type: 'png' });
    await alice.locator('#profile-photo').setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: avatarPng });
    await expect(alice.locator('.custom-avatar-picker')).toHaveClass(/selected/);
    await alice.getByRole('button', { name: 'Enregistrer le profil' }).click();
    const aliciaRow = observer.locator('.participant-row').filter({ hasText: 'Alicia' });
    await expect(aliciaRow).toBeVisible();
    await expect(aliciaRow.locator('.avatar-custom img')).toBeVisible();

    await alice.locator('.start-story').getByLabel('Jeu de cartes').selectOption('scrum');
    await expect(alice.locator('.room-toolbar').getByLabel('Jeu de cartes')).toHaveValue('scrum');
    await startStory(alice, 'EXP-101 — paiement en un clic');
    await expect(camille.locator('.poker-seat')).toHaveCount(4);
    await expect(camille.locator('.table-vote-card.voted')).toHaveCount(0);
    await expect(camille.locator('.start-story').getByLabel('Jeu de cartes')).toHaveCount(0);
    const roomDeck = alice.locator('.room-toolbar').getByLabel('Jeu de cartes');
    await expect(roomDeck).toBeEnabled();
    await roomDeck.selectOption('fibonacci');
    await expect(alice.locator('.story-ticket-label')).toContainText('Scrum');
    await expect(observer.locator('[data-estimate-value]')).toHaveCount(0);
    await expect(observer.locator('.observer-seat .card-back')).toHaveText(['SPEC.', 'SPEC.']);
    await expect(observer.getByRole('button', { name: /Révéler les cartes/ })).toBeDisabled();
    await vote(alice, '5');
    const selectedCardBox = await alice.locator('.estimate-dock .estimate-card.selected').boundingBox();
    const estimateDeckBox = await alice.locator('.estimate-dock .estimate-deck').boundingBox();
    expect(selectedCardBox).not.toBeNull();
    expect(estimateDeckBox).not.toBeNull();
    expect(selectedCardBox!.y).toBeGreaterThanOrEqual(estimateDeckBox!.y - 1);
    expect(selectedCardBox!.y + selectedCardBox!.height).toBeLessThanOrEqual(estimateDeckBox!.y + estimateDeckBox!.height + 1);
    await expect(camille.locator('.table-vote-card.voted')).toHaveCount(1);
    await vote(bob, '5');
    await expect(camille.locator('.table-vote-card.voted')).toHaveCount(2);
    await observer.getByRole('button', { name: /Révéler les cartes/ }).click();
    await expect(camille.getByRole('status').filter({ hasText: 'Même destination' })).toBeVisible();
    await expect(observer.getByRole('heading', { name: 'Même destination !' })).toBeVisible();
    await expect(camille.locator('.table-center-mark strong')).toHaveText('5');
    await expect(camille.locator('.table-vote-card.is-revealed .card-front')).toHaveText(['5', '5']);
    await expect(camille.locator('.celebration')).toBeHidden({ timeout: 6_000 });
    await camille.getByLabel('Estimation finale').fill('5');
    await camille.getByRole('button', { name: /Valider et continuer/ }).click();
    await expect(observer.getByLabel('Titre ou lien de la user story')).toBeVisible();

    await startStory(bob, 'https://example.test/stories/EXP-102');
    await expect(camille.locator('.story-reference')).toHaveAttribute('href', 'https://example.test/stories/EXP-102');
    await vote(alice, '3');
    await vote(bob, '8');
    await alice.getByRole('button', { name: /Révéler les cartes/ }).click();
    await expect(camille.getByText('5.5', { exact: true })).toBeVisible();
    await observer.getByLabel('Estimation finale').fill('à découper');
    await observer.getByRole('button', { name: /Valider et continuer/ }).click();
    await expect(camille.getByLabel('Titre ou lien de la user story')).toBeVisible();

    await startStory(observer, 'Story à affiner — besoin de précisions métier');
    await vote(alice, 'abstain');
    await revealAndFinalize(bob, 'À préciser');

    await expect(camille.locator('.history-list details')).toHaveCount(3);
    await expect(camille.getByText('À préciser', { exact: true })).toBeVisible();
    await expect(observer.getByLabel('Titre ou lien de la user story')).toBeVisible();

    await alice.getByRole('button', { name: 'Poker Express', exact: true }).click();
    await alice.getByRole('button', { name: 'Nouvelle salle' }).click();
    await alice.getByLabel('Nom de la salle').fill('Contrôle avatar');
    await alice.getByRole('button', { name: 'Créer la salle' }).click();
    const joinAvatar = alice.locator('.join-profile .avatar-custom');
    await expect(joinAvatar.locator('img')).toBeVisible();
    const joinAvatarBox = await joinAvatar.boundingBox();
    expect(joinAvatarBox).not.toBeNull();
    expect(Math.abs(joinAvatarBox!.width - joinAvatarBox!.height)).toBeLessThan(0.5);
  } finally {
    await Promise.allSettled(contexts.map((context) => context.close()));
  }
});
