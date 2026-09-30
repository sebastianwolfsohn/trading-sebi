"use client";

/** Botón de submit que pide confirmación antes de mandar el formulario. */
export function ConfirmButton({ message, className, title, children }: { message: string; className?: string; title?: string; children: React.ReactNode }) {
  return (
    <button
      className={className}
      title={title}
      aria-label={title}
      onClick={(e) => {
        if (!confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
