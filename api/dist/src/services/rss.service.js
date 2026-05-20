import Parser from "rss-parser";
import { contentHash } from "../lib/hash.js";
const parser = new Parser({
    customFields: {
        item: [["media:content", "mediaContent"], ["content:encoded", "contentEncoded"]]
    }
});
export async function readRssFeed(url, maxItems) {
    const feed = await parser.parseURL(url);
    return feed.items.slice(0, maxItems).map((item) => {
        const title = item.title?.trim() || "Noticia sem titulo";
        const content = item.contentEncoded || item.content || item.summary || "";
        const originalUrl = item.link || item.guid || `${url}#${title}`;
        const imageUrl = item.enclosure?.url || item.mediaContent?.$?.url;
        return {
            title,
            summary: item.contentSnippet || item.summary,
            content,
            imageUrl,
            author: item.creator || item.author,
            publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
            originalUrl,
            contentHash: contentHash(`${title}:${originalUrl}:${content}`)
        };
    });
}
