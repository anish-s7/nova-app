import { useLayoutEffect, useRef } from "react";

/**
 * A highlight that glides to the active item instead of jumping. Put `containerRef` on a
 * `position: relative` wrapper, `indicatorRef` on an absolutely positioned element inside it (top-0
 * left-0, with a transition on transform/width/height), and `data-indicator-active="true"` on the
 * active item. The indicator is moved by writing its style directly (no re-render), snaps into place
 * on first paint, and follows resizes.
 */
export function useSlidingIndicator(activeKey: string | number | null | undefined) {
  const containerRef = useRef<HTMLElement | null>(null);
  const indicatorRef = useRef<HTMLElement | null>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const container = containerRef.current;
    const indicator = indicatorRef.current;
    if (!container || !indicator) return;

    const place = (animate: boolean) => {
      const target = container.querySelector<HTMLElement>('[data-indicator-active="true"]');
      if (!target) {
        indicator.style.opacity = "0";
        return;
      }
      const c = container.getBoundingClientRect();
      const t = target.getBoundingClientRect();
      indicator.style.transition = animate ? "" : "none";
      indicator.style.opacity = "1";
      indicator.style.width = `${t.width}px`;
      indicator.style.height = `${t.height}px`;
      indicator.style.transform = `translate(${t.left - c.left}px, ${t.top - c.top}px)`;
    };

    place(placed.current);
    placed.current = true;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeKey]);

  return { containerRef, indicatorRef };
}
