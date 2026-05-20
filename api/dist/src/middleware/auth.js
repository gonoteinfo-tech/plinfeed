import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { ApiError } from "../lib/http.js";
export function authMiddleware(req, _res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) {
        next(new ApiError(401, "Token ausente"));
        return;
    }
    try {
        const payload = jwt.verify(token, env.JWT_SECRET);
        req.user = {
            userId: payload.sub,
            tenantId: payload.tenantId,
            role: payload.role
        };
        next();
    }
    catch {
        next(new ApiError(401, "Token invalido ou expirado"));
    }
}
export function requireRoles(...roles) {
    return (req, _res, next) => {
        if (!req.user || !roles.includes(req.user.role)) {
            next(new ApiError(403, "Permissao insuficiente"));
            return;
        }
        next();
    };
}
