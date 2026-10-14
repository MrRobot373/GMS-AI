"use client";

import { createContext, useContext } from "react";

/** The few words the shared components say themselves; the app provides them in its language. */
export interface UiText {
  close: string;
}
export const UiTextContext = createContext<UiText>({ close: "Close" });
export const useUiText = () => useContext(UiTextContext);
