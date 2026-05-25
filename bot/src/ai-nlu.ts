import OpenAI from "openai";

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
});

export interface ParsedIntent {
  action: "deposit" | "withdraw" | "compare" | "invest" | "status" | "help" | "unknown";
  amount?: number;
  token?: string;
  strategy?: string;
  riskLevel?: "low" | "medium" | "high";
  rawQuery: string;
}

const SYSTEM_PROMPT = `You are a DeFi intent parser. Parse user's natural language into structured JSON.

Output ONLY valid JSON with these fields:
- action: "deposit" | "withdraw" | "compare" | "invest" | "status" | "help" | "unknown"
- amount: number (in USDC or MNT, extract the number)
- token: string (USDC, MNT, etc.)
- strategy: string (name of strategy if mentioned: "highest yield", "stable", "lending", "lp")
- riskLevel: "low" | "medium" | "high"
- rawQuery: the original user message

Examples:
"存100个USDC" → {"action":"deposit","amount":100,"token":"USDC","strategy":"","riskLevel":"low","rawQuery":"存100个USDC"}
"哪个池子收益最高" → {"action":"compare","amount":0,"token":"","strategy":"highest yield","riskLevel":"medium","rawQuery":"哪个池子收益最高"}
"把50个MNT投到收益最高的策略" → {"action":"invest","amount":50,"token":"MNT","strategy":"highest yield","riskLevel":"high","rawQuery":"把50个MNT投到收益最高的策略"}
"show my portfolio" → {"action":"status","amount":0,"token":"","strategy":"","riskLevel":"low","rawQuery":"show my portfolio"}`;

export async function parseIntent(userMessage: string): Promise<ParsedIntent> {
  try {
    const response = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.1,
      max_tokens: 200,
    });

    const content = response.choices[0]?.message?.content || "{}";
    const parsed = JSON.parse(content.trim());
    return { ...parsed, rawQuery: userMessage } as ParsedIntent;
  } catch {
    return {
      action: "unknown",
      rawQuery: userMessage,
    };
  }
}

export async function generateResponse(
  intent: ParsedIntent,
  context: Record<string, any>
): Promise<string> {
  const ctxPrompt = `Context data: ${JSON.stringify(context)}`;

  const response = await deepseek.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content: `You are ClawBot, an AI DeFi assistant on Mantle Network.
You help users manage their crypto assets with natural language commands.
Be concise, professional, and slightly playful. Use emoji sparingly.
When showing numbers, format APY as percentage (e.g., "12.0%") and amounts with token symbol.
Always remind users that you are an AI agent and they should verify transactions.
${ctxPrompt}`,
      },
      { role: "user", content: intent.rawQuery },
    ],
    temperature: 0.7,
    max_tokens: 400,
  });

  return response.choices[0]?.message?.content || "Sorry, I couldn't process that.";
}
