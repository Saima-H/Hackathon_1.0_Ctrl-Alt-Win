"use client";

import { createBrowserClient } from "@supabase/ssr";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { distanceKm, ghmcOffices, hyderabadLocalities, isPlaceholderText, nearestGhmcOffice } from "@/lib/app-options";
import { LocationPickerMap, SafeRouteMap, TicketHeatMap, type RouteSegment } from "./LeafletMaps";

type PortalView =
  | "dashboard" | "report" | "tickets" | "map" | "safety" | "route" | "profile"
  | "overview" | "complaints" | "map-view" | "departments" | "emergency"
  | "analytics" | "budget" | "announcements" | "staff";

type Profile = {
  id: string;
  full_name: string;
  auth_email?: string | null;
  auth_name?: string | null;
  role: "citizen" | "ghmc_staff" | "contractor" | "admin";
  department_id?: string | null;
  locality: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  zone?: string | null;
  assigned_ghmc_office?: string | null;
  civic_score: number;
  trusted_citizen: boolean;
  departments?: { name: string } | { name: string }[] | null;
};

type Ticket = {
  id: string;
  ticket_no: string;
  reporter_id: string | null;
  anonymous: boolean;
  issue_type: string;
  title: string;
  description: string | null;
  severity: "low" | "medium" | "high" | "critical";
  status: "reported" | "verified" | "assigned" | "not_started" | "in_progress" | "pending" | "resolved" | "closed" | "rejected";
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  locality: string | null;
  department_id: string | null;
  created_at: string;
  departments?: { name: string } | { name: string }[] | null;
  ticket_updates?: { status: string | null; note: string | null; created_at: string; actor_id?: string | null }[] | null;
  reporter?: {
    full_name: string | null;
    locality: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    civic_score: number | null;
    trusted_citizen: boolean | null;
  } | null;
};

type Announcement = {
  id: string;
  title: string;
  body: string;
  category: string;
  severity: "low" | "medium" | "high" | "critical";
  locality: string | null;
  latitude: number | null;
  longitude: number | null;
  published_at: string;
};

const citizenNav = [["/dashboard", "Home"], ["/report", "Report"], ["/tickets", "Tickets"], ["/map", "Map"], ["/safety-score", "Safety"], ["/safe-route", "Routes"], ["/profile", "Profile"]];
const ghmcNav = [["/complaints", "Complaints"], ["/map-view", "City Map"], ["/departments", "Departments"], ["/emergency", "Emergency"], ["/analytics", "Analytics"], ["/budget", "Budget"], ["/announcements", "Comms"]];
const issueTypes = [
  ["pothole", "Pothole / road damage"],
  ["road_crack", "Road crack"],
  ["waterlogging", "Waterlogging"],
  ["drainage", "Drainage problem"],
  ["fallen_tree", "Fallen tree"],
  ["streetlight", "Streetlight failure"],
  ["garbage", "Garbage overflow"],
  ["public_hazard", "Public hazard"],
];

const ticketStatuses = ["reported", "verified", "not_started", "in_progress", "pending", "resolved", "closed"] as const;
const activeStatuses = new Set(["reported", "verified", "assigned", "not_started", "in_progress", "pending"]);
const issueSeverityWeight: Record<string, number> = {
  pothole: 1,
  road_crack: 1,
  streetlight: 1,
  garbage: 2,
  fallen_tree: 3,
  drainage: 3,
  waterlogging: 4,
  public_hazard: 3,
};

const departmentBudgets: Record<string, number> = {
  "Roads & Maintenance": 5000000,
  "Drainage Department": 3500000,
  "Electrical / Streetlights": 2000000,
  "Sanitation & Waste Management": 2500000,
  "Urban Forestry & Tree Maintenance": 1000000,
  "Waterlogging & Flood Response": 1500000,
  "Emergency Response": 1200000,
  "Public Infrastructure & Miscellaneous": 1800000,
};
const chartColors = ["#7c5cff", "#2f7df6", "#19c99a", "#ffb72b", "#7967aa", "#13202b", "#8a6f45"];

function supabaseClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}

function sameArea(profile: Profile, item: { locality: string | null; latitude: number | null; longitude: number | null }) {
  if (profile.locality && item.locality && profile.locality.toLowerCase() === item.locality.toLowerCase()) return true;
  if (profile.zone && item.locality && profile.zone.toLowerCase() === item.locality.toLowerCase()) return true;
  const distance = distanceKm(profile.latitude, profile.longitude, item.latitude, item.longitude);
  return distance !== null && distance <= 8;
}

