import { config } from "dotenv";
import { z } from "zod";
config({ path: "../../.env" });
config();
const envSchema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_PORT: z.coerce.number().default(4000),
    DATABASE_URL: z.string().min(1),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    JWT_SECRET: z.string().min(16),
    ENCRYPTION_KEY: z.string().min(32),
    CORS_ORIGIN: z.string().default("http://localhost:3000"),
    APP_FRONTEND_URL: z.string().url().optional(),
    OPENAI_API_KEY: z.string().optional(),
    OPENAI_MODEL: z.string().default("gpt-4.1-mini"),
    GEMINI_API_KEY: z.string().optional(),
    GEMINI_MODEL: z.string().default("gemini-1.5-pro"),
    UNSPLASH_ACCESS_KEY: z.string().optional(),
    PEXELS_API_KEY: z.string().optional(),
    FACEBOOK_APP_ID: z.string().optional(),
    FACEBOOK_APP_SECRET: z.string().optional(),
    FACEBOOK_REDIRECT_URI: z.string().url().default("http://localhost:4000/api/auth/facebook/callback"),
    FACEBOOK_GRAPH_VERSION: z.string().default("v22.0"),
    FACEBOOK_OAUTH_SCOPES: z.string().default("email,public_profile,pages_show_list,pages_read_engagement,instagram_basic,business_management")
});
export const env = envSchema.parse(process.env);
