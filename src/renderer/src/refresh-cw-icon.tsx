import { motion, useAnimation } from "motion/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type HTMLAttributes, type MouseEvent } from "react";

export interface RefreshCWIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}
interface RefreshCWIconProps extends HTMLAttributes<HTMLDivElement> { size?: number }

/** User-supplied spring refresh glyph, with live reduced-motion support. */
export const RefreshCWIcon = forwardRef<RefreshCWIconHandle, RefreshCWIconProps>(
  ({ onMouseEnter, onMouseLeave, className = "", size = 28, style, ...props }, ref) => {
    const controls = useAnimation();
    const controlled = useRef(false);
    const [reducedMotion, setReducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    useEffect(() => {
      const preference = matchMedia("(prefers-reduced-motion: reduce)");
      const update = () => setReducedMotion(preference.matches);
      preference.addEventListener("change", update);
      return () => preference.removeEventListener("change", update);
    }, []);
    const start = useCallback(() => { if (!reducedMotion) void controls.start("animate"); }, [controls, reducedMotion]);
    const stop = useCallback(() => {
      if (reducedMotion) { controls.stop(); controls.set("normal"); }
      else void controls.start("normal");
    }, [controls, reducedMotion]);
    useEffect(() => { if (reducedMotion) { controls.stop(); controls.set("normal"); } }, [controls, reducedMotion]);
    useImperativeHandle(ref, () => {
      controlled.current = true;
      return { startAnimation: start, stopAnimation: stop };
    }, [start, stop]);
    const enter = (event: MouseEvent<HTMLDivElement>) => { if (!controlled.current) start(); onMouseEnter?.(event); };
    const leave = (event: MouseEvent<HTMLDivElement>) => { if (!controlled.current) stop(); onMouseLeave?.(event); };
    return <div {...props} className={className} data-refresh-cw-icon aria-hidden="true" onMouseEnter={enter} onMouseLeave={leave}
      style={{ display: "inline-flex", flexShrink: 0, width: size, height: size, ...style }}>
      <motion.svg initial="normal" animate={controls} fill="none" width={size} height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2"
        transition={{ type: "spring", stiffness: 250, damping: 25 }} variants={{ normal: { rotate: "0deg" }, animate: { rotate: "50deg" } }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
        <path d="M8 16H3v5" />
      </motion.svg>
    </div>;
  },
);
RefreshCWIcon.displayName = "RefreshCWIcon";
