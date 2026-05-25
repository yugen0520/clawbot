import OpenAI from "openai";

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "",
  baseURL: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1",
});

// Per-chat language storage
const userLangs = new Map<number, string>();

export function detectLanguageName(text: string): string {
  if (/[一-鿿]/.test(text)) return "Chinese";
  if (/[぀-ゟ゠-ヿ]/.test(text)) return "Japanese";
  if (/[가-힯]/.test(text)) return "Korean";
  if (/[а-яА-ЯёЁ]/.test(text)) return "Russian";
  if (/[؀-ۿ]/.test(text)) return "Arabic";
  if (/[฀-๿]/.test(text)) return "Thai";
  return "English";
}

export function setUserLang(chatId: number, lang: string) {
  userLangs.set(chatId, lang);
}

export function getUserLang(chatId: number): string {
  return userLangs.get(chatId) || "English";
}

export async function translateText(english: string, targetLang: string): Promise<string> {
  if (targetLang === "English") return english;
  const response = await deepseek.chat.completions.create({
    model: "deepseek-chat",
    messages: [{
      role: "system",
      content: `Translate the following English text to ${targetLang}. Preserve all numbers, addresses (0x...), technical terms (APY, MNT, TVL, RPC, hash, protocol names), and Markdown formatting exactly as-is. Output ONLY the translated text.`,
    }, {
      role: "user",
      content: english,
    }],
    temperature: 0.2,
    max_tokens: 600,
  });
  return response.choices[0]?.message?.content || english;
}

export interface ParsedIntent {
  action: "deposit" | "withdraw" | "compare" | "invest" | "status" | "check_balance" | "rate_agent" | "lookup_agent" | "help" | "unknown";
  amount?: number;
  token?: string;
  strategy?: string;
  riskLevel?: "low" | "medium" | "high";
  targetAddress?: string;
  targetAgentId?: number;
  ratingScore?: number;
  rawQuery: string;
}

// ── Conversation history (last 5 rounds / 10 messages) ──

interface HistoryEntry {
  role: "user" | "assistant";
  content: string;
}

const chatHistories = new Map<number, HistoryEntry[]>();

function getHistory(chatId: number): HistoryEntry[] {
  if (!chatHistories.has(chatId)) {
    chatHistories.set(chatId, []);
  }
  return chatHistories.get(chatId)!;
}

export function addToHistory(chatId: number, role: "user" | "assistant", content: string) {
  const h = getHistory(chatId);
  h.push({ role, content });
  if (h.length > 10) h.splice(0, h.length - 10);
}

// ── Pending investment amounts (carried from NLU to execute callback) ──

const pendingInvestments = new Map<number, { amount: number; token: string }>();

export function setPendingInvestment(chatId: number, amount: number, token: string) {
  if (amount > 0) {
    pendingInvestments.set(chatId, { amount, token });
  }
}

export function getPendingInvestment(chatId: number): { amount: number; token: string } | null {
  return pendingInvestments.get(chatId) || null;
}

// ── Combined intent + response (single API call) ──

const COMBINED_SYSTEM = `You are ClawBot, an AI DeFi assistant on Mantle Network.

You MUST output exactly two sections separated by "---RESPONSE---":

---INTENT---
{"action":"<action>","amount":<number>,"token":"<string>","strategy":"<string>","riskLevel":"<level>","targetAddress":"<address>","targetAgentId":<number>,"ratingScore":<number>}
---RESPONSE---
<your natural language reply here>

Intent field rules:
- action: "deposit" | "withdraw" | "compare" | "invest" | "status" | "check_balance" | "rate_agent" | "lookup_agent" | "help" | "unknown"
- amount: number (extract the number, 0 if none. "20 MNT" → amount:20, token:"MNT")
- token: string (MNT / USDC etc., empty if none)
- strategy: string ("highest yield" / "stable" / "lending" etc., empty if none)
- riskLevel: "low" | "medium" | "high" (default "medium" for invest/compare)
- targetAddress: string (0x-prefixed address copied verbatim from user message, empty if none)
- targetAgentId: number (agent ID number if user mentions rating or looking up a specific agent, 0 if none)
- ratingScore: number (1-5 score if rating an agent, 0 if none)

Action mapping:
- Checking balance, wallet query → "check_balance"
- Comparing yields, asking about pools, "which is best" → "compare"
- Depositing, investing, buying, "spend X on" → "invest"
- Checking portfolio, my assets, my status → "status"
- Rating/endorsing an agent, giving stars: "rate agent 1 five stars" → "rate_agent" with targetAgentId:1, ratingScore:5
- Looking up agents, asking about reputation, "show me all agents", agent directory → "lookup_agent" with optional targetAgentId
- Help, greeting, unclear → "help"

Response rules:
- Reply in the SAME language the user is speaking
- Be concise, professional, slightly playful
- Format APY as percentage (e.g. "12.0%"), amounts with token symbol
- Remind users to verify transactions before signing

Conversation history is provided for context. Use it to understand follow-up questions and pronouns like "that", "it", "the first one".

IMPORTANT — Amount carry-over:
- If the user says "OK do it", "execute", "confirm", "好的帮我操作", etc. (confirming a previous suggestion), look at the conversation history to find the amount, token, and strategy from the previous messages. Copy those values into your intent JSON.
- Example: history has "buy 20 MNT" → user says "go ahead" → intent must have amount:20, token:"MNT", action:"deposit"`;