function useCivicSafety() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [allTickets, setAllTickets] = useState<Ticket[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const channelId = useId().replace(/[^a-zA-Z0-9-]/g, "");
  const loadingRef = useRef(false);
  const loadedRef = useRef(false);
  const reloadTimerRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    if (!loadedRef.current) setLoading(true);
    try {
      const supabase = supabaseClient();
      const { data: auth, error: authError } = await supabase.auth.getUser();
      const user = auth.user;
      if (authError || !user) {
        window.location.href = "/login";
        return;
      }
      const profileResponse = await fetch("/api/profile", { cache: "no-store" });
      const profileData = await profileResponse.json().catch(() => ({}));
      const nextProfile = profileResponse.ok ? profileData as Profile : null;
      setProfile(nextProfile);
      const [ticketResponse, announcementResponse] = await Promise.all([
        fetch("/api/tickets", { cache: "no-store" }),
        fetch("/api/announcements", { cache: "no-store" }),
      ]);
      const ticketData = await ticketResponse.json().catch(() => ({}));
      const announcementData = await announcementResponse.json().catch(() => ({}));
      if (!profileResponse.ok) setMessage(profileData.error || "Profile could not be loaded.");
      if (!ticketResponse.ok) setMessage(ticketData.error || "Tickets could not be loaded.");
      if (!announcementResponse.ok) setMessage(announcementData.error || "Announcements could not be loaded.");
      const allTickets = Array.isArray(ticketData) ? ticketData as Ticket[] : [];
      setAllTickets(allTickets);
      const visibleTickets = nextProfile?.role === "citizen"
        ? allTickets.filter((ticket) => ticket.reporter_id === nextProfile.id)
        : nextProfile?.role === "ghmc_staff" && nextProfile.department_id
          ? allTickets.filter((ticket) => ticket.department_id === nextProfile.department_id && sameArea(nextProfile, ticket))
          : allTickets;
      const allAnnouncements = Array.isArray(announcementData) ? announcementData as Announcement[] : [];
      const visibleAnnouncements = nextProfile?.role === "citizen"
        ? allAnnouncements.filter((item) => (!item.locality && item.latitude === null && item.longitude === null) || (nextProfile ? sameArea(nextProfile, item) : false))
        : allAnnouncements;
      setTickets(visibleTickets);
      setAnnouncements(visibleAnnouncements);
      loadedRef.current = true;
    } catch (error) {
      setMessage((error as Error).message || "Could not refresh CivicSafety data. Check your Supabase connection and try again.");
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const supabase = supabaseClient();
    const scheduleLoad = () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      reloadTimerRef.current = window.setTimeout(() => void load(), 600);
    };
    const channel = supabase
      .channel(`civicsafety-live-tickets-${channelId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "tickets" }, scheduleLoad)
      .on("postgres_changes", { event: "*", schema: "public", table: "ticket_updates" }, scheduleLoad)
      .subscribe();
    return () => {
      if (reloadTimerRef.current) window.clearTimeout(reloadTimerRef.current);
      void supabase.removeChannel(channel);
    };
  }, [channelId, load]);
  return { profile, tickets, allTickets, announcements, loading, message, reload: load };
}

function profileName(profile: Profile | null) {
  return profile?.full_name || profile?.auth_name || profile?.auth_email?.split("@")[0] || "citizen";
}

function departmentName(entity: { departments?: { name: string } | { name: string }[] | null }) {
  return Array.isArray(entity.departments) ? entity.departments[0]?.name : entity.departments?.name;
}

function budgetDepartment(ticket: Ticket) {
  const type = ticket.issue_type.toLowerCase();
  const assigned = departmentName(ticket);
  if (type.includes("streetlight")) return "Electrical / Streetlights";
  if (type.includes("garbage")) return "Sanitation & Waste Management";
  if (type.includes("fallen_tree")) return "Urban Forestry & Tree Maintenance";
  if (type.includes("waterlogging")) return "Waterlogging & Flood Response";
  if (type.includes("drainage")) return "Drainage Department";
  if (ticket.severity === "critical") return "Emergency Response";
  if (assigned === "Urban Forestry") return "Urban Forestry & Tree Maintenance";
  if (assigned === "Electrical Department") return "Electrical / Streetlights";
  if (assigned === "Roads & Maintenance") return "Roads & Maintenance";
  return assigned && departmentBudgets[assigned] ? assigned : "Public Infrastructure & Miscellaneous";
}

function budgetDepartmentName(name: string | null | undefined) {
  if (!name) return "Public Infrastructure & Miscellaneous";
  if (name === "Urban Forestry") return "Urban Forestry & Tree Maintenance";
  if (name === "Electrical Department") return "Electrical / Streetlights";
  if (name === "Roads & Maintenance") return "Roads & Maintenance";
  if (departmentBudgets[name]) return name;
  return "Public Infrastructure & Miscellaneous";
}

function ticketSpend(ticket: Ticket) {
  return (ticket.ticket_updates ?? []).reduce((sum, update) => {
    const match = update.note?.match(/Budget spent:\s*([0-9.]+)/i);
    return sum + (match ? Number(match[1]) || 0 : 0);
  }, 0);
}

function money(value: number) {
  return `Rs. ${Math.round(value).toLocaleString("en-IN")}`;
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("en-IN") : "Not recorded";
}

function spendEntries(ticket: Ticket) {
  return (ticket.ticket_updates ?? []).map((update) => {
    const match = update.note?.match(/Budget spent:\s*([0-9.]+)/i);
    return match ? { amount: Number(match[1]) || 0, created_at: update.created_at } : null;
  }).filter((entry): entry is { amount: number; created_at: string } => Boolean(entry));
}

function profileCivicMetrics(tickets: Ticket[]) {
  const resolved = tickets.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed").length;
  const verified = tickets.filter((ticket) => ["verified", "in_progress", "pending", "resolved", "closed"].includes(ticket.status)).length;
  const score = Math.min(100, tickets.length * 8 + resolved * 10 + verified * 4);
  return { score, trusted: tickets.length >= 5 && verified >= 3 && resolved >= 2 };
}

function groupCounts<T extends string>(items: T[]) {
  return items.reduce<Record<string, number>>((acc, item) => {
    acc[item] = (acc[item] || 0) + 1;
    return acc;
  }, {});
}

function ComplaintGraphs({ tickets }: { tickets: Ticket[] }) {
  const statusData = ticketStatuses.map((status) => ({ name: statusLabel(status), value: tickets.filter((ticket) => ticket.status === status).length }));
  const severityCounts = groupCounts(tickets.map((ticket) => ticket.severity));
  const severityData = Object.entries(severityCounts).map(([name, value]) => ({ name, value }));
  const departmentData = Object.entries(tickets.reduce<Record<string, number>>((acc, ticket) => {
    const department = budgetDepartment(ticket);
    acc[department] = (acc[department] || 0) + ticketSpend(ticket);
    return acc;
  }, {})).map(([name, value]) => ({ name, value }));
  return <section className="grid grid-3 section">
    <div className="card"><div className="overline">Status mix</div><ResponsiveContainer width="100%" height={220}><BarChart data={statusData}><CartesianGrid stroke="#c9deda" strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="value">{statusData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Bar></BarChart></ResponsiveContainer></div>
    <div className="card"><div className="overline">Severity share</div><ResponsiveContainer width="100%" height={220}><PieChart><Pie data={severityData} dataKey="value" nameKey="name" outerRadius={78} label>{severityData.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer></div>
    <div className="card"><div className="overline">Spend by department</div><ResponsiveContainer width="100%" height={220}><BarChart data={departmentData}><CartesianGrid stroke="#c9deda" strokeDasharray="3 3" /><XAxis dataKey="name" tick={{ fontSize: 10 }} /><YAxis tick={{ fontSize: 10 }} /><Tooltip formatter={(value) => money(Number(value))} /><Bar dataKey="value" fill="#ffb72b" /></BarChart></ResponsiveContainer></div>
  </section>;
}

function AnalyticsPie({ tickets }: { tickets: Ticket[] }) {
  const issueCounts = groupCounts(tickets.map((ticket) => statusLabel(ticket.issue_type)));
  const data = Object.entries(issueCounts).map(([name, value]) => ({ name, value }));
  return <div className="card"><div className="overline">Issue type share</div>{data.length === 0 ? <p className="subtitle">No assigned issues yet.</p> : <ResponsiveContainer width="100%" height={280}><PieChart><Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={90} label>{data.map((_, index) => <Cell key={index} fill={chartColors[index % chartColors.length]} />)}</Pie><Tooltip /></PieChart></ResponsiveContainer>}</div>;
}

function Shell({ admin = false, children }: { admin?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const navigation = admin ? ghmcNav : citizenNav;
  async function signOut() {
    window.location.href = "/logout";
  }
  return <div className="shell">
    <div className="civic-atlas" aria-hidden="true">
      <span className="atlas-ring atlas-ring-one" />
      <span className="atlas-ring atlas-ring-two" />
      <span className="atlas-scan" />
      <span className="atlas-node node-one" />
      <span className="atlas-node node-two" />
      <span className="atlas-node node-three" />
      <span className="atlas-road road-one" />
      <span className="atlas-road road-two" />
    </div>
    <header className="topbar">
      <Link className="brand" href="/"><span className="brand-mark">CS</span>Civic<span>Safety</span></Link>
      <div className="rail-status"><i /> {admin ? "GHMC control" : "Citizen network"}</div>
      <nav className="nav" aria-label="Portal navigation">
        {navigation.map(([href, label], index) => <Link className={pathname === href ? "active" : ""} href={href} key={href}>
          <span className="nav-index">{String(index + 1).padStart(2, "0")}</span>{label}
        </Link>)}
      </nav>
      <div className="rail-bottom">
        <div><span>Network</span><b>LIVE</b></div>
        <button className="pill" style={{ background: "transparent" }} onClick={signOut}>Sign out</button>
      </div>
    </header>
    <div className="portal-stage">
      <div className="city-field" aria-hidden="true"><span className="field-route field-route-one" /><span className="field-route field-route-two" /><span className="field-pulse field-pulse-one" /><span className="field-pulse field-pulse-two" /></div>
      {children}
    </div>
  </div>;
}

const Badge = ({ text, color = "#2f7df6" }: { text: string; color?: string }) => <span className="pill" style={{ color }}>{text}</span>;
const Metric = ({ label, value, note, color = "#13202b" }: { label: string; value: string | number; note?: string; color?: string }) =>
  <div className="card soft"><div className="overline">{label}</div><div className="metric" style={{ color }}>{value}</div>{note && <small style={{ color: "#627277" }}>{note}</small>}</div>;
const Empty = ({ text }: { text: string }) => <div className="card soft"><p className="subtitle">{text}</p></div>;
const AutoNotice = ({ message, onClose }: { message: string; onClose: () => void }) => {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onClose, 5000);
    return () => window.clearTimeout(timer);
  }, [message, onClose]);
  if (!message) return null;
  return <div className="notice row" style={{ alignItems: "start" }}><span>{message}</span><button className="pill" type="button" onClick={onClose}>Close</button></div>;
};

function statusLabel(status: string) {
  return status.replace(/_/g, " ");
}

function ticketStats(tickets: Ticket[]) {
  const resolved = tickets.filter((t) => t.status === "resolved" || t.status === "closed").length;
  const inProgress = tickets.filter((t) => t.status === "in_progress").length;
  const pending = tickets.filter((t) => t.status === "pending").length;
  const unresolved = tickets.length - resolved;
  const critical = tickets.filter((t) => t.severity === "critical" && activeStatuses.has(t.status)).length;
  const score = Math.max(0, Math.min(100, 100 - unresolved * 6 - critical * 10));
  return { resolved, unresolved, inProgress, pending, score };
}

function zoneSafetyScores(tickets: Ticket[]) {
  return ghmcOffices.map((office) => {
    const nearbyTickets = tickets.filter((ticket) => {
      if (ticket.locality && ticket.locality.toLowerCase() === office.locality.toLowerCase()) return true;
      const distance = distanceKm(office.latitude, office.longitude, ticket.latitude, ticket.longitude);
      return distance !== null && distance <= 4;
    });
    return { ...office, ...ticketStats(nearbyTickets), tickets: nearbyTickets.length };
  });
}

function localitySafetyTickets(profile: Profile | null, allTickets: Ticket[], ownTickets: Ticket[]) {
  if (!profile) return ownTickets;
  const office = nearestGhmcOffice(profile.latitude ?? null, profile.longitude ?? null);
  const locality = (office?.locality ?? profile.locality ?? profile.zone ?? "").toLowerCase();
  const localTickets = allTickets.filter((ticket) => {
    if (locality && ticket.locality?.toLowerCase() === locality) return true;
    if (office) {
      const distance = distanceKm(office.latitude, office.longitude, ticket.latitude, ticket.longitude);
      return distance !== null && distance <= 4;
    }
    return sameArea(profile, ticket);
  });
  return localTickets.length ? localTickets : ownTickets;
}

function scoreColor(score: number) {
  if (score >= 75) return "#19c99a";
  if (score >= 45) return "#ffb72b";
  return "#7c5cff";
}

function scoreRisk(score: number): RouteSegment["risk"] {
  if (score >= 75) return "safe";
  if (score >= 45) return "moderate";
  return "high";
}

function ZoneSafetyChart({ tickets }: { tickets: Ticket[] }) {
  const scores = zoneSafetyScores(tickets);
  return <section className="section">
    <div className="section-head"><h2 className="display">GHMC zone safety scores</h2></div>
    <div className="card">
      {scores.map((item) => <div key={item.name} style={{ marginTop: 12 }}>
        <div className="row"><b>{item.locality}</b><span>{item.score}/100</span></div>
        <div className="progress"><span style={{ width: `${item.score}%`, background: scoreColor(item.score) }} /></div>
        <small style={{ color: "#627277" }}>{item.name} | {item.unresolved} active issues</small>
      </div>)}
    </div>
  </section>;
}

function SafetyAnalytics({ tickets }: { tickets: Ticket[] }) {
  const stats = ticketStats(tickets);
  const statusCounts = ticketStatuses.map((status) => ({ status, count: tickets.filter((ticket) => ticket.status === status).length }));
  const maxCount = Math.max(1, ...statusCounts.map((item) => item.count), stats.resolved, stats.unresolved);
  return <section className="section">
    <div className="section-head"><h2 className="display">Safety analytics</h2></div>
    <div className="grid grid-4">
      <Metric label="Current safety score" value={`${stats.score}/100`} color="#19c99a" />
      <Metric label="Resolved issues" value={stats.resolved} color="#19c99a" />
      <Metric label="Unresolved issues" value={stats.unresolved} color="#7c5cff" />
      <Metric label="In progress / pending" value={`${stats.inProgress}/${stats.pending}`} color="#ffb72b" />
    </div>
    <div className="grid grid-2 section">
      <div className="card">
        <div className="overline">Resolved vs unresolved issues</div>
        {[["Resolved", stats.resolved, "#19c99a"], ["Unresolved", stats.unresolved, "#7c5cff"]].map(([label, value, color]) => <div key={label as string} style={{ marginTop: 14 }}>
          <div className="row"><b>{label}</b><span>{value}</span></div>
          <div className="progress"><span style={{ width: `${(Number(value) / maxCount) * 100}%`, background: String(color) }} /></div>
        </div>)}
      </div>
      <div className="card">
        <div className="overline">Ticket distribution by status</div>
        {statusCounts.map((item) => <div key={item.status} style={{ marginTop: 10 }}>
          <div className="row"><b>{statusLabel(item.status)}</b><span>{item.count}</span></div>
          <div className="progress"><span style={{ width: `${(item.count / maxCount) * 100}%`, background: item.status === "resolved" || item.status === "closed" ? "#19c99a" : item.status === "pending" ? "#ffb72b" : "#2f7df6" }} /></div>
        </div>)}
      </div>
    </div>
  </section>;
}

function IssueList({ tickets, staff = false, onChanged }: { tickets: Ticket[]; staff?: boolean; onChanged?: () => Promise<void> }) {
  const [filter, setFilter] = useState("all");
  const [message, setMessage] = useState("");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const filtered = tickets.filter((ticket) => filter === "all" || ticket.status === filter || ticket.severity === filter);
  async function updateStatus(ticket: Ticket, status: string) {
    const response = await fetch(`/api/complaints/${ticket.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Ticket status could not be updated.");
      return;
    }
    setMessage("Ticket status updated.");
    await onChanged?.();
  }
  return <><div className="row" style={{ marginBottom: 12 }}>
    <div className="overline">{staff ? "Live complaint feed" : "Your logged tickets"}</div>
    <select className="input" style={{ width: 190 }} value={filter} onChange={(e) => setFilter(e.target.value)}>
      {["all", "critical", "high", "medium", ...ticketStatuses].map((x) => <option key={x} value={x}>{statusLabel(x)}</option>)}
    </select>
  </div>
  <AutoNotice message={message} onClose={() => setMessage("")} />
  {filtered.length === 0 ? <Empty text="No tickets found in Supabase yet." /> : <div className="list">{filtered.map((ticket) => <div className="list-item" key={ticket.id} onClick={() => setSelected(ticket)} style={{ cursor: staff ? "pointer" : "default" }}>
    <div><b>{ticket.title}</b><div style={{ color: "#627277", fontSize: 13 }}>{ticket.ticket_no} | {ticket.locality || ticket.address || "No location"} | {departmentName(ticket) || "Unassigned"}</div></div>
    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", justifyContent: "end" }}><Badge text={ticket.severity} color={ticket.severity === "critical" ? "#7c5cff" : "#ffb72b"} />{staff ? <select className="input" style={{ width: 160 }} value={ticket.status} onClick={(e) => e.stopPropagation()} onChange={(e) => void updateStatus(ticket, e.target.value)}>{ticketStatuses.map((status) => <option key={status} value={status}>{statusLabel(status)}</option>)}</select> : <Badge text={statusLabel(ticket.status)} />}</div>
  </div>)}</div>}
  {selected && <div style={{ position: "fixed", inset: 0, background: "#13202b99", zIndex: 50, display: "grid", placeItems: "center", padding: 18 }} onClick={() => setSelected(null)}>
    <div className="card" style={{ maxHeight: "88vh", maxWidth: 860, overflow: "auto", width: "100%" }} onClick={(e) => e.stopPropagation()}>
      <div className="row"><div><div className="overline">Ticket details</div><h2 className="display" style={{ marginTop: 8 }}>{selected.title}</h2></div><button className="btn alt" onClick={() => setSelected(null)}>Close</button></div>
      <section className="grid grid-2 section">
        <div><b>Ticket no</b><p>{selected.ticket_no}</p><b>Status</b><p>{statusLabel(selected.status)}</p><b>Severity</b><p>{selected.severity}</p><b>Issue type</b><p>{statusLabel(selected.issue_type)}</p><b>Reported at</b><p>{formatDate(selected.created_at)}</p></div>
        <div><b>Area</b><p>{selected.locality || selected.address || "Not recorded"}</p><b>GPS</b><p>{selected.latitude && selected.longitude ? `${selected.latitude}, ${selected.longitude}` : "Not recorded"}</p><b>Department</b><p>{departmentName(selected) || "Unassigned"}</p><b>Description</b><p>{selected.description || "No description"}</p></div>
      </section>
      <section className="section"><div className="overline">Reporter information</div><div className="card soft" style={{ marginTop: 10 }}><p><b>Name:</b> {selected.anonymous ? "Anonymous" : selected.reporter?.full_name || "Not recorded"}</p><p><b>Area:</b> {selected.reporter?.locality || selected.reporter?.address || "Not recorded"}</p><p><b>Reporter GPS:</b> {selected.reporter?.latitude && selected.reporter?.longitude ? `${selected.reporter.latitude}, ${selected.reporter.longitude}` : "Not recorded"}</p><p><b>Civic score:</b> {selected.reporter?.civic_score ?? "Not recorded"} | <b>Trusted:</b> {selected.reporter?.trusted_citizen ? "Yes" : "No"}</p></div></section>
      <section className="section"><div className="overline">Status and spend history</div><div className="list" style={{ marginTop: 10 }}>{(selected.ticket_updates ?? []).length === 0 ? <div className="list-item">No history recorded.</div> : selected.ticket_updates?.map((update, index) => <div className="list-item" key={`${update.created_at}-${index}`}><div><b>{update.status ? statusLabel(update.status) : "Update"}</b><div style={{ color: "#627277", fontSize: 13 }}>{formatDate(update.created_at)}</div><p style={{ margin: "6px 0 0" }}>{update.note || "No note"}</p></div></div>)}</div></section>
    </div>
  </div>}</>;
}

