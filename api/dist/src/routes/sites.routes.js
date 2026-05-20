import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { encryptSecret } from "../lib/crypto.js";
import { asyncHandler, isDatabaseUnavailable, requireTenant, routeParam, validateBody } from "../lib/http.js";
import { testWordPressConnection } from "../services/wordpress.service.js";
const siteSchema = z.object({
    name: z.string().min(2),
    wordpressUrl: z.string().url(),
    apiUsername: z.string().min(1),
    apiSecret: z.string().min(1),
    defaultCategory: z.string().optional(),
    defaultAuthor: z.string().optional(),
    publishMode: z.enum(["AUTO", "DRAFT", "REVIEW"]).default("DRAFT")
});
export const siteRoutes = Router();
const demoOfflineSites = [
    createDemoSite({
        id: "offline-site-1",
        name: "Portal Prime",
        wordpressUrl: "https://portalprime.com.br",
        apiUsername: "demo",
        encryptedApiSecret: encryptSecret("demo"),
        status: "CONNECTED",
        defaultCategory: "Noticias",
        defaultAuthor: "Redacao AutoNews",
        publishMode: "DRAFT"
    }),
    createDemoSite({
        id: "offline-site-2",
        name: "Blog Arena",
        wordpressUrl: "https://blogarena.com.br",
        apiUsername: "demo",
        encryptedApiSecret: encryptSecret("demo"),
        status: "CONNECTED",
        defaultCategory: "Esportes",
        defaultAuthor: "Editor",
        publishMode: "REVIEW"
    }),
    createDemoSite({
        id: "offline-site-3",
        name: "Revista Clara",
        wordpressUrl: "https://revistaclara.com.br",
        apiUsername: "demo",
        encryptedApiSecret: encryptSecret("demo"),
        status: "WARNING",
        defaultCategory: "Saude",
        defaultAuthor: "Redacao",
        publishMode: "DRAFT"
    })
];
function isDemoOfflineTenant(tenantId) {
    return tenantId === "demo-tenant";
}
function createDemoSite(site) {
    const now = new Date();
    return {
        tenantId: "demo-tenant",
        status: "DISCONNECTED",
        defaultCategory: null,
        defaultAuthor: null,
        publishMode: "DRAFT",
        adsenseCode: null,
        adsBeforeContent: false,
        adsMiddleContent: false,
        adsAfterContent: false,
        adsEnabled: false,
        createdAt: now,
        updatedAt: now,
        ...site
    };
}
function safeSite(site) {
    const { encryptedApiSecret: _secret, ...publicSite } = site;
    return publicSite;
}
siteRoutes.get("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    if (isDemoOfflineTenant(tenantId)) {
        res.json({ sites: demoOfflineSites.map(safeSite), mode: "demo-offline" });
        return;
    }
    try {
        const sites = await prisma.site.findMany({ where: { tenantId }, orderBy: { createdAt: "desc" } });
        res.json({ sites: sites.map(safeSite) });
    }
    catch (error) {
        if (isDatabaseUnavailable(error)) {
            res.json({ sites: demoOfflineSites.map(safeSite), mode: "demo-offline" });
            return;
        }
        throw error;
    }
}));
siteRoutes.post("/", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const data = validateBody(siteSchema, req.body);
    if (isDemoOfflineTenant(tenantId)) {
        const site = createDemoSite({
            id: `offline-site-${Date.now()}`,
            tenantId,
            name: data.name,
            wordpressUrl: data.wordpressUrl,
            apiUsername: data.apiUsername,
            encryptedApiSecret: encryptSecret(data.apiSecret),
            defaultCategory: data.defaultCategory || null,
            defaultAuthor: data.defaultAuthor || null,
            publishMode: data.publishMode,
            status: "DISCONNECTED"
        });
        demoOfflineSites.unshift(site);
        res.status(201).json({ site: safeSite(site), mode: "demo-offline" });
        return;
    }
    const site = await prisma.site.create({
        data: {
            tenantId,
            name: data.name,
            wordpressUrl: data.wordpressUrl,
            apiUsername: data.apiUsername,
            encryptedApiSecret: encryptSecret(data.apiSecret),
            defaultCategory: data.defaultCategory,
            defaultAuthor: data.defaultAuthor,
            publishMode: data.publishMode,
            status: "DISCONNECTED"
        }
    });
    res.status(201).json({ site: safeSite(site) });
}));
siteRoutes.post("/:id/test", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    if (isDemoOfflineTenant(tenantId)) {
        const site = demoOfflineSites.find((item) => item.id === id);
        if (!site) {
            res.status(404).json({ message: "Site demo nao encontrado" });
            return;
        }
        const result = await testWordPressConnection(site);
        site.status = result.ok ? "CONNECTED" : "WARNING";
        site.updatedAt = new Date();
        res.json({ ok: result.ok, message: result.message, site: safeSite(site), mode: "demo-offline" });
        return;
    }
    const site = await prisma.site.findFirstOrThrow({ where: { id, tenantId } });
    const result = await testWordPressConnection(site);
    const updated = await prisma.site.update({
        where: { id: site.id },
        data: { status: result.ok ? "CONNECTED" : "WARNING" }
    });
    res.json({ ok: result.ok, message: result.message, site: safeSite(updated) });
}));
siteRoutes.patch("/:id", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    const data = validateBody(siteSchema.partial(), req.body);
    if (isDemoOfflineTenant(tenantId)) {
        const index = demoOfflineSites.findIndex((item) => item.id === id);
        if (index === -1) {
            res.status(404).json({ message: "Site demo nao encontrado" });
            return;
        }
        demoOfflineSites[index] = {
            ...demoOfflineSites[index],
            ...data,
            encryptedApiSecret: data.apiSecret ? encryptSecret(data.apiSecret) : demoOfflineSites[index].encryptedApiSecret,
            updatedAt: new Date()
        };
        res.json({ site: safeSite(demoOfflineSites[index]), mode: "demo-offline" });
        return;
    }
    const site = await prisma.site.update({
        where: { id, tenantId },
        data: {
            ...data,
            encryptedApiSecret: data.apiSecret ? encryptSecret(data.apiSecret) : undefined
        }
    });
    res.json({ site: safeSite(site) });
}));
siteRoutes.delete("/:id", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const id = routeParam(req, "id");
    if (isDemoOfflineTenant(tenantId)) {
        const index = demoOfflineSites.findIndex((item) => item.id === id);
        if (index !== -1) {
            demoOfflineSites.splice(index, 1);
        }
        res.status(204).send();
        return;
    }
    await prisma.site.delete({ where: { id, tenantId } });
    res.status(204).send();
}));
