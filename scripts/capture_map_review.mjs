import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import path from "node:path";

const OUTPUT_DIR = path.resolve("deliverables/map-review");
const BASE_URL = process.env.MAP_REVIEW_URL || "http://127.0.0.1:5173";
const VIEWPORT = { width: 1680, height: 1140 };

const shots = [
  {
    name: "work-corridors",
    url: `${BASE_URL}/map-review?regime=work_core&variant=corridors&capture=1`,
  },
  {
    name: "work-corridors-od",
    url: `${BASE_URL}/map-review?regime=work_core&variant=corridors-od&capture=1`,
  },
  {
    name: "weekday-08-all-routes",
    url: `${BASE_URL}/map-review?variant=all-routes&profile=weekdays&hour=8&capture=1`,
  },
  {
    name: "weekday-17-all-routes",
    url: `${BASE_URL}/map-review?variant=all-routes&profile=weekdays&hour=17&capture=1`,
  },
  {
    name: "work-flows",
    url: `${BASE_URL}/map-review?regime=work_core&variant=flows&capture=1`,
  },
  {
    name: "leisure-corridors-od",
    url: `${BASE_URL}/map-review?regime=day_leisure&variant=corridors-od&capture=1`,
  },
  {
    name: "weekend-13-all-routes",
    url: `${BASE_URL}/map-review?variant=all-routes&profile=weekends&hour=13&capture=1`,
  },
  {
    name: "night-corridors-od",
    url: `${BASE_URL}/map-review?regime=night_social&variant=corridors-od&capture=1`,
  },
  {
    name: "weekend-23-all-routes",
    url: `${BASE_URL}/map-review?variant=all-routes&profile=weekends&hour=23&capture=1`,
  },
  {
    name: "leisure-hotspots",
    url: `${BASE_URL}/map-review?regime=day_leisure&variant=hotspots&capture=1`,
  },
];

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--use-angle=swiftshader",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--disable-dev-shm-usage",
    ],
  });

  const page = await browser.newPage({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
  });

  for (const shot of shots) {
    await page.goto(shot.url, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForSelector("[data-map-review-root], .load-screen", { timeout: 120_000 });
    await page.waitForTimeout(5000);
    await page.screenshot({
      path: path.join(OUTPUT_DIR, `${shot.name}.png`),
      fullPage: false,
    });
  }

  await browser.close();
  console.log(`Captured ${shots.length} screenshots to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
