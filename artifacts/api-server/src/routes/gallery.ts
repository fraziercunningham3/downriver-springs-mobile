import { Readable } from "node:stream";
import { and, desc, eq } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import { db, galleryUploads, type GalleryUpload } from "@workspace/db";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { getShopAuth, type ShopAuthPayload } from "../lib/shopAuth";

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();
const mediaKindSchema = z.enum(["photo", "video"]);
const uploadUrlRequestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(200_000_000),
  contentType: z.string().trim().regex(/^(image|video)\/[a-z0-9.+-]+$/i),
});
const galleryCreateSchema = z.object({
  objectPath: z.string().regex(/^\/objects\/uploads\/[a-zA-Z0-9-]+$/),
  thumbnailPath: z.string().regex(/^\/objects\/uploads\/[a-zA-Z0-9-]+$/).optional(),
  originalName: z.string().trim().min(1).max(255),
  title: z.string().trim().min(1).max(120),
  mediaKind: mediaKindSchema,
  contentType: z.string().trim().regex(/^(image|video)\/[a-z0-9.+-]+$/i),
  size: z.number().int().positive().max(200_000_000),
});
const idSchema = z.string().uuid();

async function requireShopAuth(req: Request, res: Response) {
  const auth = await getShopAuth(req);
  if (!auth) {
    res.status(401).json({ error: "A valid shop account session is required." });
    return null;
  }
  return auth;
}

function serializeUpload(upload: GalleryUpload) {
  return {
    id: upload.id,
    ownerId: upload.ownerId,
    originalName: upload.originalName,
    title: upload.title,
    mediaKind: upload.mediaKind,
    contentType: upload.contentType,
    size: upload.size,
    createdAt: upload.createdAt.toISOString(),
    mediaUrl: `/api/gallery/${upload.id}/media`,
    thumbnailUrl: `/api/gallery/${upload.id}/thumbnail`,
  };
}

async function getVisibleUpload(id: string, auth: ShopAuthPayload) {
  const [upload] = await db
    .select()
    .from(galleryUploads)
    .where(
      auth.role === "staff"
        ? eq(galleryUploads.id, id)
        : and(eq(galleryUploads.id, id), eq(galleryUploads.ownerId, auth.userId)),
    )
    .limit(1);
  return upload;
}

async function streamObject(res: Response, objectPath: string) {
  const file = await objectStorageService.getObjectEntityFile(objectPath);
  const response = await objectStorageService.downloadObject(file, 3600);
  res.status(response.status);
  response.headers.forEach((value, key) => res.setHeader(key, value));
  if (response.body) {
    Readable.fromWeb(response.body as ReadableStream<Uint8Array>).pipe(res);
  } else {
    res.end();
  }
}

router.post("/gallery/uploads/request-url", async (req, res) => {
  const auth = await requireShopAuth(req, res);
  if (!auth) return;
  const parsed = uploadUrlRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid image or video name, size, and content type." });
    return;
  }

  try {
    const uploadURL = await objectStorageService.getObjectEntityUploadURL();
    const objectPath = objectStorageService.normalizeObjectEntityPath(uploadURL);
    res.json({ uploadURL, objectPath, metadata: parsed.data });
  } catch (error) {
    req.log.error({ err: error, userId: auth.userId }, "Gallery upload URL request failed");
    res.status(500).json({ error: "We could not prepare gallery storage right now." });
  }
});

router.get("/gallery", async (req, res) => {
  const auth = await requireShopAuth(req, res);
  if (!auth) return;
  try {
    const uploads = await db
      .select()
      .from(galleryUploads)
      .where(auth.role === "staff" ? undefined : eq(galleryUploads.ownerId, auth.userId))
      .orderBy(desc(galleryUploads.createdAt));
    res.json({ uploads: uploads.map(serializeUpload) });
  } catch (error) {
    req.log.error({ err: error, userId: auth.userId }, "Gallery listing failed");
    res.status(500).json({ error: "We could not load the gallery right now." });
  }
});

router.post("/gallery", async (req, res) => {
  const auth = await requireShopAuth(req, res);
  if (!auth) return;
  const parsed = galleryCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Gallery metadata is incomplete or invalid." });
    return;
  }

  try {
    await objectStorageService.getObjectEntityFile(parsed.data.objectPath);
    if (parsed.data.thumbnailPath) {
      await objectStorageService.getObjectEntityFile(parsed.data.thumbnailPath);
    }
    const [upload] = await db
      .insert(galleryUploads)
      .values({
        ...parsed.data,
        title: parsed.data.title.trim(),
        originalName: parsed.data.originalName.trim(),
        ownerId: auth.userId,
      })
      .returning();
    res.status(201).json({ upload: serializeUpload(upload) });
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "The uploaded gallery file was not found." });
      return;
    }
    req.log.error({ err: error, userId: auth.userId }, "Gallery metadata creation failed");
    res.status(500).json({ error: "We could not save this gallery upload." });
  }
});

router.delete("/gallery/:id", async (req, res) => {
  const auth = await requireShopAuth(req, res);
  if (!auth) return;
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(404).json({ error: "Gallery upload not found." });
    return;
  }

  const [upload] = await db
    .select()
    .from(galleryUploads)
    .where(and(eq(galleryUploads.id, parsedId.data), eq(galleryUploads.ownerId, auth.userId)))
    .limit(1);
  if (!upload) {
    const [existing] = await db
      .select({ id: galleryUploads.id })
      .from(galleryUploads)
      .where(eq(galleryUploads.id, parsedId.data))
      .limit(1);
    res.status(existing ? 403 : 404).json({
      error: existing ? "Only the upload owner can delete this gallery item." : "Gallery upload not found.",
    });
    return;
  }

  try {
    await db.delete(galleryUploads).where(eq(galleryUploads.id, upload.id));
    await Promise.all(
      [upload.objectPath, upload.thumbnailPath]
        .filter((path): path is string => Boolean(path))
        .map(async (path) => {
          try {
            const file = await objectStorageService.getObjectEntityFile(path);
            await file.delete({ ignoreNotFound: true });
          } catch (error) {
            req.log.warn({ err: error, objectPath: path }, "Gallery object cleanup failed");
          }
        }),
    );
    res.status(204).end();
  } catch (error) {
    req.log.error({ err: error, userId: auth.userId }, "Gallery deletion failed");
    res.status(500).json({ error: "We could not remove this gallery upload." });
  }
});

async function serveGalleryObject(req: Request, res: Response, thumbnail: boolean) {
  const auth = await requireShopAuth(req, res);
  if (!auth) return;
  const parsedId = idSchema.safeParse(req.params.id);
  if (!parsedId.success) {
    res.status(404).json({ error: "Gallery media not found." });
    return;
  }

  try {
    const upload = await getVisibleUpload(parsedId.data, auth);
    const objectPath = thumbnail ? upload?.thumbnailPath ?? upload?.objectPath : upload?.objectPath;
    if (!objectPath) {
      res.status(404).json({ error: "Gallery media not found." });
      return;
    }
    await streamObject(res, objectPath);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Gallery media not found." });
      return;
    }
    req.log.error({ err: error, userId: auth.userId }, "Gallery media streaming failed");
    res.status(500).json({ error: "We could not load this gallery media." });
  }
}

router.get("/gallery/:id/media", (req, res) => serveGalleryObject(req, res, false));
router.get("/gallery/:id/thumbnail", (req, res) => serveGalleryObject(req, res, true));

export default router;