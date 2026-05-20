import axios from "axios";
import slugify from "slugify";
import { decryptSecret } from "../lib/crypto.js";
function auth(site) {
    return {
        username: site.apiUsername,
        password: decryptSecret(site.encryptedApiSecret)
    };
}
function baseUrl(site) {
    return `${site.wordpressUrl.replace(/\/$/, "")}/wp-json/wp/v2`;
}
function client(site) {
    return axios.create({
        baseURL: baseUrl(site),
        auth: auth(site),
        timeout: 20_000,
        headers: {
            "User-Agent": "AutoNewsAI/0.1"
        }
    });
}
export async function testWordPressConnection(site) {
    try {
        const { data } = await client(site).get("/users/me", { params: { context: "edit" } });
        return { ok: true, message: `Conexao com WordPress validada para ${data?.name || site.apiUsername}.` };
    }
    catch (error) {
        const message = axios.isAxiosError(error)
            ? error.response?.data?.message || error.message
            : error instanceof Error
                ? error.message
                : "Falha ao conectar com WordPress";
        return { ok: false, message };
    }
}
export async function fetchWordPressCategories(site) {
    const { data } = await client(site).get("/categories", { params: { per_page: 100 } });
    return data;
}
export async function fetchWordPressAuthors(site) {
    const { data } = await client(site).get("/users", { params: { per_page: 100 } });
    return data;
}
export async function publishWordPressPost(site, post, status) {
    const wp = client(site);
    const [categoryIds, tagIds, authorId, featuredMediaId] = await Promise.all([
        resolveCategoryIds(site, post.category || site.defaultCategory),
        resolveTagIds(site, post.tags),
        resolveAuthorId(site, site.defaultAuthor),
        uploadFeaturedImage(site, post)
    ]);
    const payload = {
        title: post.title,
        slug: post.slug,
        excerpt: post.summary,
        content: appendSchema(post.contentHtml || "", post.schemaJson),
        status
    };
    if (categoryIds.length) {
        payload.categories = categoryIds;
    }
    if (tagIds.length) {
        payload.tags = tagIds;
    }
    if (authorId) {
        payload.author = authorId;
    }
    if (featuredMediaId) {
        payload.featured_media = featuredMediaId;
    }
    const endpoint = post.wordpressPostId ? `/posts/${post.wordpressPostId}` : "/posts";
    const { data } = post.wordpressPostId ? await wp.put(endpoint, payload) : await wp.post(endpoint, payload);
    return {
        wordpressId: data.id,
        wordpressUrl: data.link,
        status: data.status,
        payload: data
    };
}
async function resolveCategoryIds(site, categoryName) {
    if (!categoryName) {
        return [];
    }
    const category = await findOrCreateTerm(site, "categories", categoryName, false);
    return category ? [category.id] : [];
}
async function resolveTagIds(site, tags) {
    const ids = [];
    for (const tag of tags.slice(0, 12)) {
        try {
            const term = await findOrCreateTerm(site, "tags", tag, true);
            if (term) {
                ids.push(term.id);
            }
        }
        catch {
            // Tag creation should not block the publication of the article.
        }
    }
    return ids;
}
async function findOrCreateTerm(site, endpoint, name, createIfMissing) {
    const wp = client(site);
    const normalizedName = name.trim();
    if (!normalizedName) {
        return null;
    }
    const { data } = await wp.get(`/${endpoint}`, {
        params: { search: normalizedName, per_page: 20 }
    });
    const found = data.find((term) => term.name.toLowerCase() === normalizedName.toLowerCase());
    if (found || !createIfMissing) {
        return found || null;
    }
    const created = await wp.post(`/${endpoint}`, {
        name: normalizedName,
        slug: slugify(normalizedName, { lower: true, strict: true })
    });
    return created.data;
}
async function resolveAuthorId(site, defaultAuthor) {
    if (!defaultAuthor) {
        return undefined;
    }
    const numericAuthor = Number(defaultAuthor);
    if (Number.isInteger(numericAuthor) && numericAuthor > 0) {
        return numericAuthor;
    }
    const { data } = await client(site).get("/users", {
        params: { search: defaultAuthor, per_page: 10 }
    });
    return data[0]?.id;
}
async function uploadFeaturedImage(site, post) {
    if (!post.featuredImageUrl) {
        return undefined;
    }
    try {
        const imageResponse = await axios.get(post.featuredImageUrl, {
            responseType: "arraybuffer",
            timeout: 20_000
        });
        const mimeType = imageResponse.headers["content-type"] || "image/jpeg";
        if (!String(mimeType).startsWith("image/")) {
            return undefined;
        }
        const extension = String(mimeType).split("/")[1]?.split(";")[0] || "jpg";
        const fileName = `${post.slug || slugify(post.title, { lower: true, strict: true })}.${extension}`;
        const uploadResponse = await client(site).post("/media", Buffer.from(imageResponse.data), {
            headers: {
                "Content-Type": mimeType,
                "Content-Disposition": `attachment; filename="${fileName}"`
            }
        });
        if (post.featuredImageAlt) {
            await client(site).post(`/media/${uploadResponse.data.id}`, {
                alt_text: post.featuredImageAlt
            });
        }
        return uploadResponse.data.id;
    }
    catch {
        return undefined;
    }
}
function appendSchema(contentHtml, schemaJson) {
    if (!schemaJson) {
        return contentHtml;
    }
    return `${contentHtml}\n<script type="application/ld+json">${JSON.stringify(schemaJson)}</script>`;
}
