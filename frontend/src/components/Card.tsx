import React from "react";
import Card from "../ui/Card";

type Props = { title: string; children: React.ReactNode };

export default function LegacyCard({ title, children }: Props) {
  return <Card title={title}>{children}</Card>;
}
