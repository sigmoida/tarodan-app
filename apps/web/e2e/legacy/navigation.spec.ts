import { test, expect } from '@playwright/test';

test.describe('Navigation', () => {
  test('should load home page', async ({ page }) => {
    await page.goto('/');
    
    await expect(page).toHaveTitle(/diecast|market/i);
    await expect(page.getByRole('link', { name: /diecast market/i })).toBeVisible();
  });

  test('should have working navbar links', async ({ page }) => {
    await page.goto('/');
    
    // Check navbar links exist
    await expect(page.getByRole('link', { name: /ilanlar/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /takaslar/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /koleksiyonlar/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /üyelik/i })).toBeVisible();
  });

  test('should navigate to listings page', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('link', { name: /ilanlar/i }).click();
    
    await expect(page).toHaveURL('/listings');
    await expect(page.getByPlaceholder(/model, marka ara/i)).toBeVisible();
  });

  test('should navigate to trades page', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('link', { name: /takaslar/i }).click();
    
    await expect(page).toHaveURL('/trades');
    await expect(page.getByText(/takaslarım/i)).toBeVisible();
  });

  test('should navigate to collections page', async ({ page }) => {
    await page.goto('/');
    
    await page.getByRole('link', { name: /koleksiyonlar/i }).click();
    
    await expect(page).toHaveURL('/collections');
    await expect(page.getByRole('heading', { name: /koleksiyonlar/i })).toBeVisible();
  });

  test('should show login/register for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    
    await expect(page.getByRole('link', { name: /giriş yap/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /üye ol/i })).toBeVisible();
  });

  test('should navigate to login from navbar', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    
    await page.getByRole('link', { name: /giriş yap/i }).click();
    
    await expect(page).toHaveURL('/login');
  });

  test('should navigate to register from navbar', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    
    await page.getByRole('link', { name: /üye ol/i }).click();
    
    await expect(page).toHaveURL('/register');
  });

  test('should have working footer links', async ({ page }) => {
    await page.goto('/');
    
    // Check footer exists
    await expect(page.locator('footer')).toBeVisible();
    
    // Check some footer links
    await expect(page.locator('footer').getByRole('link', { name: /ilanlar/i })).toBeVisible();
  });

  test('should show categories on home page', async ({ page }) => {
    await page.goto('/');
    
    await expect(page.getByRole('heading', { name: /kategoriler/i })).toBeVisible();
  });

  test('should show features section on home page', async ({ page }) => {
    await page.goto('/');
    
    await expect(page.getByRole('heading', { name: /neden biz/i })).toBeVisible();
    await expect(page.getByText(/güvenli takas/i)).toBeVisible();
    await expect(page.getByText(/güvenli ödeme/i)).toBeVisible();
    await expect(page.getByText(/kargo takibi/i)).toBeVisible();
  });
});
