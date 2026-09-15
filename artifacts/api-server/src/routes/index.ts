import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import { createHmac, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { db } from "@workspace/db";
import {
  expertReviewRequests,
  shopSessions,
  shopUsers,
  shopVehicles,
  shopWorkOrders,
  type ShopUser,
} from "@workspace/db/schema";
import healthRouter from "./health";
import galleryRouter from "./gallery";
import { logger } from "../lib/logger";
import { createMobileDownloadUrl, createMobileUploadUrl } from "../lib/mobileObjectStorage";
import { createShopSession, getShopAuth, type ShopAuthPayload } from "../lib/shopAuth";

const router: IRouter = Router();
const revenueCatConnectors = new ReplitConnectors();

router.use(healthRouter);
router.use(galleryRouter);

const componentSchema = z.enum(["Engine", "Mounts", "Leaks", "Wiring", "Exhaust"]);
const mediaKindSchema = z.enum(["photo", "video"]);
const mediaPayloadSchema = z.object({
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  data: z.string().min(100).max(1_600_000),
});
const analysisRequestSchema = z.object({
  component: componentSchema,
  mediaKind: mediaKindSchema,
  vehicle: z.string().trim().min(1).max(120),
  media: z.array(mediaPayloadSchema).min(1).max(4),
});
const findingSchema = z.object({
  title: z.string().trim().min(1).max(140),
  severity: z.enum(["watch", "attention", "urgent"]),
  confidence: z.number().min(0).max(1),
  detail: z.string().trim().min(1).max(600),
  evidence: z.array(z.string().trim().min(1).max(220)).min(1).max(5),
  recommendation: z.string().trim().min(1).max(600),
});
const modelOutputSchema = z.object({
  findings: z.array(findingSchema).min(1).max(3),
  summary: z.string().trim().min(1).max(1200),
});

const vehicleChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(4000),
});
const vehicleChatRequestSchema = z.object({
  question: z.string().trim().min(1).max(1600),
  vehicle: z.object({
    year: z.string().trim().max(20).optional(),
    make: z.string().trim().max(60).optional(),
    model: z.string().trim().max(60).optional(),
    mileage: z.string().trim().max(30).optional(),
    engine: z.string().trim().max(80).optional(),
    climate: z.string().trim().max(100).optional(),
    maintenanceHistory: z.string().trim().max(1200).optional(),
    symptoms: z.string().trim().max(1200).optional(),
    inspectionContext: z.string().trim().max(4000).optional(),
  }),
  messages: z.array(vehicleChatMessageSchema).max(12).default([]),
});
const vehicleChatOutputSchema = z.object({
  answer: z.string().trim().min(1).max(4000),
  dataPoints: z.array(z.string().trim().min(1).max(500)).max(5),
  nextSteps: z.array(z.string().trim().min(1).max(500)).max(5),
  followUpQuestions: z.array(z.string().trim().min(1).max(300)).max(3),
  safetyLevel: z.enum(["routine", "attention", "urgent"]),
});

type AnalysisRequest = z.infer<typeof analysisRequestSchema>;

function getSessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required for inspection sessions.");
  return secret;
}

function encodeTokenPart(value: string) {
  return Buffer.from(value).toString("base64url");
}

function createDeviceToken(deviceId: string) {
  const payload = encodeTokenPart(
    JSON.stringify({ deviceId, exp: Date.now() + 24 * 60 * 60 * 1000 }),
  );
  const signature = createHmac("sha256", getSessionSecret())
    .update(payload)
    .digest("base64url");
  return `ds.${payload}.${signature}`;
}

function verifyDeviceToken(value: unknown) {
  if (typeof value !== "string") return false;
  const [prefix, encodedPayload, signature] = value.split(".");
  if (prefix !== "ds" || !encodedPayload || !signature) return false;

  const expected = createHmac("sha256", getSessionSecret())
    .update(encodedPayload)
    .digest("base64url");
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  ) {
    return false;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as { deviceId?: string; exp?: number };
    return Boolean(
      payload.deviceId &&
        typeof payload.exp === "number" &&
        payload.exp > Date.now(),
    );
  } catch {
    return false;
  }
}

