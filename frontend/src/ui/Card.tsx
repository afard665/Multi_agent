import React from "react";
import { cn } from "./cn";

type Props = {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
};

export default function Card({ title, actions, children, className }: Props) {
  return (
    <section className={cn("bg-white shadow rounded p-4", className)}>
      {(title || actions) && (
        <header className="flex items-center justify-between gap-3 mb-3">
          <div className="font-semibold">{title}</div>
          <div>{actions}</div>
        </header>
      )}
      {children}
    </section>
  );
}
