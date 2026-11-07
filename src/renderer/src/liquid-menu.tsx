import { motion } from "motion/react";
import { useEffect, useLayoutEffect, useState, type RefObject } from "react";
import "./liquid-menu.css";

export const LIQUID_MENU_DURATION = 200;
/** Keep the shell mounted while its paint folds back into the trigger. */
export function useLiquidMenuPresence(open: boolean) {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { setMounted(false); return; }
    const timer = setTimeout(() => setMounted(false), LIQUID_MENU_DURATION);
    return () => clearTimeout(timer);
  }, [open]);
  return open || mounted;
}

/** One opaque shape, with crisp text on a separate unfiltered layer.
 * Width, height and corners use the same non-overshooting spring. Raising
 * stiffness with damping makes it settle quickly instead of creeping.
 * Only the content scrolls; the border follows the visible shell. */
export function LiquidMenuSurface({ open, host, anchor, corner = 12, className = "" }: {
  open: boolean; host: RefObject<HTMLElement | null>; anchor: RefObject<HTMLElement | null>; corner?: number; className?: string;
}) {
  const [reduce, setReduce] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [shape, setShape] = useState({ width: 240, height: 120, pillWidth: 120, pillHeight: 30 });
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduce(preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    const menu = host.current, trigger = anchor.current;
    if (!menu || !trigger) return;
    const measure = () => {
      const button = trigger.querySelector("button") ?? trigger;
      const rect = button.getBoundingClientRect();
      setShape(current => {
        const next = { width: menu.clientWidth || current.width, height: menu.clientHeight || current.height, pillWidth: rect.width, pillHeight: rect.height };
        return Object.keys(next).every(key => next[key as keyof typeof next] === current[key as keyof typeof current]) ? current : next;
      });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(menu); observer.observe(trigger);
    return () => observer.disconnect();
  }, [open, host, anchor]);
  return <motion.div className={`u-liquid-menu-surface ${className}`.trim()} aria-hidden="true" initial={false}
    animate={{ width: open ? shape.width : shape.pillWidth, height: open ? shape.height : shape.pillHeight, borderRadius: open ? corner : Math.min(15, shape.pillHeight / 2), opacity: open ? 1 : 0 }}
    transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 420, damping: 30, mass: .5 }} />;
}
