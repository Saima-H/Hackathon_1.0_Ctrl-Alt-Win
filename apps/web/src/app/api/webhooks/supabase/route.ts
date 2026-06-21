import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const event = await request.json();
  return NextResponse.json({ received: true, type: event.type ?? "unknown" }, { status: 202 });
}