function AnnouncementsPanel({ announcements }: { announcements: Announcement[] }) {
  return <div className="card">
    <div className="overline">Public announcements</div>
    {announcements.length === 0 ? <p className="subtitle">No GHMC announcements published yet.</p> : <div className="list" style={{ marginTop: 14 }}>
      {announcements.map((a) => <div className="list-item" key={a.id}>
        <div><b>{a.title}</b><div style={{ color: "#627277", fontSize: 13 }}>{a.category} | {a.locality || "All areas"}</div><p style={{ margin: "6px 0 0" }}>{a.body}</p></div>
        <Badge text={a.severity} color={a.severity === "critical" ? "#7c5cff" : "#2f7df6"} />
      </div>)}
    </div>}
  </div>;
}

function CitizenDashboard() {
  const { profile, tickets, allTickets, announcements, loading, message } = useCivicSafety();
  const safetyTickets = useMemo(() => localitySafetyTickets(profile, allTickets, tickets), [profile, allTickets, tickets]);
  const safetyStats = ticketStats(safetyTickets);
  const myStats = ticketStats(tickets);
  const nearby = safetyStats.unresolved;
  return <Shell><main className="page">
    <div className="overline">Citizen portal | live locality intelligence</div>
    <h1 className="display">Hi {profileName(profile)}.<br/><span style={{ color: "#7c5cff" }}>Your city is live.</span></h1>
    {message && <div className="notice">{message}</div>}
    {loading ? <p>Loading Supabase data...</p> : <>
      <section className="grid grid-4 section">
        <Metric label="Locality safety score" value={safetyStats.score} note={profile?.locality || "No locality saved"} color="#19c99a" />
        <Metric label="Nearby active issues" value={nearby} note="Same locality dataset as Safety" color="#7c5cff" />
        <Metric label="My open tickets" value={myStats.unresolved} note="From your reported tickets" color="#2f7df6" />
        <Metric label="Assigned GHMC office" value={profile?.assigned_ghmc_office || "Pending"} note={profile?.zone || undefined} color="#ffb72b" />
      </section>
      <SafetyAnalytics tickets={safetyTickets} />
      <section className="grid grid-2 section">
        <AnnouncementsPanel announcements={announcements} />
        <div className="card"><div className="overline">Quick actions</div><h2 className="display" style={{ margin: "10px 0 16px" }}>Report what you see.</h2><div className="row" style={{ justifyContent: "start" }}><Link className="btn" href="/report">Report issue</Link><Link className="btn alt" href="/map">Open live heatmap</Link></div></div>
      </section>
      <section className="section"><div className="section-head"><h2 className="display">Recent tickets</h2><Link href="/tickets">View all</Link></div><IssueList tickets={tickets} /></section>
    </>}
  </main></Shell>;
}

