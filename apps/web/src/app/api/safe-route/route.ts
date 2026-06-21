import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const { from = "Jubilee Hills", to = "Hitech City" } = await request.json();
  return NextResponse.json({ from, to, routes: [
    { label: "Safest route", score: 87, etaMinutes: 26, hazardsAvoided: ["flooding", "poor lighting"] },
    { label: "Fastest route", score: 63, etaMinutes: 21, hazardsAvoided: ["road maintenance"] },
    { label: "Avoid route", score: 29, etaMinutes: 24, warnings: ["flood-prone segment", "severe pothole"] },
  ]});
}
