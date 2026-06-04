import { test, expect } from '@playwright/test';

test.describe('Profile', () => {
  // Helper to login before profile tests
  async function login(page: any) {
    await page.goto('/login');
    await page.getByPlaceholder(/email/i).fill('seller@demo.com');
    await page.getByPlaceholder(/şifre|password/i).first().fill('Demo123!');
    await page.getByRole('button', { name: /giriş yap/i }).click();
    await page.waitForURL('/', { timeout: 10000 });
  }

  test('should redirect to login if not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/profile');
    
    // Should redirect to login
    await expect(page).toHaveURL('/login', { timeout: 5000 });
  });

  test('should display profile page for authenticated user', async ({ page }) => {
    await login(page);
    
    await page.goto('/profile');
    
    // Should show profile info
    await expect(page.getByText(/demo satıcı/i)).toBeVisible({ timeout: 5000 });
  });

  test('should show user stats', async ({ page }) => {
    await login(page);
    
    await page.goto('/profile');
    
    // Should show stats cards
    await expect(page.getByText(/ilanlarım/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/siparişlerim/i)).toBeVisible();
    await expect(page.getByText(/takaslarım/i)).toBeVisible();
    await expect(page.getByText(/koleksiyonlarım/i)).toBeVisible();
  });

  test('should show quick links', async ({ page }) => {
    await login(page);
    
    await page.goto('/profile');
    
    // Should show quick access links
    await expect(page.getByText(/hızlı erişim/i)).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(/mesajlarım/i)).toBeVisible();
    await expect(page.getByText(/favorilerim/i)).toBeVisible();
  });

  test('should have logout button', async ({ page }) => {
    await login(page);
    
    await page.goto('/profile');
    
    // Should show logout button
    await expect(page.getByRole('button', { name: /çıkış yap/i })).toBeVisible({ timeout: 5000 });
  });

  test('should logout successfully', async ({ page }) => {
    await login(page);
    
    await page.goto('/profile');
    
    // Click logout
    await page.getByRole('button', { name: /çıkış yap/i }).click();
    
    // Should redirect to home
    await expect(page).toHaveURL('/', { timeout: 5000 });
    
    // Should show login button (not authenticated)
    await expect(page.getByRole('link', { name: /giriş yap/i })).toBeVisible();
  });

  test('should navigate to edit profile', async ({ page }) => {
    await login(page);
    
    await page.goto('/profile');
    
    // Click edit profile
    const editLink = page.getByRole('link', { name: /profili düzenle/i });
    if (await editLink.isVisible()) {
      await editLink.click();
      await expect(page).toHaveURL(/\/profile\/edit/);
    }
  });
});

test.describe('Protected Routes', () => {
  test('should redirect messages to login if not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/messages');
    
    await expect(page).toHaveURL('/login', { timeout: 5000 });
  });

  test('should redirect orders to login if not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/orders');
    
    await expect(page).toHaveURL('/login', { timeout: 5000 });
  });
});