function requireAnalysisSession(req: Request, res: Response, next: NextFunction) {
  const authorization = req.header("authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : undefined;
  if (!verifyDeviceToken(token)) {
    res.status(401).json({ error: "A valid inspection session is required." });
    return;
  }
  next();
}

const scryptAsync = promisify(scrypt);
const shopUserResponseSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email(),
  phone: z.string(),
  role: z.enum(["customer", "staff"]),
});
const vehicleResponseSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  plate: z.string(),
});
const workOrderStatusSchema = z.enum([
  "In progress",
  "Awaiting approval",
  "Ready for pickup",
]);
const shopRegisterSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(30),
  password: z.string().min(8).max(128),
  deviceName: z.string().trim().max(100).optional(),
  vehicle: z.object({
    label: z.string().trim().min(1).max(120),
    plate: z.string().trim().min(1).max(20),
  }).optional(),
});
const shopSignInSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(128),
  deviceName: z.string().trim().max(100).optional(),
});
const shopProfileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email(),
  phone: z.string().trim().min(7).max(30),
});
const expertReviewMediaSchema = z.object({
  kind: mediaKindSchema,
  objectPath: z.string().trim().min(1).max(500),
  fileName: z.string().trim().max(160).optional(),
});
const expertReviewCreateSchema = z.object({
  vin: z.string().trim().min(11).max(17).regex(/^[A-HJ-NPR-Z0-9]+$/i, "Enter a valid VIN."),
  vehicle: z.string().trim().min(2).max(160),
  question: z.string().trim().min(10).max(2400),
  pricingContext: z.string().trim().max(1600).default(""),
  media: z.array(expertReviewMediaSchema).min(1).max(8),
  deliveryMethod: z.enum(["app", "email", "both"]).default("both"),
});
const expertReviewUpdateSchema = z.object({
  status: z.enum(["pending", "in_review", "answered", "cancelled"]).optional(),
  response: z.string().trim().min(1).max(6000).optional(),
  staffNotes: z.string().trim().max(2400).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one expert-review field is required.")
  .refine((value) => value.status !== "answered" || Boolean(value.response), "A customer-facing response is required before answering.");
const staffBootstrapSchema = shopRegisterSchema.omit({ vehicle: true }).extend({
  inviteToken: z.string().min(1),
});
const uploadUrlSchema = z.object({
  name: z.string().trim().min(1).max(160),
  size: z.number().int().positive().max(80_000_000),
  contentType: z.string().trim().min(3).max(120),
});
const staffWorkOrderUpdateSchema = z
  .object({
    service: z.string().trim().min(1).max(240).optional(),
    status: workOrderStatusSchema.optional(),
    progress: z.number().min(0).max(1).optional(),
    eta: z.string().trim().min(1).max(120).optional(),
    technician: z.string().trim().min(1).max(120).optional(),
    note: z.string().trim().min(1).max(1200).optional(),
    estimate: z.string().trim().min(1).max(40).optional(),
    approved: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one work-order field is required.");
const staffWorkOrderCreateSchema = z.object({
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  service: z.string().trim().min(1).max(240),
  status: workOrderStatusSchema.default("In progress"),
  progress: z.number().min(0).max(1).default(0),
  eta: z.string().trim().min(1).max(120),
  technician: z.string().trim().min(1).max(120),
  note: z.string().trim().min(1).max(1200),
  estimate: z.string().trim().min(1).max(40),
  approved: z.boolean().default(false),
});

async function requireShopRole(req: Request, res: Response, role: ShopAuthPayload["role"]) {
  const auth = await getShopAuth(req);
  if (!auth || auth.role !== role) {
    res.status(401).json({ error: "A valid shop account session is required." });
    return null;
  }
  return auth;
}

async function hasActiveProEntitlement(userId: string) {
  const projectId = process.env.REVENUECAT_PROJECT_ID;
  if (!projectId) throw new Error("REVENUECAT_PROJECT_ID is not configured.");
  const response = await revenueCatConnectors.proxy(
    "revenuecat",
    `/v2/projects/${encodeURIComponent(projectId)}/customers/${encodeURIComponent(userId)}/active_entitlements`,
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`RevenueCat entitlement lookup failed with ${response.status}.`);
  }
  const payload = await response.json() as {
    items?: Array<{ lookup_key?: string; entitlement?: { lookup_key?: string } }>;
  };
  return Boolean(payload.items?.some((item) =>
    item.lookup_key === "pro" || item.entitlement?.lookup_key === "pro",
  ));
}

async function requirePaidCustomer(req: Request, res: Response) {
  const auth = await requireShopRole(req, res, "customer");
  if (!auth) return null;
  try {
    if (!(await hasActiveProEntitlement(auth.userId))) {
      res.status(402).json({
        error: "Downriver Springs Pro is required for expert vehicle-buying reviews.",
        code: "PRO_REQUIRED",
      });
      return null;
    }
    return auth;
  } catch (error) {
    logger.error({ error, userId: auth.userId }, "RevenueCat entitlement check failed");
    res.status(503).json({ error: "Paid features are temporarily unavailable. Try again shortly." });
    return null;
  }
}

async function hashShopPassword(password: string, salt = randomBytes(16).toString("hex")) {
  const derivedKey = (await scryptAsync(password, salt, 64)) as Buffer;
  return { salt, hash: derivedKey.toString("hex") };
}

async function verifyShopPassword(password: string, salt: string, expectedHash: string) {
  const { hash } = await hashShopPassword(password, salt);
  const actual = Buffer.from(hash, "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function serializeUser(user: ShopUser) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
  };
}

function serializeExpertReview(
  review: typeof expertReviewRequests.$inferSelect,
  customer?: ShopUser,
) {
  return {
    id: review.id,
    vin: review.vin,
    vehicle: review.vehicle,
    question: review.question,
    pricingContext: review.pricingContext,
    media: review.media,
    status: review.status,
    deliveryMethod: review.deliveryMethod,
    response: review.response,
    staffNotes: review.staffNotes,
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
    answeredAt: review.answeredAt?.toISOString() ?? null,
    customer: customer
      ? { id: customer.id, name: customer.name, email: customer.email, phone: customer.phone }
      : undefined,
  };
}

function serializeVehicle(vehicle: typeof shopVehicles.$inferSelect) {
  return { id: vehicle.id, label: vehicle.label, plate: vehicle.plate };
}

function serializeWorkOrder(
  order: typeof shopWorkOrders.$inferSelect,
  vehicle?: typeof shopVehicles.$inferSelect,
) {
  return {
    id: order.id,
    customerId: order.customerId,
    vehicleId: order.vehicleId,
    vehicle: vehicle?.label ?? "Vehicle",
    plate: vehicle?.plate ?? "—",
    status: order.status,
    updatedAt: order.updatedAt.toISOString(),
    service: order.service,
    progress: order.progress,
    eta: order.eta,
    technician: order.technician,
    note: order.note,
    estimate: order.estimate,
    approved: order.approved,
  };
}

async function getShopDashboard(userId: string) {
  const [vehicles, workOrders] = await Promise.all([
    db.select().from(shopVehicles).where(eq(shopVehicles.customerId, userId)),
    db
      .select()
      .from(shopWorkOrders)
      .where(eq(shopWorkOrders.customerId, userId))
      .orderBy(desc(shopWorkOrders.updatedAt)),
  ]);
  return {
    vehicles: vehicles.map(serializeVehicle),
    workOrders: workOrders.map((order) => serializeWorkOrder(
      order,
      vehicles.find((vehicle) => vehicle.id === order.vehicleId),
    )),
  };
}

router.post("/shop/auth/register", async (req, res) => {
  const parsed = shopRegisterSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a name, valid email, password, and vehicle." });
    return;
  }

  try {
    const existing = await db
      .select({ id: shopUsers.id })
      .from(shopUsers)
      .where(eq(shopUsers.email, parsed.data.email))
      .limit(1);
    if (existing.length) {
      res.status(409).json({ error: "An account already exists for this email." });
      return;
    }

    const { hash, salt } = await hashShopPassword(parsed.data.password);
    const created = await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(shopUsers)
        .values({
          name: parsed.data.name,
          email: parsed.data.email,
          phone: parsed.data.phone,
          passwordHash: hash,
          passwordSalt: salt,
          role: "customer",
        })
        .returning();
      const vehicle = parsed.data.vehicle
        ? (await tx
          .insert(shopVehicles)
          .values({
            customerId: user.id,
            label: parsed.data.vehicle.label,
            plate: parsed.data.vehicle.plate,
          })
          .returning())[0]
        : undefined;
      return { user, vehicle };
    });

    const session = await createShopSession(created.user, parsed.data.deviceName);
    res.status(201).json({
      token: session.token,
      sessionId: session.sessionId,
      user: serializeUser(created.user),
      vehicles: created.vehicle ? [serializeVehicle(created.vehicle)] : [],
      workOrders: [],
    });
  } catch (error) {
    logger.error({ error }, "Shop customer registration failed");
    res.status(500).json({ error: "We could not create your shop account right now." });
  }
});

