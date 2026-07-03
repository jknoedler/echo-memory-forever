import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  SendHorizonal,
  Loader2,
  CheckCircle2,
  CircleDot,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getThreadMessages } from "@/lib/threads.functions";
import { listThreads, setThreadContinuity } from "@/lib/threads.functions";
import {
  AttachmentsButton,
  AttachmentChips,
  type Attachment,
} from "@/components/chat-attachments";
import { ChatSettings, ModelPicker, useAdvanced } from "@/components/chat-settings";
import { startMicRecorder, type MicRecorder } from "@/lib/voice";
import { extractYouTubeIds, type YouTubeIngest } from "@/lib/youtube";
import { buildAudioViz } from "@/lib/audio-viz";

export const Route = createFileRoute("/_authenticated/c/$threadId")({
  component: ChatPage,
});

type DBMsg = { id: string; role: string; content: string; parts: unknown; created_at: string };

function stripFallbackBanner(text: string): string {
  return text.replace(
    /^\s*↻?\s*Primary model declined\s+[—-]\s*capability fallback engaged\.\s*/i,
    "",
  );
}

function dbToUI(m: DBMsg): UIMessage {
  const parts = Array.isArray(m.parts)
    ? (m.parts as UIMessage["parts"])
    : [{ type: "text" as const, text: stripFallbackBanner(m.content) }];
  return { id: m.id, role: (m.role as UIMessage["role"]) ?? "user", parts };
}

function fileToDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(f);
  });
}

const VOICE_KEY = "mement0_voice_mode";

function ChatPage() {
  const { threadId } = Route.useParams();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      setToken(session?.access_token ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);


  const historyQ = useQuery({
    queryKey: ["messages", threadId],
    queryFn: () => getThreadMessages({ data: { threadId } }),
  });

  const initial = useMemo<UIMessage[]>(
    () => (historyQ.data ?? []).map(dbToUI),
    [historyQ.data],
  );

  if (historyQ.isLoading || !token) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading thread…
      </div>
    );
  }

  return <ChatWindow key={threadId} threadId={threadId} token={token} initialMessages={initial} />;
}

type AttachmentWithFile = Attachment & { file: File };

