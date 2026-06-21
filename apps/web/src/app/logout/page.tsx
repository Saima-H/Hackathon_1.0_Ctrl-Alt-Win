"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useEffect } from "react";

export default function LogoutPage() {
  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    void supabase.auth.signOut().finally(() => {
      window.location.href = "/login";
    });
  }, []);

  return <main className="page"><p>Signing out...</p></main>;
}