export async function processMessage(
  userMessage: string,
  chatId: number,
  language?: string
): Promise<{ intent: ParsedIntent; response: string }> {
  const history = getHistory(chatId);
  const historyBlock = history.length > 0
    ? history.map(e => `${e.role}: ${e.content}`).join("\n")
    : "(new conversation)";

  const langNote = language
    ? `The user speaks ${language}. Reply in ${language}.`
    : "Detect the user's language and reply in that language.";

  try {
    const apiResponse = await deepseek.chat.completions.create({
      model: "deepseek-chat",
      messages: [
        {
          role: "system",
          content: `${COMBINED_SYSTEM}\n\n${langNote}\n\nConversation history:\n${historyBlock}`,
        },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 700,
    });

    const content = apiResponse.choices[0]?.message?.content || "";

    // Parse the two sections
    const parts = content.split("---RESPONSE---");
    const intentBlock = (parts[0] || "").replace("---INTENT---", "").trim();
    const responseText = (parts[1] || "").trim();

    let intent: ParsedIntent;
    try {
      // Extract JSON object from intent block
      const jsonMatch = intentBlock.match(/\{[\s\S]*\}/);
      intent = JSON.parse(jsonMatch ? jsonMatch[0] : intentBlock) as ParsedIntent;
    } catch {
      intent = { action: "unknown", rawQuery: userMessage } as ParsedIntent;
    }

    // Fallback: extract 0x address from message if model missed it
    const addrMatch = userMessage.match(/0x[a-fA-F0-9]{40}/);
    if (!intent.targetAddress && addrMatch) {
      intent.targetAddress = addrMatch[0];
    }

    intent.rawQuery = userMessage;

    // Store in history
    addToHistory(chatId, "user", userMessage);
    if (responseText) {
      addToHistory(chatId, "assistant", responseText);
    }

    return {
      intent,
      response: responseText || "I didn't quite catch that. Could you rephrase?",
    };
  } catch {
    const addrMatch = userMessage.match(/0x[a-fA-F0-9]{40}/);
    return {
      intent: {
        action: addrMatch ? "check_balance" : "unknown",
        targetAddress: addrMatch?.[0],
        rawQuery: userMessage,
      },
      response: "Sorry, something went wrong. Please try again.",
    };
  }
}

// ── Standalone response generator (for callbacks / data-rich responses) ──

export async function generateResponse(
  intent: ParsedIntent,
  context: Record<string, any>,
  language?: string
): Promise<string> {
  const ctxPrompt = `Context data: ${JSON.stringify(context)}`;
  const langInstruction = language
    ? `Reply in ${language}.`
    : "CRITICAL: Reply in the EXACT same language as the user's message. Detect the language and match it.";

  const response = await deepseek.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content: [
          "You are ClawBot, an AI DeFi assistant on Mantle Network.",
          langInstruction,
          "Keep responses concise, professional, and slightly playful.",
          "Format APY as percentage (e.g. '12.0%'), amounts with token symbol.",
          "Always remind users to verify transactions before signing.",
          ctxPrompt,
        ].join("\n"),
      },
      { role: "user", content: intent.rawQuery },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  return response.choices[0]?.message?.content || "Sorry, I couldn't process that.";
}