function Report() {
  const { profile, reload } = useCivicSafety();
  const [anonymous, setAnonymous] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [coords, setCoords] = useState<{ latitude: number; longitude: number } | null>(null);
  const [form, setForm] = useState({ issue_type: "pothole", severity: "medium", title: "", description: "", address: "", locality: "" });

  function getGps() {
    if (!navigator.geolocation) {
      setMessage("GPS is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const office = nearestGhmcOffice(position.coords.latitude, position.coords.longitude);
        setCoords({ latitude: position.coords.latitude, longitude: position.coords.longitude });
        setForm((current) => ({ ...current, locality: office?.locality || current.locality }));
        setMessage(`GPS captured: ${position.coords.latitude}, ${position.coords.longitude}${office ? `. Locality set to ${office.locality}.` : ""}`);
      },
      (error) => setMessage(`GPS error: ${error.message}`),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) {
      setMessage("Still checking your login/profile. Refresh once if this stays here.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        anonymous,
        reporter_id: profile.id,
        latitude: coords?.latitude ?? profile.latitude,
        longitude: coords?.longitude ?? profile.longitude,
        locality: form.locality || profile.locality,
      }),
    });
    const result = await response.json();
    setBusy(false);
    if (!response.ok) {
      setMessage(result.error || "Ticket was not saved.");
      return;
    }
    setMessage(`Ticket saved: ${result.ticket_no}. Assigned to ${departmentName(result) || "a department"}.`);
    setForm({ issue_type: "pothole", severity: "medium", title: "", description: "", address: "", locality: "" });
    await reload();
  }

  return <Shell><main className="page">
    <div className="overline">Smart issue reporting | saved to Supabase</div><h1 className="display">Report an <span style={{ color: "#7c5cff" }}>issue.</span></h1>
    <form className="card form-grid" onSubmit={submit}>
      <select className="input" value={form.issue_type} onChange={(e) => setForm({ ...form, issue_type: e.target.value })}>{issueTypes.map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select>
      <input className="input" required placeholder="Ticket title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <textarea className="input" rows={4} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <div className="grid grid-2"><input className="input" placeholder="Address / landmark" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /><input className="input" placeholder="Locality" value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} /></div>
      <select className="input" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select>
      <div className="grid grid-2"><input className="input" placeholder="Latitude" value={coords?.latitude ?? ""} readOnly/><input className="input" placeholder="Longitude" value={coords?.longitude ?? ""} readOnly/></div>
      <div className="row" style={{ justifyContent: "start" }}><button className="btn alt" type="button" onClick={getGps}>Use GPS</button><button className={"btn " + (anonymous ? "red" : "alt")} type="button" onClick={() => setAnonymous(!anonymous)}>{anonymous ? "Anonymous on" : "Report anonymously"}</button><button className="btn" disabled={busy}>{busy ? "Saving..." : "Save ticket"}</button></div>
      {coords && <div className="notice">Latitude: {coords.latitude} | Longitude: {coords.longitude}</div>}
      <AutoNotice message={message} onClose={() => setMessage("")} />
    </form>
  </main></Shell>;
}

