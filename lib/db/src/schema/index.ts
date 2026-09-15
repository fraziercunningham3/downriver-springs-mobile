import { createInsertSchema } from "drizzle-zod";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";
export const shopUserRoleEnum = pgEnum("shop_user_role", ["customer", "staff"]);
export const workOrderStatusEnum = pgEnum("work_order_status", [
  "In progress",
  "Awaiting approval",
  "Ready for pickup",
]);

export const galleryMediaKindEnum = pgEnum("gallery_media_kind", ["photo", "video"]);
export const expertReviewStatusEnum = pgEnum("expert_review_status", [
  "pending",
  "in_review",
  "answered",
  "cancelled",
]);
export const expertReviewDeliveryEnum = pgEnum("expert_review_delivery", ["app", "email", "both"]);

export const shopUsers = pgTable(
  "shop_users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    phone: text("phone").notNull().default(""),
    passwordHash: text("password_hash").notNull(),
    passwordSalt: text("password_salt").notNull(),
    role: shopUserRoleEnum("role").notNull().default("customer"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    emailIndex: uniqueIndex("shop_users_email_idx").on(table.email),
  }),
);

export const expertReviewRequests = pgTable(
  "expert_review_requests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => shopUsers.id, { onDelete: "cascade" }),
    vin: text("vin").notNull(),
    vehicle: text("vehicle").notNull(),
    question: text("question").notNull(),
    pricingContext: text("pricing_context").notNull().default(""),
    media: jsonb("media").$type<Array<{ kind: "photo" | "video"; objectPath: string; fileName?: string }>>().notNull().default([]),
    status: expertReviewStatusEnum("status").notNull().default("pending"),
    deliveryMethod: expertReviewDeliveryEnum("delivery_method").notNull().default("both"),
    response: text("response"),
    staffNotes: text("staff_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    answeredAt: timestamp("answered_at", { withTimezone: true }),
  },
  (table) => ({
    customerIndex: index("expert_review_requests_customer_idx").on(table.customerId),
    statusIndex: index("expert_review_requests_status_idx").on(table.status),
  }),
);

export const shopVehicles = pgTable(
  "shop_vehicles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => shopUsers.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    plate: text("plate").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIndex: index("shop_vehicles_customer_idx").on(table.customerId),
  }),
);

export const shopWorkOrders = pgTable(
  "shop_work_orders",
  {
    id: text("id").primaryKey(),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => shopUsers.id, { onDelete: "cascade" }),
    vehicleId: uuid("vehicle_id")
      .notNull()
      .references(() => shopVehicles.id, { onDelete: "cascade" }),
    status: workOrderStatusEnum("status").notNull().default("In progress"),
    service: text("service").notNull(),
    progress: real("progress").notNull().default(0),
    eta: text("eta").notNull(),
    technician: text("technician").notNull(),
    note: text("note").notNull(),
    estimate: text("estimate").notNull(),
    approved: boolean("approved").notNull().default(false),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    customerIndex: index("shop_work_orders_customer_idx").on(table.customerId),
    vehicleIndex: index("shop_work_orders_vehicle_idx").on(table.vehicleId),
  }),
);

export const galleryUploads = pgTable(
  "gallery_uploads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => shopUsers.id, { onDelete: "cascade" }),
    objectPath: text("object_path").notNull(),
    thumbnailPath: text("thumbnail_path"),
    originalName: text("original_name").notNull(),
    title: text("title").notNull(),
    mediaKind: galleryMediaKindEnum("media_kind").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    ownerIndex: index("gallery_uploads_owner_idx").on(table.ownerId),
    createdAtIndex: index("gallery_uploads_created_at_idx").on(table.createdAt),
  }),
);
export const insertShopUserSchema = createInsertSchema(shopUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export const insertShopVehicleSchema = createInsertSchema(shopVehicles).omit({
  id: true,
  createdAt: true,
});
export const insertShopWorkOrderSchema = createInsertSchema(shopWorkOrders).omit({
  createdAt: true,
  updatedAt: true,
});

export const insertGalleryUploadSchema = createInsertSchema(galleryUploads).omit({
  id: true,
  createdAt: true,
});
export const insertExpertReviewRequestSchema = createInsertSchema(expertReviewRequests).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  answeredAt: true,
});

export type ShopUser = typeof shopUsers.$inferSelect;
export type ShopVehicle = typeof shopVehicles.$inferSelect;
export type ShopWorkOrder = typeof shopWorkOrders.$inferSelect;
export type InsertShopUser = z.infer<typeof insertShopUserSchema>;
export type InsertShopVehicle = z.infer<typeof insertShopVehicleSchema>;
export type InsertShopWorkOrder = z.infer<typeof insertShopWorkOrderSchema>;

export type GalleryUpload = typeof galleryUploads.$inferSelect;
export type ExpertReviewRequest = typeof expertReviewRequests.$inferSelect;
export type InsertExpertReviewRequest = z.infer<typeof insertExpertReviewRequestSchema>;

export type InsertGalleryUpload = z.infer<typeof insertGalleryUploadSchema>;
