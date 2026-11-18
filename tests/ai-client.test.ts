import Anthropic from "@anthropic-ai/sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { describeError, looksLikeAnthropicKey, maskKey, testConnection } from "../lib/ai/client.ts";
import { DEFAULT_MODEL, MODELS, modelById } from "../lib/ai/models.ts";

const KEY = "sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789-XYZW";

describe("models", () => {
  it("recommends Claude Opus 5.5 by default", () => {
    expect(DEFAULT_MODEL).toBe("claude-opus-5-5");
    expect(MODELS[0].description).toMatch(/Recommended/);
  });

  it("falls back to the default for an unknown model", () => {
    expect(modelById("no-such-model").id).toBe(DEFAULT_MODEL);
  });
});

describe("key helpers", () => {
  it("accepts Anthropic keys and rejects other text", () => {
    expect(looksLikeAnthropicKey(KEY)).toBe(true);
    expect(looksLikeAnthropicKey(`  ${KEY}  `)).toBe(true);
    expect(looksLikeAnthropicKey("sk-proj-abcdefghijklmnopqrstuvwxyz")).toBe(false);
    expect(looksLikeAnthropicKey("sk-ant-short")).toBe(false);
  });

  it("masks all but the start and end of a key", () => {
    expect(maskKey(KEY)).toBe("sk-ant-api03…XYZW");
    expect(maskKey("short")).toBe("•••••");
  });
});

describe("describeError", () => {
  const headers = new Headers();
  it.each([
    [new Anthropic.AuthenticationError(401, {}, "invalid x-api-key", headers), /not accepted/],
    [new Anthropic.PermissionDeniedError(403, {}, "forbidden", headers), /access to the selected model/],
    [new Anthropic.NotFoundError(404, {}, "not found", headers), /isn't available/],
    [new Anthropic.RateLimitError(429, {}, "slow down", headers), /Too many requests/],
    [new Anthropic.APIConnectionError({ message: "offline" }), /internet connection/],
    [new Error("boom"), /Something went wrong/],
  ])("explains %s in plain words", (error, expected) => {
    expect(describeError(error)).toMatch(expected);
  });
});

describe("testConnection", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("checks the model through the Models API, without generating text", async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      new Response(JSON.stringify({ type: "model", id: "claude-opus-5-5", display_name: "Claude Opus 5.5", created_at: "2026-10-01T00:00:00Z" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(testConnection(KEY, "claude-opus-5-5")).resolves.toEqual({ modelName: "Claude Opus 5.5" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.anthropic.com/v1/models/claude-opus-5-5");
    expect(init?.method).toBe("GET");
    const sent = new Headers(init?.headers);
    // The key travels only in the auth header of this one request to Anthropic.
    expect(sent.get("x-api-key") ?? sent.get("authorization")).toContain(KEY);
    expect(sent.get("anthropic-dangerous-direct-browser-access")).toBe("true");
  });

  it("surfaces a rejected key as an AuthenticationError", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    ));
    const error = await testConnection(KEY, "claude-opus-5-5").catch((e) => e);
    expect(error).toBeInstanceOf(Anthropic.AuthenticationError);
    expect(describeError(error)).toMatch(/not accepted/);
  });
});
