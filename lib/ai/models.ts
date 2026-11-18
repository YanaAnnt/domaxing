// The Claude models a user can pick for the assistant when they bring their own Anthropic API key.
// Prices are Anthropic's list prices in US dollars per million tokens (input / output).

export interface ModelOption {
  id: string;
  name: string;
  description: string;
  price: { input: number; output: number };
}

export const MODELS: ModelOption[] = [
  {
    id: "claude-opus-5-5",
    name: "Claude Opus 5.5",
    description: "Recommended. The best plans and the most reliable follow-through.",
    price: { input: 4, output: 20 },
  },
  {
    id: "claude-sonnet-5-5",
    name: "Claude Sonnet 5.5",
    description: "Fast and capable, at half the price.",
    price: { input: 2, output: 10 },
  },
  {
    id: "claude-haiku-5-5",
    name: "Claude Haiku 5.5",
    description: "The quickest and cheapest, for light everyday use.",
    price: { input: 0.1, output: 0.5 },
  },
];

export const DEFAULT_MODEL = MODELS[0].id;

export const modelById = (id: string): ModelOption => MODELS.find((m) => m.id === id) ?? MODELS[0];

export const formatPrice = (m: ModelOption) => `$${m.price.input} / $${m.price.output} per 1M tokens`;
