// Talks to Claude straight from the browser (or the desktop app) with the user's own API key.
// The key goes only to api.anthropic.com; Domaxing has no server in between in this mode.
import Anthropic from "@anthropic-ai/sdk";

export function createClient(apiKey: string): Anthropic {
  // Browser use is safe here because the key is the user's own, typed into their own device.
  return new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 1 });
}

/** A quick format check before any network call. Real validation happens in testConnection. */
export function looksLikeAnthropicKey(key: string): boolean {
  return /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(key.trim());
}

/** Shows only the start and end of a key, e.g. "sk-ant-api03…x9Qz". */
export function maskKey(key: string): string {
  const k = key.trim();
  if (k.length <= 16) return "•".repeat(k.length);
  return `${k.slice(0, 12)}…${k.slice(-4)}`;
}

/** Turns an SDK error into one short sentence the user can act on. */
export function describeError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return "That key was not accepted. Check that you copied the whole key.";
  if (e instanceof Anthropic.PermissionDeniedError) return "This key doesn't have access to the selected model.";
  if (e instanceof Anthropic.NotFoundError) return "The selected model isn't available for this key.";
  if (e instanceof Anthropic.RateLimitError) return "Too many requests right now. Wait a moment and try again.";
  if (e instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic. Check your internet connection.";
  if (e instanceof Anthropic.InternalServerError) return "Anthropic is having trouble right now. Try again in a minute.";
  if (e instanceof Anthropic.APIError) return `Anthropic returned an error (${e.status ?? "unknown"}).`;
  return "Something went wrong while checking the key.";
}

/**
 * Checks the key and the model without generating any text, so the check costs nothing:
 * it asks the Models API for the selected model, which needs a valid key with access to it.
 */
export async function testConnection(apiKey: string, model: string): Promise<{ modelName: string }> {
  const info = await createClient(apiKey).models.retrieve(model);
  return { modelName: info.display_name };
}
