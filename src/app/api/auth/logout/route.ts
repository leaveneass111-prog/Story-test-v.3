import { cookies } from "next/headers";
import { SESSION_COOKIE_NAME } from "@/lib/auth";

export async function POST() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);

  return Response.json(
    { success: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
