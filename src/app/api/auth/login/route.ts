import { cookies } from "next/headers";
import {
  createSessionToken,
  getAuthConfig,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  verifyAccessPassword,
} from "@/lib/auth";

const noStoreHeaders = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const authConfig = getAuthConfig();

  if (!authConfig) {
    return Response.json(
      { error: "Authentication is not configured correctly on the server." },
      { status: 503, headers: noStoreHeaders },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return Response.json(
        { error: "Request body must be valid JSON." },
        { status: 400, headers: noStoreHeaders },
      );
    }

    throw error;
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("password" in body) ||
    typeof body.password !== "string" ||
    body.password.length === 0 ||
    body.password.length > 1024
  ) {
    return Response.json(
      { error: "A valid password is required." },
      { status: 400, headers: noStoreHeaders },
    );
  }

  if (!verifyAccessPassword(body.password, authConfig.accessPassword)) {
    return Response.json(
      { error: "Invalid password." },
      { status: 401, headers: noStoreHeaders },
    );
  }

  const cookieStore = await cookies();
  cookieStore.set(
    SESSION_COOKIE_NAME,
    createSessionToken(authConfig.sessionSecret),
    {
      httpOnly: true,
      maxAge: SESSION_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
    },
  );

  return Response.json({ success: true }, { headers: noStoreHeaders });
}