function Tickets() {
  const { tickets } = useCivicSafety();
  return <Shell><main className="page"><div className="overline">Live ticket tracking</div><h1 className="display">Track every <span style={{ color: "#2f7df6" }}>logged ticket.</span></h1><IssueList tickets={tickets} /></main></Shell>;
}

function MapPage({ admin = false }: { admin?: boolean }) {
  const { tickets, reload } = useCivicSafety();
  const points = useMemo(() => tickets.filter((t) => t.latitude !== null && t.longitude !== null), [tickets]);
  return <Shell admin={admin}><main className="page">
    <div className="overline">{admin ? "GHMC geo intelligence" : "Area-wise civic monitoring"}</div><h1 className="display">Live <span style={{ color: "#7c5cff" }}>heatmap.</span></h1>
    <p className="subtitle">This heatmap uses OpenStreetMap tiles through Leaflet and actual ticket latitude/longitude stored in Supabase.</p>
    {points.length === 0 && <div style={{ marginBottom: 14 }}><Empty text="No GPS tickets yet. Create a ticket with Use GPS to populate the Leaflet heatmap." /></div>}
    <TicketHeatMap tickets={points} />
    <section className="section"><IssueList tickets={tickets} staff={admin} onChanged={reload} /></section>
  </main></Shell>;
}

function Safety() {
  const { profile, tickets, allTickets } = useCivicSafety();
  const office = nearestGhmcOffice(profile?.latitude ?? null, profile?.longitude ?? null);
  const safetyTickets = useMemo(() => localitySafetyTickets(profile, allTickets, tickets), [profile, allTickets, tickets]);
  const stats = ticketStats(safetyTickets);
  return <Shell><main className="page"><div className="overline">Dynamic locality safety score</div><h1 className="display">Know your <span style={{ color: "#19c99a" }}>neighbourhood.</span></h1><section className="grid grid-3"><Metric label="Current score" value={`${stats.score}/100`} color="#19c99a"/><Metric label="Open complaints" value={stats.unresolved} color="#7c5cff"/><Metric label="Locality" value={office?.locality || profile?.locality || "Not set"} color="#2f7df6"/></section><SafetyAnalytics tickets={safetyTickets} /><ZoneSafetyChart tickets={allTickets} /></main></Shell>;
}

function pointRisk(lat: number, lng: number, tickets: Ticket[]) {
  return tickets.filter((ticket) => activeStatuses.has(ticket.status) && ticket.latitude !== null && ticket.longitude !== null).reduce((sum, ticket) => {
    const distance = distanceKm(lat, lng, ticket.latitude, ticket.longitude);
    if (distance === null || distance > 1.5) return sum;
    const severity = ticket.severity === "critical" ? 4 : ticket.severity === "high" ? 3 : ticket.severity === "medium" ? 2 : 1;
    const impact = issueSeverityWeight[ticket.issue_type] ?? 1;
    return sum + severity * impact * Math.max(0.25, 1.5 - distance);
  }, 0);
}

function segmentRiskFromScore(score: number, path: [number, number][], tickets: Ticket[]) {
  const issueRisk = path.reduce((sum, point) => sum + pointRisk(point[0], point[1], tickets), 0) / Math.max(1, path.length);
  const scoreRiskValue = score >= 75 ? 0 : score >= 45 ? 4 : 10;
  const totalRisk = issueRisk + scoreRiskValue;
  return totalRisk > 9 ? "high" : totalRisk > 3 ? "moderate" : "safe";
}

function scoreRoutePath(path: [number, number][], tickets: Ticket[]) {
  const scores = zoneSafetyScores(tickets);
  const nearestScores = path.map((point) => {
    const nearest = scores
      .map((score) => ({ ...score, distance: distanceKm(point[0], point[1], score.latitude, score.longitude) ?? Number.POSITIVE_INFINITY }))
      .sort((a, b) => a.distance - b.distance)[0];
    return nearest?.score ?? 100;
  });
  return Math.round(nearestScores.reduce((sum, score) => sum + score, 0) / Math.max(1, nearestScores.length));
}

function buildFallbackRouteSegments(start: [number, number], end: [number, number], tickets: Ticket[]) {
  const midA: [number, number] = [(start[0] + end[0]) / 2 + 0.025, (start[1] + end[1]) / 2 - 0.015];
  const midB: [number, number] = [(start[0] + end[0]) / 2 - 0.018, (start[1] + end[1]) / 2 + 0.02];
  const candidates = [
    [start, midA, end],
    [start, midB, end],
  ];
  const scored = candidates.map((points) => {
    const risk = points.reduce((sum, point) => sum + pointRisk(point[0], point[1], tickets), 0);
    const score = scoreRoutePath(points, tickets);
    const segments = [{ from: points[0], to: points[points.length - 1], path: points, risk: segmentRiskFromScore(score, points, tickets) } as RouteSegment];
    return { risk, segments };
  }).sort((a, b) => a.risk - b.risk);
  return scored[0];
}

