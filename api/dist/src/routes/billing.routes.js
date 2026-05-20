import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, requireTenant } from "../lib/http.js";
export const billingRoutes = Router();
billingRoutes.get("/subscription", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const subscription = await prisma.subscription.findFirst({
        where: { tenantId },
        orderBy: { createdAt: "desc" }
    });
    const [sites, feeds, postsThisMonth] = await Promise.all([
        prisma.site.count({ where: { tenantId } }),
        prisma.feed.count({ where: { tenantId } }),
        prisma.post.count({ where: { tenantId, importedAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } })
    ]);
    res.json({
        subscription,
        usage: {
            sites,
            feeds,
            postsThisMonth
        },
        providersReady: ["stripe", "mercado_pago", "cakto"]
    });
}));
