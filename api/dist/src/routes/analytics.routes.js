import { Router } from "express";
import { subDays } from "date-fns";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, requireTenant } from "../lib/http.js";
export const analyticsRoutes = Router();
analyticsRoutes.get("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const since = subDays(new Date(), 30);
    const [postsByStatus, postsByFeed, latestErrors, executions] = await Promise.all([
        prisma.post.groupBy({ by: ["status"], where: { tenantId, importedAt: { gte: since } }, _count: { id: true } }),
        prisma.post.groupBy({ by: ["feedId"], where: { tenantId, importedAt: { gte: since }, feedId: { not: null } }, _count: { id: true } }),
        prisma.executionLog.findMany({ where: { tenantId, type: "ERROR" }, orderBy: { createdAt: "desc" }, take: 10 }),
        prisma.executionLog.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" }, take: 30 })
    ]);
    const totalPosts = postsByStatus.reduce((sum, item) => sum + item._count.id, 0);
    const errors = postsByStatus.find((item) => item.status === "ERROR")?._count.id || 0;
    res.json({
        totalPosts,
        errorRate: totalPosts ? Number(((errors / totalPosts) * 100).toFixed(2)) : 0,
        postsByStatus,
        postsByFeed,
        latestErrors,
        executions
    });
}));