router.post("/shop/auth/sign-in", async (req, res) => {
  const parsed = shopSignInSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email and password." });
    return;
  }

  try {
    const [user] = await db
      .select()
      .from(shopUsers)
      .where(eq(shopUsers.email, parsed.data.email))
      .limit(1);
    if (!user || !(await verifyShopPassword(parsed.data.password, user.passwordSalt, user.passwordHash))) {
      res.status(401).json({ error: "The email or password is incorrect." });
      return;
    }
    const dashboard = user.role === "customer" ? await getShopDashboard(user.id) : { vehicles: [], workOrders: [] };
    const session = await createShopSession(user, parsed.data.deviceName);
    res.json({
      token: session.token,
      sessionId: session.sessionId,
      user: serializeUser(user),
      ...dashboard,
    });
  } catch (error) {
    logger.error({ error }, "Shop sign-in failed");
    res.status(500).json({ error: "We could not sign you in right now." });
  }
});

router.patch("/shop/auth/profile", async (req, res) => {
  const auth = await getShopAuth(req);
  if (!auth) {
    res.status(401).json({ error: "A valid shop account session is required." });
    return;
  }
  const parsed = shopProfileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your full name, valid email, and phone number." });
    return;
  }
  try {
    const conflicting = await db
      .select({ id: shopUsers.id })
      .from(shopUsers)
      .where(eq(shopUsers.email, parsed.data.email))
      .limit(1);
    if (conflicting.length && conflicting[0].id !== auth.userId) {
      res.status(409).json({ error: "An account already exists for this email." });
      return;
    }
    const [user] = await db
      .update(shopUsers)
      .set({ name: parsed.data.name, email: parsed.data.email, phone: parsed.data.phone, updatedAt: new Date() })
      .where(eq(shopUsers.id, auth.userId))
      .returning();
    if (!user) {
      res.status(404).json({ error: "Shop account no longer exists." });
      return;
    }
    res.json({ user: serializeUser(user) });
  } catch (error) {
    logger.error({ error, userId: auth.userId }, "Shop profile update failed");
    res.status(500).json({ error: "We could not update your account right now." });
  }
});

