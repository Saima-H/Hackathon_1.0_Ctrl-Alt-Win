import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ issueType: "pothole", severity: "high", confidence: 0.91, duplicateProbability: 0.08 });
}
