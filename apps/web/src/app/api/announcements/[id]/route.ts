import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/rest";

type Context = { params: Promise<{ id: string }> };

export async function DELETE(_: Request, { params }: Context) {
  try {
    const { id } = await params;
    const { error } = await getServerSupabase().from("announcements").delete().eq("id", id);
    return NextResponse.json(error ? { error: error.message } : { deleted: true }, { status: error ? 400 : 200 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 503 });
  }
}
