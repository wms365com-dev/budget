const http = require("node:http");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const ROOT_DIR = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT_DIR, "data");
const DATA_FILE = path.join(DATA_DIR, "budget-data.json");
const MAX_BODY_BYTES = 1024 * 1024;
const BASIC_AUTH_USER = process.env.BASIC_AUTH_USER || "";
const BASIC_AUTH_PASS = process.env.BASIC_AUTH_PASS || "";

const DEFAULT_STATE = {
  settings: {
    currentBalance: 0,
    safetyBuffer: 0,
    forecastDays: 60
  },
  items: [],
  budgets: []
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon"
};

let writeQueue = Promise.resolve();

const server = http.createServer(async (request, response) => {
  try {
    if (isAuthEnabled() && !isAuthorized(request)) {
      return requestAuthentication(response);
    }

    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/api/health") {
      return sendJson(response, 200, {
        ok: true,
        storage: DATA_FILE
      });
    }

    if (requestUrl.pathname === "/api/data") {
      if (request.method === "GET") {
        return sendJson(response, 200, await readState());
      }

      if (request.method === "PUT") {
        const payload = await readJsonBody(request);
        const normalized = normalizeStatePayload(payload);
        const saved = await enqueueWrite(normalized);
        return sendJson(response, 200, saved);
      }

      return sendJson(response, 405, { error: "Method not allowed" });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return sendJson(response, 405, { error: "Method not allowed" });
    }

    return serveStaticAsset(requestUrl.pathname, response, request.method === "HEAD");
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: "Internal server error" });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Budget dashboard listening on http://${HOST}:${PORT}`);
  console.log(`Persistent data file: ${DATA_FILE}`);
});

async function serveStaticAsset(pathname, response, headOnly) {
  const requestedPath = pathname === "/" ? "/index.html" : pathname;
  const absolutePath = path.resolve(ROOT_DIR, `.${requestedPath}`);

  if (!absolutePath.startsWith(ROOT_DIR)) {
    return sendJson(response, 403, { error: "Forbidden" });
  }

  let stats;

  try {
    stats = await fsp.stat(absolutePath);
  } catch (error) {
    return sendJson(response, 404, { error: "Not found" });
  }

  if (!stats.isFile()) {
    return sendJson(response, 404, { error: "Not found" });
  }

  const extension = path.extname(absolutePath).toLowerCase();
  response.writeHead(200, {
    "Content-Type": MIME_TYPES[extension] || "application/octet-stream",
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300"
  });

  if (headOnly) {
    response.end();
    return;
  }

  fs.createReadStream(absolutePath).pipe(response);
}

async function enqueueWrite(nextState) {
  writeQueue = writeQueue
    .catch(() => {})
    .then(async () => {
      await ensureDataDir();

      const tempFile = `${DATA_FILE}.tmp`;
      await fsp.writeFile(tempFile, `${JSON.stringify(nextState, null, 2)}\n`, "utf8");
      await fsp.rename(tempFile, DATA_FILE);
      return nextState;
    });

  return writeQueue;
}

async function readState() {
  try {
    const raw = await fsp.readFile(DATA_FILE, "utf8");
    return normalizeStatePayload(JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") {
      return DEFAULT_STATE;
    }

    throw error;
  }
}

async function ensureDataDir() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
}

async function readJsonBody(request) {
  let rawBody = "";

  for await (const chunk of request) {
    rawBody += chunk;

    if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) {
      throw new Error("Request body too large");
    }
  }

  if (!rawBody) {
    return DEFAULT_STATE;
  }

  return JSON.parse(rawBody);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function isAuthEnabled() {
  return Boolean(BASIC_AUTH_USER && BASIC_AUTH_PASS);
}

function isAuthorized(request) {
  const header = request.headers.authorization;

  if (!header || !header.startsWith("Basic ")) {
    return false;
  }

  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");

  if (separatorIndex === -1) {
    return false;
  }

  const username = decoded.slice(0, separatorIndex);
  const password = decoded.slice(separatorIndex + 1);

  return username === BASIC_AUTH_USER && password === BASIC_AUTH_PASS;
}

function requestAuthentication(response) {
  response.writeHead(401, {
    "WWW-Authenticate": 'Basic realm="Budget Dashboard"',
    "Content-Type": "text/plain; charset=utf-8"
  });
  response.end("Authentication required");
}

function normalizeStatePayload(payload) {
  return {
    settings: normalizeSettings(payload?.settings),
    items: normalizeItems(payload?.items),
    budgets: normalizeBudgets(payload?.budgets)
  };
}

function normalizeSettings(settings) {
  return {
    currentBalance: sanitizeMoney(settings?.currentBalance ?? DEFAULT_STATE.settings.currentBalance),
    safetyBuffer: sanitizeMoney(settings?.safetyBuffer ?? DEFAULT_STATE.settings.safetyBuffer),
    forecastDays: [30, 60, 90, 120].includes(Number(settings?.forecastDays))
      ? Number(settings.forecastDays)
      : DEFAULT_STATE.settings.forecastDays
  };
}

function normalizeItems(items) {
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => ({
      id: String(item?.id || createId("item")),
      direction: item?.direction === "expense" ? "expense" : "income",
      label: String(item?.label || "").trim(),
      amount: sanitizeMoney(item?.amount),
      category: String(item?.category || "").trim() || "General",
      schedule: normalizeSchedule(item?.schedule),
      startDate: isValidIsoDate(item?.startDate) ? item.startDate : toIsoDate(new Date()),
      notes: String(item?.notes || "").trim()
    }))
    .filter((item) => item.label);
}

function normalizeBudgets(budgets) {
  if (!Array.isArray(budgets)) {
    return [];
  }

  return budgets
    .map((budget) => ({
      id: String(budget?.id || createId("budget")),
      category: String(budget?.category || "").trim(),
      limit: sanitizeMoney(budget?.limit)
    }))
    .filter((budget) => budget.category);
}

function normalizeSchedule(schedule) {
  const allowed = ["once", "weekly", "biweekly", "monthly", "quarterly", "yearly"];
  return allowed.includes(schedule) ? schedule : "once";
}

function isValidIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function sanitizeMoney(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) / 100 : 0;
}

function createId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function toIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
