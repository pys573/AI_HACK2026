import type { ReactNode } from "react";

export function Section({
  id,
  eyebrow,
  title,
  lead,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  lead?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} className="border-t border-line-soft">
      <div className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        {eyebrow && (
          <p className="mb-3 text-xs font-medium tracking-[0.2em] text-fg-dim uppercase">
            {eyebrow}
          </p>
        )}
        {title && (
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
        )}
        {lead && <div className="mt-4 max-w-3xl text-fg-muted leading-relaxed">{lead}</div>}
        <div className={title || lead ? "mt-10" : ""}>{children}</div>
      </div>
    </section>
  );
}

export function Stat({
  label,
  value,
  unit,
  tone = "neutral",
  sub,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  tone?: "neutral" | "clear" | "stumble";
  sub?: ReactNode;
}) {
  const color =
    tone === "clear" ? "text-clear" : tone === "stumble" ? "text-stumble" : "text-fg";
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <div className="text-[11px] text-fg-dim">{label}</div>
      <div className={`tnum mt-1 text-2xl font-bold ${color}`}>
        {value}
        {unit && <span className="ml-1 text-sm font-medium text-fg-muted">{unit}</span>}
      </div>
      {sub && <div className="mt-1 text-[11px] text-fg-dim">{sub}</div>}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "clear" | "stumble" | "blocked";
}) {
  const map = {
    neutral: "border-line text-fg-muted",
    clear: "border-clear/40 text-clear bg-clear/10",
    stumble: "border-stumble/40 text-stumble bg-stumble/10",
    blocked: "border-blocked/40 text-blocked bg-blocked/10",
  } as const;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${map[tone]}`}
    >
      {children}
    </span>
  );
}

/**
 * 마스킹된 글자에 색을 입힌다.
 * 「◯◯◯マップ」가 그냥 텍스트로 지나가면 아무도 눈치채지 못한다.
 */
export function MaskedText({ text }: { text: string }) {
  const parts = text.split(/(◯+)/g);
  return (
    <>
      {parts.map((p, i) =>
        /^◯+$/.test(p) ? (
          <span key={i} className="masked">
            {p}
          </span>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}