function SafeRoute() {
  const { profile, allTickets } = useCivicSafety();
  const activeTickets = useMemo(() => allTickets.filter((t) => activeStatuses.has(t.status)), [allTickets]);
  const startLat = profile?.latitude ?? 17.385;
  const startLng = profile?.longitude ?? 78.4867;
  const start = useMemo<[number, number]>(() => [startLat, startLng], [startLat, startLng]);
  const [destination, setDestination] = useState("GHMC Khairatabad Zonal Office");
  const [destinationLat, setDestinationLat] = useState("17.4126");
  const [destinationLng, setDestinationLng] = useState("78.4627");
  const [routeSegments, setRouteSegments] = useState<RouteSegment[]>([]);
  const [routeMessage, setRouteMessage] = useState("");
  const endLat = Number(destinationLat) || 17.4126;
  const endLng = Number(destinationLng) || 78.4627;
  const end = useMemo<[number, number]>(() => [endLat, endLng], [endLat, endLng]);
  const destinationOffice = nearestGhmcOffice(end[0], end[1]);
  const currentRoute = routeSegments.length ? { segments: routeSegments } : buildFallbackRouteSegments(start, end, activeTickets);
  const highRisk = currentRoute.segments.filter((segment) => segment.risk === "high").length;
  const routeScore = scoreRoutePath(currentRoute.segments.flatMap((segment) => segment.path ?? [segment.from, segment.to]), activeTickets);

  function selectDestination(value: string) {
    setDestination(value);
    const office = ghmcOffices.find((item) => item.name === value || item.locality === value);
    if (office) {
      setDestinationLat(String(office.latitude));
      setDestinationLng(String(office.longitude));
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function loadRoute() {
      const fallback = buildFallbackRouteSegments(start, end, activeTickets).segments;
      setRouteSegments(fallback);
      if (!Number.isFinite(end[0]) || !Number.isFinite(end[1])) return;
      try {
        const response = await fetch(`https://router.project-osrm.org/route/v1/driving/${start[1]},${start[0]};${end[1]},${end[0]}?alternatives=true&geometries=geojson&overview=full`);
        const result = await response.json();
        if (cancelled || !Array.isArray(result.routes)) return;
        const nextSegments = result.routes.slice(0, 3).map((route: { geometry?: { coordinates?: [number, number][] } }) => {
          const path = route.geometry?.coordinates?.map(([lng, lat]) => [lat, lng] as [number, number]) ?? [];
          const score = scoreRoutePath(path, activeTickets);
          return { from: path[0] ?? start, to: path[path.length - 1] ?? end, path, risk: scoreRisk(score) } as RouteSegment;
        }).filter((segment: RouteSegment) => segment.path && segment.path.length > 1);
        if (nextSegments.length) {
          setRouteSegments(nextSegments);
          setRouteMessage("");
        }
      } catch {
        if (!cancelled) setRouteMessage("Live route service unavailable. Showing the safest estimated route from saved map data.");
      }
    }
    void loadRoute();
    return () => { cancelled = true; };
  }, [start, end, activeTickets]);

  return <Shell><main className="page"><div className="overline">Hazard-aware navigation</div><h1 className="display">Route risk from <span style={{ color: "#19c99a" }}>live tickets.</span></h1>
    <section className="card form-grid">
      <datalist id="route-destinations">{ghmcOffices.map((office) => <option key={office.name} value={office.name} />)}{ghmcOffices.map((office) => <option key={office.locality} value={office.locality} />)}</datalist>
      <input className="input" list="route-destinations" placeholder="Select or type destination" value={destination} onChange={(e) => selectDestination(e.target.value)} />
      <div className="grid grid-2"><input className="input" placeholder="Destination latitude" value={destinationLat} onChange={(e) => setDestinationLat(e.target.value)} /><input className="input" placeholder="Destination longitude" value={destinationLng} onChange={(e) => setDestinationLng(e.target.value)} /></div>
      {routeMessage && <AutoNotice message={routeMessage} onClose={() => setRouteMessage("")} />}
    </section>
    <section className="grid grid-3">
      <Metric label="Active hazards nearby" value={activeTickets.length} color="#7c5cff" />
      <Metric label="Route safety score" value={`${routeScore}/100`} note={highRisk ? "High-risk route segments present" : "Based on GHMC zone scores"} color={scoreColor(routeScore)} />
      <Metric label="Destination" value={destinationOffice?.locality || destination || "Custom"} note={destinationOffice?.name} color="#2f7df6" />
    </section>
    <section className="section">
      <SafeRouteMap segments={currentRoute.segments} tickets={activeTickets} center={start} />
      <div className="row" style={{ justifyContent: "start", marginTop: 12 }}><Badge text="Green safe" color="#19c99a" /><Badge text="Orange moderately risky" color="#ffb72b" /><Badge text="Violet high risk" color="#7c5cff" /></div>
    </section>
  </main></Shell>;
}

