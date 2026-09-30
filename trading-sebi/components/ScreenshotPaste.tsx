"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { uploadScreenshotAction } from "@/lib/actions";

/** Zona para pegar (Cmd+V), arrastrar o elegir capturas del gráfico. */
export function ScreenshotPaste({ tradeId }: { tradeId: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const running = useRef(false);

  async function upload(files: File[]) {
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (!images.length || running.current) return;
    running.current = true;
    setBusy(true);
    setStatus(`Subiendo ${images.length === 1 ? "captura" : `${images.length} capturas`}…`);
    try {
      for (const f of images) {
        const fd = new FormData();
        fd.set("trade_id", tradeId);
        fd.set("file", f);
        const res = await uploadScreenshotAction(fd);
        if (!res.ok) {
          setStatus(`Error: ${res.error}`);
          return;
        }
      }
      setStatus("Captura guardada");
      router.refresh();
    } catch {
      setStatus("Error al subir la captura. Probá de nuevo.");
    } finally {
      running.current = false;
      setBusy(false);
    }
  }

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const files = [...(e.clipboardData?.files ?? [])];
      if (files.some((f) => f.type.startsWith("image/"))) {
        e.preventDefault();
        upload(files);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tradeId]);

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        upload([...e.dataTransfer.files]);
      }}
      onClick={() => input.current?.click()}
      className={`cursor-pointer rounded-lg border border-dashed p-4 text-center text-sm ${over ? "border-accent bg-accent/10" : "border-line text-muted hover:border-accent"}`}
    >
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => upload([...(e.target.files ?? [])])} />
      {busy ? status : (
        <>
          <b className="text-slate-200">Pegá la captura con ⌘V</b>, arrastrala acá o hacé clic para elegirla
          {status && <span className="mt-1 block text-xs">{status}</span>}
        </>
      )}
    </div>
  );
}
