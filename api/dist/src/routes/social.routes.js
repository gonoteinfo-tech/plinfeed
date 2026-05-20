import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { asyncHandler, isDatabaseUnavailable, requireTenant } from "../lib/http.js";
import { getOfflineSocialConnection } from "../lib/offline-social-store.js";
import { fetchFacebookAssets } from "../services/meta.service.js";
export const socialRoutes = Router();
socialRoutes.get("/facebook/status", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const offline = getOfflineSocialConnection(tenantId, "facebook");
    if (offline) {
        res.json({
            connected: true,
            mode: "demo-offline",
            connection: {
                provider: offline.provider,
                providerUserId: offline.providerUserId,
                name: offline.name,
                email: offline.email,
                expiresAt: offline.expiresAt,
                scopes: offline.scopes
            }
        });
        return;
    }
    try {
        const connection = await prisma.socialConnection.findFirst({
            where: { tenantId, provider: "facebook" },
            orderBy: { updatedAt: "desc" },
            select: {
                provider: true,
                providerUserId: true,
                name: true,
                email: true,
                expiresAt: true,
                scopes: true,
                updatedAt: true
            }
        });
        res.json({ connected: Boolean(connection), connection });
    }
    catch (error) {
        if (isDatabaseUnavailable(error)) {
            res.json({ connected: false, mode: "demo-offline" });
            return;
        }
        throw error;
    }
}));
socialRoutes.get("/facebook/pages", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const offline = getOfflineSocialConnection(tenantId, "facebook");
    if (offline) {
        const assets = await fetchFacebookAssets(offline);
        res.json({ ...assets, mode: "demo-offline" });
        return;
    }
    try {
        const connection = await prisma.socialConnection.findFirst({
            where: { tenantId, provider: "facebook" },
            orderBy: { updatedAt: "desc" }
        });
        if (!connection) {
            res.json({ pages: [], connected: false });
            return;
        }
        const assets = await fetchFacebookAssets(connection);
        res.json({ ...assets, connected: true });
    }
    catch (error) {
        if (isDatabaseUnavailable(error)) {
            res.json({ pages: [], connected: false, mode: "demo-offline" });
            return;
        }
        throw error;
    }
}));
socialRoutes.get("/facebook/instagram", asyncHandler(async (req, res) => {
    const tenantId = requireTenant(req);
    const offline = getOfflineSocialConnection(tenantId, "facebook");
    if (offline) {
        const assets = await fetchFacebookAssets(offline);
        res.json({
            instagramAccounts: assets.pages.filter((page) => page.instagram).map((page) => ({ page, instagram: page.instagram })),
            mode: "demo-offline"
        });
        return;
    }
    try {
        const connection = await prisma.socialConnection.findFirst({
            where: { tenantId, provider: "facebook" },
            orderBy: { updatedAt: "desc" }
        });
        if (!connection) {
            res.json({ instagramAccounts: [], connected: false });
            return;
        }
        const assets = await fetchFacebookAssets(connection);
        res.json({
            instagramAccounts: assets.pages.filter((page) => page.instagram).map((page) => ({ page, instagram: page.instagram })),
            connected: true
        });
    }
    catch (error) {
        if (isDatabaseUnavailable(error)) {
            res.json({ instagramAccounts: [], connected: false, mode: "demo-offline" });
            return;
        }
        throw error;
    }
}));
