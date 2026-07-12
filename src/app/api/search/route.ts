import { NextRequest } from "next/server";
import { searchFinnhubCompanies } from "@/lib/api-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q");
  if (!q || q.length < 1) {
    return Response.json([]);
  }

  const results = await searchFinnhubCompanies(q);
  return Response.json(results);
}
