import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
  });

  test('should display login page', async ({ page }) => {
    await page.goto('/login');
    
    await expect(page.getByRole('heading', { name: /hoş geldiniz/i })).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByPlaceholder(/şifre|password/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: /giriş yap/i })).toBeVisible();
  });

  test('should show error for empty form submission', async ({ page }) => {
    await page.goto('/login');
    
    await page.getByRole('button', { name: /giriş yap/i }).click();
    
    // Should show toast error
    await expect(page.getByText(/e-posta ve şifre gerekli/i)).toBeVisible({ timeout: 5000 });
  });

  test('should login successfully with valid credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.getByPlaceholder(/email/i).fill('seller@demo.com');
    await page.getByPlaceholder(/şifre|password/i).first().fill('Demo123!');
    await page.getByRole('button', { name: /giriş yap/i }).click();
    
    // Should redirect to home page
    await expect(page).toHaveURL('/', { timeout: 10000 });
    
    // Should show user info in navbar
    await expect(page.getByText(/demo satıcı/i)).toBeVisible({ timeout: 5000 });
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');
    
    await page.getByPlaceholder(/email/i).fill('wrong@email.com');
    await page.getByPlaceholder(/şifre|password/i).first().fill('WrongPass123!');
    await page.getByRole('button', { name: /giriş yap/i }).click();
    
    // Should show error toast
    await expect(page.getByText(/giriş başarısız|hatalı/i)).toBeVisible({ timeout: 5000 });
  });

  test('should display register page', async ({ page }) => {
    await page.goto('/register');
    
    await expect(page.getByRole('heading', { name: /hesap oluştur/i })).toBeVisible();
    await expect(page.getByPlaceholder(/adınız soyadınız/i)).toBeVisible();
    await expect(page.getByPlaceholder(/email/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /üye ol/i })).toBeVisible();
  });

  test('should validate password requirements on register', async ({ page }) => {
    await page.goto('/register');
    
    await page.getByPlaceholder(/adınız soyadınız/i).fill('Test User');
    await page.getByPlaceholder(/email/i).fill('test@example.com');
    await page.getByPlaceholder(/şifre|password/i).first().fill('weak');
    await page.getByPlaceholder(/şifre tekrar/i).fill('weak');
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: /üye ol/i }).click();
    
    // Should show password validation error
    await expect(page.getByText(/en az 8 karakter|büyük harf|küçük harf|rakam/i)).toBeVisible({ timeout: 5000 });
  });

  test('should navigate from login to register', async ({ page }) => {
    await page.goto('/login');
    
    await page.getByRole('link', { name: /üye olun/i }).click();
    
    await expect(page).toHaveURL('/register');
  });

  test('should navigate from register to login', async ({ page }) => {
    await page.goto('/register');
    
    await page.getByRole('link', { name: /giriş yapın/i }).click();
    
    await expect(page).toHaveURL('/login');
  });
});