router.get("/shop/auth/sessions", async (req, res) => {
  const auth = await getShopAuth(req);
  if (!auth) {
    res.status(401).json({ error: "A valid shop account session is required." });
    return;
  }
  try {
    const sessions = await db
      .select()
      .from(shopSessions)
      .where(eq(shopSessions.userId, auth.userId));
    const now = Date.now();
    res.json({
      sessions: sessions
        .filter((session) => !session.revokedAt && session.expiresAt.getTime() > now)
        .sort((left, right) => right.lastSeenAt.getTime() - left.lastSeenAt.getTime())
        .map((session) => ({
          id: session.id,
          deviceName: session.deviceName,
          createdAt: session.createdAt.toISOString(),
          lastSeenAt: session.lastSeenAt.toISOString(),
          expiresAt: session.expiresAt.toISOString(),
          current: session.id === auth.sessionId,
        })),
    });
  } catch (error) {
    logger.error({ error, userId: auth.userId }, "Shop session list failed");
    res.status(500).json({ error: "We could not load your signed-in devices right now." });
  }
});

router.delete("/shop/auth/sessions/:id", async (req, res) => {
  const auth = await getShopAuth(req);
  if (!auth) {
    res.status(401).json({ error: "A valid shop account session is required." });
    return;
  }
  const sessionId = z.string().uuid().safeParse(req.params.id);
  if (!sessionId.success) {
    res.status(400).json({ error: "A valid device session is required." });
    return;
  }
  try {
    const [revoked] = await db
      .update(shopSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(shopSessions.id, sessionId.data),
          eq(shopSessions.userId, auth.userId),
          isNull(shopSessions.revokedAt),
        ),
      )
      .returning({ id: shopSessions.id });
    if (!revoked) {
      res.status(404).json({ error: "That device session is no longer active." });
      return;
    }
    res.json({ revoked: true, current: revoked.id === auth.sessionId });
  } catch (error) {
    logger.error({ error, userId: auth.userId, sessionId: sessionId.data }, "Shop session revocation failed");
    res.status(500).json({ error: "We could not revoke that device session right now." });
  }
});

router.post("/shop/auth/sessions/revoke-all", async (req, res) => {
  const auth = await getShopAuth(req);
  if (!auth) {
    res.status(401).json({ error: "A valid shop account session is required." });
    return;
  }
  try {
    const revoked = await db
      .update(shopSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(shopSessions.userId, auth.userId), isNull(shopSessions.revokedAt)))
      .returning({ id: shopSessions.id });
    res.json({ revokedCount: revoked.length });
  } catch (error) {
    logger.error({ error, userId: auth.userId }, "All shop session revocation failed");
    res.status(500).json({ error: "We could not sign out the other devices right now." });
  }
});

router.get("/shop/dashboard", async (req, res) => {
  const auth = await requireShopRole(req, res, "customer");
  if (!auth) return;
  try {
    const [user] = await db.select().from(shopUsers).where(eq(shopUsers.id, auth.userId)).limit(1);
    if (!user) {
      res.status(401).json({ error: "Shop account no longer exists." });
      return;
    }
    res.json({ user: serializeUser(user), ...(await getShopDashboard(user.id)) });
  } catch (error) {
    logger.error({ error }, "Shop dashboard request failed");
    res.status(500).json({ error: "We could not load your shop updates right now." });
  }
});

