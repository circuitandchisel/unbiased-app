import { motion, useAnimation, type Variants } from "motion/react";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type HTMLAttributes, type MouseEvent } from "react";

export interface MessageCircleMoreIconHandle {
  startAnimation: () => void;
  stopAnimation: () => void;
}
interface MessageCircleMoreIconProps extends HTMLAttributes<HTMLDivElement> { size?: number }
const DOT_VARIANTS: Variants = {
  normal: { opacity: 1 },
  animate: (custom: number) => ({
    opacity: [1, 0, 0, 1, 1, 0, 0, 1],
    transition: { opacity: { times: [0, .1, .1 + custom * .1, .2 + custom * .1, .5, .6, .6 + custom * .1, .7 + custom * .1], duration: 1.5 } },
  }),
};

/** User-supplied chat glyph, adapted to the desktop theme and reduced motion. */
export const MessageCircleMoreIcon = forwardRef<MessageCircleMoreIconHandle, MessageCircleMoreIconProps>(
  ({ onMouseEnter, onMouseLeave, className = "", size = 28, style, ...props }, ref) => {
    const controls = useAnimation();
    const [reducedMotion, setReducedMotion] = useState(() => matchMedia("(prefers-reduced-motion: reduce)").matches);
    useEffect(() => {
      const preference = matchMedia("(prefers-reduced-motion: reduce)");
      const update = () => setReducedMotion(preference.matches);
      preference.addEventListener("change", update);
      return () => preference.removeEventListener("change", update);
    }, []);
    const controlled = useRef(false);
    const start = useCallback(() => { if (!reducedMotion) void controls.start("animate"); }, [controls, reducedMotion]);
    const stop = useCallback(() => { controls.stop(); controls.set("normal"); }, [controls]);
    useEffect(() => { if (reducedMotion) stop(); }, [reducedMotion, stop]);
    useImperativeHandle(ref, () => {
      controlled.current = true;
      return { startAnimation: start, stopAnimation: stop };
    }, [start, stop]);
    const enter = (event: MouseEvent<HTMLDivElement>) => { if (!controlled.current) start(); onMouseEnter?.(event); };
    const leave = (event: MouseEvent<HTMLDivElement>) => { if (!controlled.current) stop(); onMouseLeave?.(event); };
    return <div {...props} className={`message-circle-more-icon ${className}`.trim()} data-message-circle-more aria-hidden="true"
      style={{ display: "inline-flex", flexShrink: 0, width: size, height: size, ...style }} onMouseEnter={enter} onMouseLeave={leave}>
      <svg fill="none" width={size} height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />
        {[8, 12, 16].map((x, index) => <motion.path key={x} initial="normal" animate={controls} custom={index} d={`M${x} 12h.01`} variants={DOT_VARIANTS} />)}
      </svg>
    </div>;
  },
);
MessageCircleMoreIcon.displayName = "MessageCircleMoreIcon";
