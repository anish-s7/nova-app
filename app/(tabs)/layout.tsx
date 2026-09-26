import type { ReactNode } from "react";
import { TabShell } from "@/components/tab-shell";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return <TabShell>{children}</TabShell>;
}
