"use client"

import { ChakraProvider } from "@chakra-ui/react"
import { useEffect, useState } from "react"
import { BRAND_BAR, system } from "styles/theme"
import { resolveColorModeSetup } from "config/colorMode"
import {
  ColorModeProvider,
  ColorModeSetupContext,
  useColorMode,
  type ColorModeProviderProps,
} from "./color-mode"

// Accessing window.sessionStorage itself can throw when site data is blocked.
const noStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined,
} as unknown as Storage
const storage = (name: "sessionStorage" | "localStorage"): Storage => {
  try {
    return window[name]
  } catch {
    return noStorage
  }
}

/** Keeps the phone's status bar the colour of the brand bar. */
const ThemeColorMeta = () => {
  const { colorMode } = useColorMode()
  useEffect(() => {
    const meta = document.querySelector('meta[name="theme-color"]')
    meta?.setAttribute(
      "content",
      colorMode === "dark" ? BRAND_BAR.dark.base : BRAND_BAR.light.base,
    )
  }, [colorMode])
  return null
}

// Users stay on light until dark mode is enabled (config/colorMode); a
// ?theme= preview lets the team try dark first.
export function Provider({ children, ...props }: ColorModeProviderProps) {
  const [setup] = useState(() =>
    resolveColorModeSetup(
      window.location.search,
      storage("sessionStorage"),
      storage("localStorage"),
    ),
  )
  const themeProps: ColorModeProviderProps =
    setup.mode === "forced-light"
      ? { forcedTheme: "light" }
      : { defaultTheme: "system", enableSystem: true, storageKey: setup.storageKey }

  return (
    <ChakraProvider value={system}>
      <ColorModeSetupContext.Provider value={setup}>
        <ColorModeProvider {...themeProps} {...props}>
          <ThemeColorMeta />
          {children}
        </ColorModeProvider>
      </ColorModeSetupContext.Provider>
    </ChakraProvider>
  )
}
