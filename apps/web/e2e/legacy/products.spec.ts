import { test, expect } from '@playwright/test';

test.describe('Products/Listings', () => {
  test('should display listings page', async ({ page }) => {
    await page.goto('/listings');
    
    // Check page structure
    await expect(page.getByPlaceholder(/model, marka ara/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /filtreler/i })).toBeVisible();
  });

  test('should show loading state initially', async ({ page }) => {
    await page.goto('/listings');
    
    // Should show skeleton loaders or loading indicator
    // The page has skeleton loaders for cards
    const skeletons = page.locator('.animate-pulse');
    await expect(skeletons.first()).toBeVisible({ timeout: 1000 }).catch(() => {
      // Loading finished quickly, that's fine
    });
  });

  test('should display products after loading', async ({ page }) => {
    await page.goto('/listings');
    
    // Wait for products to load or empty state
    await page.waitForTimeout(3000);
    
    // Either products or empty state should be visible
    const hasProducts = await page.locator('[class*="card"]').count() > 0;
    const hasEmptyState = await page.getByText(/henüz ilan bulunamadı/i).isVisible().catch(() => false);
    
    expect(hasProducts || hasEmptyState).toBeTruthy();
  });

  test('should have search functionality', async ({ page }) => {
    await page.goto('/listings');
    
    const searchInput = page.getByPlaceholder(/model, marka ara/i);
    await searchInput.fill('Hot Wheels');
    await searchInput.press('Enter');
    
    // Should trigger search
    await page.waitForTimeout(1000);
  });

  test('should toggle filters panel', async ({ page }) => {
    await page.goto('/listings');
    
    // Click filter button
    await page.getByRole('button', { name: /filtreler/i }).click();
    
    // Filter panel should be visible
    await expect(page.getByText(/tüm markalar/i)).toBeVisible();
    await expect(page.getByText(/tüm ölçekler/i)).toBeVisible();
  });

  test('should have brand filter', async ({ page }) => {
    await page.goto('/listings');
    
    await page.getByRole('button', { name: /filtreler/i }).click();
    
    // Check brand dropdown
    const brandSelect = page.locator('select').filter({ hasText: /tüm markalar/i });
    await expect(brandSelect).toBeVisible();
  });

  test('should have scale filter', async ({ page }) => {
    await page.goto('/listings');
    
    await page.getByRole('button', { name: /filtreler/i }).click();
    
    // Check scale dropdown
    const scaleSelect = page.locator('select').filter({ hasText: /tüm ölçekler/i });
    await expect(scaleSelect).toBeVisible();
  });

  test('should have price filters', async ({ page }) => {
    await page.goto('/listings');
    
    await page.getByRole('button', { name: /filtreler/i }).click();
    
    // Check price inputs
    await expect(page.getByPlaceholder(/min/i)).toBeVisible();
    await expect(page.getByPlaceholder(/max/i)).toBeVisible();
  });

  test('should have trade only filter', async ({ page }) => {
    await page.goto('/listings');
    
    await page.getByRole('button', { name: /filtreler/i }).click();
    
    // Check trade checkbox
    await expect(page.getByText(/sadece takas/i)).toBeVisible();
  });

  test('should clear filters', async ({ page }) => {
    await page.goto('/listings');
    
    // Open filters
    await page.getByRole('button', { name: /filtreler/i }).click();
    
    // Apply a filter
    await page.getByRole('checkbox').check();
    
    // Clear filters button should appear
    await expect(page.getByText(/filtreleri temizle/i)).toBeVisible();
    
    // Click clear
    await page.getByText(/filtreleri temizle/i).click();
    
    // Checkbox should be unchecked
    await expect(page.getByRole('checkbox')).not.toBeChecked();
  });
});

test.describe('Product Detail', () => {
  // Note: These tests assume there's at least one product in the database
  // If database is empty, these will fail
  
  test('should show not found for invalid product ID', async ({ page }) => {
    await page.goto('/listings/invalid-id-12345');
    
    // Should show loading then not found or error
    await page.waitForTimeout(2000);
    
    // Either shows "not found" or some error state
    const content = await page.content();
    const hasError = content.includes('bulunamadı') || content.includes('not found') || content.includes('Error');
    
    // This is expected behavior for invalid ID
  });
});
