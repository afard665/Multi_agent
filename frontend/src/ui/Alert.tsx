import React from "react";
import { cn } from "./cn";

type Tone = "info" | "success" | "warning" | "error";

type Props = {
  tone?: Tone;
  title?: string;
  children?: React.ReactNode;
  className?: string;
};

export default function Alert({ tone = "info", title, children, className }: Props) {
  const tones: Record<Tone, string> = {
    info: "bg-blue-50 text-blue-900 border-blue-200",
    success: "bg-emerald-50 text-emerald-900 border-emerald-200",
    warning: "bg-amber-50 text-amber-900 border-amber-200",
    error: "bg-red-50 text-red-900 border-red-200",
  };

  return (
    <div className={cn("border rounded p-3 text-sm", tones[tone], className)}>
      {title ? <div className="font-semibold mb-1">{title}</div> : null}
      {children}
    </div>
  );
}