router.post("/shop/work-orders/:id/approve", async (req, res) => {
  const auth = await requireShopRole(req, res, "customer");
  if (!auth) return;
  const orderId = z.string().trim().min(1).max(80).safeParse(req.params.id);
  if (!orderId.success) {
    res.status(400).json({ error: "A work-order id is required." });
    return;
  }

  try {
    const [order] = await db
      .select()
      .from(shopWorkOrders)
      .where(and(eq(shopWorkOrders.id, orderId.data), eq(shopWorkOrders.customerId, auth.userId)))
      .limit(1);
    if (!order) {
      res.status(404).json({ error: "Work order not found." });
      return;
    }
    const [updated] = await db
      .update(shopWorkOrders)
      .set({
        approved: true,
        status: order.status === "Awaiting approval" ? "In progress" : order.status,
        progress: Math.max(order.progress, 0.42),
        eta: order.status === "Awaiting approval" ? "Technician is queued" : order.eta,
        updatedAt: new Date(),
      })
      .where(eq(shopWorkOrders.id, order.id))
      .returning();
    const [vehicle] = await db
      .select()
      .from(shopVehicles)
      .where(eq(shopVehicles.id, updated.vehicleId))
      .limit(1);
    res.json({ workOrder: serializeWorkOrder(updated, vehicle) });
  } catch (error) {
    logger.error({ error, orderId: orderId.data }, "Work-order approval failed");
    res.status(500).json({ error: "We could not approve this estimate right now." });
  }
});

router.post("/shop/staff/bootstrap", async (req, res) => {
  const parsed = staffBootstrapSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.inviteToken !== getSessionSecret()) {
    res.status(403).json({ error: "A valid staff invite is required." });
    return;
  }

  try {
    const email = parsed.data.email;
    const existing = await db
      .select({ id: shopUsers.id })
      .from(shopUsers)
      .where(eq(shopUsers.email, email))
      .limit(1);
    if (existing.length) {
      res.status(409).json({ error: "An account already exists for this email." });
      return;
    }
    const { hash, salt } = await hashShopPassword(parsed.data.password);
    const [user] = await db
      .insert(shopUsers)
      .values({
        name: parsed.data.name,
        email,
        phone: parsed.data.phone,
        passwordHash: hash,
        passwordSalt: salt,
        role: "staff",
      })
      .returning();
    const session = await createShopSession(user, parsed.data.deviceName);
    res.status(201).json({ token: session.token, sessionId: session.sessionId, user: serializeUser(user) });
  } catch (error) {
    logger.error({ error }, "Shop staff bootstrap failed");
    res.status(500).json({ error: "We could not create the staff account right now." });
  }
});

router.post("/shop/staff/work-orders", async (req, res) => {
  const auth = await requireShopRole(req, res, "staff");
  if (!auth) return;
  const parsed = staffWorkOrderCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Include a customer, vehicle, service, estimate, and work-order details." });
    return;
  }
  const idempotencyHeader = req.header("Idempotency-Key");
  const parsedIdempotencyKey = idempotencyHeader
    ? z.string().trim().min(1).max(120).safeParse(idempotencyHeader)
    : null;
  if (parsedIdempotencyKey && !parsedIdempotencyKey.success) {
    res.status(400).json({ error: "The work-order idempotency key is invalid." });
    return;
  }
  const workOrderId = parsedIdempotencyKey?.success ? parsedIdempotencyKey.data : randomUUID();

  try {
    const [customer, vehicle] = await Promise.all([
      db
        .select()
        .from(shopUsers)
        .where(and(eq(shopUsers.id, parsed.data.customerId), eq(shopUsers.role, "customer")))
        .limit(1),
      db
        .select()
        .from(shopVehicles)
        .where(and(eq(shopVehicles.id, parsed.data.vehicleId), eq(shopVehicles.customerId, parsed.data.customerId)))
        .limit(1),
    ]);
    if (!customer[0]) {
      res.status(404).json({ error: "Customer not found." });
      return;
    }
    if (!vehicle[0]) {
      res.status(400).json({ error: "That vehicle does not belong to the selected customer." });
      return;
    }

    const [created] = await db
      .insert(shopWorkOrders)
      .values({
        id: workOrderId,
        customerId: parsed.data.customerId,
        vehicleId: parsed.data.vehicleId,
        service: parsed.data.service,
        status: parsed.data.status,
        progress: parsed.data.progress,
        eta: parsed.data.eta,
        technician: parsed.data.technician,
        note: parsed.data.note,
        estimate: parsed.data.estimate,
        approved: parsed.data.approved,
      })
      .onConflictDoNothing({ target: shopWorkOrders.id })
      .returning();
    const order = created ?? (await db
      .select()
      .from(shopWorkOrders)
      .where(eq(shopWorkOrders.id, workOrderId))
      .limit(1))[0];
    if (!order) {
      throw new Error("The work order was not available after the idempotent insert.");
    }
    res.status(created ? 201 : 200).json({
      workOrder: {
        ...serializeWorkOrder(order, vehicle[0]),
        customer: { id: customer[0].id, name: customer[0].name, email: customer[0].email },
      },
    });
  } catch (error) {
    logger.error({ error, userId: auth.userId }, "Staff work-order creation failed");
    res.status(500).json({ error: "We could not create this work order right now." });
  }
});

