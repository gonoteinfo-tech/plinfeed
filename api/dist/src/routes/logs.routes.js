import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, requireTenant, validateBody } from "../lib/http.js";
const logSchema = z.object({
    type: z.enum(["INFO", "SUCCESS", "WARNING", "ERROR"]).default("INFO"),
    feedId: z.string().optional(),
    postId: z.string().optional(),
    message: z.string().min(2),
    stack: z.string().optional(),
    metadata: z.record(z.unknown()).optional()
});
export const logRoutes = Router();
logRoutes.get("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const type = typeof req.query.type === "string" ? req.query.type : undefined;
    const logs = await prisma.executionLog.findMany({
        where: { tenantId, type: type && type !== "all" ? type : undefined },
        include: { feed: true, post: true },
        orderBy: { createdAt: "desc" },
        take: 200
    });
    res.json({ logs });
}));
logRoutes.post("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const data = validateBody(logSchema, req.body);
    const log = await prisma.executionLog.create({
        data: {
            ...data,
            tenantId,
            metadata: data.metadata
        }
    });
    res.status(201).json({ log });
}));
