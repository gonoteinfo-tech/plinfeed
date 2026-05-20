import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import slugify from "slugify";
import { z } from "zod";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { ApiError, asyncHandler, isDatabaseUnavailable, validateBody } from "../lib/http.js";
import { authMiddleware } from "../middleware/auth.js";
import { buildFacebookLoginUrl, buildStoredFacebookConnection, exchangeFacebookCode, fetchFacebookProfile, verifyFacebookState } from "../services/meta.service.js";
import { saveOfflineSocialConnection } from "../lib/offline-social-store.js";
const registerSchema = z.object({
    name: z.string().min(2),
    company: z.string().min(2),
    email: z.string().email(),
    password: z.string().min(8)
});
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(1)
});
const updateProfileSchema = z.object({
    name: z.string().min(2).optional(),
    avatarUrl: z.string().url().optional()
});
const changePasswordSchema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8)
});
function signSession(userId, tenantId, role) {
    return jwt.sign({ sub: userId, tenantId, role }, env.JWT_SECRET, { expiresIn: "7d" });
}
function demoLoginResponse(email) {
    const token = signSession("demo-user", "demo-tenant", "ADMIN");
    return {
        token,
        user: { id: "demo-user", name: "Admin Demo", email, role: "ADMIN" },
        tenant: { id: "demo-tenant", name: "AutoNews Demo" },
        mode: "demo-offline"
    };
}
export const authRoutes = Router();
authRoutes.post("/register", asyncHandler(async (req, res) => {
    const data = validateBody(registerSchema, req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
        throw new ApiError(409, "Email ja cadastrado");
    }
    const passwordHash = await bcrypt.hash(data.password, 12);
    const slug = `${slugify(data.company, { lower: true, strict: true })}-${Date.now().toString(36)}`;
    const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                name: data.name,
                email: data.email,
                passwordHash
            }
        });
        const tenant = await tx.tenant.create({
            data: {
                name: data.company,
                slug,
                members: {
                    create: {
                        userId: user.id,
                        role: "ADMIN"
                    }
                },
                subscriptions: {
                    create: {
                        userId: user.id,
                        plan: "Basico",
                        siteLimit: 1,
                        feedLimit: 5,
                        monthlyPostLimit: 200
                    }
                }
            }
        });
        return { user, tenant };
    });
    const token = signSession(result.user.id, result.tenant.id, "ADMIN");
    res.status(201).json({
        token,
        user: { id: result.user.id, name: result.user.name, email: result.user.email },
        tenant: { id: result.tenant.id, name: result.tenant.name }
    });
}));
authRoutes.post("/login", asyncHandler(async (req, res) => {
    const data = validateBody(loginSchema, req.body);
    const email = data.email.toLowerCase();
    try {
        const user = await prisma.user.findUnique({
            where: { email },
            include: { memberships: { include: { tenant: true }, take: 1 } }
        });
        if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) {
            throw new ApiError(401, "Email ou senha invalidos");
        }
        const membership = user.memberships[0];
        if (!membership) {
            throw new ApiError(403, "Usuario sem workspace ativo");
        }
        const token = signSession(user.id, membership.tenantId, membership.role);
        res.json({
            token,
            user: { id: user.id, name: user.name, email: user.email, role: membership.role },
            tenant: { id: membership.tenant.id, name: membership.tenant.name }
        });
    }
    catch (error) {
        if (isDatabaseUnavailable(error) && email === "admin@autonews.ai" && data.password === "Admin123!") {
            res.json(demoLoginResponse(email));
            return;
        }
        throw error;
    }
}));
authRoutes.get("/facebook/url", asyncHandler(async (req, res) => {
    const redirectTo = typeof req.query.redirectTo === "string" ? req.query.redirectTo : "/dashboard/social";
    res.json({ url: buildFacebookLoginUrl(redirectTo) });
}));
authRoutes.get("/facebook/callback", asyncHandler(async (req, res) => {
    const code = typeof req.query.code === "string" ? req.query.code : undefined;
    const state = typeof req.query.state === "string" ? req.query.state : undefined;
    if (!code || !state) {
        throw new ApiError(400, "Retorno OAuth invalido.");
    }
    const statePayload = verifyFacebookState(state);
    const token = await exchangeFacebookCode(code);
    const profile = await fetchFacebookProfile(token.access_token);
    try {
        const session = await prisma.$transaction(async (tx) => {
            const email = profile.email || `facebook_${profile.id}@facebook.local`;
            const existingUser = await tx.user.findUnique({
                where: { email },
                include: { memberships: { include: { tenant: true }, take: 1 } }
            });
            if (existingUser?.memberships[0]) {
                const membership = existingUser.memberships[0];
                await tx.socialConnection.upsert({
                    where: {
                        tenantId_provider_providerUserId: {
                            tenantId: membership.tenantId,
                            provider: "facebook",
                            providerUserId: profile.id
                        }
                    },
                    create: {
                        ...buildStoredFacebookConnection({
                            tenantId: membership.tenantId,
                            userId: existingUser.id,
                            profile,
                            token
                        }),
                        metadata: buildStoredFacebookConnection({
                            tenantId: membership.tenantId,
                            userId: existingUser.id,
                            profile,
                            token
                        }).metadata
                    },
                    update: {
                        name: profile.name,
                        email: profile.email,
                        accessTokenEncrypted: buildStoredFacebookConnection({
                            tenantId: membership.tenantId,
                            userId: existingUser.id,
                            profile,
                            token
                        }).accessTokenEncrypted,
                        tokenType: token.token_type || "bearer",
                        expiresAt: token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null,
                        scopes: buildStoredFacebookConnection({
                            tenantId: membership.tenantId,
                            userId: existingUser.id,
                            profile,
                            token
                        }).scopes,
                        metadata: buildStoredFacebookConnection({
                            tenantId: membership.tenantId,
                            userId: existingUser.id,
                            profile,
                            token
                        }).metadata
                    }
                });
                return {
                    user: existingUser,
                    tenant: membership.tenant,
                    role: membership.role
                };
            }
            const createdUser = await tx.user.create({
                data: {
                    name: profile.name || "Usuario Facebook",
                    email,
                    passwordHash: await bcrypt.hash(`facebook:${profile.id}:${Date.now()}`, 12)
                }
            });
            const tenant = await tx.tenant.create({
                data: {
                    name: `Workspace ${profile.name || "Facebook"}`,
                    slug: `facebook-${profile.id}-${Date.now().toString(36)}`,
                    members: {
                        create: {
                            userId: createdUser.id,
                            role: "ADMIN"
                        }
                    },
                    subscriptions: {
                        create: {
                            userId: createdUser.id,
                            plan: "Basico",
                            siteLimit: 1,
                            feedLimit: 5,
                            monthlyPostLimit: 200
                        }
                    }
                }
            });
            const connection = buildStoredFacebookConnection({
                tenantId: tenant.id,
                userId: createdUser.id,
                profile,
                token
            });
            await tx.socialConnection.create({
                data: {
                    ...connection,
                    metadata: connection.metadata
                }
            });
            return {
                user: createdUser,
                tenant,
                role: "ADMIN"
            };
        });
        const appToken = signSession(session.user.id, session.tenant.id, session.role);
        res.type("html").send(buildOAuthCallbackHtml(appToken, statePayload.redirectTo));
    }
    catch (error) {
        if (isDatabaseUnavailable(error)) {
            const connection = buildStoredFacebookConnection({
                tenantId: "demo-tenant",
                userId: "demo-user",
                profile,
                token
            });
            saveOfflineSocialConnection(connection);
            const appToken = signSession("demo-user", "demo-tenant", "ADMIN");
            res.type("html").send(buildOAuthCallbackHtml(appToken, statePayload.redirectTo));
            return;
        }
        throw error;
    }
}));
function buildOAuthCallbackHtml(token, redirectTo) {
    const safeRedirect = redirectTo.startsWith("/") ? redirectTo : "/dashboard/social";
    return `<!doctype html>
<html lang="pt-BR">
  <head><meta charset="utf-8"><title>Facebook conectado</title></head>
  <body>
    <script>
      localStorage.setItem("autonews_token", ${JSON.stringify(token)});
      window.location.replace(${JSON.stringify(`${env.APP_FRONTEND_URL || env.CORS_ORIGIN}${safeRedirect}`)});
    </script>
  </body>
</html>`;
}
authRoutes.post("/forgot-password", asyncHandler(async (req, res) => {
    const { email } = validateBody(z.object({ email: z.string().email() }), req.body);
    res.json({ message: `Se ${email} existir, enviaremos instrucoes de recuperacao.` });
}));
authRoutes.get("/me", authMiddleware, asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
        where: { id: req.user.userId },
        select: { id: true, name: true, email: true, avatarUrl: true, memberships: { where: { tenantId: req.user.tenantId } } }
    });
    res.json({ user });
}));
authRoutes.patch("/profile", authMiddleware, asyncHandler(async (req, res) => {
    const data = validateBody(updateProfileSchema, req.body);
    const user = await prisma.user.update({
        where: { id: req.user.userId },
        data,
        select: { id: true, name: true, email: true, avatarUrl: true }
    });
    res.json({ user });
}));
authRoutes.post("/change-password", authMiddleware, asyncHandler(async (req, res) => {
    const data = validateBody(changePasswordSchema, req.body);
    const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user.userId } });
    if (!(await bcrypt.compare(data.currentPassword, user.passwordHash))) {
        throw new ApiError(422, "Senha atual incorreta");
    }
    await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await bcrypt.hash(data.newPassword, 12) }
    });
    res.json({ message: "Senha atualizada com sucesso" });
}));
