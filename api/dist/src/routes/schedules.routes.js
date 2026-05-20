import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, requireTenant, routeParam, validateBody } from "../lib/http.js";
import { enqueueFeedProcessing } from "../queues/content.queue.js";
const scheduleSchema = z.object({
    siteId: z.string().min(1),
    feedId: z.string().min(1),
    frequency: z.enum(["MINUTES", "FIXED_TIME", "DAILY", "WEEKLY"]).default("MINUTES"),
    intervalMinutes: z.number().int().min(5).optional(),
    fixedTime: z.string().optional(),
    weekdays: z.array(z.string()).default([]),
    maxPostsPerRun: z.number().int().min(1).max(50).default(5),
    active: z.boolean().default(true)
});
export const scheduleRoutes = Router();
scheduleRoutes.get("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const schedules = await prisma.schedule.findMany({
        where: { tenantId },
        include: { feed: true, site: true },
        orderBy: { createdAt: "desc" }
    });
    res.json({ schedules });
}));
scheduleRoutes.post("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const data = validateBody(scheduleSchema, req.body);
    const schedule = await prisma.schedule.create({
        data: {
            ...data,
            tenantId,
            nextRunAt: data.frequency === "MINUTES" ? new Date(Date.now() + (data.intervalMinutes || 30) * 60_000) : undefined
        }
    });
    res.status(201).json({ schedule });
}));
scheduleRoutes.post("/:id/test", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    const schedule = await prisma.schedule.findFirstOrThrow({ where: { id, tenantId } });
    const job = await enqueueFeedProcessing({ tenantId, feedId: schedule.feedId, maxPosts: schedule.maxPostsPerRun });
    res.status(202).json({ message: "Agendamento enviado para teste", jobId: job.id });
}));
scheduleRoutes.patch("/:id", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    const data = validateBody(scheduleSchema.partial(), req.body);
    const schedule = await prisma.schedule.update({ where: { id, tenantId }, data });
    res.json({ schedule });
}));
scheduleRoutes.delete("/:id", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    await prisma.schedule.delete({ where: { id, tenantId } });
    res.status(204).send();
}));