router.get("/shop/staff/work-orders", async (req, res) => {
  const auth = await requireShopRole(req, res, "staff");
  if (!auth) return;
  try {
    const [orders, vehicles, customers] = await Promise.all([
      db.select().from(shopWorkOrders).orderBy(desc(shopWorkOrders.updatedAt)),
      db.select().from(shopVehicles),
      db.select().from(shopUsers).where(eq(shopUsers.role, "customer")),
    ]);
    res.json({
      workOrders: orders.map((order) => ({
        ...serializeWorkOrder(order, vehicles.find((vehicle) => vehicle.id === order.vehicleId)),
        customer: customers.find((customer) => customer.id === order.customerId)
          ? {
              id: customers.find((customer) => customer.id === order.customerId)!.id,
              name: customers.find((customer) => customer.id === order.customerId)!.name,
              email: customers.find((customer) => customer.id === order.customerId)!.email,
            }
          : null,
      })),
      customers: customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        role: customer.role,
        vehicles: vehicles
          .filter((vehicle) => vehicle.customerId === customer.id)
          .map(serializeVehicle),
      })),
    });
  } catch (error) {
    logger.error({ error }, "Staff work-order list failed");
    res.status(500).json({ error: "We could not load staff work orders right now." });
  }
});

router.post("/shop/expert-reviews", async (req, res) => {
  const auth = await requirePaidCustomer(req, res);
  if (!auth) return;
  const parsed = expertReviewCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Include a valid VIN, vehicle details, question, and at least one photo or video." });
    return;
  }
  const expectedObjectPrefix = `/objects/expert-reviews/${auth.userId}/`;
  if (parsed.data.media.some((item) => !item.objectPath.startsWith(expectedObjectPrefix))) {
    res.status(400).json({ error: "One or more attachments do not belong to this account." });
    return;
  }
  try {
    const [review] = await db
      .insert(expertReviewRequests)
      .values({
        customerId: auth.userId,
        vin: parsed.data.vin.toUpperCase(),
        vehicle: parsed.data.vehicle,
        question: parsed.data.question,
        pricingContext: parsed.data.pricingContext,
        media: parsed.data.media,
        deliveryMethod: parsed.data.deliveryMethod,
      })
      .returning();
    res.status(201).json({ review: serializeExpertReview(review) });
  } catch (error) {
    logger.error({ error, userId: auth.userId }, "Expert vehicle review creation failed");
    res.status(500).json({ error: "We could not submit your expert review right now." });
  }
});

router.post("/shop/expert-reviews/upload-url", async (req, res) => {
  const auth = await requirePaidCustomer(req, res);
  if (!auth) return;
  const parsed = uploadUrlSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The attachment metadata is invalid." });
    return;
  }
  try {
    res.json({
      ...(await createMobileUploadUrl(auth.userId)),
      metadata: parsed.data,
    });
  } catch (error) {
    logger.error({ error, userId: auth.userId }, "Expert review upload URL failed");
    res.status(500).json({ error: "We could not prepare that attachment for upload." });
  }
});

router.get("/shop/expert-reviews", async (req, res) => {
  const auth = await requireShopRole(req, res, "customer");
  if (!auth) return;
  try {
    const reviews = await db
      .select()
      .from(expertReviewRequests)
      .where(eq(expertReviewRequests.customerId, auth.userId))
      .orderBy(desc(expertReviewRequests.createdAt));
    res.json({ reviews: reviews.map((review) => serializeExpertReview(review)) });
  } catch (error) {
    logger.error({ error, userId: auth.userId }, "Customer expert review list failed");
    res.status(500).json({ error: "We could not load your expert reviews right now." });
  }
});

router.patch("/shop/staff/work-orders/:id", async (req, res) => {
  const auth = await requireShopRole(req, res, "staff");
  if (!auth) return;
  const orderId = z.string().trim().min(1).max(80).safeParse(req.params.id);
  const parsed = staffWorkOrderUpdateSchema.safeParse(req.body);
  if (!orderId.success || !parsed.success) {
    res.status(400).json({ error: "The work-order update did not match the staff contract." });
    return;
  }

  try {
    const [updated] = await db
      .update(shopWorkOrders)
      .set({ ...parsed.data, updatedAt: new Date() })
      .where(eq(shopWorkOrders.id, orderId.data))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Work order not found." });
      return;
    }
    const [vehicle] = await db
      .select()
      .from(shopVehicles)
      .where(eq(shopVehicles.id, updated.vehicleId))
      .limit(1);
    const [customer] = await db
      .select()
      .from(shopUsers)
      .where(eq(shopUsers.id, updated.customerId))
      .limit(1);
    res.json({
      workOrder: {
        ...serializeWorkOrder(updated, vehicle),
        customer: customer
          ? { id: customer.id, name: customer.name, email: customer.email }
          : null,
      },
    });
  } catch (error) {
    logger.error({ error, orderId: orderId.data }, "Staff work-order update failed");
    res.status(500).json({ error: "We could not save this work-order update right now." });
  }
});

