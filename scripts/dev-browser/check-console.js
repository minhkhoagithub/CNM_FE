const TEST_URL = "http://127.0.0.1:5173";

const page = await browser.getPage("console-check");

const consoleErrors = [];
const pageErrors = [];
const requestFailures = [];
const serverErrors = [];

page.on("console", (msg) => {
  if (msg.type() === "error") {
    consoleErrors.push(msg.text());
  }
});

page.on("pageerror", (err) => {
  pageErrors.push(err.message);
});

page.on("requestfailed", (request) => {
  const failure = request.failure();
  requestFailures.push({
    url: request.url(),
    method: request.method(),
    errorText: failure ? failure.errorText : "Unknown request failure",
  });
});

page.on("response", (response) => {
  if (response.status() >= 500) {
    serverErrors.push({
      url: response.url(),
      status: response.status(),
    });
  }
});

await page.goto(TEST_URL, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);

console.log("URL:", page.url());
console.log("Console errors:", JSON.stringify(consoleErrors, null, 2));
console.log("Page errors:", JSON.stringify(pageErrors, null, 2));
console.log("Request failures:", JSON.stringify(requestFailures, null, 2));
console.log("Server 5xx:", JSON.stringify(serverErrors, null, 2));

if (pageErrors.length > 0) {
  throw new Error("Page errors detected: " + pageErrors.join(" | "));
}

if (consoleErrors.length > 0) {
  throw new Error("Console errors detected: " + consoleErrors.join(" | "));
}
