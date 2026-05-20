import slugify from "slugify";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { z } from "zod";
import { env } from "../config/env.js";
import { decryptSecret } from "../lib/crypto.js";
const rewriteOutputSchema = z.object({
    title: z.string().min(5),
    slug: z.string().min(3).optional(),
    summary: z.string().min(20),
    metaTitle: z.string().min(5).max(70).optional(),
    metaDescription: z.string().min(30).max(180),
    tags: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
    contentHtml: z.string().min(50),
    featuredImageAlt: z.string().min(5),
    socialSummary: z.string().min(20),
    schemaJson: z.record(z.unknown()).optional()
});
export async function rewriteWithAi(input) {
    const runtime = resolveRuntime(input.config);
    if (!runtime.apiKey) {
        return deterministicRewrite(input);
    }
    const prompt = buildRewritePrompt(input, runtime);
    const rawResponse = runtime.provider === "GEMINI" ? await callGemini(runtime, prompt) : await callOpenAi(runtime, prompt);
    return normalizeAiOutput(rawResponse, input);
}
export async function testAiConnection(config) {
    const runtime = resolveRuntime(config);
    if (!runtime.apiKey) {
        return { ok: false, message: "Nenhuma chave de IA configurada para o provedor selecionado." };
    }
    try {
        const output = runtime.provider === "GEMINI"
            ? await callGemini(runtime, "Responda apenas com JSON valido: {\"ok\":true,\"provider\":\"gemini\"}.")
            : await callOpenAi(runtime, "Responda apenas com JSON valido: {\"ok\":true,\"provider\":\"openai\"}.");
        JSON.parse(extractJson(output));
        return { ok: true, message: `Conexao com ${runtime.provider} validada usando ${runtime.model}.` };
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Falha ao testar provedor de IA";
        return { ok: false, message };
    }
}
function resolveRuntime(config) {
    if (config) {
        if (config.provider === "CUSTOM") {
            throw new Error("Provedor CUSTOM ainda nao possui adaptador ativo.");
        }
        return {
            provider: config.provider,
            apiKey: decryptSecret(config.encryptedApiKey),
            model: config.model,
            temperature: config.temperature,
            maxArticleLength: config.maxArticleLength
        };
    }
    if (env.GEMINI_API_KEY) {
        return {
            provider: "GEMINI",
            apiKey: env.GEMINI_API_KEY,
            model: env.GEMINI_MODEL,
            temperature: 0.7,
            maxArticleLength: 5000
        };
    }
    return {
        provider: "OPENAI",
        apiKey: env.OPENAI_API_KEY,
        model: env.OPENAI_MODEL,
        temperature: 0.7,
        maxArticleLength: 5000
    };
}
function buildRewritePrompt(input, runtime) {
    const content = input.content.replace(/\s+/g, " ").trim().slice(0, runtime.maxArticleLength);
    return `
Voce e um editor jornalistico senior especializado em SEO para WordPress.

Instrucoes editoriais:
${input.prompt}

Dados da noticia:
- Titulo original: ${input.title}
- Fonte original: ${input.source}
- Categoria: ${input.category || "Noticias"}
- Idioma: ${input.language}
- Tom de voz: ${input.toneOfVoice}
- Conteudo original: ${content}

Regras obrigatorias:
- Nao copie frases do texto original.
- Preserve fatos principais sem inventar informacoes.
- Escreva em HTML sem <html>, <head> ou <body>.
- Use intertitulos H2/H3 naturais.
- Gere SEO para portal de noticias.
- Responda somente JSON valido, sem markdown.

Formato JSON:
{
  "title": "novo titulo",
  "slug": "slug-otimizado",
  "summary": "resumo editorial",
  "metaTitle": "titulo SEO ate 70 caracteres",
  "metaDescription": "descricao SEO ate 180 caracteres",
  "tags": ["tag1", "tag2"],
  "keywords": ["palavra chave 1", "palavra chave 2"],
  "contentHtml": "<h2>...</h2><p>...</p>",
  "featuredImageAlt": "texto alternativo da imagem",
  "socialSummary": "resumo para redes sociais",
  "schemaJson": {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": "novo titulo"
  }
}`.trim();
}
async function callOpenAi(runtime, prompt) {
    const client = new OpenAI({ apiKey: runtime.apiKey });
    const completion = await client.chat.completions.create({
        model: runtime.model,
        temperature: runtime.temperature,
        response_format: { type: "json_object" },
        messages: [
            {
                role: "system",
                content: "Voce responde sempre com JSON valido e conteudo jornalistico original em portugues quando solicitado."
            },
            { role: "user", content: prompt }
        ]
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) {
        throw new Error("OpenAI retornou resposta vazia.");
    }
    return content;
}
async function callGemini(runtime, prompt) {
    const client = new GoogleGenerativeAI(runtime.apiKey);
    const model = client.getGenerativeModel({ model: runtime.model });
    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: runtime.temperature,
            responseMimeType: "application/json"
        }
    });
    const content = result.response.text();
    if (!content) {
        throw new Error("Gemini retornou resposta vazia.");
    }
    return content;
}
function normalizeAiOutput(rawResponse, input) {
    const parsed = rewriteOutputSchema.parse(JSON.parse(extractJson(rawResponse)));
    const title = parsed.title.trim();
    const slug = slugify(parsed.slug || title, { lower: true, strict: true });
    const category = input.category || "Noticias";
    return {
        title,
        slug,
        summary: parsed.summary.trim(),
        metaTitle: (parsed.metaTitle || title).slice(0, 70),
        metaDescription: parsed.metaDescription.slice(0, 180),
        tags: cleanList(parsed.tags.length ? parsed.tags : [category, "noticias"]),
        keywords: cleanList(parsed.keywords.length ? parsed.keywords : [category.toLowerCase(), "noticia"]),
        contentHtml: parsed.contentHtml,
        featuredImageAlt: parsed.featuredImageAlt,
        socialSummary: parsed.socialSummary,
        schemaJson: parsed.schemaJson || {
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            headline: title,
            inLanguage: input.language
        }
    };
}
function extractJson(value) {
    const trimmed = value.trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();
    const first = trimmed.indexOf("{");
    const last = trimmed.lastIndexOf("}");
    if (first === -1 || last === -1 || last < first) {
        throw new Error("Resposta da IA nao contem JSON valido.");
    }
    return trimmed.slice(first, last + 1);
}
function cleanList(values) {
    return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 12);
}
function deterministicRewrite(input) {
    const cleanTitle = input.title.replace(/\s+/g, " ").trim();
    const rewrittenTitle = cleanTitle.startsWith("Nova") ? cleanTitle : `Entenda: ${cleanTitle}`;
    const slug = slugify(rewrittenTitle, { lower: true, strict: true });
    const intro = input.content.slice(0, 420).replace(/<[^>]*>/g, "").trim();
    const category = input.category || "Noticias";
    return {
        title: rewrittenTitle,
        slug,
        summary: `Resumo editorial sobre ${cleanTitle}, com foco em contexto, impacto e proximos passos.`,
        metaTitle: rewrittenTitle.slice(0, 60),
        metaDescription: `Veja os principais fatos sobre ${cleanTitle} e entenda os impactos para a editoria de ${category}.`.slice(0, 158),
        tags: [category, "atualidades", "noticias"],
        keywords: [category.toLowerCase(), "noticia", "analise"],
        contentHtml: `<h2>Contexto da noticia</h2><p>${intro || "A noticia foi processada e esta pronta para revisao editorial."}</p><h2>O que muda agora</h2><p>O tema ganha relevancia por seus impactos diretos para leitores, mercado e tomada de decisao.</p><h2>Conclusao</h2><p>Acompanhar os proximos desdobramentos sera essencial para entender a evolucao deste assunto.</p>`,
        featuredImageAlt: `Imagem ilustrativa sobre ${cleanTitle}`,
        socialSummary: `${rewrittenTitle} - leia o resumo completo.`,
        schemaJson: {
            "@context": "https://schema.org",
            "@type": "NewsArticle",
            headline: rewrittenTitle,
            inLanguage: input.language
        }
    };
}