router.get("/shop/staff/expert-reviews", async (req, res) => {
  const auth = await requireShopRole(req, res, "staff");
  if (!auth) return;
  try {
    const [reviews, customers] = await Promise.all([
      db.select().from(expertReviewRequests).orderBy(desc(expertReviewRequests.updatedAt)),
      db.select().from(shopUsers).where(eq(shopUsers.role, "customer")),
    ]);
    res.json({
      reviews: reviews.map((review) => serializeExpertReview(
        review,
        customers.find((customer) => customer.id === review.customerId),
      )),
    });
  } catch (error) {
    logger.error({ error }, "Staff expert review list failed");
    res.status(500).json({ error: "We could not load the expert review queue right now." });
  }
});

router.get("/shop/expert-reviews/:id/media/:index", async (req, res) => {
  const auth = await getShopAuth(req);
  if (!auth) {
    res.status(401).json({ error: "A valid shop account session is required." });
    return;
  }
  const reviewId = z.string().uuid().safeParse(req.params.id);
  const mediaIndex = z.coerce.number().int().min(0).max(7).safeParse(req.params.index);
  if (!reviewId.success || !mediaIndex.success) {
    res.status(400).json({ error: "A valid expert review media reference is required." });
    return;
  }
  try {
    const [review] = await db.select().from(expertReviewRequests).where(eq(expertReviewRequests.id, reviewId.data)).limit(1);
    if (!review || (auth.role === "customer" && review.customerId !== auth.userId)) {
      res.status(404).json({ error: "Expert review not found." });
      return;
    }
    const item = review.media[mediaIndex.data];
    if (!item) {
      res.status(404).json({ error: "Attachment not found." });
      return;
    }
    res.json({ url: await createMobileDownloadUrl(item.objectPath) });
  } catch (error) {
    logger.error({ error, reviewId: reviewId.data }, "Expert review media URL failed");
    res.status(500).json({ error: "We could not load that attachment." });
  }
});

router.patch("/shop/staff/expert-reviews/:id", async (req, res) => {
  const auth = await requireShopRole(req, res, "staff");
  if (!auth) return;
  const reviewId = z.string().uuid().safeParse(req.params.id);
  const parsed = expertReviewUpdateSchema.safeParse(req.body);
  if (!reviewId.success || !parsed.success) {
    res.status(400).json({ error: "The expert review update did not match the staff contract." });
    return;
  }
  try {
    const [updated] = await db
      .update(expertReviewRequests)
      .set({
        ...parsed.data,
        answeredAt: parsed.data.status === "answered" ? new Date() : undefined,
        updatedAt: new Date(),
      })
      .where(eq(expertReviewRequests.id, reviewId.data))
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Expert review not found." });
      return;
    }
    const [customer] = await db.select().from(shopUsers).where(eq(shopUsers.id, updated.customerId)).limit(1);
    res.json({ review: serializeExpertReview(updated, customer) });
  } catch (error) {
    logger.error({ error, reviewId: reviewId.data }, "Staff expert review update failed");
    res.status(500).json({ error: "We could not save the expert review response." });
  }
});

class VisionProviderNotConfigured extends Error {}

class VehicleAssistantNotConfigured extends Error {}

