import type { ReactNode } from "react";
import { CircleHelp } from "lucide-react";

export default function InfoNotice({ title, children, id, className = "" }: {
  title: string; children: ReactNode; id?: string; className?: string;
}) {
  return <aside id={id} className={`info-notice ${className}`} aria-label={title}>
    <CircleHelp size={19} aria-hidden="true" />
    <div><strong>{title}</strong><div>{children}</div></div>
  </aside>;
}
