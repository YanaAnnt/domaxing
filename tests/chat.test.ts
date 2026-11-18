import { afterEach, describe, expect, it, vi } from "vitest";
import { buildSystemPrompt, toApiMessages, type ChatMessage } from "../lib/ai/conversation.ts";
import { useChat } from "../lib/ai/chat.ts";
import { useAISettings } from "../lib/ai/settings.ts";

// The tools read a fixed snapshot instead of the app's stores.
vi.mock("../lib/ai/snapshot.ts", () => ({
  readSnapshot: () => ({
    today: "2026-11-18",
    categories: [],
    lists: [],
    events: [],
    calendarConnected: false,
    tasks: [
      { id: "t1", title: "Buy milk", notes: "", categoryId: null, listId: null, dueDate: "2026-11-18", dueTime: null, priority: 0, subtasks: [], recurrence: null, reminderAt: null, tags: [], completed: false, completedAt: null, order: 0, createdAt: "", updatedAt: "" },
    ],
  }),
}));

let n = 0;
const msg = (role: ChatMessage["role"], text: string, error?: string): ChatMessage => ({
  id: String(++n),
  role,
  text,
  createdAt: "2026-11-18T10:00:00.000Z",
  ...(error ? { error } : {}),
});

describe("toApiMessages", () => {
  it("keeps a normal back-and-forth as is", () => {
    expect(toApiMessages([msg("user", "Hi"), msg("assistant", "Hello!"), msg("user", "Plan my week")])).toEqual([
      { role: "user", content: "Hi" },
      { role: "assistant", content: "Hello!" },
      { role: "user", content: "Plan my week" },
    ]);
  });

  it("skips failed empty replies and merges the user's messages around them", () => {
    const history = [msg("user", "Hi"), msg("assistant", "", "That key was not accepted."), msg("user", "Hi again")];
    expect(toApiMessages(history)).toEqual([{ role: "user", content: "Hi\n\nHi again" }]);
  });

  it("keeps a partial reply that was cut short", () => {
    const history = [msg("user", "Long plan please"), msg("assistant", "Step 1…", "The reply was cut short"), msg("user", "Go on")];
    expect(toApiMessages(history).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });

  it("sends only the most recent messages and always starts with the user", () => {
    const history = Array.from({ length: 10 }, (_, i) => msg(i % 2 ? "assistant" : "user", `m${i}`));
    const out = toApiMessages(history, 5);
    expect(out[0]).toEqual({ role: "user", content: "m6" });
    expect(out).toHaveLength(4);
  });
});

describe("buildSystemPrompt", () => {
  it("includes the user's date, time and time zone", () => {
    const p = buildSystemPrompt(new Date(2026, 10, 18, 14, 5), "Asia/Jerusalem");
    expect(p).toContain("Wednesday, 18 November 2026, 14:05");
    expect(p).toContain("Asia/Jerusalem");
  });
});

type Block = { text: string[] } | { tool: { id: string; name: string; input: unknown } };

/** A streamed Messages API response in server-sent events format. */
function sseResponse(chunks: string[], stopReason = "end_turn") {
  return sseBlocks([{ text: chunks }], stopReason);
}

function sseBlocks(blocks: Block[], stopReason: string) {
  const events: [string, unknown][] = [
    ["message_start", { type: "message_start", message: { id: "msg_1", type: "message", role: "assistant", model: "claude-opus-5-5", content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } }],
  ];
  blocks.forEach((b, index) => {
    if ("text" in b) {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }]);
      for (const text of b.text) events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text } }]);
    } else {
      events.push(["content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id: b.tool.id, name: b.tool.name, input: {} } }]);
      events.push(["content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(b.tool.input) } }]);
    }
    events.push(["content_block_stop", { type: "content_block_stop", index }]);
  });
  events.push(
    ["message_delta", { type: "message_delta", delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 5 } }],
    ["message_stop", { type: "message_stop" }],
  );
  const body = events.map(([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

describe("useChat.send", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    useChat.setState({ messages: [], streaming: false });
  });

  it("streams the reply into the history and sends the conversation with the chosen model", async () => {
    useAISettings.setState({ apiKey: "sk-ant-api03-test-key-0000000000", model: "claude-sonnet-5-5" });
    const fetchMock = vi.fn(async () => sseResponse(["Here is ", "your plan."]));
    vi.stubGlobal("fetch", fetchMock);

    await useChat.getState().send("  Plan my Thursday  ");

    const { messages, streaming } = useChat.getState();
    expect(streaming).toBe(false);
    expect(messages.map((m) => [m.role, m.text])).toEqual([
      ["user", "Plan my Thursday"],
      ["assistant", "Here is your plan."],
    ]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    const sent = JSON.parse(String(init.body));
    expect(sent.model).toBe("claude-sonnet-5-5");
    expect(sent.stream).toBe(true);
    expect(sent.messages).toEqual([{ role: "user", content: "Plan my Thursday" }]);
    expect(sent.system).toContain("Domaxing");
  });

  it("lets the assistant look at today's tasks and then answer", async () => {
    useAISettings.setState({ apiKey: "sk-ant-api03-test-key-0000000000" });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(sseBlocks([{ text: ["Let me look."] }, { tool: { id: "toolu_1", name: "get_today", input: {} } }], "tool_use"))
      .mockResolvedValueOnce(sseResponse(["Start with ", "Buy milk."]));
    vi.stubGlobal("fetch", fetchMock);

    await useChat.getState().send("What should I do today?");

    const reply = useChat.getState().messages[1];
    expect(reply).toMatchObject({ text: "Let me look.\n\nStart with Buy milk.", tools: ["get_today"] });
    expect(reply.error).toBeUndefined();

    const second = JSON.parse(String((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body));
    expect(second.tools.map((t: { name: string }) => t.name)).toEqual(["get_today", "list_tasks", "list_lists", "get_calendar"]);
    expect(second.messages).toHaveLength(3);
    expect(second.messages[1].role).toBe("assistant");
    const result = second.messages[2].content[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(JSON.parse(result.content).due_today).toEqual([{ title: "Buy milk", list: "Inbox", due: "2026-11-18" }]);
  });

  it("marks a reply that hit the token limit", async () => {
    useAISettings.setState({ apiKey: "sk-ant-api03-test-key-0000000000" });
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse(["Step 1"], "max_tokens")));
    await useChat.getState().send("A very long plan");
    expect(useChat.getState().messages[1]).toMatchObject({ text: "Step 1", error: expect.stringContaining("cut short") });
  });

  it("shows a friendly error when the key is rejected", async () => {
    useAISettings.setState({ apiKey: "sk-ant-api03-test-key-0000000000" });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }), { status: 401, headers: { "content-type": "application/json" } })),
    );
    await useChat.getState().send("Hi");
    expect(useChat.getState().messages[1]).toMatchObject({ text: "", error: "That key was not accepted. Check that you copied the whole key." });
  });

  it("does nothing without a key", async () => {
    useAISettings.setState({ apiKey: "" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await useChat.getState().send("Hi");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(useChat.getState().messages).toEqual([]);
  });
});
