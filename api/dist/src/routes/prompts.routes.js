import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, requireTenant, routeParam, validateBody } from "../lib/http.js";
const promptSchema = z.object({
    siteId: z.string().optional(),
    feedId: z.string().optional(),
    name: z.string().min(2),
    scope: z.enum(["global", "site", "feed", "title", "summary", "seo", "image"]),
    content: z.string().min(20),
    active: z.boolean().default(true)
});
export const promptRoutes = Router();
promptRoutes.get("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const prompts = await prisma.promptTemplate.findMany({ where: { tenantId }, orderBy: { updatedAt: "desc" } });
    res.json({ prompts });
}));
promptRoutes.post("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const data = validateBody(promptSchema, req.body);
    const prompt = await prisma.promptTemplate.create({ data: { ...data, tenantId } });
    res.status(201).json({ prompt });
}));
promptRoutes.patch("/:id", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    const data = validateBody(promptSchema.partial(), req.body);
    const prompt = await prisma.promptTemplate.update({ where: { id, tenantId }, data });
    res.json({ prompt });
}));
promptRoutes.delete("/:id", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    await prisma.promptTemplate.delete({ where: { id, tenantId } });
    res.status(204).send();
}));
