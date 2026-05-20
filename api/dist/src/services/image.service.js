import slugify from "slugify";
export function chooseFeaturedImage(rssImage, title) {
    if (rssImage) {
        return {
            url: rssImage,
            altText: title ? `Imagem relacionada a ${title}` : "Imagem destacada da noticia",
            fileName: `${slugify(title || "imagem-destacada", { lower: true, strict: true })}.jpg`,
            source: "rss"
        };
    }
    return {
        url: "https://images.unsplash.com/photo-1495020689067-958852a7765e",
        altText: title ? `Imagem editorial sobre ${title}` : "Imagem editorial para noticia",
        fileName: `${slugify(title || "imagem-editorial", { lower: true, strict: true })}.jpg`,
        source: "fallback"
    };
}
