import { Prisma } from "@prisma/client";
import { ApiError, isDatabaseUnavailable } from "../lib/http.js";
export function notFoundHandler(req, _res, next) {
    next(new ApiError(404, `Rota nao encontrada: ${req.method} ${req.path}`));
}
export function errorHandler(error, _req, res, _next) {
    if (error instanceof ApiError) {
        res.status(error.statusCode).json({ message: error.message });
        return;
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        res.status(400).json({ message: "Operacao invalida no banco de dados", code: error.code });
        return;
    }
    if (isDatabaseUnavailable(error)) {
        res.status(503).json({
            message: "Banco de dados indisponivel. Inicie o PostgreSQL ou use o modo demo offline.",
            code: "DATABASE_UNAVAILABLE"
        });
        return;
    }
    const message = error instanceof Error ? error.message : "Erro inesperado";
    res.status(500).json({ message });
}
