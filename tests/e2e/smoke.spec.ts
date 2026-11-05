import { test, expect } from "@playwright/test";

test("login page loads", async ({ page }) => {
  await page.goto("/entrar");
  await expect(page).toHaveTitle(/.+/);
});

test("health endpoint", async ({ request }) => {
  const res = await request.get("/api/v1/health");
  expect(res.ok()).toBeTruthy();
});