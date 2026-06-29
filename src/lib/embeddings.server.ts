// Server-side embedding helper using OpenAI text-embedding-3-small (1536 dims)
// via the Lovable AI Gateway.
const GATEWAY = "https://ai.gateway.lovable.dev/v1/embeddings";
export const EMBED_MODEL = "openai/text-embedding-3-small";
export const EMBED_DIM = 1536;

export async function embedText(text: string): Promise<number[] | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) return null;
  const cleaned = text.trim().slice(0, 8000);
  if (!cleaned) return null;
  try {
    const res = await fetch(GATEWAY, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": key,
        "X-Lovable-AIG-SDK": "vercel-ai-sdk",
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: cleaned,
        encoding_format: "float",
      }),
    });
    if (!res.ok) {
      console.error("[embed] gateway error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return json.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error("[embed] failed", e);
    return null;
  }
}