function Profile() {
  const { profile, tickets, reload } = useCivicSafety();
  const resolved = tickets.filter((t) => t.status === "resolved").length;
  const civic = profileCivicMetrics(tickets);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({ full_name: "", locality: "", address: "", latitude: "", longitude: "", zone: "", assigned_ghmc_office: "" });

  useEffect(() => {
    if (!profile) return;
    setForm({
      full_name: profileName(profile),
      locality: profile.locality ?? "",
      address: isPlaceholderText(profile.address) ? "" : profile.address ?? "",
      latitude: profile.latitude ? String(profile.latitude) : "",
      longitude: profile.longitude ? String(profile.longitude) : "",
      zone: profile.zone ?? "",
      assigned_ghmc_office: profile.assigned_ghmc_office ?? "",
    });
  }, [profile]);

  function getGps() {
    if (!navigator.geolocation) {
      setMessage("GPS is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const office = nearestGhmcOffice(position.coords.latitude, position.coords.longitude);
        setForm((current) => ({ ...current, latitude: String(position.coords.latitude), longitude: String(position.coords.longitude), zone: current.zone || office?.zone || "", assigned_ghmc_office: office?.name || current.assigned_ghmc_office }));
        setMessage(`GPS captured: ${position.coords.latitude}, ${position.coords.longitude}`);
      },
      (error) => setMessage(`GPS error: ${error.message}`),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!profile) return;
    const office = nearestGhmcOffice(form.latitude ? Number(form.latitude) : null, form.longitude ? Number(form.longitude) : null);
    const response = await fetch("/api/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: form.full_name,
        locality: form.locality || null,
        address: form.address || null,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        zone: form.zone || office?.zone || null,
        assigned_ghmc_office: office?.name || form.assigned_ghmc_office || null,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Profile could not be updated.");
      return;
    }
    setMessage("Profile updated.");
    setEditing(false);
    await reload();
  }

  return <Shell><main className="page"><div className="overline">Citizen profile & contribution system</div><h1 className="display">{profileName(profile)}</h1><div className="card"><div className="row"><div><p>{profile?.auth_email || "No email saved"}</p><p>{isPlaceholderText(profile?.address) ? "No address saved" : profile?.address || "No address saved"}</p><p>{profile?.locality || "No locality saved"}</p><p>{profile?.assigned_ghmc_office || "No GHMC office assigned"}</p><p>{profile?.latitude && profile?.longitude ? `${profile.latitude}, ${profile.longitude}` : "No GPS location saved"}</p></div><button className="btn" onClick={() => setEditing((value) => !value)}>{editing ? "Cancel edit" : "Edit profile"}</button></div>{editing && <form className="form-grid section" onSubmit={saveProfile}><datalist id="profile-hyderabad-localities">{hyderabadLocalities.map((item) => <option key={item} value={item} />)}</datalist><input className="input" required placeholder="Full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} /><input className="input" list="profile-hyderabad-localities" placeholder="Choose or type your Hyderabad locality" value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })} /><input className="input" placeholder="Your address or landmark" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /><div className="grid grid-2"><input className="input" placeholder="Latitude" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /><input className="input" placeholder="Longitude" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></div><input className="input" placeholder="Assigned zone / locality" value={form.zone} onChange={(e) => setForm({ ...form, zone: e.target.value })} /><input className="input" placeholder="Assigned GHMC office" value={form.assigned_ghmc_office} onChange={(e) => setForm({ ...form, assigned_ghmc_office: e.target.value })} /><div className="row" style={{ justifyContent: "start" }}><button className="btn alt" type="button" onClick={getGps}>Use GPS</button><a className="btn alt" href="https://www.openstreetmap.org/search?query=Hyderabad" target="_blank">Search OpenStreetMap</a><button className="btn" type="submit">Save profile</button></div><LocationPickerMap latitude={form.latitude ? Number(form.latitude) : null} longitude={form.longitude ? Number(form.longitude) : null} onPick={({ latitude, longitude }) => { const office = nearestGhmcOffice(latitude, longitude); setForm((current) => ({ ...current, latitude: String(latitude), longitude: String(longitude), zone: current.zone || office?.zone || "", assigned_ghmc_office: office?.name || current.assigned_ghmc_office })); }} /></form>}<div style={{ marginTop: 14 }}><AutoNotice message={message} onClose={() => setMessage("")} /></div></div><section className="grid grid-4 section"><Metric label="Reports filed" value={tickets.length}/><Metric label="Resolved" value={resolved} color="#19c99a"/><Metric label="Civic score" value={civic.score} note="Reports, verification and resolution based" color="#ffb72b"/><Metric label="Trusted citizen" value={civic.trusted ? "Yes" : "No"} note="Calculated from verified/resolved reports" color="#2f7df6"/></section></main></Shell>;
}

function RequireStaff({ children }: { children: React.ReactNode }) {
  const { profile, loading } = useCivicSafety();
  if (loading) return <Shell admin><main className="page"><p>Checking GHMC access...</p></main></Shell>;
  if (!profile || !["ghmc_staff", "admin"].includes(profile.role)) {
    return <Shell><main className="page"><h1 className="display">GHMC access denied.</h1><p className="subtitle">Your profile is not marked as GHMC staff/admin in Supabase. Update the profiles table before opening the GHMC dashboard.</p></main></Shell>;
  }
  return <>{children}</>;
}

function Overview() {
  const { tickets, profile, reload } = useCivicSafety();
  const stats = ticketStats(tickets);
  return <RequireStaff><Shell admin><main className="page"><div className="overline">GHMC command center | {departmentName(profile || {}) || "No department assigned"} | {profile?.zone || profile?.locality || "No zone assigned"}</div><h1 className="display">City operations.<br/><span style={{ color:"#7c5cff" }}>Live.</span></h1><section className="grid grid-4"><Metric label="Total issues" value={tickets.length}/><Metric label="Open tickets" value={stats.unresolved} color="#7c5cff"/><Metric label="Resolved" value={stats.resolved} color="#19c99a"/><Metric label="Assigned office" value={profile?.assigned_ghmc_office || "Pending"} color="#ffb72b"/></section><SafetyAnalytics tickets={tickets} /><section className="section"><IssueList tickets={tickets} staff onChanged={reload} /></section></main></Shell></RequireStaff>;
}

function Departments() {
  const { tickets } = useCivicSafety();
  const counts = tickets.reduce<Record<string, number>>((acc, ticket) => {
    const name = departmentName(ticket) || "Unassigned";
    acc[name] = (acc[name] || 0) + 1;
    return acc;
  }, {});
  return <RequireStaff><Shell admin><main className="page"><div className="overline">Department-wise ticket management</div><h1 className="display">Assigned from <span style={{color:"#2f7df6"}}>issue type.</span></h1>{Object.keys(counts).length === 0 ? <Empty text="No department assignments yet." /> : <div className="list">{Object.entries(counts).map(([name, count]) => <div className="list-item" key={name}><b>{name}</b><span>{count} tickets</span></div>)}</div>}</main></Shell></RequireStaff>;
}

function Analytics() {
  const { tickets } = useCivicSafety();
  const stats = ticketStats(tickets);
  const byType = tickets.reduce<Record<string, number>>((acc, ticket) => {
    acc[ticket.issue_type] = (acc[ticket.issue_type] || 0) + 1;
    return acc;
  }, {});
  const max = Math.max(1, ...Object.values(byType));
  return <RequireStaff><Shell admin><main className="page"><div className="overline">GHMC issue analytics</div><h1 className="display">Analytics from <span style={{color:"#2f7df6"}}>assigned issues.</span></h1><section className="grid grid-4"><Metric label="Assigned issues" value={tickets.length}/><Metric label="Resolved" value={stats.resolved} color="#19c99a"/><Metric label="In progress" value={stats.inProgress} color="#2f7df6"/><Metric label="Pending" value={stats.pending} color="#ffb72b"/></section><section className="grid grid-2 section"><div className="card"><div className="overline">Issue type distribution</div>{Object.entries(byType).length === 0 ? <p className="subtitle">No assigned issues yet.</p> : Object.entries(byType).map(([type, count]) => <div key={type} style={{marginTop:12}}><div className="row"><b>{statusLabel(type)}</b><span>{count}</span></div><div className="progress"><span style={{width:`${count / max * 100}%`,background:"#2f7df6"}} /></div></div>)}</div><AnalyticsPie tickets={tickets} /></section><SafetyAnalytics tickets={tickets} /></main></Shell></RequireStaff>;
}

function Emergency() {
  const { tickets, reload } = useCivicSafety();
  const emergencyTickets = tickets.filter((ticket) => ticket.severity === "critical" || ticket.status === "pending");
  return <RequireStaff><Shell admin><main className="page"><div className="overline">Emergency response queue</div><h1 className="display">Critical assigned <span style={{color:"#7c5cff"}}>issues.</span></h1><section className="grid grid-3"><Metric label="Emergency issues" value={emergencyTickets.length} color="#7c5cff"/><Metric label="Critical" value={emergencyTickets.filter((t) => t.severity === "critical").length} color="#ffb72b"/><Metric label="Pending" value={emergencyTickets.filter((t) => t.status === "pending").length} color="#2f7df6"/></section><section className="section"><IssueList tickets={emergencyTickets} staff onChanged={reload} /></section></main></Shell></RequireStaff>;
}

function Budget() {
  const { tickets, profile, reload } = useCivicSafety();
  const [spend, setSpend] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const activeBudgetTickets = tickets.filter((ticket) => !["resolved", "closed", "rejected"].includes(ticket.status));
  const resolvedBudgetTickets = tickets.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed");
  const profileDepartment = budgetDepartmentName(departmentName(profile || {}));
  const visibleDepartments = profile?.role === "admin"
    ? Object.keys(departmentBudgets)
    : Array.from(new Set([profileDepartment, ...activeBudgetTickets.map(budgetDepartment)]));
  const totals = visibleDepartments.map((department) => {
    const departmentTickets = activeBudgetTickets.filter((ticket) => budgetDepartment(ticket) === department);
    const spent = tickets.filter((ticket) => budgetDepartment(ticket) === department).reduce((sum, ticket) => sum + ticketSpend(ticket), 0);
    return { department, tickets: departmentTickets, budget: departmentBudgets[department] ?? 0, spent };
  });

  async function saveSpend(ticket: Ticket) {
    const value = Number(spend[ticket.id]);
    if (!Number.isFinite(value) || value < 0) {
      setMessage("Enter a valid spend amount.");
      return;
    }
    const response = await fetch(`/api/complaints/${ticket.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ budget_spent: value }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Budget spend could not be saved.");
      return;
    }
    setSpend((current) => ({ ...current, [ticket.id]: "" }));
    setMessage("Budget updated.");
    await reload();
  }

  async function markResolved(ticket: Ticket) {
    const response = await fetch(`/api/complaints/${ticket.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "resolved" }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage(result.error || "Ticket could not be resolved.");
      return;
    }
    setMessage("Issue resolved.");
    await reload();
  }

  return <RequireStaff><Shell admin><main className="page"><div className="overline">Department budget tracker</div><h1 className="display">Track spend by <span style={{color:"#ffb72b"}}>assigned ticket.</span></h1><AutoNotice message={message} onClose={() => setMessage("")}/><section className="grid grid-4">{totals.map((item) => <Metric key={item.department} label={item.department} value={money(item.budget - item.spent)} note={`${money(item.spent)} spent of ${money(item.budget)}`} color={item.spent > item.budget ? "#7c5cff" : "#19c99a"} />)}</section><section className="section"><div className="card"><div className="overline">Active ticket spend entries</div>{activeBudgetTickets.length === 0 ? <p className="subtitle">No active assigned tickets to budget.</p> : <div className="list" style={{marginTop:14}}>{activeBudgetTickets.map((ticket) => <div className="list-item" key={ticket.id}><div><b>{ticket.title}</b><div style={{color:"#627277",fontSize:13}}>{ticket.ticket_no} | {budgetDepartment(ticket)} | spent {money(ticketSpend(ticket))}</div><div style={{color:"#627277",fontSize:13}}>{spendEntries(ticket).map((entry) => `${money(entry.amount)} at ${formatDate(entry.created_at)}`).join(" | ") || "No spend entries yet"}</div></div><div className="row" style={{justifyContent:"end"}}><input className="input" style={{width:150}} placeholder="Spend amount" value={spend[ticket.id] ?? ""} onChange={(e) => setSpend((current) => ({...current,[ticket.id]:e.target.value}))}/><button className="btn" type="button" onClick={() => void saveSpend(ticket)}>Update</button><button className="btn red" type="button" onClick={() => void markResolved(ticket)}>Issue resolved</button></div></div>)}</div>}</div></section><section className="section"><div className="card"><div className="overline">Resolved issue spend history</div>{resolvedBudgetTickets.length === 0 ? <p className="subtitle">No resolved issues yet.</p> : <div className="list" style={{marginTop:14}}>{resolvedBudgetTickets.map((ticket) => <div className="list-item" key={ticket.id}><div><b>{ticket.title}</b><div style={{color:"#627277",fontSize:13}}>{ticket.ticket_no} | {budgetDepartment(ticket)} | total spent {money(ticketSpend(ticket))}</div><div style={{color:"#627277",fontSize:13}}>{spendEntries(ticket).map((entry) => `${money(entry.amount)} at ${formatDate(entry.created_at)}`).join(" | ") || "No spend entries recorded"}</div></div><Badge text={statusLabel(ticket.status)} color="#19c99a" /></div>)}</div>}</div></section></main></Shell></RequireStaff>;
}

function Announcements() {
  const { announcements, profile, reload } = useCivicSafety();
  const [form, setForm] = useState({ title: "", body: "", category: "Emergency advisory", severity: "low", locality: "", latitude: "", longitude: "" });
  const [message, setMessage] = useState("");
  function setAnnouncementTarget(latitude: number, longitude: number) {
    const office = nearestGhmcOffice(latitude, longitude);
    setForm((current) => ({
      ...current,
      locality: office?.locality || current.locality,
      latitude: String(latitude),
      longitude: String(longitude),
    }));
  }
  function getGps() {
    if (!navigator.geolocation) {
      setMessage("GPS is not supported by this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setAnnouncementTarget(position.coords.latitude, position.coords.longitude);
        const office = nearestGhmcOffice(position.coords.latitude, position.coords.longitude);
        setMessage(`Announcement GPS target captured${office ? ` for ${office.locality}` : ""}: ${position.coords.latitude}, ${position.coords.longitude}`);
      },
      (error) => setMessage(`GPS error: ${error.message}`),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }
  async function publish(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const response = await fetch("/api/announcements", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, author_id: profile?.id, locality: form.locality || null, latitude: form.latitude || null, longitude: form.longitude || null }) });
    const result = await response.json();
    setMessage(response.ok ? "Announcement published." : result.error || "Could not publish.");
    if (response.ok) {
      setForm({ title: "", body: "", category: "Emergency advisory", severity: "low", locality: "", latitude: "", longitude: "" });
      await reload();
    }
  }
  async function remove(id: string) {
    await fetch(`/api/announcements/${id}`, { method: "DELETE" });
    await reload();
  }
  return <RequireStaff><Shell admin><main className="page"><div className="overline">Citizen communication center</div><h1 className="display">Publish real <span style={{color:"#ffb72b"}}>announcements.</span></h1><div className="grid grid-2"><form className="card form-grid" onSubmit={publish}><datalist id="announcement-hyderabad-localities">{hyderabadLocalities.map((item) => <option key={item} value={item} />)}</datalist><input className="input" required placeholder="Announcement title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}/><select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}><option>Emergency advisory</option><option>Maintenance notice</option><option>Area alert</option><option>Civic awareness message</option></select><select className="input" value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select><input className="input" list="announcement-hyderabad-localities" placeholder="Target locality, or blank for all users" value={form.locality} onChange={(e) => setForm({ ...form, locality: e.target.value })}/><div className="grid grid-2"><input className="input" placeholder="Target latitude" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })}/><input className="input" placeholder="Target longitude" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })}/></div><div className="row" style={{ justifyContent: "start" }}><button className="btn alt" type="button" onClick={getGps}>Use GPS target</button><button className="btn alt" type="button" onClick={() => setForm((current) => ({ ...current, locality: profile?.locality ?? "", latitude: profile?.latitude ? String(profile.latitude) : "", longitude: profile?.longitude ? String(profile.longitude) : "" }))}>Use my GHMC location</button></div><LocationPickerMap latitude={form.latitude ? Number(form.latitude) : null} longitude={form.longitude ? Number(form.longitude) : null} onPick={({ latitude, longitude }) => setAnnouncementTarget(latitude, longitude)} /><textarea className="input" required rows={5} placeholder="Write the update..." value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })}/><button className="btn">Publish announcement</button><AutoNotice message={message} onClose={() => setMessage("")} /></form><div className="card"><div className="overline">Published announcements</div>{announcements.length === 0 ? <p className="subtitle">No announcements in Supabase.</p> : <div className="list">{announcements.map((a) => <div className="list-item" key={a.id}><div><b>{a.title}</b><div style={{ color: "#627277", fontSize: 13 }}>{a.locality || "All areas"}{a.latitude && a.longitude ? ` | ${a.latitude}, ${a.longitude}` : ""}</div><p>{a.body}</p></div><button className="btn red" onClick={() => void remove(a.id)}>Remove</button></div>)}</div>}</div></div></main></Shell></RequireStaff>;
}

