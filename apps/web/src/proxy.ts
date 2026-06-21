import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const protectedRoutes = ["/dashboard", "/report", "/tickets", "/map", "/safety-score", "/safe-route", "/profile", "/overview", "/complaints", "/map-view", "/departments", "/emergency", "/analytics", "/budget", "/announcements", "/staff"];
const ghmcRoutes = ["/complaints", "/map-view", "/departments", "/emergency", "/analytics", "/budget", "/announcements"];

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("YOUR_PROJECT")) {
    return supabaseResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() { return request.cookies.getAll(); },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          request.cookies.set(name, value);
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;
  const forceLogin = request.nextUrl.searchParams.get("force") === "1";

  if (!user && protectedRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  let role: string | null = null;
  if (user && (ghmcRoutes.some((route) => pathname.startsWith(route)) || pathname === "/login" || pathname === "/register")) {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    role = profile?.role ?? null;
  }

  if (user && ghmcRoutes.some((route) => pathname.startsWith(route)) && !["ghmc_staff", "admin"].includes(role ?? "")) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (user && !forceLogin && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL(["ghmc_staff", "admin"].includes(role ?? "") ? "/complaints" : "/dashboard", request.url));
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
