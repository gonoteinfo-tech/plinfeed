import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, requireTenant, routeParam } from "../lib/http.js";
import { fetchWordPressAuthors, fetchWordPressCategories, testWordPressConnection } from "../services/wordpress.service.js";
export const wordpressRoutes = Router();
wordpressRoutes.get("/sites/:siteId/categories", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const siteId = routeParam(req, "siteId");
    const site = await prisma.site.findFirstOrThrow({ where: { id: siteId, tenantId } });
    const categories = await fetchWordPressCategories(site);
    res.json({ categories });
}));
wordpressRoutes.get("/sites/:siteId/authors", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const siteId = routeParam(req, "siteId");
    const site = await prisma.site.findFirstOrThrow({ where: { id: siteId, tenantId } });
    const authors = await fetchWordPressAuthors(site);
    res.json({ authors });
}));
wordpressRoutes.post("/sites/:siteId/test", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const siteId = routeParam(req, "siteId");
    const site = await prisma.site.findFirstOrThrow({ where: { id: siteId, tenantId } });
    const result = await testWordPressConnection(site);
    res.json(result);
}));