function StaffOnlySimple({ title, subtitle }: { title: string; subtitle: string }) {
  return <RequireStaff><Shell admin><main className="page"><div className="overline">GHMC portal</div><h1 className="display">{title}</h1><p className="subtitle">{subtitle}</p></main></Shell></RequireStaff>;
}

function GhmcComplaints() {
  const { tickets, reload } = useCivicSafety();
  const activeTickets = tickets.filter((ticket) => !["resolved", "closed", "rejected"].includes(ticket.status));
  const resolvedTickets = tickets.filter((ticket) => ticket.status === "resolved" || ticket.status === "closed");
  return <RequireStaff><Shell admin><main className="page">
    <div className="overline">Live complaint feed</div>
    <h1 className="display">Manage logged <span style={{color:"#7c5cff"}}>tickets.</span></h1>
    <ComplaintGraphs tickets={tickets} />
    <section className="section"><div className="section-head"><h2 className="display">Active issues</h2><span className="pill">{activeTickets.length} open</span></div><IssueList tickets={activeTickets} staff onChanged={reload} /></section>
    <section className="section"><div className="section-head"><h2 className="display">Resolved issues</h2><span className="pill">{resolvedTickets.length} closed</span></div><IssueList tickets={resolvedTickets} staff onChanged={reload} /></section>
  </main></Shell></RequireStaff>;
}

export default function Portal({ view }: { view: PortalView }) {
  const pages: Record<PortalView, React.ReactNode> = useMemo(() => ({
    dashboard:<CitizenDashboard/>, report:<Report/>, tickets:<Tickets/>, map:<MapPage/>, safety:<Safety/>, route:<SafeRoute/>, profile:<Profile/>,
    overview:<Overview/>, complaints:<GhmcComplaints/>,
    "map-view":<MapPage admin/>, departments:<Departments/>, emergency:<Emergency/>, analytics:<Analytics/>, budget:<Budget/>, announcements:<Announcements/>, staff:<StaffOnlySimple title="Staff and contractor management" subtitle="Assign departments to GHMC profiles in Supabase to use department based access." />
  }), []);
  return pages[view];
}

function IssueFeedStaff() {
  const { tickets, reload } = useCivicSafety();
  return <IssueList tickets={tickets} staff onChanged={reload} />;
}