function ChatWindow({
  threadId,
  token,
  initialMessages,
}: {
  threadId: string;
  token: string;
  initialMessages: UIMessage[];
}) {
  const transport = useMemo(
    () => {
      // Snapshot the user's IANA timezone once per mount. The server uses it
      // to render an accurate wall-clock + Pacific anchor into the system
      // prompt so the model stops guessing what time it is.
      let tz = "America/Los_Angeles";
      try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
      } catch {}
      return new DefaultChatTransport({
        api: "/api/chat",
        // Fetch a fresh access token on every send. Supabase tokens expire
        // after ~1h; capturing once on mount caused 401s mid-conversation.
        headers: async () => {
          const { data } = await supabase.auth.getSession();
          const t = data.session?.access_token ?? token;
          return { Authorization: `Bearer ${t}` };
        },
        body: { threadId, tz },
      });
    },
    [threadId, token],
  );


  const { messages, sendMessage, status, error, setMessages } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
  });

  // In-flight chat_jobs (rescue path). On mount, look for any pending or
  // processing job on this thread — that means the user asked something,
  // then closed/reloaded before the assistant finished. Show the thinking
  // indicator immediately and let realtime deliver the answer.
  const [hasInFlightJob, setHasInFlightJob] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("chat_jobs")
        .select("id")
        .eq("thread_id", threadId)
        .in("status", ["pending", "processing"])
        .limit(1);
      if (!cancelled) setHasInFlightJob((data?.length ?? 0) > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [threadId]);

  // Realtime: new assistant messages (from the rescue worker after a
  // disconnect) and chat_jobs status transitions for this thread.
  useEffect(() => {
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as DBMsg;
          if (row.role !== "assistant") return;
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            // Dedupe: if the last assistant message already carries the
            // same text (the live streaming path just persisted it), skip
            // — otherwise we double-render on the connected client.
            const rowText = (row.content ?? "").trim();
            for (let i = prev.length - 1; i >= 0; i--) {
              const m = prev[i];
              if (m.role !== "assistant") break;
              const mt = m.parts
                .map((p) => (p.type === "text" ? p.text : ""))
                .join("")
                .trim();
              if (mt && rowText && mt === rowText) return prev;
            }
            return [...prev, dbToUI(row)];
          });
          setHasInFlightJob(false);
        },

      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "chat_jobs",
          filter: `thread_id=eq.${threadId}`,
        },
        (payload) => {
          const row = payload.new as { status: string; error: string | null };
          if (row.status === "complete" || row.status === "failed") {
            setHasInFlightJob(false);
            if (row.status === "failed") {
              toast.error(row.error || "Reply failed. Try again.");
            }
          } else if (row.status === "processing" || row.status === "pending") {
            setHasInFlightJob(true);
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [threadId, setMessages]);


  const [input, setInput] = useState("");
  const [attachments, setAttachments] = useState<AttachmentWithFile[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [advanced, setAdvanced] = useAdvanced();

  // Voice mode (mic + TTS)
  const [voiceMode, setVoiceMode] = useState<boolean>(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    setVoiceMode(window.localStorage.getItem(VOICE_KEY) === "1");
  }, []);
  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(VOICE_KEY, voiceMode ? "1" : "0");
    }
  }, [voiceMode]);

  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recorderRef = useRef<MicRecorder | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const playedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);

  const consumedRef = useRef(false);
  useEffect(() => {
    if (consumedRef.current) return;
    const pending = sessionStorage.getItem("mement0_pending_prompt");
    if (pending && pending.trim()) {
      consumedRef.current = true;
      sessionStorage.removeItem("mement0_pending_prompt");
      sendMessage({ text: pending });
    }
  }, [sendMessage]);

  const lastCountRef = useRef(0);
  useEffect(() => {
    if (messages.length > lastCountRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
      lastCountRef.current = messages.length;
    }
  }, [messages]);

  // Autoplay TTS on each newly-completed assistant message (voice mode only)
  useEffect(() => {
    if (!voiceMode) return;
    if (status !== "ready") return;
    const last = messages[messages.length - 1];
    if (!last || last.role !== "assistant") return;
    if (playedRef.current.has(last.id)) return;
    const text = last.parts
      .map((p) => (p.type === "text" ? stripFallbackBanner(p.text) : ""))
      .filter(Boolean)
      .join("")
      .trim();
    if (!text) return;
    playedRef.current.add(last.id);
    void speak(text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, status, voiceMode]);

  async function speak(text: string) {
    try {
      // Stop any current playback
      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current = null;
      }
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) throw new Error(`TTS failed: ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = new Audio(url);
      audioElRef.current = a;
      a.onended = () => URL.revokeObjectURL(url);
      await a.play();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't play voice");
    }
  }

  function stopSpeaking() {
    if (audioElRef.current) {
      audioElRef.current.pause();
      audioElRef.current = null;
    }
  }

  const isBusy = status === "submitted" || status === "streaming";

  const qc = useQueryClient();
  const threadsQ = useQuery({ queryKey: ["threads"], queryFn: () => listThreads() });
  const thisThread = threadsQ.data?.find((t) => t.id === threadId);
  const continuity = thisThread?.continuity_status ?? "open";
  const setStatus = useMutation({
    mutationFn: (status: "open" | "resolved") =>
      setThreadContinuity({ data: { id: threadId, status } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["threads"] });
      toast.success("Continuity updated");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  function addFiles(files: File[]) {
    const next: AttachmentWithFile[] = files.map((f) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: f.name || (f.type.startsWith("image/") ? "pasted-image" : "file"),
      type: f.type || "application/octet-stream",
      size: f.size,
      previewUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      file: f,
    }));
    setAttachments((p) => [...p, ...next]);
  }

  function removeAttachment(id: string) {
    setAttachments((p) => {
      const out = p.filter((a) => a.id !== id);
      const removed = p.find((a) => a.id === id);
      if (removed?.previewUrl) URL.revokeObjectURL(removed.previewUrl);
      return out;
    });
  }

  function onPaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files: File[] = [];
    for (const it of items) {
      if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) files.push(f);
      }
    }
    if (files.length) {
      e.preventDefault();
      addFiles(files);
    }
  }

  const transcribeBlob = useCallback(
    async (blob: Blob): Promise<string> => {
      const form = new FormData();
      form.append("file", blob, "recording.wav");
      const res = await fetch("/api/stt", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        throw new Error(t || `Transcription failed: ${res.status}`);
      }
      const json = (await res.json()) as { text?: string };
      return (json.text ?? "").trim();
    },
    [token],
  );

  async function toggleMic() {
    if (recording) {
      const rec = recorderRef.current;
      recorderRef.current = null;
      setRecording(false);
      if (!rec) return;
      try {
        setTranscribing(true);
        const blob = await rec.stop();
        if (blob.size < 2048) {
          toast.error("That recording was empty — try again.");
          return;
        }
        const text = await transcribeBlob(blob);
        if (!text) {
          toast.error("Didn't catch that.");
          return;
        }
        await sendComposed(text, []);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Mic failed");
      } finally {
        setTranscribing(false);
      }
      return;
    }
    try {
      stopSpeaking();
      const rec = await startMicRecorder();
      recorderRef.current = rec;
      setRecording(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Microphone permission denied");
    }
  }

  async function ingestYouTube(videoUrl: string): Promise<YouTubeIngest | null> {
    try {
      const res = await fetch("/api/youtube", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ url: videoUrl }),
      });
      if (!res.ok) return null;
      return (await res.json()) as YouTubeIngest;
    } catch {
      return null;
    }
  }

  async function sendComposed(text: string, attached: AttachmentWithFile[]) {
    if (continuity === "resolved") setStatus.mutate("open");

    const fileParts: { type: "file"; mediaType: string; url: string }[] = [];
    let augmentedText = text;

    // 1. YouTube URLs in the message → pull transcript + thumbnail
    //    storyboard so DED can "watch" the video.
    const ytIds = extractYouTubeIds(text);
    if (ytIds.length) {
      toast.info(`Ingesting ${ytIds.length} YouTube link${ytIds.length > 1 ? "s" : ""}…`);
      const ingests = await Promise.all(
        ytIds.map((id) => ingestYouTube(`https://www.youtube.com/watch?v=${id}`)),
      );
      for (const ing of ingests) {
        if (!ing) continue;
        for (const url of ing.thumbnails) {
          fileParts.push({ type: "file", mediaType: "image/jpeg", url });
        }
        const header = `[YouTube ingest: ${ing.title ?? ing.videoId}${ing.author ? ` — ${ing.author}` : ""} · ${ing.url}]`;
        const transcriptBlock = ing.transcript
          ? `Transcript (captions):\n${ing.transcript}`
          : "No captions were available for this video. The thumbnails above are the only frames I could pull — treat them as a 4-frame storyboard.";
        augmentedText +=
          (augmentedText ? "\n\n" : "") + `${header}\n${transcriptBlock}`;
      }
    }

    // 2. Per-attachment handling.
    //    - Audio: in addition to transcribing speech, render a waveform +
    //      spectrogram so the vision model can read dynamics and frequency
    //      content (lyrics/chords workaround for SoundCloud, demos, etc.).
    //    - Non-wav/mp3 audio still gets transcribed; wav/mp3 also passes
    //      through as a file part for Gemini to ingest directly.
    //    - Everything else: ride through as a file part.
    for (const a of attached) {
      const mt = a.type || "application/octet-stream";
      const isAudio = mt.startsWith("audio/");
      const safeAudio = mt === "audio/wav" || mt === "audio/mpeg" || mt === "audio/mp3";

      if (isAudio) {
        // Render the visualizations first — these are the workaround for
        // "the model can't actually hear."
        try {
          const viz = await buildAudioViz(a.file);
          const [wave, spec] = await Promise.all([
            fileToDataUrl(viz.waveform),
            fileToDataUrl(viz.spectrogram),
          ]);
          fileParts.push({ type: "file", mediaType: "image/png", url: wave });
          fileParts.push({ type: "file", mediaType: "image/png", url: spec });
          augmentedText +=
            (augmentedText ? "\n\n" : "") +
            `[audio analysis pack for ${a.name} · ${viz.durationSec.toFixed(1)}s @ ${viz.sampleRate}Hz]\nAttached: waveform (dynamics, structure, silence) and log-frequency spectrogram (tonal balance, brightness, mix density). Read them as the audio.`;
        } catch (e) {
          augmentedText +=
            (augmentedText ? "\n\n" : "") +
            `[audio viz for ${a.name} failed: ${e instanceof Error ? e.message : "decode error"}]`;
        }

        if (safeAudio) {
          try {
            const dataUrl = await fileToDataUrl(a.file);
            fileParts.push({ type: "file", mediaType: mt, url: dataUrl });
          } catch {
            /* fall through to transcript only */
          }
        } else {
          try {
            const transcript = await transcribeBlob(a.file);
            if (transcript) {
              augmentedText +=
                (augmentedText ? "\n\n" : "") +
                `[speech transcript of ${a.name}]: ${transcript}`;
            }
          } catch {
            augmentedText +=
              (augmentedText ? "\n\n" : "") +
              `[speech in ${a.name} could not be transcribed — rely on the spectrogram/waveform]`;
          }
        }
        continue;
      }

      try {
        const dataUrl = await fileToDataUrl(a.file);
        fileParts.push({ type: "file", mediaType: mt, url: dataUrl });
      } catch {
        augmentedText +=
          (augmentedText ? "\n\n" : "") + `[attachment ${a.name} could not be loaded]`;
      }
    }

    const parts: UIMessage["parts"] = [];
    for (const fp of fileParts) parts.push(fp);
    if (augmentedText.trim()) parts.push({ type: "text", text: augmentedText });
    if (parts.length === 0) return;

    await sendMessage({ role: "user", parts });
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if ((!text && attachments.length === 0) || isBusy) return;
    const queued = attachments;
    setInput("");
    setAttachments([]);
    try {
      await sendComposed(text, queued);
    } finally {
      queued.forEach((a) => a.previewUrl && URL.revokeObjectURL(a.previewUrl));
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-background/85 backdrop-blur px-4 py-2 text-xs gap-2">
        <span className="truncate text-muted-foreground min-w-0 flex-1">
          {thisThread?.title ?? ""}
        </span>
        <button
          type="button"
          onClick={() =>
            setStatus.mutate(continuity === "resolved" ? "open" : "resolved")
          }
          disabled={setStatus.isPending}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors ${
            continuity === "resolved"
              ? "border-border text-muted-foreground hover:text-foreground"
              : "border-primary/40 text-primary hover:bg-primary/10"
          }`}
        >
          {continuity === "resolved" ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5" /> Resolved
            </>
          ) : (
            <>
              <CircleDot className="h-3.5 w-3.5" /> Open
            </>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setVoiceMode((v) => {
              const next = !v;
              if (!next) stopSpeaking();
              return next;
            });
          }}
          className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 transition-colors ${
            voiceMode
              ? "border-primary/40 text-primary hover:bg-primary/10"
              : "border-border text-muted-foreground hover:text-foreground"
          }`}
          title={voiceMode ? "Voice replies on" : "Voice replies off"}
        >
          {voiceMode ? <Volume2 className="h-3.5 w-3.5" /> : <VolumeX className="h-3.5 w-3.5" />}
          {voiceMode ? "Voice" : "Silent"}
        </button>
        <ChatSettings advanced={advanced} setAdvanced={setAdvanced} />
      </div>

      <div className="flex-1 overflow-y-auto" ref={scrollRef}>
        <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-20">
              <p className="text-sm">The archive listens.</p>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
          {(status === "submitted" || hasInFlightJob) && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {hasInFlightJob && status !== "streaming" && status !== "submitted"
                ? "Finishing your last message…"
                : "thinking…"}
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
              {error.message || "Stream failed"}
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      <form onSubmit={submit} className="border-t border-border bg-card/40 px-4 py-3">
        <div className="mx-auto max-w-3xl">
          <AttachmentChips items={attachments} onRemove={removeAttachment} />
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onPaste={onPaste}
              placeholder={recording ? "Listening…" : "Speak. The archive is listening."}
              rows={1}
              disabled={recording || transcribing}
              className="flex-1 resize-none rounded-md border border-border bg-background px-4 py-3 text-base md:text-sm outline-none focus:border-primary disabled:opacity-60"
              style={{ maxHeight: 240 }}
            />
            <button
              type="button"
              onClick={toggleMic}
              disabled={transcribing || isBusy}
              className={`inline-flex h-11 w-11 items-center justify-center rounded-md border transition-colors ${
                recording
                  ? "border-destructive bg-destructive/10 text-destructive animate-pulse"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
              } disabled:opacity-40`}
              aria-label={recording ? "Stop recording" : "Start recording"}
              title={recording ? "Stop recording" : "Hold a conversation"}
            >
              {transcribing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : recording ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
            </button>
            <button
              type="submit"
              disabled={isBusy || (!input.trim() && attachments.length === 0)}
              className="inline-flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40"
              aria-label="Send"
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <SendHorizonal className="h-4 w-4" />
              )}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <AttachmentsButton onAdd={addFiles} />
            {advanced && <ModelPicker />}
            {recording && (
              <span className="text-xs text-destructive animate-pulse">● recording</span>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}

function MessageBubble({ msg }: { msg: UIMessage }) {
  const isUser = msg.role === "user";
  const text = msg.parts
    .map((p) => (p.type === "text" ? stripFallbackBanner(p.text) : ""))
    .filter(Boolean)
    .join("");
  const files = msg.parts.filter(
    (p): p is { type: "file"; mediaType: string; url: string } => p.type === "file",
  );
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap space-y-2 ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border text-foreground"
        }`}
      >
        {files.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {files.map((f, i) =>
              f.mediaType.startsWith("image/") ? (
                <img
                  key={i}
                  src={f.url}
                  alt=""
                  className="max-h-48 rounded-md border border-border/50"
                />
              ) : f.mediaType.startsWith("video/") ? (
                <video
                  key={i}
                  src={f.url}
                  controls
                  className="max-h-56 rounded-md border border-border/50"
                />
              ) : f.mediaType.startsWith("audio/") ? (
                <audio key={i} src={f.url} controls className="max-w-full" />
              ) : (
                <span
                  key={i}
                  className="rounded-md border border-border/50 px-2 py-1 text-xs"
                >
                  {f.mediaType || "file"}
                </span>
              ),
            )}
          </div>
        )}
        {text}
      </div>
    </div>
  );
}
