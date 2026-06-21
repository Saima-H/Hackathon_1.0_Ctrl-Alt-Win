import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/rest";

export async function GET() {
  try {
    const { data, error } = await getServerSupabase()
      .from("announcements")
      .select("*")
      .order("published_at", { ascending: false });
    return NextResponse.json(error ? { error: error.message } : data, { status: error ? 400 : 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = {
      author_id: body.author_id || null,
      title: String(body.title ?? "").trim(),
      body: String(body.body ?? "").trim(),
      category: String(body.category ?? "Maintenance notice"),
      severity: String(body.severity ?? "low"),
      locality: body.locality ? String(body.locality).trim() : null,
      latitude: body.latitude === "" || body.latitude == null ? null : Number(body.latitude),
      longitude: body.longitude === "" || body.longitude == null ? null : Number(body.longitude),
    };
    if (!payload.title || !payload.body) {
      return NextResponse.json({ error: "Announcement title and body are required." }, { status: 400 });
    }
    const supabase = getServerSupabase();
    let { data, error } = await supabase
      .from("announcements")
      .insert(payload)
      .select()
      .single();
    if (error?.message?.includes("latitude") || error?.message?.includes("longitude")) {
      const fallbackPayload = {
        author_id: payload.author_id,
        title: payload.title,
        body: payload.body,
        category: payload.category,
        severity: payload.severity,
        locality: payload.locality,
      };
      const fallback = await supabase.from("announcements").insert(fallbackPayload).select().single();
      data = fallback.data;
      error = fallback.error;
    }
    return NextResponse.json(error ? { error: error.message } : data, { status: error ? 400 : 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }
}
