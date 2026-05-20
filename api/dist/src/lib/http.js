export class ApiError extends Error {
    statusCode;
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
    }
}
export function asyncHandler(handler) {
    return (req, res, next) => {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}
export function validateBody(schema, body) {
    const result = schema.safeParse(body);
    if (!result.success) {
        throw new ApiError(422, result.error.issues.map((issue) => issue.message).join("; "));
    }
    return result.data;
}
export function requireTenant(req) {
    if (!req.user?.tenantId) {
        throw new ApiError(401, "Tenant nao identificado");
    }
    return req.user.tenantId;
}
export function routeParam(req, name) {
    const value = req.params[name];
    if (typeof value !== "string" || !value) {
        throw new ApiError(400, `Parametro de rota invalido: ${name}`);
    }
    return value;
}
export function isDatabaseUnavailable(error) {
    if (!(error instanceof Error)) {
        return false;
    }
    return error.message.includes("Can't reach database server") || error.message.includes("P1001");
}
