import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const DEFAULT_CONFIG_URL = "**/greeting/loaders/web_config_v3.json";
const IMAGE_URL_GLOB = "**/greeting/loaders/*.jpeg";

const baseEntry = {
  autumn_2025: {
    description: "Осень",
    options: {
      aspectRatio: "xMaxYMid",
      gradient: "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
    },
    "options-portrait": {
      aspectRatio: "xMaxYMid",
      gradient: "linear-gradient(0deg, rgb(3,3,3) 0%, rgb(4,4,4) 100%)",
    },
  },
};

const onePixelPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WnV1ioAAAAASUVORK5CYII=",
  "base64",
);

async function mockDefaultConfig(page: Page, payload = baseEntry) {
  await page.route(DEFAULT_CONFIG_URL, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(payload),
    });
  });

  await page.route(IMAGE_URL_GLOB, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "image/jpeg",
      body: onePixelPng,
    });
  });
}

async function openEntry(page: Page, key: string) {
  await page.getByRole("button", { name: new RegExp(`${key}`) }).first().click();
}

test.describe("JSON config editor e2e", () => {
  test("happy path: edits visual form and downloads updated JSON", async ({ page }) => {
    await mockDefaultConfig(page);
    await page.goto("/");

    await openEntry(page, "autumn_2025");
    await page.getByLabel("Подпись к заставке").fill("Новая осенняя заставка");

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать JSON" }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();

    expect(downloadPath).toBeTruthy();
    const fileContent = await readFile(downloadPath!, "utf8");
    const json = JSON.parse(fileContent);

    expect(json.autumn_2025.description).toBe("Новая осенняя заставка");
  });

  test("keeps desktop and mobile gradients independent", async ({ page }) => {
    await mockDefaultConfig(page);
    await page.goto("/");

    await openEntry(page, "autumn_2025");
    const gradientInputs = page.getByRole("textbox", { name: "Градиент" });
    await gradientInputs.nth(1).fill(
      "linear-gradient(45deg, rgb(10,10,10) 0%, rgb(20,20,20) 100%)",
    );

    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать JSON" }).click();
    const download = await downloadPromise;
    const fileContent = await readFile((await download.path())!, "utf8");
    const json = JSON.parse(fileContent);

    expect(json.autumn_2025.options.gradient).toBe(
      "linear-gradient(0deg, rgb(1,1,1) 0%, rgb(2,2,2) 100%)",
    );
    expect(json.autumn_2025["options-portrait"].gradient).toBe(
      "linear-gradient(45deg, rgb(10,10,10) 0%, rgb(20,20,20) 100%)",
    );
  });

  test("generates and applies a gradient from uploaded image", async ({ page }) => {
    await mockDefaultConfig(page, {
      autumn_2025: {
        ...baseEntry.autumn_2025,
        "options-portrait": {
          aspectRatio: "xMaxYMid",
          gradient: "",
        },
      },
    });

    await page.goto("/");
    await openEntry(page, "autumn_2025");

    await page.getByLabel("Сгенерировать градиент из изображения").nth(1).click();
    await expect(page.getByText("Генерация градиента из изображения")).toBeVisible();

    await page.locator('input[type="file"]').setInputFiles({
      name: "gradient-source.png",
      mimeType: "image/png",
      buffer: onePixelPng,
    });

    await expect(page.getByRole("button", { name: "Сгенерировать градиент" })).toBeVisible();
    await page.getByRole("button", { name: "Сгенерировать градиент" }).click();
    await expect(page.getByRole("button", { name: "Вариант 1" })).toBeVisible();

    await page.getByRole("button", { name: "Применить" }).click();

    await expect(page.getByRole("textbox", { name: "Градиент" }).nth(1)).toHaveValue(/linear-gradient\(/);
  });
});
