import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Camera,
  Image as ImageIcon,
  Paperclip,
  Mic,
  FileText,
  X,
} from "lucide-react";

export type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  previewUrl?: string;
};

export function AttachmentsButton({
  onAdd,
}: {
  onAdd: (files: File[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const cameraRef = useRef<HTMLInputElement>(null);
  const photosRef = useRef<HTMLInputElement>(null);
  const filesRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function handle(input: HTMLInputElement | null) {
    if (!input?.files?.length) return;
    onAdd(Array.from(input.files));
    input.value = "";
    setOpen(false);
  }

  const items = [
    { label: "Camera", icon: Camera, onClick: () => cameraRef.current?.click() },
    { label: "Photos", icon: ImageIcon, onClick: () => photosRef.current?.click() },
    { label: "Documents", icon: FileText, onClick: () => docRef.current?.click() },
    { label: "Audio", icon: Mic, onClick: () => audioRef.current?.click() },
    { label: "Any file", icon: Paperclip, onClick: () => filesRef.current?.click() },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
        aria-label="Add attachment"
      >
        <Plus className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute bottom-10 left-0 z-50 w-48 rounded-lg border border-border bg-popover p-1 shadow-xl">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={it.onClick}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs text-foreground hover:bg-secondary"
            >
              <it.icon className="h-3.5 w-3.5 text-muted-foreground" />
              {it.label}
            </button>
          ))}
        </div>
      )}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={() => handle(cameraRef.current)}
      />
      <input
        ref={photosRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        onChange={() => handle(photosRef.current)}
      />
      <input
        ref={docRef}
        type="file"
        accept=".pdf,.txt,.md,.doc,.docx,.csv,.json,.xlsx"
        multiple
        hidden
        onChange={() => handle(docRef.current)}
      />
      <input
        ref={audioRef}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={() => handle(audioRef.current)}
      />
      <input
        ref={filesRef}
        type="file"
        multiple
        hidden
        onChange={() => handle(filesRef.current)}
      />
    </div>
  );
}

export function AttachmentChips({
  items,
  onRemove,
}: {
  items: Attachment[];
  onRemove: (id: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 px-2 pb-2">
      {items.map((a) => (
        <div
          key={a.id}
          className="group relative inline-flex items-center gap-2 rounded-md border border-border bg-secondary/60 py-1 pl-1 pr-2 text-xs"
        >
          {a.previewUrl ? (
            <img
              src={a.previewUrl}
              alt=""
              className="h-7 w-7 rounded object-cover"
            />
          ) : (
            <span className="inline-flex h-7 w-7 items-center justify-center rounded bg-background">
              <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          )}
          <span className="max-w-[140px] truncate">{a.name}</span>
          <button
            type="button"
            onClick={() => onRemove(a.id)}
            className="ml-1 rounded p-0.5 text-muted-foreground hover:bg-background hover:text-destructive"
            aria-label="Remove"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
