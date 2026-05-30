const TEST_URL = "http://127.0.0.1:5173";

const page = await browser.getPage("basic-navigation");

await page.goto(TEST_URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1200);

console.log("Start URL:", page.url());
console.log("Start Title:", await page.title());

const links = await page.locator("a").evaluateAll((items) =>
  items.slice(0, 40).map((a) => ({
    text: (a.innerText || "").trim(),
    href: a.href,
  }))
);

console.log("Detected links:", JSON.stringify(links, null, 2));

const originMatch = TEST_URL.match(/^https?:\/\/[^/]+/);
const origin = originMatch ? originMatch[0] : TEST_URL;
const visited = {};

for (const item of links) {
  if (!item.href || !item.href.startsWith(origin)) {
    continue;
  }

  const match = item.href.match(/^https?:\/\/[^/]+(\/[^?#]*)/);
  const key = match ? `${origin}${match[1]}` : item.href;
  if (visited[key]) {
    continue;
  }
  visited[key] = true;

  if (Object.keys(visited).length > 4) {
    break;
  }

  try {
    await page.goto(key, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(700);
    console.log("Visited:", key, "=>", page.url());
  } catch (error) {
    console.log("Navigation failed for:", key, "Error:", String(error));
  }
}

if (Object.keys(visited).length <= 1) {
  const fallbackPaths = ["/auth/register", "/auth/forgot-password", "/auth/login"];
  for (const path of fallbackPaths) {
    const url = `${origin}${path}`;
    if (visited[url]) {
      continue;
    }
    try {
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(700);
      visited[url] = true;
      console.log("Fallback visited:", url, "=>", page.url());
    } catch (error) {
      console.log("Fallback navigation failed for:", url, "Error:", String(error));
    }
  }
}

console.log("Final URL:", page.url());
