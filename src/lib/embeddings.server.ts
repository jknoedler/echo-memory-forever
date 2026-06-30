// Server-side embedding helper using OpenAI text-embedding-3-small (1536 dims),
// called directly against api.openai.com so the app has no dependency on the
// Lovable AI Gateway. Returns null when no OPENAI_API_KEY is configured —
// memory retrieval silently degrades to "no matches" in that case.
export const EMBED_MODEL = "text-embedding-3-small";
export const EMBED_DIM = 1536;

export async function embedText(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const cleaned = text.trim().slice(0, 8000);
  if (!cleaned) return null;
  try {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        input: cleaned,
        encoding_format: "float",
      }),
    });
    if (!res.ok) {
      console.error("[embed] openai error", res.status, await res.text().catch(() => ""));
      return null;
    }
    const json = (await res.json()) as { data?: Array<{ embedding: number[] }> };
    return json.data?.[0]?.embedding ?? null;
  } catch (e) {
    console.error("[embed] failed", e);
    return null;
  }
}
