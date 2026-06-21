import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/rest";

export async function GET() {
  try {
    const { data, error } = await getServerSupabase().from("safety_scores").select("*").order("calculated_at", { ascending: false });
    return NextResponse.json(error ? { error: error.message } : data, { status: error ? 400 : 200 });
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }); }
}
