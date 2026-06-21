import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ghmcDepartments, isPlaceholderText } from "@/lib/app-options";
import { getServerSupabase } from "@/lib/supabase/rest";

type ProfilePatch = {
  full_name?: string;
  role?: string;
  department_name?: string;
  locality?: string;
  address?: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  zone?: string | null;
  assigned_ghmc_office?: string | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" && !isPlaceholderText(value) ? value.trim() : null;
}

function cleanNumber(value: unknown) {
  if (value === "" || value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isMissingProfileColumn(error: { message?: string } | null) {
  return Boolean(error?.message?.includes("assigned_ghmc_office") || error?.message?.includes("zone"));
}

async function getAuthenticatedUser() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("YOUR_PROJECT")) {
    throw new Error("Supabase is not configured. Add the keys in apps/web/.env.local.");
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

async function ensureProfile(patch: ProfilePatch = {}) {
  const user = await getAuthenticatedUser();
  if (!user) {
    return { response: NextResponse.json({ error: "Not logged in." }, { status: 401 }) };
  }

  const supabase = getServerSupabase();
  const baseSelect = "id, full_name, role, department_id, locality, address, latitude, longitude, civic_score, trusted_citizen, departments(name)";
  const extendedSelect = "id, full_name, role, department_id, locality, address, latitude, longitude, zone, assigned_ghmc_office, civic_score, trusted_citizen, departments(name)";
  let profileColumnsReady = true;
  const extendedResult = await supabase
    .from("profiles")
    .select(extendedSelect)
    .eq("id", user.id)
    .maybeSingle();
  let existing = extendedResult.data as Record<string, unknown> | null;
  let existingError = extendedResult.error;
  if (isMissingProfileColumn(existingError)) {
    profileColumnsReady = false;
    const fallback = await supabase
      .from("profiles")
      .select(baseSelect)
      .eq("id", user.id)
      .maybeSingle();
    existing = fallback.data as Record<string, unknown> | null;
    existingError = fallback.error;
  }
  if (existingError) {
    return { response: NextResponse.json({ error: existingError.message }, { status: 400 }) };
  }

  const metadataName = cleanText(user.user_metadata?.full_name);
  const emailName = user.email?.split("@")[0] ?? "Citizen";
  const current = existing as Record<string, unknown> | null;
  const requestedRole = patch.role === "ghmc_staff" || user.user_metadata?.role === "ghmc_staff" ? "ghmc_staff" : null;
  const requestedDepartment = cleanText(patch.department_name) ?? cleanText(user.user_metadata?.department_name);
  const { data: department } = requestedDepartment && ghmcDepartments.includes(requestedDepartment)
    ? await supabase.from("departments").select("id").eq("name", requestedDepartment).maybeSingle()
    : { data: null };
  const payload = {
    id: user.id,
    full_name: cleanText(patch.full_name) ?? cleanText(current?.full_name) ?? metadataName ?? emailName,
    role: current?.role ?? requestedRole ?? "citizen",
    department_id: current?.department_id ?? department?.id ?? null,
    locality: cleanText(patch.locality) ?? cleanText(current?.locality) ?? cleanText(user.user_metadata?.locality),
    address: cleanText(patch.address) ?? cleanText(current?.address) ?? cleanText(user.user_metadata?.address),
    latitude: patch.latitude !== undefined ? cleanNumber(patch.latitude) : cleanNumber(current?.latitude) ?? cleanNumber(user.user_metadata?.latitude),
    longitude: patch.longitude !== undefined ? cleanNumber(patch.longitude) : cleanNumber(current?.longitude) ?? cleanNumber(user.user_metadata?.longitude),
    zone: cleanText(patch.zone) ?? cleanText(current?.zone) ?? cleanText(user.user_metadata?.zone),
    assigned_ghmc_office: cleanText(patch.assigned_ghmc_office) ?? cleanText(current?.assigned_ghmc_office) ?? cleanText(user.user_metadata?.assigned_ghmc_office),
    civic_score: current?.civic_score ?? 0,
    trusted_citizen: current?.trusted_citizen ?? false,
  };
  const upsertPayload = profileColumnsReady ? payload : {
    id: payload.id,
    full_name: payload.full_name,
    role: payload.role,
    department_id: payload.department_id,
    locality: payload.locality,
    address: payload.address,
    latitude: payload.latitude,
    longitude: payload.longitude,
    civic_score: payload.civic_score,
    trusted_citizen: payload.trusted_citizen,
  };

  const { data, error } = await supabase
    .from("profiles")
    .upsert(upsertPayload, { onConflict: "id" })
    .select(profileColumnsReady ? extendedSelect : baseSelect)
    .single();

  if (error) {
    return { response: NextResponse.json({ error: error.message }, { status: 400 }) };
  }
  const savedProfile = data as unknown as Record<string, unknown>;

  return {
    profile: {
      ...savedProfile,
      zone: profileColumnsReady ? savedProfile.zone : cleanText(patch.zone) ?? cleanText(user.user_metadata?.zone),
      assigned_ghmc_office: profileColumnsReady ? savedProfile.assigned_ghmc_office : cleanText(patch.assigned_ghmc_office) ?? cleanText(user.user_metadata?.assigned_ghmc_office),
      auth_email: user.email,
      auth_name: metadataName,
      schema_warning: profileColumnsReady ? null : "Run supabase/migrations/010_location_office_status_updates.sql to persist zone and assigned GHMC office.",
    },
  };
}

export async function GET() {
  try {
    const result = await ensureProfile();
    if (result.response) return result.response;
    return NextResponse.json(result.profile);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const result = await ensureProfile(await request.json());
    if (result.response) return result.response;
    return NextResponse.json(result.profile);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }
}
