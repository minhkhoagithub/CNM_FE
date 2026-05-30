const TEST_URL = "http://127.0.0.1:5173";

const page = await browser.getPage("screenshot-home");

await page.goto(TEST_URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const screenshotBuffer = await page.screenshot({ fullPage: true });
const screenshotPath = await saveScreenshot(screenshotBuffer, "cnm-fe-home.png");

console.log("URL:", page.url());
console.log("Screenshot saved to:", screenshotPath);
