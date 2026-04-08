import { GoogleGenAI } from "@google/genai";
import { ENV } from "./env";

export type Role = "system" | "user" | "assistant" | "tool" | "function";

export type TextContent = {
  type: "text";
  text: string;
};

export type ImageContent = {
  type: "image_url";
  image_url: {
    url: string;
    detail?: "auto" | "low" | "high";
  };
};

export type FileContent = {
  type: "file_url";
  file_url: {
    url: string;
    mime_type?: "audio/mpeg" | "audio/wav" | "application/pdf" | "audio/mp4" | "video/mp4";
  };
};

export type MessageContent = string | TextContent | ImageContent | FileContent;

export type Message = {
  role: Role;
  content: MessageContent | MessageContent[];
  name?: string;
  tool_call_id?: string;
};

export type JsonSchema = {
  name: string;
  schema: Record<string, unknown>;
  strict?: boolean;
};

export type OutputSchema = JsonSchema;

export type ResponseFormat =
  | { type: "text" }
  | { type: "json_object" }
  | { type: "json_schema"; json_schema: JsonSchema };

export type InvokeParams = {
  messages: Message[];
  maxTokens?: number;
  max_tokens?: number;
  outputSchema?: OutputSchema;
  output_schema?: OutputSchema;
  responseFormat?: ResponseFormat;
  response_format?: ResponseFormat;
};

export type ToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type InvokeResult = {
  id: string;
  created: number;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: Role;
      content: string | Array<TextContent | ImageContent | FileContent>;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
};

function extractTextFromContent(content: MessageContent | MessageContent[]): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part.type === "text") return part.text;
        return "";
      })
      .join("");
  }
  if (content.type === "text") return content.text;
  return "";
}

let _ai: GoogleGenAI | null = null;

function getAI(): GoogleGenAI {
  if (!_ai) {
    if (!ENV.forgeApiKey) {
      throw new Error("Gemini API key is not configured. Set AI_INTEGRATIONS_GEMINI_API_KEY.");
    }
    const opts: ConstructorParameters<typeof GoogleGenAI>[0] = {
      apiKey: ENV.forgeApiKey,
    };
    if (ENV.forgeApiUrl) {
      opts.httpOptions = {
        apiVersion: "",
        baseUrl: ENV.forgeApiUrl,
      };
    }
    _ai = new GoogleGenAI(opts);
  }
  return _ai;
}

export async function invokeLLM(params: InvokeParams): Promise<InvokeResult> {
  const ai = getAI();

  const { messages, responseFormat, response_format, outputSchema, output_schema } = params;
  const maxTokens = params.maxTokens ?? params.max_tokens ?? 8192;

  const systemParts = messages.filter((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");

  const systemInstruction = systemParts
    .map((m) => extractTextFromContent(m.content))
    .join("\n");

  const contents = chatMessages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: extractTextFromContent(m.content) }],
  }));

  const config: Record<string, unknown> = {
    maxOutputTokens: maxTokens,
  };

  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  const fmt = responseFormat ?? response_format;
  const schema = outputSchema ?? output_schema;
  if (fmt?.type === "json_object" || schema) {
    config.responseMimeType = "application/json";
  }

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash",
    contents,
    config,
  });

  const text = response.text ?? "";

  return {
    id: `gemini-${Date.now()}`,
    created: Math.floor(Date.now() / 1000),
    model: "gemini-2.5-flash",
    choices: [
      {
        index: 0,
        message: {
          role: "assistant",
          content: text,
        },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}
