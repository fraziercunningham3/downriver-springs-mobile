import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Request } from "express";
import { db, shopSessions, type ShopUser } from "@workspace/db";

const SHOP_SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export type ShopAuthPayload = {
  userId: string;
  role: "customer" | "staff";
  sessionId: string;
};

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for shop sessions.");
  return secret;
}

function encodeTokenPart(value: string) {
  return Buffer.from(value).toString("base64url");
}

function signShopToken(payload: {
  userId: string;
  role: "customer" | "staff";
  sessionId: string;
  exp: number;
}) {
  const encodedPayload = encodeTokenPart(JSON.stringify({ kind: "shop", ...payload }));
  const signature = createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
  return `shop.${encodedPayload}.${signature}`;
}

export async function createShopSession(
  user: Pick<ShopUser, "id" | "role">,
  deviceName = "Mobile device",
) {
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SHOP_SESSION_DURATION_MS);
  await db.insert(shopSessions).values({
    id: sessionId,
    userId: user.id,
    deviceName: deviceName.trim().slice(0, 100) || "Mobile device",
    expiresAt,
  });
  return {
    token: signShopToken({
      userId: user.id,
      role: user.role,
      sessionId,
      exp: expiresAt.getTime(),
    }),
    sessionId,
  };
}

function verifyShopTokenSignature(value: unknown) {
  if (typeof value !== "string") return null;
  const [prefix, encodedPayload, signature] = value.split(".");
  if (prefix !== "shop" || !encodedPayload || !signature) return null;

  const expected = createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as Partial<ShopAuthPayload> & { kind?: string; exp?: number };
    if (
      payload.kind !== "shop" ||
      typeof payload.userId !== "string" ||
      (payload.role !== "customer" && payload.role !== "staff") ||
      typeof payload.sessionId !== "string" ||
      typeof payload.exp !== "number" ||
      payload.exp <= Date.now()
    ) {
      return null;
    }
    return {
      userId: payload.userId,
      role: payload.role,
      sessionId: payload.sessionId,
    };
  } catch {
    return null;
  }
}

export async function getShopAuth(req: Request): Promise<ShopAuthPayload | null> {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
  const payload = verifyShopTokenSignature(token);
  if (!payload) return null;

  const [session] = await db
    .select({
      id: shopSessions.id,
      userId: shopSessions.userId,
      revokedAt: shopSessions.revokedAt,
      expiresAt: shopSessions.expiresAt,
    })
    .from(shopSessions)
    .where(
      and(
        eq(shopSessions.id, payload.sessionId),
        eq(shopSessions.userId, payload.userId),
        isNull(shopSessions.revokedAt),
        gt(shopSessions.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!session || session.expiresAt.getTime() <= Date.now()) return null;

  await db
    .update(shopSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(shopSessions.id, payload.sessionId));
  return payload;
}