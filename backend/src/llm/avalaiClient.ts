import axios from "axios";

export interface Message {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AvalAIResponse {
  text: string;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  raw: any;
}

export async function chatComplete(messages: Message[], model: string, temperature: number): Promise<AvalAIResponse> {
  const apiKey = process.env.AVALAI_API_KEY;
  const baseURL = process.env.AVALAI_BASE_URL || "https://api.avalai.ir/v1";

  if (!apiKey) {
    // mock response for local dev
    const combined = messages.map((m) => `${m.role}: ${m.content}`).join("\n");
    return {
      text: `Mock response for model ${model}. Summary: ${combined.slice(0, 150)}`,
      inputTokens: combined.length / 4,
      outputTokens: 80,
      reasoningTokens: 0,
      raw: { mock: true },
    };
  }

  const resp = await axios.post(
    `${baseURL}/chat/completions`,
    { model, messages, temperature },
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  const choice = resp.data?.choices?.[0]?.message?.content || "";
  const usage = resp.data?.usage || {};
  return {
    text: choice,
    inputTokens: usage.input_tokens || usage.prompt_tokens || 0,
    outputTokens: usage.output_tokens || usage.completion_tokens || 0,
    reasoningTokens: usage.reasoning_tokens || 0,
    raw: resp.data,
  };
}