async function analyzeWithVisionModel(request: AnalysisRequest) {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new VisionProviderNotConfigured(
      "The managed vision model is not configured for this workspace.",
    );
  }

  const prompt = [
    "You are an automotive inspection assistant reviewing customer-captured media.",
    `Vehicle: ${request.vehicle}. Component selected by the customer: ${request.component}.`,
    `There are ${request.media.length} ${request.mediaKind === "video" ? "sampled video frames" : "photo"} in this request.`,
    "Only describe visible evidence. Do not invent details outside the images.",
    "Return JSON only with this exact shape: {\"findings\":[{\"title\":string,\"severity\":\"watch\"|\"attention\"|\"urgent\",\"confidence\":number from 0 to 1,\"detail\":string,\"evidence\":string[],\"recommendation\":string}],\"summary\":string}.",
    "Evidence must contain one or more short, concrete observations from the supplied media.",
    "Use watch when no clear issue is visible, attention for a plausible issue that needs inspection, and urgent only for a visible safety-critical condition.",
    "This is a visual clue, not a final mechanical diagnosis.",
  ].join(" ");

  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/models/gemini-2.5-flash:generateContent`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              ...request.media.map((media) => ({
                inlineData: { mimeType: media.mimeType, data: media.data },
              })),
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
        },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );

  if (!response.ok) {
    logger.error({ status: response.status }, "Vision model request failed");
    throw new Error("The vision model could not analyze this media.");
  }

  const providerPayload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = providerPayload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("The vision model returned an empty analysis.");

  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  let modelJson: unknown;
  try {
    modelJson = JSON.parse(jsonText);
  } catch {
    logger.error("Vision model response was not valid JSON");
    throw new Error("The vision model returned an invalid analysis.");
  }
  const parsed = modelOutputSchema.safeParse(modelJson);
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues }, "Vision model response failed validation");
    throw new Error("The vision model returned an invalid analysis.");
  }

  return {
    ...parsed.data,
    model: "gemini-2.5-flash",
    mediaCount: request.media.length,
    analysisId: randomUUID(),
    createdAt: new Date().toISOString(),
  };
}

async function answerVehicleQuestion(request: z.infer<typeof vehicleChatRequestSchema>) {
  const baseUrl = process.env.AI_INTEGRATIONS_GEMINI_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_GEMINI_API_KEY;
  if (!baseUrl || !apiKey) {
    throw new VehicleAssistantNotConfigured(
      "The managed vehicle assistant is not configured for this workspace.",
    );
  }

  const prompt = [
    "You are the Downriver Springs vehicle maintenance assistant.",
    "Answer the customer's question using the supplied vehicle facts, maintenance history, symptoms, and conversation.",
    "This is an evidence-based guidance assistant, not a substitute for a technician.",
    "Never invent a diagnosis, recall, service interval, failure rate, repair cost, or vehicle-specific fact.",
    "Use general statistical ranges only when they are well-established, label them as estimates, explain the variables, and say that the owner's manual or a qualified technician takes priority.",
    "If the data is insufficient, say exactly what is missing and ask a focused follow-up question.",
    "For safety-critical symptoms such as brake failure, steering loss, overheating, fuel leaks, smoke, or suspected carbon monoxide, recommend stopping use and getting professional help.",
    'Return JSON only with this shape: {"answer":string,"dataPoints":string[],"nextSteps":string[],"followUpQuestions":string[],"safetyLevel":"routine"|"attention"|"urgent"}.',
    `Vehicle facts: ${JSON.stringify(request.vehicle)}`,
    `Stored vision inspection context, if present. Treat it as prior context, not a new diagnosis: ${request.vehicle.inspectionContext ?? "none"}`,
    `Customer question: ${request.question}`,
    `Recent conversation: ${JSON.stringify(request.messages)}`,
  ].join("\n");

  const response = await fetch(
    `${baseUrl.replace(/\/+$/, "")}/models/gemini-2.5-flash:generateContent`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
      }),
      signal: AbortSignal.timeout(45_000),
    },
  );
  if (!response.ok) {
    logger.error({ status: response.status }, "Vehicle assistant request failed");
    throw new Error("The vehicle assistant could not answer right now.");
  }
  const providerPayload = (await response.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = providerPayload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text ?? "")
    .join("")
    .trim();
  if (!text) throw new Error("The vehicle assistant returned an empty answer.");
  const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const parsed = vehicleChatOutputSchema.safeParse(JSON.parse(jsonText));
  if (!parsed.success) {
    logger.error({ issues: parsed.error.issues }, "Vehicle assistant response failed validation");
    throw new Error("The vehicle assistant returned an invalid answer.");
  }
  return {
    ...parsed.data,
    model: "gemini-2.5-flash",
    dataBasis:
      "Customer-provided vehicle facts plus general maintenance reference ranges; verify vehicle-specific details against the owner's manual or a qualified technician.",
  };
}

router.post("/inspection/session", (req, res) => {
  const parsed = z
    .object({ deviceId: z.string().trim().min(16).max(128) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A stable device id is required." });
    return;
  }
  try {
    res.json({ token: createDeviceToken(parsed.data.deviceId), expiresIn: 86400 });
  } catch (error) {
    logger.error({ error }, "Inspection session signing is unavailable");
    res.status(503).json({ error: "Inspection sessions are not available." });
  }
});

router.post("/inspection/analyze", requireAnalysisSession, async (req, res) => {
  const parsed = analysisRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Inspection media did not match the analysis contract." });
    return;
  }
  try {
    res.json(await analyzeWithVisionModel(parsed.data));
  } catch (error) {
    if (error instanceof VisionProviderNotConfigured) {
      res.status(503).json({ error: error.message, code: "VISION_PROVIDER_NOT_CONFIGURED" });
      return;
    }
    logger.error({ error }, "Inspection analysis failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "Inspection analysis failed." });
  }
});

router.post("/vehicle-chat", requireAnalysisSession, async (req, res) => {
  const parsed = vehicleChatRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "The vehicle assistant request was incomplete." });
    return;
  }
  try {
    res.json(await answerVehicleQuestion(parsed.data));
  } catch (error) {
    if (error instanceof VehicleAssistantNotConfigured) {
      res.status(503).json({ error: error.message, code: "VEHICLE_ASSISTANT_NOT_CONFIGURED" });
      return;
    }
    logger.error({ error }, "Vehicle assistant failed");
    res.status(502).json({ error: error instanceof Error ? error.message : "Vehicle assistant failed." });
  }
});

export default router;
