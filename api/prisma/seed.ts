import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma.js";
import { encryptSecret } from "../src/lib/crypto.js";
import { contentHash } from "../src/lib/hash.js";

const defaultPrompt =
  "Reescreva esta notícia de forma original, profissional, jornalística e otimizada para SEO. Não copie frases do texto original. Preserve os fatos principais, mas reestruture o conteúdo. Crie um título atrativo, subtítulo, introdução, desenvolvimento com intertítulos e conclusão. Gere também meta description, tags e slug.";

async function main() {
  await prisma.executionLog.deleteMany();
  await prisma.imageAsset.deleteMany();
  await prisma.wordPressPost.deleteMany();
  await prisma.post.deleteMany();
  await prisma.rawNews.deleteMany();
  await prisma.schedule.deleteMany();
  await prisma.feed.deleteMany();
  await prisma.site.deleteMany();
  await prisma.promptTemplate.deleteMany();
  await prisma.aiConfig.deleteMany();
  await prisma.subscription.deleteMany();
  await prisma.tenantMember.deleteMany();
  await prisma.accessLog.deleteMany();
  await prisma.tenant.deleteMany();
  await prisma.user.deleteMany();

  const passwordHash = await bcrypt.hash("Admin123!", 12);

  const user = await prisma.user.create({
    data: {
      name: "Admin Demo",
      email: "admin@autonews.ai",
      passwordHash
    }
  });

  const tenant = await prisma.tenant.create({
    data: {
      name: "AutoNews Demo",
      slug: "autonews-demo",
      members: {
        create: {
          userId: user.id,
          role: "ADMIN"
        }
      },
      subscriptions: {
        create: {
          userId: user.id,
          plan: "Pro",
          status: "ACTIVE",
          siteLimit: 1,
          feedLimit: 9999,
          monthlyPostLimit: 3000,
          expiresAt: new Date("2026-06-01T03:00:00.000Z")
        }
      }
    }
  });

  const site = await prisma.site.create({
    data: {
      tenantId: tenant.id,
      name: "Portal Prime",
      wordpressUrl: "https://portalprime.example",
      apiUsername: "autonews-api",
      encryptedApiSecret: encryptSecret("demo-application-password"),
      status: "CONNECTED",
      defaultCategory: "Noticias",
      defaultAuthor: "Redacao AutoNews",
      publishMode: "DRAFT",
      adsenseCode: "ca-pub-0000000000000000",
      adsBeforeContent: true,
      adsMiddleContent: true,
      adsAfterContent: false,
      adsEnabled: true
    }
  });

  const seededAiProvider = process.env.GEMINI_API_KEY ? "GEMINI" : "OPENAI";
  const seededAiKey = process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY || "demo-ai-key";
  const seededAiModel =
    seededAiProvider === "GEMINI"
      ? process.env.GEMINI_MODEL || "gemini-1.5-pro"
      : process.env.OPENAI_MODEL || "gpt-4.1-mini";

  await prisma.aiConfig.create({
    data: {
      tenantId: tenant.id,
      provider: seededAiProvider,
      encryptedApiKey: encryptSecret(seededAiKey),
      model: seededAiModel,
      temperature: 0.7,
      maxArticleLength: 5000,
      toneOfVoice: "Jornalistico profissional",
      language: "pt-BR",
      globalPrompt: defaultPrompt,
      active: Boolean(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY)
    }
  });

  await prisma.promptTemplate.createMany({
    data: [
      { tenantId: tenant.id, name: "Prompt global", scope: "global", content: defaultPrompt },
      { tenantId: tenant.id, siteId: site.id, name: "Prompt do Portal Prime", scope: "site", content: `${defaultPrompt}\nUse linguagem clara e foco em servico ao leitor.` },
      { tenantId: tenant.id, name: "Prompt SEO", scope: "seo", content: "Gere meta title, meta description, slug, tags, keywords e resumo social para a noticia." }
    ]
  });

  const feedInputs = [
    ["Tecnologia Global", "https://example.com/tech/rss", "Tecnologia", "tecnologia", 30],
    ["Economia Matinal", "https://example.com/economia/rss", "Economia", "economia", 60],
    ["Esportes Agora", "https://example.com/esportes/rss", "Esportes", "esportes", 120],
    ["Ciencia e Saude", "https://example.com/saude/rss", "Saude", "saude", 45],
    ["Politica e Cidadania", "https://example.com/politica/rss", "Politica", "politica", 90]
  ] as const;

  const feeds = [];
  for (const [name, rssUrl, category, niche, minutes] of feedInputs) {
    const feed = await prisma.feed.create({
      data: {
        tenantId: tenant.id,
        siteId: site.id,
        name,
        rssUrl,
        wordpressCategory: category,
        niche,
        readFrequency: `${minutes}m`,
        autopublish: name === "Tecnologia Global",
        status: name === "Esportes Agora" ? "PAUSED" : "ACTIVE",
        lastRunAt: new Date(Date.now() - minutes * 60_000)
      }
    });
    feeds.push(feed);
  }

  for (const feed of feeds.slice(0, 4)) {
    await prisma.schedule.create({
      data: {
        tenantId: tenant.id,
        siteId: site.id,
        feedId: feed.id,
        frequency: "MINUTES",
        intervalMinutes: Number(feed.readFrequency.replace("m", "")),
        weekdays: ["mon", "tue", "wed", "thu", "fri"],
        maxPostsPerRun: 5,
        active: feed.status === "ACTIVE",
        lastRunAt: feed.lastRunAt,
        nextRunAt: feed.status === "ACTIVE" ? new Date(Date.now() + 30 * 60_000) : null
      }
    });
  }

  const postTitles = [
    "Startups ampliam uso de IA em redacoes digitais",
    "Mercado revisa projecoes para investimentos em energia",
    "Nova politica de dados muda rotina de portais",
    "Falha na imagem destacada impede publicacao automatica",
    "Aplicativos de noticia investem em personalizacao",
    "Setor de saude acelera projetos de conteudo educativo",
    "Clubes adotam dados para aproximar torcedores",
    "Plataformas digitais reforcam ferramentas de SEO",
    "Empresas testam resumos automatizados em blogs",
    "Veiculos regionais buscam escala com automacao"
  ];

  for (const [index, title] of postTitles.entries()) {
    const feed = feeds[index % feeds.length]!;
    const raw = await prisma.rawNews.create({
      data: {
        tenantId: tenant.id,
        feedId: feed.id,
        title: `Original: ${title}`,
        summary: "Resumo bruto capturado do RSS para demonstracao.",
        content: `Conteudo bruto sobre ${title}. Este texto representa o material original que sera reestruturado pela IA.`,
        imageUrl: index % 2 === 0 ? "https://images.unsplash.com/photo-1495020689067-958852a7765e" : null,
        author: "Fonte Exemplo",
        publishedAt: new Date(Date.now() - index * 3_600_000),
        originalUrl: `https://fonte.example/noticia-${index + 1}`,
        contentHash: contentHash(`${title}-${index}`)
      }
    });

    await prisma.post.create({
      data: {
        tenantId: tenant.id,
        siteId: site.id,
        feedId: feed.id,
        rawNewsId: raw.id,
        title,
        slug: title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        summary: `Resumo gerado para ${title}.`,
        contentHtml: `<h2>Contexto</h2><p>${title} ganha destaque em um cenario de transformacao digital.</p><h2>Impactos</h2><p>A mudanca afeta operacoes editoriais, distribuicao e relacionamento com leitores.</p>`,
        metaTitle: title.slice(0, 60),
        metaDescription: `Entenda os principais pontos sobre ${title} e os impactos para portais e blogs.`.slice(0, 158),
        tags: [feed.wordpressCategory || "Noticias", "automacao", "ia"],
        keywords: [(feed.wordpressCategory || "noticias").toLowerCase(), "conteudo", "wordpress"],
        category: feed.wordpressCategory,
        featuredImageUrl: raw.imageUrl,
        featuredImageAlt: `Imagem sobre ${title}`,
        socialSummary: `${title}: veja o resumo completo.`,
        schemaJson: {
          "@context": "https://schema.org",
          "@type": "NewsArticle",
          headline: title
        },
        sourceUrl: raw.originalUrl,
        status: index === 3 ? "ERROR" : index % 3 === 0 ? "PUBLISHED" : index % 3 === 1 ? "DRAFT" : "PENDING_REVIEW",
        publishedAt: index % 3 === 0 ? new Date(Date.now() - index * 1_800_000) : null,
        errorMessage: index === 3 ? "Imagem destacada recusada pelo WordPress" : null,
        generationDurationMs: 12_000 + index * 700,
        wordpressPostId: index % 3 === 0 ? 1200 + index : null,
        wordpressPostUrl: index % 3 === 0 ? `https://portalprime.example/${index + 1}` : null,
        importedAt: new Date(Date.now() - index * 3_600_000)
      }
    });
  }

  await prisma.executionLog.createMany({
    data: [
      { tenantId: tenant.id, type: "SUCCESS", feedId: feeds[0]!.id, message: "Post publicado com ID 1200 no WordPress" },
      { tenantId: tenant.id, type: "INFO", feedId: feeds[0]!.id, message: "Feed Tecnologia Global processado em 12s" },
      { tenantId: tenant.id, type: "WARNING", message: "Limite mensal do plano Pro esta em 21%" },
      { tenantId: tenant.id, type: "ERROR", feedId: feeds[3]!.id, message: "Imagem destacada recusada pelo WordPress", stack: "WordPressMediaError: invalid mime" }
    ]
  });

  console.log("Seed concluido: admin@autonews.ai / Admin123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
