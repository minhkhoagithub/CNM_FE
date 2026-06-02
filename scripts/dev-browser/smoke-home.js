const TEST_URL = "http://127.0.0.1:5173";

const page = await browser.getPage("smoke-home");

await page.goto(TEST_URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

const currentUrl = page.url();
const title = await page.title();
const bodyText = (await page.locator("body").innerText()) || "";
const bodyLength = bodyText.trim().length;

console.log("URL:", currentUrl);
console.log("Title:", title);
console.log("Body length:", bodyLength);

if (bodyLength < 20) {
  throw new Error("Page body seems empty or not rendered correctly.");
}
