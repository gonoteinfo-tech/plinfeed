import axios from "axios";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { decryptSecret, encryptSecret } from "../lib/crypto.js";
export function assertFacebookConfigured() {
    if (!env.FACEBOOK_APP_ID || !env.FACEBOOK_APP_SECRET) {
        throw new Error("Configure FACEBOOK_APP_ID e FACEBOOK_APP_SECRET no .env para ativar o login com Facebook.");
    }
    if (env.FACEBOOK_REDIRECT_URI.includes("localhost") || env.FACEBOOK_REDIRECT_URI.includes("sua-url-publica-https")) {
        throw new Error("A Meta nao aceita localhost neste fluxo. Configure FACEBOOK_REDIRECT_URI com uma URL publica HTTPS, como ngrok ou Cloudflare Tunnel.");
    }
}
export function buildFacebookLoginUrl(redirectTo = "/dashboard/social") {
    assertFacebookConfigured();
    const state = jwt.sign({
        purpose: "facebook_oauth",
        redirectTo
    }, env.JWT_SECRET, { expiresIn: "10m" });
    const params = new URLSearchParams({
        client_id: env.FACEBOOK_APP_ID,
        redirect_uri: env.FACEBOOK_REDIRECT_URI,
        state,
        response_type: "code",
        scope: env.FACEBOOK_OAUTH_SCOPES
    });
    return `https://www.facebook.com/${env.FACEBOOK_GRAPH_VERSION}/dialog/oauth?${params.toString()}`;
}
export function verifyFacebookState(state) {
    const payload = jwt.verify(state, env.JWT_SECRET);
    if (payload.purpose !== "facebook_oauth") {
        throw new Error("State OAuth invalido.");
    }
    return payload;
}
export async function exchangeFacebookCode(code) {
    assertFacebookConfigured();
    const shortToken = await graphGet("/oauth/access_token", {
        client_id: env.FACEBOOK_APP_ID,
        client_secret: env.FACEBOOK_APP_SECRET,
        redirect_uri: env.FACEBOOK_REDIRECT_URI,
        code
    });
    const longToken = await graphGet("/oauth/access_token", {
        grant_type: "fb_exchange_token",
        client_id: env.FACEBOOK_APP_ID,
        client_secret: env.FACEBOOK_APP_SECRET,
        fb_exchange_token: shortToken.access_token
    });
    return longToken.access_token ? longToken : shortToken;
}
export async function fetchFacebookProfile(accessToken) {
    return graphGet("/me", {
        fields: "id,name,email,picture",
        access_token: accessToken
    });
}
export function buildStoredFacebookConnection({ tenantId, userId, profile, token }) {
    const expiresAt = token.expires_in ? new Date(Date.now() + token.expires_in * 1000) : null;
    return {
        tenantId,
        userId: userId || null,
        provider: "facebook",
        providerUserId: profile.id,
        name: profile.name || null,
        email: profile.email || null,
        accessTokenEncrypted: encryptSecret(token.access_token),
        tokenType: token.token_type || "bearer",
        expiresAt,
        scopes: env.FACEBOOK_OAUTH_SCOPES.split(",").map((scope) => scope.trim()).filter(Boolean),
        metadata: {
            pictureUrl: profile.picture?.data?.url
        }
    };
}
export async function fetchFacebookAssets(connection) {
    const userAccessToken = decryptSecret(connection.accessTokenEncrypted);
    const pageResponse = await graphGet("/me/accounts", {
        fields: "id,name,category,access_token,tasks,perms,picture{url},instagram_business_account{id,username,name,profile_picture_url}",
        access_token: userAccessToken
    });
    const pages = await Promise.all(pageResponse.data.map(async (page) => {
        const instagram = await fetchInstagramForPage(page, userAccessToken);
        return {
            id: page.id,
            name: page.name,
            category: page.category,
            accessToken: page.access_token,
            tasks: page.tasks || page.perms || [],
            pictureUrl: page.picture?.data?.url,
            instagram
        };
    }));
    return { pages };
}
async function fetchInstagramForPage(page, fallbackUserToken) {
    if (page.instagram_business_account?.id) {
        return page.instagram_business_account;
    }
    try {
        const token = page.access_token || fallbackUserToken;
        const response = await graphGet(`/${page.id}`, {
            fields: "instagram_business_account{id,username,name,profile_picture_url,followers_count,media_count}",
            access_token: token
        });
        return response.instagram_business_account || null;
    }
    catch {
        return null;
    }
}
async function graphGet(path, params) {
    const { data } = await axios.get(`https://graph.facebook.com/${env.FACEBOOK_GRAPH_VERSION}${path}`, {
        params,
        timeout: 20_000
    });
    return data;
}
