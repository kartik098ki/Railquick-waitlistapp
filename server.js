import http from "node:http";
import { readFileSync, appendFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "public");

function loadEnv() {
  try {
    const envFile = readFileSync(join(__dirname, ".env"), "utf8");

    for (const line of envFile.split(/\r?\n/)) {
      const trimmed = line.trim();

      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) {
        continue;
      }

      const [key, ...valueParts] = trimmed.split("=");
      const value = valueParts.join("=").trim().replace(/^["']|["']$/g, "");

      if (!process.env[key]) {
        process.env[key] = value;
      }
    }
  } catch {
    // Local .env is optional. Production hosts should provide real env vars.
  }
}

loadEnv();

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

const supabaseUrl = process.env.SUPABASE_URL || "https://dfwwgppsjnovbzvldftc.supabase.co";
const supabaseAnonKey =
  process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRmd3dncHBzam5vdWJ6dmxkZnRjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE4MDExMTksImV4cCI6MjA5NzM3NzExOX0._B_bI6yUtQpWo5ZMuon6TmiJqf2ps_gAcnW7dcdoBuE";
const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM || "RailQuick <onboarding@resend.dev>";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg"
};

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(payload));
}

async function readJson(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function supabaseRequest(path, options = {}) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
      ...(options.headers || {})
    }
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  return { response, data };
}

async function emailAlreadyExists(email) {
  const path = `waitlist?email=eq.${encodeURIComponent(email)}&select=email&limit=1`;
  const { response, data } = await supabaseRequest(path, {
    method: "GET",
    headers: {
      Prefer: ""
    }
  });

  if (!response.ok) {
    return false;
  }

  return Array.isArray(data) && data.length > 0;
}

async function addToWaitlist(email, city) {
  if (await emailAlreadyExists(email)) {
    return { inserted: false };
  }

  // First try inserting with both email and city
  let { response, data } = await supabaseRequest("waitlist", {
    method: "POST",
    body: JSON.stringify({ email, city })
  });

  if (response.ok) {
    return { inserted: true, data };
  }

  // Fallback: If city column is missing (PGRST204) or bad request status, insert email only
  if (response.status === 400 || data?.code === "PGRST204") {
    console.warn("City column not found in Supabase 'waitlist' schema; falling back to email-only insert.");
    const retry = await supabaseRequest("waitlist", {
      method: "POST",
      body: JSON.stringify({ email })
    });
    if (retry.response.ok) {
      return { inserted: true, data: retry.data };
    }
    if (retry.data?.code === "23505") {
      return { inserted: false };
    }
    throw new Error(retry.data?.message || "Could not add email to waitlist.");
  }

  if (data?.code === "23505") {
    return { inserted: false };
  }

  throw new Error(data?.message || "Could not add this email to the waitlist.");
}

async function sendWelcomeEmail(email) {
  if (!resendApiKey) {
    return;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: resendFrom,
      to: email,
      subject: "Welcome to RailQuick",
      text: `Hello,

Thank you for joining the RailQuick waitlist.

We have successfully received your request and added your email to our early access list.

RailQuick is building a simpler way for train passengers to get essential items delivered directly during their journey.

As we move closer to launch, we'll share important updates, early access invitations, and availability information for your city.

Thank you for your interest in RailQuick.

Regards,
Kartik Guleria
Founder & CEO
RailQuick`
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || "Could not send welcome email.");
  }
}

function saveToLocalFallback(email, city) {
  try {
    const backupPath = join(__dirname, "waitlist_backups.json");
    const entry = JSON.stringify({ email, city, timestamp: new Date().toISOString() }) + "\n";
    appendFileSync(backupPath, entry, "utf8");
    console.log(`Saved backup entry locally: ${email} (${city})`);
    return true;
  } catch (err) {
    console.error("Failed to write local backup:", err);
    return false;
  }
}

async function handleWaitlist(request, response) {
  let email = "";
  let city = "";
  try {
    const body = await readJson(request);
    email = String(body.email || "").trim().toLowerCase();
    city = String(body.city || "").trim();

    if (!isEmail(email) || !city) {
      sendJson(response, 400, { message: "Please enter a valid email and city." });
      return;
    }

    // Try Supabase database write
    let waitlist;
    try {
      waitlist = await addToWaitlist(email, city);
    } catch (dbError) {
      console.warn("Database connection failed, using local backup fallback:", dbError.message);
      // Save locally
      saveToLocalFallback(email, city);

      // Send welcome email (ignore if it fails)
      try {
        await sendWelcomeEmail(email);
      } catch {}

      sendJson(response, 201, {
        message: "You are on the RailQuick waitlist. We will notify you at launch!"
      });
      return;
    }

    if (!waitlist.inserted) {
      try {
        await sendWelcomeEmail(email);
      } catch (emailError) {
        console.warn("Welcome email failed to send on resubmission:", emailError.message);
      }
      sendJson(response, 200, {
        message: "You are already on the RailQuick waitlist. We sent another welcome email!"
      });
      return;
    }

    try {
      await sendWelcomeEmail(email);
    } catch (emailError) {
      console.warn("Welcome email failed to send:", emailError.message);
    }

    sendJson(response, 201, {
      message: "You are on the RailQuick waitlist. Please check your email for the welcome note."
    });
  } catch (error) {
    console.error("Waitlist handler error:", error);
    // If anything else unexpected fails but we have input, save locally and succeed
    if (email && city && isEmail(email)) {
      saveToLocalFallback(email, city);
      sendJson(response, 201, {
        message: "You are on the RailQuick waitlist. We will notify you at launch!"
      });
    } else {
      sendJson(response, 500, {
        message: "Something went wrong. Please try again."
      });
    }
  }
}

async function serveStatic(request, response) {
  const requestUrl = new URL(request.url, `http://${request.headers.host}`);
  const pathname = requestUrl.pathname === "/" ? "/index.html" : requestUrl.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.[/\\])+/, "");
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(filePath)] || "application/octet-stream"
    });
    response.end(file);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method === "POST" && request.url === "/api/waitlist") {
    await handleWaitlist(request, response);
    return;
  }

  if (request.method === "GET" || request.method === "HEAD") {
    await serveStatic(request, response);
    return;
  }

  response.writeHead(405);
  response.end("Method not allowed");
});

server.listen(port, host, () => {
  console.log(`RailQuick waitlist running at http://${host}:${port}`);
});
