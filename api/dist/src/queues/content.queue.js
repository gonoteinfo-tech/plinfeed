import { handleFeedProcess, handlePostGenerate, handlePostPublish } from "../workers/handlers.js";
/**
 * Process feed inline — parses RSS, creates posts, triggers AI generation.
 * Returns a fake job object for API compatibility.
 */
export async function enqueueFeedProcessing(data) {
    console.log(`[inline-queue] feed.process: feedId=${data.feedId}`);
    // Run async but don't await — mimics BullMQ behavior
    handleFeedProcess(data).catch((err) => console.error(`[inline-queue] feed.process FAILED:`, err));
    return { id: `inline-${Date.now()}` };
}
/**
 * Process post AI generation inline.
 */
export async function enqueuePostGeneration(data) {
    console.log(`[inline-queue] post.generate: postId=${data.postId}`);
    handlePostGenerate(data).catch((err) => console.error(`[inline-queue] post.generate FAILED:`, err));
    return { id: `inline-${Date.now()}` };
}
/**
 * Process post WordPress publishing inline.
 */
export async function enqueuePostPublishing(data) {
    console.log(`[inline-queue] post.publish: postId=${data.postId}`);
    handlePostPublish(data).catch((err) => console.error(`[inline-queue] post.publish FAILED:`, err));
    return { id: `inline-${Date.now()}` };
}
