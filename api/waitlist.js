import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const resendFrom = process.env.RESEND_FROM || "Kartik Guleria <kartik@railquick.in>";

function saveToLocalFallback(email, city) {
  try {
    const isServerless = process.env.LAMBDA_TASK_ROOT || process.env.VERCEL || process.env.NETLIFY;
    const backupPath = isServerless
      ? "/tmp/waitlist_backups.json"
      : join(__dirname, "waitlist_backups.json");
    const entry = JSON.stringify({ email, city, timestamp: new Date().toISOString() }) + "\n";
    appendFileSync(backupPath, entry, "utf8");
    console.log(`Saved backup entry locally (Vercel): ${email} (${city}) to ${backupPath}`);
    return true;
  } catch (err) {
    console.error("Failed to write local backup:", err);
    return false;
  }
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

async function supabaseRequest(path, options = {}) {
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL environment variable is missing on Vercel dashboard.");
  }
  if (!supabaseAnonKey) {
    throw new Error("SUPABASE_ANON_KEY (or SUPABASE_SECRET_KEY) environment variable is missing on Vercel dashboard.");
  }

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
    headers: { Prefer: "" }
  });

  if (!response.ok) { return false; }
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
    console.warn("City column not found in schema, falling back to email-only insert.");
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
  if (!resendApiKey) return;

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

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ message: "Method not allowed" });
  }

  let email = "";
  let city = "";

  try {
    const body = req.body || {};
    email = String(body.email || "").trim().toLowerCase();
    city = String(body.city || "").trim();

    if (!isEmail(email) || !city) {
      return res.status(400).json({ message: "Please enter a valid email and city." });
    }

    let waitlist;
    try {
      waitlist = await addToWaitlist(email, city);
    } catch (dbError) {
      console.warn("Database connection failed, using local backup fallback:", dbError.message);
      saveToLocalFallback(email, city);

      let emailErr = null;
      try {
        await sendWelcomeEmail(email);
      } catch (e) {
        emailErr = e.message;
      }

      return res.status(201).json({
        message: "Fallback triggered",
        error: dbError.message,
        emailError: emailErr,
        hasSupabaseUrl: !!supabaseUrl,
        hasSupabaseAnonKey: !!supabaseAnonKey,
        hasResendKey: !!resendApiKey
      });
    }

    if (!waitlist.inserted) {
      let emailErr = null;
      try {
        await sendWelcomeEmail(email);
      } catch (e) {
        emailErr = e.message;
      }
      return res.status(200).json({
        message: "You are already on the RailQuick waitlist. We sent another welcome email!",
        emailError: emailErr
      });
    }

    let emailErr = null;
    try {
      await sendWelcomeEmail(email);
    } catch (emailError) {
      console.warn("Welcome email failed to send:", emailError.message);
      emailErr = emailError.message;
    }

    return res.status(201).json({
      message: "You are on the RailQuick waitlist. Please check your email for the welcome note.",
      emailError: emailErr
    });
  } catch (error) {
    console.error("Waitlist Vercel Function Error:", error);
    if (email && city && isEmail(email)) {
      saveToLocalFallback(email, city);
      return res.status(201).json({
        message: "Generic Fallback triggered",
        error: error.message,
        hasSupabaseUrl: !!supabaseUrl,
        hasSupabaseAnonKey: !!supabaseAnonKey,
        hasResendKey: !!resendApiKey
      });
    } else {
      return res.status(500).json({
        message: error.message || "Something went wrong. Please try again."
      });
    }
  }
}
