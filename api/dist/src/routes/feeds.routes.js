import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, isDatabaseUnavailable, requireTenant, routeParam, validateBody } from "../lib/http.js";
import { enqueueFeedProcessing } from "../queues/content.queue.js";
const feedSchema = z.object({
    siteId: z.string().min(1),
    name: z.string().min(2),
    rssUrl: z.string().url(),
    wordpressCategory: z.string().optional(),
    status: z.enum(["ACTIVE", "INACTIVE", "PAUSED"]).default("ACTIVE"),
    autopublish: z.boolean().default(false),
    readFrequency: z.string().default("30m"),
    language: z.string().default("pt-BR"),
    niche: z.string().optional(),
    customPrompt: z.string().optional(),
    maxPostsPerRun: z.number().int().min(1).max(50).default(5),
    ignoreDuplicates: z.boolean().default(true),
    importFeaturedImage: z.boolean().default(true)
});
export const feedRoutes = Router();
const demoOfflineFeeds = [
    createDemoFeed({
        id: "offline-feed-1",
        siteId: "offline-site-1",
        name: "Tecnologia Global",
        rssUrl: "https://example.com/tech/rss",
        wordpressCategory: "Tecnologia",
        status: "ACTIVE",
        autopublish: true,
        readFrequency: "30m",
        language: "pt-BR",
        niche: "Tecnologia"
    }),
    createDemoFeed({
        id: "offline-feed-2",
        siteId: "offline-site-1",
        name: "Economia Matinal",
        rssUrl: "https://example.com/economia/rss",
        wordpressCategory: "Economia",
        status: "ACTIVE",
        autopublish: false,
        readFrequency: "1h",
        language: "pt-BR",
        niche: "Economia"
    }),
    createDemoFeed({
        id: "offline-feed-3",
        siteId: "offline-site-2",
        name: "Esportes Agora",
        rssUrl: "https://example.com/esportes/rss",
        wordpressCategory: "Esportes",
        status: "PAUSED",
        autopublish: false,
        readFrequency: "2h",
        language: "pt-BR",
        niche: "Esportes"
    })
];
function isDemoOfflineTenant(tenantId) {
    return tenantId === "demo-tenant";
}
function createDemoFeed(feed) {
    const now = new Date();
    return {
        tenantId: "demo-tenant",
        wordpressCategory: null,
        status: "ACTIVE",
        autopublish: false,
        readFrequency: "30m",
        language: "pt-BR",
        niche: null,
        customPrompt: null,
        maxPostsPerRun: 5,
        ignoreDuplicates: true,
        importFeaturedImage: true,
        lastRunAt: null,
        createdAt: now,
        updatedAt: now,
        ...feed
    };
}
function withDemoSite(feed) {
    const siteNames = {
        "offline-site-1": "Portal Prime",
        "offline-site-2": "Blog Arena",
        "offline-site-3": "Revista Clara"
    };
    return {
        ...feed,
        site: {
            id: feed.siteId,
            name: siteNames[feed.siteId] || "Site demo"
        }
    };
}
feedRoutes.get("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    if (isDemoOfflineTenant(tenantId)) {
        res.json({ feeds: demoOfflineFeeds.map(withDemoSite), mode: "demo-offline" });
        return;
    }
    try {
        const feeds = await prisma.feed.findMany({
            where: { tenantId },
            include: { site: { select: { id: true, name: true } } },
            orderBy: { createdAt: "desc" }
        });
        res.json({ feeds });
    }
    catch (error) {
        if (isDatabaseUnavailable(error)) {
            res.json({ feeds: demoOfflineFeeds.map(withDemoSite), mode: "demo-offline" });
            return;
        }
        throw error;
    }
}));
feedRoutes.post("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const data = validateBody(feedSchema, req.body);
    if (isDemoOfflineTenant(tenantId)) {
        const feed = createDemoFeed({
            id: `offline-feed-${Date.now()}`,
            tenantId,
            ...data,
            wordpressCategory: data.wordpressCategory || null,
            niche: data.niche || null,
            customPrompt: data.customPrompt || null
        });
        demoOfflineFeeds.unshift(feed);
        res.status(201).json({ feed: withDemoSite(feed), mode: "demo-offline" });
        return;
    }
    const feed = await prisma.feed.create({ data: { ...data, tenantId } });
    res.status(201).json({ feed });
}));
feedRoutes.post("/:id/process", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    if (isDemoOfflineTenant(tenantId)) {
        const feed = demoOfflineFeeds.find((item) => item.id === id);
        if (!feed) {
            res.status(404).json({ message: "Feed demo nao encontrado" });
            return;
        }
        feed.lastRunAt = new Date();
        feed.updatedAt = new Date();
        res.status(202).json({ message: "Feed processado em modo demo offline", jobId: `offline-${Date.now()}`, mode: "demo-offline" });
        return;
    }
    const feed = await prisma.feed.findFirstOrThrow({ where: { id, tenantId } });
    const job = await enqueueFeedProcessing({ tenantId, feedId: feed.id, maxPosts: feed.maxPostsPerRun });
    res.status(202).json({ message: "Feed enviado para processamento", jobId: job.id });
}));
feedRoutes.patch("/:id", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    const data = validateBody(feedSchema.partial(), req.body);
    if (isDemoOfflineTenant(tenantId)) {
        const index = demoOfflineFeeds.findIndex((item) => item.id === id);
        if (index === -1) {
            res.status(404).json({ message: "Feed demo nao encontrado" });
            return;
        }
        demoOfflineFeeds[index] = {
            ...demoOfflineFeeds[index],
            ...data,
            wordpressCategory: data.wordpressCategory === undefined ? demoOfflineFeeds[index].wordpressCategory : data.wordpressCategory || null,
            niche: data.niche === undefined ? demoOfflineFeeds[index].niche : data.niche || null,
            customPrompt: data.customPrompt === undefined ? demoOfflineFeeds[index].customPrompt : data.customPrompt || null,
            updatedAt: new Date()
        };
        res.json({ feed: withDemoSite(demoOfflineFeeds[index]), mode: "demo-offline" });
        return;
    }
    const feed = await prisma.feed.update({ where: { id, tenantId }, data });
    res.json({ feed });
}));
feedRoutes.delete("/:id", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    if (isDemoOfflineTenant(tenantId)) {
        const index = demoOfflineFeeds.findIndex((item) => item.id === id);
        if (index !== -1) {
            demoOfflineFeeds.splice(index, 1);
        }
        res.status(204).send();
        return;
    }
    await prisma.feed.delete({ where: { id, tenantId } });
    res.status(204).send();
}));
