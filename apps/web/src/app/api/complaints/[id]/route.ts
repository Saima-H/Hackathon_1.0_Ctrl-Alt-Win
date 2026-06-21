import { NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/rest";

const allowedStatuses = new Set(["reported", "verified", "not_started", "in_progress", "pending", "resolved", "closed"]);

type Context = { params: Promise<{ id: string }> };
export async function GET(_: Request, { params }: Context) {
  try {
    const { id } = await params;
    const { data, error } = await getServerSupabase().from("tickets").select("*, ticket_updates(*), ticket_media(*), community_votes(*)").eq("id", id).single();
    return NextResponse.json(error ? { error: error.message } : data, { status: error ? 404 : 200 });
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }); }
}

export async function PUT(request: Request, { params }: Context) {
  try {
    const { id } = await params;
    const supabase = getServerSupabase();
    const body = await request.json();
    const patch = { ...body } as Record<string, unknown>;
    const budgetSpent = typeof body.budget_spent === "number" ? body.budget_spent : null;
    delete patch.budget_spent;
    if (typeof patch.status === "string" && !allowedStatuses.has(patch.status)) {
      return NextResponse.json({ error: "Unsupported ticket status." }, { status: 400 });
    }
    if (patch.status === "resolved" || patch.status === "closed") patch.resolved_at = new Date().toISOString();
    patch.updated_at = new Date().toISOString();
    const { data, error } = await supabase.from("tickets").update(patch).eq("id", id).select("*, departments(name)").single();
    if (!error && data?.id && typeof patch.status === "string") {
      await supabase.from("ticket_updates").insert({
        ticket_id: data.id,
        status: patch.status,
        note: `Status updated to ${patch.status.replace("_", " ")}.`,
      });
    }
    if (!error && data?.id && budgetSpent !== null && Number.isFinite(budgetSpent) && budgetSpent >= 0) {
      await supabase.from("ticket_updates").insert({
        ticket_id: data.id,
        note: `Budget spent: ${budgetSpent}`,
      });
    }
    return NextResponse.json(error ? { error: error.message } : data, { status: error ? 400 : 200 });
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }); }
}

export async function DELETE(_: Request, { params }: Context) {
  try {
    const { id } = await params;
    const { error } = await getServerSupabase().from("tickets").delete().eq("id", id);
    return NextResponse.json(error ? { error: error.message } : { deleted: true }, { status: error ? 400 : 200 });
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }); }
}
