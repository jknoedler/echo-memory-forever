// YouTube ingest helpers (client-safe).
//
// The model can't watch YouTube. The workaround Mement0 ships:
//   1. Pull the captions/transcript and feed them as text.
//   2. Pull the canonical thumbnails (start / 25% / 50% / 75% / hero) and
//      feed them as image parts so the vision model sees a storyboard.
// Together those give DED enough signal to discuss the video honestly.

export type YouTubeIngest = {
  videoId: string;
  url: string;
  title: string | null;
  author: string | null;
  transcript: string | null;
  transcriptSource: "captions" | "none";
  thumbnails: string[]; // public https URLs, ordered start -> end
};

// Match watch?v=, youtu.be/, shorts/, embed/, /v/.
const YT_PATTERNS: RegExp[] = [
  /https?:\/\/(?:www\.|m\.)?youtube\.com\/watch\?[^\s]*\bv=([A-Za-z0-9_-]{11})/i,
  /https?:\/\/(?:www\.|m\.)?youtube\.com\/(?:shorts|embed|v|live)\/([A-Za-z0-9_-]{11})/i,
  /https?:\/\/youtu\.be\/([A-Za-z0-9_-]{11})/i,
];

export function extractYouTubeIds(text: string): string[] {
  if (!text) return [];
  const ids = new Set<string>();
  for (const re of YT_PATTERNS) {
    const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
    let m: RegExpExecArray | null;
    while ((m = g.exec(text))) ids.add(m[1]);
  }
  return [...ids];
}

export function canonicalThumbnails(videoId: string): string[] {
  // 0.jpg = hero, 1/2/3.jpg = start / mid / late frames YouTube pre-extracts.
  // maxresdefault gives a bigger hero when available.
  return [
    `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`,
    `https://i.ytimg.com/vi/${videoId}/1.jpg`,
    `https://i.ytimg.com/vi/${videoId}/2.jpg`,
    `https://i.ytimg.com/vi/${videoId}/3.jpg`,
  ];
}
