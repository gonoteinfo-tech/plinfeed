import { Router } from "express";
import sanitizeHtml from "sanitize-html";
import slugify from "slugify";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, requireTenant, routeParam, validateBody } from "../lib/http.js";
import { enqueuePostGeneration, enqueuePostPublishing } from "../queues/content.queue.js";
const postUpdateSchema = z.object({
    title: z.string().min(2).optional(),
    slug: z.string().min(2).optional(),
    summary: z.string().optional(),
    contentHtml: z.string().optional(),
    metaTitle: z.string().optional(),
    metaDescription: z.string().max(180).optional(),
    tags: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
    category: z.string().optional(),
    featuredImageUrl: z.string().url().optional(),
    featuredImageAlt: z.string().optional(),
    status: z.enum(["DRAFT", "PENDING_REVIEW", "PUBLISHED", "ERROR"]).optional()
});
export const postRoutes = Router();
postRoutes.get("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const { status, feedId, siteId, keyword } = req.query;
    const posts = await prisma.post.findMany({
        where: {
            tenantId,
            status: typeof status === "string" && status !== "all" ? status : undefined,
            feedId: typeof feedId === "string" ? feedId : undefined,
            siteId: typeof siteId === "string" ? siteId : undefined,
            title: typeof keyword === "string" ? { contains: keyword, mode: "insensitive" } : undefined
        },
        include: { feed: true, site: true },
        orderBy: { importedAt: "desc" },
        take: 100
    });
    res.json({ posts });
}));
postRoutes.get("/:id", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    const post = await prisma.post.findFirstOrThrow({
        where: { id, tenantId },
        include: { feed: true, site: true, rawNews: true, images: true, logs: { orderBy: { createdAt: "desc" } } }
    });
    res.json({ post });
}));
postRoutes.patch("/:id", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    const data = validateBody(postUpdateSchema, req.body);
    const post = await prisma.post.update({
        where: { id, tenantId },
        data: {
            ...data,
            slug: data.slug ? slugify(data.slug, { lower: true, strict: true }) : undefined,
            contentHtml: data.contentHtml ? sanitizeHtml(data.contentHtml) : undefined
        }
    });
    res.json({ post });
}));
postRoutes.post("/:id/regenerate", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    const post = await prisma.post.findFirstOrThrow({ where: { id, tenantId } });
    const job = await enqueuePostGeneration({ tenantId, postId: post.id });
    res.status(202).json({ message: "Post reenviado para IA", jobId: job.id });
}));
postRoutes.post("/:id/publish", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    const post = await prisma.post.findFirstOrThrow({ where: { id, tenantId } });
    const job = await enqueuePostPublishing({ tenantId, postId: post.id });
    res.status(202).json({ message: "Post enviado para publicacao", jobId: job.id });
}));
postRoutes.delete("/:id", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    await prisma.post.delete({ where: { id, tenantId } });
    res.status(204).send();
}));
