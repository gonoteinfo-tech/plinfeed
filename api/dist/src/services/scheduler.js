import { prisma } from "../lib/prisma.js";
import { handleFeedProcess } from "../workers/handlers.js";
const POLL_INTERVAL_MS = 60_000; // 60 seconds
function computeNextRunAt(schedule) {
    const now = new Date();
    switch (schedule.frequency) {
        case "MINUTES":
            return new Date(now.getTime() + (schedule.intervalMinutes || 30) * 60_000);
        case "FIXED_TIME": {
            if (!schedule.fixedTime) {
                return new Date(now.getTime() + 24 * 60 * 60_000);
            }
            const parts1 = schedule.fixedTime.split(":").map(Number);
            const next = new Date(now);
            next.setHours(parts1[0] ?? 0, parts1[1] ?? 0, 0, 0);
            if (next <= now) {
                next.setDate(next.getDate() + 1);
            }
            return next;
        }
        case "DAILY": {
            if (!schedule.fixedTime) {
                return new Date(now.getTime() + 24 * 60 * 60_000);
            }
            const parts2 = schedule.fixedTime.split(":").map(Number);
            const nextDaily = new Date(now);
            nextDaily.setHours(parts2[0] ?? 0, parts2[1] ?? 0, 0, 0);
            if (nextDaily <= now) {
                nextDaily.setDate(nextDaily.getDate() + 1);
            }
            return nextDaily;
        }
        case "WEEKLY": {
            const dayNames = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SAB"];
            const todayIndex = now.getDay();
            const activeDays = (schedule.weekdays || []).map((d) => dayNames.indexOf(d.toUpperCase())).filter((i) => i >= 0);
            if (activeDays.length === 0) {
                return new Date(now.getTime() + 7 * 24 * 60 * 60_000);
            }
            for (let offset = 1; offset <= 7; offset++) {
                const candidate = (todayIndex + offset) % 7;
                if (activeDays.includes(candidate)) {
                    const next = new Date(now);
                    next.setDate(now.getDate() + offset);
                    if (schedule.fixedTime) {
                        const parts3 = schedule.fixedTime.split(":").map(Number);
                        next.setHours(parts3[0] ?? 0, parts3[1] ?? 0, 0, 0);
                    }
                    else {
                        next.setHours(8, 0, 0, 0);
                    }
                    return next;
                }
            }
            return new Date(now.getTime() + 7 * 24 * 60 * 60_000);
        }
        default:
            return new Date(now.getTime() + 30 * 60_000);
    }
}
async function pollSchedules() {
    try {
        const now = new Date();
        const dueSchedules = await prisma.schedule.findMany({
            where: {
                active: true,
                nextRunAt: { lte: now }
            },
            include: { feed: true }
        });
        for (const schedule of dueSchedules) {
            console.log(`[scheduler] Triggering schedule "${schedule.id}" for feed "${schedule.feed?.id || schedule.feedId}"`);
            try {
                await handleFeedProcess({
                    tenantId: schedule.tenantId,
                    feedId: schedule.feedId,
                    maxPosts: schedule.maxPostsPerRun
                });
                const nextRunAt = computeNextRunAt(schedule);
                await prisma.schedule.update({
                    where: { id: schedule.id },
                    data: { lastRunAt: now, nextRunAt }
                });
                await prisma.executionLog.create({
                    data: {
                        tenantId: schedule.tenantId,
                        feedId: schedule.feedId,
                        type: "SUCCESS",
                        message: `Agendamento executado com sucesso. Proxima execucao: ${nextRunAt.toLocaleString("pt-BR")}`
                    }
                });
                console.log(`[scheduler] Schedule "${schedule.id}" completed. Next run: ${nextRunAt.toISOString()}`);
            }
            catch (error) {
                console.error(`[scheduler] Schedule "${schedule.id}" failed:`, error);
                const nextRunAt = computeNextRunAt(schedule);
                await prisma.schedule.update({
                    where: { id: schedule.id },
                    data: { lastRunAt: now, nextRunAt }
                });
                await prisma.executionLog.create({
                    data: {
                        tenantId: schedule.tenantId,
                        feedId: schedule.feedId,
                        type: "ERROR",
                        message: error instanceof Error ? error.message : "Falha ao executar agendamento",
                        stack: error instanceof Error ? error.stack : undefined
                    }
                });
            }
        }
    }
    catch (error) {
        console.error("[scheduler] Poll error:", error);
    }
}
let schedulerInterval = null;
export function startScheduler() {
    if (schedulerInterval) {
        return;
    }
    console.log(`[scheduler] Started — polling every ${POLL_INTERVAL_MS / 1000}s`);
    // Run first poll immediately
    pollSchedules();
    schedulerInterval = setInterval(pollSchedules, POLL_INTERVAL_MS);
}
export function stopScheduler() {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log("[scheduler] Stopped");
    }
}
