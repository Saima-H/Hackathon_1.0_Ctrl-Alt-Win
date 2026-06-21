import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type SignupPayload = {
  email?: string;
  password?: string;
  data?: Record<string, unknown>;
};

const attempts = new Map<string, { count: number; resetAt: number }>();

function canCreateAccount(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const now = Date.now();
  const current = attempts.get(ip);
  if (!current || current.resetAt <= now) {
    attempts.set(ip, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (current.count >= 5) return false;
  current.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  if (!canCreateAccount(request)) {
    return NextResponse.json({ error: "Please wait a minute before creating another account." }, { status: 429 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey || url.includes("YOUR_PROJECT")) {
    return NextResponse.json({ error: "Signup is not configured on this deployment." }, { status: 503 });
  }

  const body = await request.json() as SignupPayload;
  const email = body.email?.trim().toLowerCase();
  const password = body.password;
  if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password || password.length < 6) {
    return NextResponse.json({ error: "Enter a valid email address and a password of at least 6 characters." }, { status: 400 });
  }

  const supabase = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: body.data ?? {},
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
