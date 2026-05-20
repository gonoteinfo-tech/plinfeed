import { Worker } from "bullmq";
import sanitizeHtml from "sanitize-html";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { readRssFeed } from "../services/rss.service.js";
import { rewriteWithAi } from "../services/ai.service.js";
import { chooseFeaturedImage } from "../services/image.service.js";
import { publishWordPressPost } from "../services/wordpress.service.js";
import { enqueuePostGeneration, enqueuePostPublishing } from "../queues/content.queue.js";
const connection = { url: env.REDIS_URL };
new Worker("feed.process", async (job) => {
    const { tenantId, feedId, maxPosts } = job.data;
    try {
        const feed = await prisma.feed.findFirstOrThrow({ where: { id: feedId, tenantId }, include: { site: true } });
        const items = await readRssFeed(feed.rssUrl, maxPosts);
        for (const item of items) {
            const existing = await prisma.rawNews.findFirst({
                where: {
                    tenantId,
                    OR: [{ originalUrl: item.originalUrl }, { contentHash: item.contentHash }, { title: item.title }]
                }
            });
            if (existing && feed.ignoreDuplicates) {
                continue;
            }
            const rawNews = await prisma.rawNews.create({
                data: {
                    tenantId,
                    feedId,
                    title: item.title,
                    summary: item.summary,
                    content: item.content,
                    imageUrl: item.imageUrl,
                    author: item.author,
                    publishedAt: item.publishedAt,
                    originalUrl: item.originalUrl,
                    contentHash: item.contentHash
                }
            });
            const post = await prisma.post.create({
                data: {
                    tenantId,
                    siteId: feed.siteId,
                    feedId,
                    rawNewsId: rawNews.id,
                    title: rawNews.title,
                    slug: rawNews.contentHash.slice(0, 16),
                    summary: rawNews.summary,
                    sourceUrl: rawNews.originalUrl,
                    status: "RAW",
                    tags: [],
                    keywords: []
                }
            });
            await enqueuePostGeneration({ tenantId, postId: post.id });
        }
        await prisma.feed.update({ where: { id: feedId }, data: { lastRunAt: new Date() } });
        await prisma.executionLog.create({
            data: { tenantId, feedId, type: "SUCCESS", message: `Feed ${feed.name} processado com ${items.length} itens lidos` }
        });
    }
    catch (error) {
        await prisma.executionLog.create({
            data: {
                tenantId,
                feedId,
                type: "ERROR",
                message: error instanceof Error ? error.message : "Falha ao processar feed",
                stack: error instanceof Error ? error.stack : undefined
            }
        });
        throw error;
    }
}, { connection });
new Worker("post.generate", async (job) => {
    const startedAt = Date.now();
    const { tenantId, postId } = job.data;
    try {
        const post = await prisma.post.findFirstOrThrow({
            where: { id: postId, tenantId },
            include: { rawNews: true, feed: true, site: true }
        });
        const aiConfig = await prisma.aiConfig.findFirst({
            where: { tenantId, active: true },
            orderBy: { updatedAt: "desc" }
        });
        await prisma.post.update({ where: { id: post.id }, data: { status: "GENERATING" } });
        const prompt = post.feed?.customPrompt || aiConfig?.globalPrompt || "Reescreva com originalidade, precisao jornalistica e SEO.";
        const output = await rewriteWithAi({
            title: post.rawNews?.title || post.title,
            content: post.rawNews?.content || post.summary || "",
            source: post.rawNews?.originalUrl || post.sourceUrl || "",
            category: post.feed?.wordpressCategory || post.site.defaultCategory || undefined,
            language: post.feed?.language || aiConfig?.language || "pt-BR",
            toneOfVoice: aiConfig?.toneOfVoice || "Jornalistico profissional",
            prompt,
            config: aiConfig
        });
        const image = chooseFeaturedImage(post.rawNews?.imageUrl || undefined, output.title);
        const nextStatus = post.feed?.autopublish || post.site.publishMode === "AUTO" ? "DRAFT" : post.site.publishMode === "REVIEW" ? "PENDING_REVIEW" : "DRAFT";
        await prisma.post.update({
            where: { id: post.id },
            data: {
                title: output.title,
                slug: output.slug,
                summary: output.summary,
                metaTitle: output.metaTitle,
                metaDescription: output.metaDescription,
                tags: output.tags,
                keywords: output.keywords,
                contentHtml: sanitizeHtml(output.contentHtml),
                featuredImageUrl: image.url,
                featuredImageAlt: image.altText,
                socialSummary: output.socialSummary,
                schemaJson: output.schemaJson,
                category: post.feed?.wordpressCategory || post.site.defaultCategory,
                status: nextStatus,
                generationDurationMs: Date.now() - startedAt
            }
        });
        if (post.feed?.autopublish || post.site.publishMode === "AUTO") {
            await enqueuePostPublishing({ tenantId, postId: post.id });
        }
    }
    catch (error) {
        await prisma.post.update({
            where: { id: postId },
            data: {
                status: "ERROR",
                errorMessage: error instanceof Error ? error.message : "Falha ao gerar post com IA"
            }
        });
        await prisma.executionLog.create({
            data: {
                tenantId,
                postId,
                type: "ERROR",
                message: error instanceof Error ? error.message : "Falha ao gerar post com IA",
                stack: error instanceof Error ? error.stack : undefined
            }
        });
        throw error;
    }
}, { connection });
new Worker("post.publish", async (job) => {
    const { tenantId, postId } = job.data;
    try {
        const post = await prisma.post.findFirstOrThrow({ where: { id: postId, tenantId }, include: { site: true } });
        const wpStatus = post.site.publishMode === "AUTO" ? "publish" : post.site.publishMode === "REVIEW" ? "pending" : "draft";
        const publication = await publishWordPressPost(post.site, post, wpStatus);
        await prisma.post.update({
            where: { id: post.id },
            data: {
                status: wpStatus === "publish" ? "PUBLISHED" : wpStatus === "pending" ? "PENDING_REVIEW" : "DRAFT",
                wordpressPostId: publication.wordpressId,
                wordpressPostUrl: publication.wordpressUrl,
                publishedAt: wpStatus === "publish" ? new Date() : undefined
            }
        });
        await prisma.wordPressPost.upsert({
            where: { postId: post.id },
            create: {
                siteId: post.siteId,
                postId: post.id,
                wordpressId: publication.wordpressId,
                wordpressUrl: publication.wordpressUrl,
                status: publication.status,
                payload: publication.payload
            },
            update: {
                wordpressId: publication.wordpressId,
                wordpressUrl: publication.wordpressUrl,
                status: publication.status,
                payload: publication.payload
            }
        });
    }
    catch (error) {
        await prisma.post.update({
            where: { id: postId },
            data: {
                status: "ERROR",
                errorMessage: error instanceof Error ? error.message : "Falha ao publicar no WordPress"
            }
        });
        await prisma.executionLog.create({
            data: {
                tenantId,
                postId,
                type: "ERROR",
                message: error instanceof Error ? error.message : "Falha ao publicar no WordPress",
                stack: error instanceof Error ? error.stack : undefined
            }
        });
        throw error;
    }
}, { connection });
console.log("AutoNews AI workers running");
