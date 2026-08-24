import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

const { version } = JSON.parse(
  readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
);

const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 1024, height: 768 },
  { name: "laptop", width: 1366, height: 768 },
  { name: "desktop", width: 1920, height: 1080 },
];

test("serves pre-rendered, indexable metadata and discovery files", async ({ page, request }) => {
  const response = await request.get("/");
  expect(response.status()).toBe(200);
  const source = await response.text();
  expect((source.match(/<h1\b/g) || []).length).toBe(1);
  expect(source).toContain("Pomodoro Focus Timer");
  expect(source).toContain(`Application version ${version}`);
  expect(source).toContain('rel="canonical" href="https://pomodoro.iomdev.com/"');

  const robots = await request.get("/robots.txt");
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain("Sitemap: https://pomodoro.iomdev.com/sitemap.xml");

  const sitemap = await request.get("/sitemap.xml");
  expect(sitemap.status()).toBe(200);
  expect(await sitemap.text()).toContain("<loc>https://pomodoro.iomdev.com/</loc>");

  const socialImage = await request.get("/og-image.png");
  expect(socialImage.status()).toBe(200);
  expect(socialImage.headers()["content-type"]).toContain("image/png");

  const manifest = await request.get("/site.webmanifest");
  expect(manifest.status()).toBe(200);
  expect(JSON.parse(await manifest.text()).name).toBe("Pomodoro Focus Timer");

  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await expect(page).toHaveTitle("Pomodoro Focus Timer | Customisable Study Timer");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("Pomodoro Focus Timer");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    "Free, customisable Pomodoro focus timer with adjustable work and break sessions, saved settings, notifications and screen wake support on any device.",
  );
  await expect(page.locator(".app-version")).toHaveText(`v${version}`);
  const structuredData = JSON.parse(
    await page.locator('script[type="application/ld+json"]').textContent(),
  );
  expect(structuredData).toMatchObject({
    "@type": "WebApplication",
    name: "Pomodoro Focus Timer",
    url: "https://pomodoro.iomdev.com/",
  });
  expect(errors).toEqual([]);
});

for (const viewport of viewports) {
  test(`renders without horizontal overflow on ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator("#timer-panel")).toBeVisible();
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client);
  });
}

test("supports timer controls and persists validated settings", async ({ page }) => {
  await page.goto("/");
  const timer = page.locator(".timer-time span");
  await expect(timer).toHaveText("25:00");

  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("button", { name: "Pause" })).toBeVisible();
  await expect(timer).not.toHaveText("25:00", { timeout: 2500 });
  await page.getByRole("button", { name: "Pause" }).click();
  const pausedTime = await timer.textContent();
  await page.waitForTimeout(1100);
  await expect(timer).toHaveText(pausedTime);
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(timer).toHaveText("25:00");

  await page.getByRole("tab", { name: "Short break" }).click();
  await expect(timer).toHaveText("05:00");
  await page.getByRole("tab", { name: "Focus" }).click();

  await page.locator("#focus-minutes").fill("10");
  await page.locator("#short-break-minutes").fill("2");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(timer).toHaveText("10:00");
  await page.reload();
  await expect(page.locator("#focus-minutes")).toHaveValue("10");
  await expect(page.locator("#short-break-minutes")).toHaveValue("2");
  await expect(timer).toHaveText("10:00");
});
