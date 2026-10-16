import { createContext } from "react";

export const VisualReadyContext = createContext<(() => void) | null>(null);
