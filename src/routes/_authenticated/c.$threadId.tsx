import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { SendHorizonal, Loader2, CheckCircle2, CircleDot } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getThreadMessages } from "@/lib/threads.functions";
import { listThreads, setThreadContinuity } from "@/lib/threads.functions";

export const Route = createFileRoute("/_authenticated/c/$threadId")({
  component: ChatPage,
});

type DBMsg = { id: string; role: string; content: string; parts: unknown; created_at: string };

function dbToUI(m: DBMsg): UIMessage {
  const parts = Array.isArray(m.parts)
    ? (m.parts as UIMessage["parts"])
    : [{ type: "text" as const, text: m.content }];
  return {
    id: m.id,
    role: (m.role as UIMessage["role"]) ?? "user",
    parts,
  };
}

function ChatPage() {
  const { threadId } = Route.useParams();
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
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
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: { Authorization: `Bearer ${token}` },
        body: { threadId },
      }),
    [threadId, token],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initialMessages,
    transport,
  });

  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [threadId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, status]);

  const isBusy = status === "submitted" || status === "streaming";

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const text = input.trim();
    if (!text || isBusy) return;
    setInput("");
    try {
      await sendMessage({ text });
    } finally {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  return (
    <div className="flex flex-1 flex-col min-h-0">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
          {messages.length === 0 && (
            <div className="text-center text-muted-foreground py-20">
              <p className="text-sm">The archive listens.</p>
            </div>
          )}
          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
          {status === "submitted" && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              thinking…
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

      <form
        onSubmit={submit}
        className="border-t border-border bg-card/40 px-4 py-3"
      >
        <div className="mx-auto max-w-3xl flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Speak. The archive is listening."
            rows={1}
            className="flex-1 resize-none rounded-md border border-border bg-background px-4 py-3 text-sm outline-none focus:border-primary"
            style={{ maxHeight: 240 }}
          />
          <button
            type="submit"
            disabled={isBusy || !input.trim()}
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
      </form>
    </div>
  );
}

function MessageBubble({ msg }: { msg: UIMessage }) {
  const isUser = msg.role === "user";
  const text = msg.parts
    .map((p) => (p.type === "text" ? p.text : ""))
    .filter(Boolean)
    .join("");
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap ${
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-card border border-border text-foreground"
        }`}
      >
        {text}
      </div>
    </div>
  );
}
