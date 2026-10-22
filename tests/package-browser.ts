import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { chromium, type Page } from "playwright";
import { assertIsolatedTestEnvironment } from "./fixture";

assertIsolatedTestEnvironment(process.env);
const origin = process.env.TEST_ORIGIN ?? "";
assert.match(origin, /^http:\/\/localhost:\d+$/);
const directory = resolve(
  process.env.BROWSER_PROOF_DIRECTORY ?? ".local/package/browser",
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
const errors: string[] = [];
async function pictures(page: Page, surface: string): Promise<void> {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["light", "dark"]) {
      await page.getByLabel("Appearance", { exact: true }).selectOption(theme);
      assert.equal(
        await page.evaluate(() => document.documentElement.dataset.theme),
        theme,
      );
      assert.ok(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      );
      await page.screenshot({
        path: `${directory}/${surface}-${width}-${theme}.png`,
      });
    }
  }
}
async function setup(page: Page): Promise<void> {
  await page.goto(origin + "/setup");
  assert.equal(new URL(page.url()).origin, origin);
  await pictures(page, "setup");
  await page.getByLabel("Your name", { exact: true }).fill("Remote Operator");
  await page.getByLabel("Email", { exact: true }).fill("operator@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("remote-proof-password-12!");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page
    .getByRole("button", { name: "Verify installation", exact: true })
    .click();
  await page
    .getByText("Skipped · manual login links available", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Brand name", { exact: true }).fill("Remote Studio");
  await page
    .getByRole("button", { name: "Create portal", exact: true })
    .click();
  await page
    .getByRole("link", { name: "Go to dashboard", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Welcome, Remote", exact: true })
    .waitFor();
}
async function login(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await page.waitForURL(origin + "/login");
  await page.getByLabel("Email", { exact: true }).fill("operator@example.test");
  await page
    .getByLabel("Password", { exact: true })
    .fill("remote-proof-password-12!");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await page.waitForURL(origin + "/dashboard");
  await page
    .getByRole("heading", { name: "Welcome, Remote", exact: true })
    .waitFor();
  await pictures(page, "operator");
}
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await setup(page);
  await login(page);
  await page.goto(origin + "/dashboard/clients/new");
  await page.getByLabel("Name", { exact: true }).fill("Package Browser Client");
  await page
    .getByLabel("Email", { exact: true })
    .fill("package-browser@example.test");
  await page.getByRole("button", { name: "Save client", exact: true }).click();
  await page.waitForURL(/\/dashboard\/clients\/[a-f0-9-]+$/);
  await page
    .getByRole("button", { name: "Generate login link", exact: true })
    .click();
  const link = await page
    .getByLabel("Single-use login link · expires in 24 hours")
    .inputValue();
  const client = await browser.newContext();
  const clientPage = await client.newPage();
  clientPage.on("pageerror", (error) => errors.push(error.message));
  await clientPage.goto(link);
  await clientPage
    .getByRole("button", { name: "Continue to portal", exact: true })
    .click();
  await clientPage.waitForURL(origin + "/portal");
  await pictures(clientPage, "client");
  assert.deepEqual(errors, []);
  await client.close();
  await context.close();
  process.stdout.write(
    `Exact-image browser setup/operator/manual-client login passed at ${origin}.\n`,
  );
} finally {
  await browser.close();
}
