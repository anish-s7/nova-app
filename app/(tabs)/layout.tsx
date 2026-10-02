import type { ReactNode } from "react";
import { TabShell } from "@/components/layout/tab-shell";

export default function TabsLayout({ children }: { children: ReactNode }) {
  return <TabShell>{children}</TabShell>;
}
