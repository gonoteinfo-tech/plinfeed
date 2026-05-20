import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { encryptSecret } from "../lib/crypto.js";
import { asyncHandler, requireTenant, validateBody } from "../lib/http.js";
import { testAiConnection } from "../services/ai.service.js";
const aiConfigSchema = z.object({
    provider: z.enum(["OPENAI", "GEMINI", "CUSTOM"]).default("OPENAI"),
    apiKey: z.string().min(1),
    model: z.string().min(1),
    temperature: z.number().min(0).max(2).default(0.7),
    maxArticleLength: z.number().int().min(500).max(20000).default(5000),
    toneOfVoice: z.string().default("Jornalistico profissional"),
    language: z.string().default("pt-BR"),
    globalPrompt: z.string().min(20),
    active: z.boolean().default(true)
});
export const settingsRoutes = Router();
settingsRoutes.get("/system", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const [aiConfigs, sites, feeds] = await Promise.all([
        prisma.aiConfig.findMany({ where: { tenantId }, select: { id: true, provider: true, model: true, active: true, updatedAt: true } }),
        prisma.site.count({ where: { tenantId } }),
        prisma.feed.count({ where: { tenantId } })
    ]);
    res.json({
        version: "0.1.0",
        database: "connected",
        queues: "redis-bullmq",
        aiConfigs,
        usage: { sites, feeds }
    });
}));
settingsRoutes.post("/ai", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const data = validateBody(aiConfigSchema, req.body);
    const config = await prisma.aiConfig.create({
        data: {
            tenantId,
            provider: data.provider,
            encryptedApiKey: encryptSecret(data.apiKey),
            model: data.model,
            temperature: data.temperature,
            maxArticleLength: data.maxArticleLength,
            toneOfVoice: data.toneOfVoice,
            language: data.language,
            globalPrompt: data.globalPrompt,
            active: data.active
        },
        select: { id: true, provider: true, model: true, temperature: true, active: true }
    });
    res.status(201).json({ config });
}));
settingsRoutes.get("/ai", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const configs = await prisma.aiConfig.findMany({
        where: { tenantId },
        orderBy: { updatedAt: "desc" },
        select: {
            id: true,
            provider: true,
            model: true,
            temperature: true,
            maxArticleLength: true,
            toneOfVoice: true,
            language: true,
            active: true,
            updatedAt: true
        }
    });
    res.json({ configs });
}));
settingsRoutes.post("/ai/test", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const configId = typeof req.body?.configId === "string" ? req.body.configId : undefined;
    const config = await prisma.aiConfig.findFirst({
        where: { tenantId, id: configId, active: true }
    });
    const result = await testAiConnection(config);
    res.status(result.ok ? 200 : 422).json(result);
}));
