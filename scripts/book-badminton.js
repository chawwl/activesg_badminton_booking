import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const DEFAULT_BASE_URL = "https://activesg.gov.sg";
const BADMINTON_VENUES_PATH = "/facility-bookings/activities/YLONatwvqJfikKOmB5N9U/venues";

function parseDotEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function optionalEnv(name, fallback = "") {
  return process.env[name]?.trim() || fallback;
}

function parseBool(value, fallback = false) {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatDateButtonLabel(dateIso) {
  const parts = new Intl.DateTimeFormat("en-SG", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "Asia/Singapore"
  }).formatToParts(new Date(`${dateIso}T00:00:00+08:00`));

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${map.weekday}, ${map.day} ${map.month}`;
}

function formatTimeLabel(time24) {
  const [hoursRaw, minutesRaw] = time24.split(":");
  const hours = Number(hoursRaw);
  const minutes = Number(minutesRaw);

  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
    throw new Error(`Invalid time: ${time24}. Expected HH:MM in 24-hour format.`);
  }

  const meridiem = hours >= 12 ? "pm" : "am";
  const twelveHour = hours % 12 || 12;
  return `${twelveHour}:${String(minutes).padStart(2, "0")} ${meridiem}`;
}

async function clickFirstVisible(locatorFactories, actionName) {
  for (const createLocator of locatorFactories) {
    const locator = createLocator();
    if (await locator.count().catch(() => 0)) {
      const target = locator.first();
      if (await target.isVisible().catch(() => false)) {
        await target.click({ timeout: 10_000 });
        return true;
      }
    }
  }

  console.log(`No visible control found for: ${actionName}`);
  return false;
}

async function waitForManualLogin(page, timeoutMs) {
  const loggedOutSignals = [
    page.getByRole("button", { name: /^Log in$/i }),
    page.getByRole("button", { name: /Log in with/i }),
    page.getByRole("button", { name: /sing pass/i })
  ];

  for (const signal of loggedOutSignals) {
    if (await signal.first().isVisible().catch(() => false)) {
      console.log("Waiting for you to complete Singpass login in the Chrome window...");
      break;
    }
  }

  await page.waitForFunction(
    () => !/login\.id\.singpass\.gov\.sg/.test(window.location.hostname),
    null,
    { timeout: timeoutMs }
  );
}

async function ensureLoggedIn(page, timeoutMs) {
  const isLoggedOut =
    (await page.getByRole("button", { name: /^Log in$/i }).first().isVisible().catch(() => false)) ||
    (await page.getByRole("button", { name: /Log in with/i }).first().isVisible().catch(() => false));

  if (!isLoggedOut) {
    return;
  }

  const clicked = await clickFirstVisible(
    [
      () => page.getByRole("button", { name: /Log in with/i }),
      () => page.getByRole("button", { name: /^Log in$/i })
    ],
    "log in"
  );

  if (!clicked) {
    throw new Error("Could not find a login button on the page.");
  }

  await page.waitForURL(/singpass\.gov\.sg/, { timeout: 30_000 });
  await waitForManualLogin(page, timeoutMs);
}

async function openVenue(page, baseUrl, venueName, searchTerm) {
  await page.goto(`${baseUrl}${BADMINTON_VENUES_PATH}`, { waitUntil: "domcontentloaded" });

  const searchBox = page.getByRole("textbox", { name: /Press enter to search/i });
  await searchBox.waitFor({ state: "visible", timeout: 20_000 });

  if (searchTerm || venueName) {
    await searchBox.fill(searchTerm || venueName);
    await searchBox.press("Enter");
  }

  const exactLink = page.getByRole("link", { name: new RegExp(`^${escapeForRegex(venueName)}(?:\\s|$)`, "i") }).first();
  await exactLink.waitFor({ state: "visible", timeout: 20_000 });
  await exactLink.click();
  await page.waitForLoadState("domcontentloaded");
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function selectDate(page, targetDate) {
  const dateLabel = formatDateButtonLabel(targetDate);
  const button = page.getByRole("button", { name: new RegExp(`View timeslots for ${escapeForRegex(dateLabel)}`, "i") });
  await button.waitFor({ state: "visible", timeout: 20_000 });
  await button.click();
  console.log(`Selected date: ${dateLabel}`);
}

async function selectTimes(page, times) {
  for (const time of times) {
    const label = formatTimeLabel(time);
    const checkbox = page.getByRole("checkbox", { name: new RegExp(`^${escapeForRegex(label)}$`, "i") }).first();
    await checkbox.waitFor({ state: "visible", timeout: 20_000 });
    await checkbox.check();
    console.log(`Selected slot: ${label}`);
  }
}

async function advanceToReview(page) {
  const moved = await clickFirstVisible(
    [
      () => page.getByRole("button", { name: /continue/i }),
      () => page.getByRole("button", { name: /review/i }),
      () => page.getByRole("button", { name: /next/i }),
      () => page.getByRole("button", { name: /add to cart/i }),
      () => page.getByRole("button", { name: /go to cart/i }),
      () => page.getByRole("button", { name: /checkout/i })
    ],
    "advance to review"
  );

  if (moved) {
    await page.waitForLoadState("domcontentloaded");
  }

  return moved;
}

async function finalizeBooking(page) {
  const clicked = await clickFirstVisible(
    [
      () => page.getByRole("button", { name: /pay/i }),
      () => page.getByRole("button", { name: /confirm/i }),
      () => page.getByRole("button", { name: /book now/i }),
      () => page.getByRole("button", { name: /submit/i })
    ],
    "final confirmation"
  );

  if (!clicked) {
    console.log("Reached the end of the scripted flow, but no final confirmation button was found.");
  }
}

async function main() {
  parseDotEnv(path.resolve(".env"));

  const venueName = requiredEnv("ACTIVESG_VENUE");
  const targetDate = requiredEnv("ACTIVESG_DATE");
  const requestedTimes = requiredEnv("ACTIVESG_TIMES")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!requestedTimes.length) {
    throw new Error("ACTIVESG_TIMES must contain at least one time.");
  }

  const baseUrl = optionalEnv("ACTIVESG_BASE_URL", DEFAULT_BASE_URL);
  const searchTerm = optionalEnv("ACTIVESG_SEARCH_TERM");
  const profileDir = path.resolve(optionalEnv("ACTIVESG_PROFILE_DIR", ".chrome-profile"));
  const loginTimeoutMs = parseNumber(optionalEnv("ACTIVESG_LOGIN_TIMEOUT_MS"), 300_000);
  const autoFinalConfirm = parseBool(optionalEnv("ACTIVESG_AUTO_FINAL_CONFIRM"), false);
  const chromeExecutablePath = optionalEnv("CHROME_EXECUTABLE_PATH");

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    channel: chromeExecutablePath ? undefined : "chrome",
    executablePath: chromeExecutablePath || undefined,
    viewport: { width: 1440, height: 1080 }
  });

  const page = context.pages()[0] ?? (await context.newPage());

  try {
    console.log(`Opening ActiveSG badminton venues for: ${venueName}`);
    await openVenue(page, baseUrl, venueName, searchTerm);
    await selectDate(page, targetDate);
    await ensureLoggedIn(page, loginTimeoutMs);

    // Re-open the venue page after login in case ActiveSG resets page state.
    await openVenue(page, baseUrl, venueName, searchTerm);
    await selectDate(page, targetDate);
    await selectTimes(page, requestedTimes);
    await advanceToReview(page);

    if (autoFinalConfirm) {
      console.log("Auto-final-confirm is enabled. Attempting the last booking action.");
      await finalizeBooking(page);
    } else {
      console.log("Paused before the final paid/confirming click. Review the booking in Chrome and finish manually.");
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

await main();
