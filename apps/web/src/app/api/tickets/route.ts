import { NextResponse } from "next/server";
import { nearestGhmcOffice } from "@/lib/app-options";
import { getServerSupabase } from "@/lib/supabase/rest";

const departmentByIssue: Record<string, string> = {
  pothole: "Roads & Maintenance",
  road_damage: "Roads & Maintenance",
  road_crack: "Roads & Maintenance",
  waterlogging: "Drainage Department",
  drainage: "Drainage Department",
  fallen_tree: "Urban Forestry",
  streetlight: "Electrical Department",
  garbage: "Roads & Maintenance",
  public_hazard: "Roads & Maintenance",
};

export async function GET() {
  try {
    const supabase = getServerSupabase();
    const { data, error } = await supabase
      .from("tickets")
      .select("*, departments(name), ticket_updates(status, note, created_at, actor_id)")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const tickets = Array.isArray(data) ? data : [];
    const reporterIds = Array.from(new Set(tickets.map((ticket) => ticket.reporter_id).filter(Boolean)));
    const { data: reporters } = reporterIds.length
      ? await supabase.from("profiles").select("id, full_name, locality, address, latitude, longitude, civic_score, trusted_citizen").in("id", reporterIds)
      : { data: [] };
    const reporterById = new Map((reporters ?? []).map((reporter) => [reporter.id, reporter]));
    return NextResponse.json(tickets.map((ticket) => ({ ...ticket, reporter: ticket.reporter_id ? reporterById.get(ticket.reporter_id) ?? null : null })));
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }); }
}

export async function POST(request: Request) {
  try {
    const supabase = getServerSupabase();
    const body = await request.json();
    const departmentName = departmentByIssue[String(body.issue_type ?? "").toLowerCase()] ?? "Roads & Maintenance";
    const { data: department } = await supabase.from("departments").select("id, sla_hours").eq("name", departmentName).single();
    const latitude = body.latitude === "" || body.latitude == null ? null : Number(body.latitude);
    const longitude = body.longitude === "" || body.longitude == null ? null : Number(body.longitude);
    const office = nearestGhmcOffice(Number.isFinite(latitude) ? latitude : null, Number.isFinite(longitude) ? longitude : null);
    const payload = {
      anonymous: Boolean(body.anonymous),
      issue_type: String(body.issue_type ?? "pothole"),
      title: String(body.title ?? "").trim(),
      description: body.description ? String(body.description).trim() : null,
      severity: String(body.severity ?? "medium"),
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      address: body.address ? String(body.address).trim() : null,
      locality: office?.locality ?? (body.locality ? String(body.locality).trim() : null),
      department_id: department?.id ?? null,
      reporter_id: body.reporter_id || null,
      sla_due_at: department?.sla_hours ? new Date(Date.now() + department.sla_hours * 60 * 60 * 1000).toISOString() : null,
    };
    if (!payload.title) {
      return NextResponse.json({ error: "Ticket title is required." }, { status: 400 });
    }
    const { data, error } = await supabase.from("tickets").insert(payload).select("*, departments(name)").single();
    if (!error && data?.id) {
      await supabase.from("ticket_updates").insert({
        ticket_id: data.id,
        actor_id: body.anonymous ? null : body.reporter_id,
        status: "reported",
        note: `Ticket created and routed to ${departmentName}.`,
      });
      if (office) {
        const { data: officeTickets } = await supabase
          .from("tickets")
          .select("status, severity")
          .eq("locality", office.locality);
        const active = Array.isArray(officeTickets) ? officeTickets.filter((ticket) => !["resolved", "closed", "rejected"].includes(String(ticket.status))) : [];
        const critical = active.filter((ticket) => ticket.severity === "critical").length;
        const score = Math.max(0, Math.min(100, 100 - active.length * 6 - critical * 10));
        await supabase.from("safety_scores").insert({
          locality: office.locality,
          score,
          factors: { assigned_ghmc_office: office.name, active_issues: active.length, critical_issues: critical },
        });
      }
    }
    return NextResponse.json(error ? { error: error.message } : data, { status: error ? 400 : 201 });
  } catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 503 }); }
}
