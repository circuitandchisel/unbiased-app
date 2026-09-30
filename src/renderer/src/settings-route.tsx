import { cloneElement, type CSSProperties, type ReactElement, type ReactNode } from "react";

export function SettingsRoute({
  active,
  settings,
  children,
}: {
  active: boolean;
  settings: ReactNode;
  children: ReactElement<{ style?: CSSProperties; "aria-hidden"?: boolean }>;
}) {
  return (
    <>
      {cloneElement(children, {
        style: { ...children.props.style, display: active ? "none" : children.props.style?.display },
        "aria-hidden": active || undefined,
      })}
      {active && settings}
    </>
  );
}
