import { useLayoutEffect, useRef } from "react";

/** A quick squash-and-stretch while the highlight travels, then a small settle. */
const SQUISH: Keyframe[] = [
  { transform: "scale(1, 1)" },
  { transform: "scale(1.12, 0.84)", offset: 0.3 },
  { transform: "scale(0.96, 1.05)", offset: 0.65 },
  { transform: "scale(1, 1)" },
];

/**
 * A highlight that glides to the active item instead of jumping, with a little squish on the way.
 * Put `containerRef` on a `position: relative` wrapper and `indicatorRef` on an absolutely positioned
 * element inside it (top-0 left-0, with a transition on transform/width/height) whose first child is
 * the visible highlight (the squish plays on that child, so it never fights the glide). Mark the
 * active item with `data-indicator-active="true"`. The indicator is moved by writing its style
 * directly (no re-render), snaps into place on first paint, and follows resizes. Reduced motion:
 * no squish (and the global rule shortens the glide).
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

      const body = indicator.firstElementChild as HTMLElement | null;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (animate && body && !reduced) body.animate(SQUISH, { duration: 420, easing: "cubic-bezier(0.3, 0.7, 0.2, 1)" });
    };

    place(placed.current);
    placed.current = true;
    const observer = new ResizeObserver(() => place(false));
    observer.observe(container);
    return () => observer.disconnect();
  }, [activeKey]);

  return { containerRef, indicatorRef };
}
