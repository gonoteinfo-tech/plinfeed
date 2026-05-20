import { Router } from "express";
import { subDays, startOfDay } from "date-fns";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, requireTenant } from "../lib/http.js";
export const dashboardRoutes = Router();
dashboardRoutes.get("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const today = startOfDay(new Date());
    const [totalFeeds, activeFeeds, postsToday, posts7, posts30, published, drafts, errors, recentLogs, latestPosts, nextSchedule] = await Promise.all([
        prisma.feed.count({ where: { tenantId } }),
        prisma.feed.count({ where: { tenantId, status: "ACTIVE" } }),
        prisma.post.count({ where: { tenantId, importedAt: { gte: today } } }),
        prisma.post.count({ where: { tenantId, importedAt: { gte: subDays(new Date(), 7) } } }),
        prisma.post.count({ where: { tenantId, importedAt: { gte: subDays(new Date(), 30) } } }),
        prisma.post.count({ where: { tenantId, status: "PUBLISHED" } }),
        prisma.post.count({ where: { tenantId, status: "DRAFT" } }),
        prisma.post.count({ where: { tenantId, status: "ERROR" } }),
        prisma.executionLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 8 }),
        prisma.post.findMany({ where: { tenantId }, include: { feed: true, site: true }, orderBy: { importedAt: "desc" }, take: 8 }),
        prisma.schedule.findFirst({ where: { tenantId, active: true, nextRunAt: { not: null } }, orderBy: { nextRunAt: "asc" }, include: { feed: true } })
    ]);
    res.json({
        metrics: { totalFeeds, activeFeeds, postsToday, posts7, posts30, published, drafts, errors },
        recentLogs,
        latestPosts,
        nextSchedule
    });
}));
