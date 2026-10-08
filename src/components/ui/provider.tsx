"use client"

import { ChakraProvider } from "@chakra-ui/react"
import { system } from "styles/theme"
import {
  ColorModeProvider,
  type ColorModeProviderProps,
} from "./color-mode"

// The app has only ever shipped in light mode; dark stays forced off until
// every page is dark-safe (planned colour-mode pass).
export function Provider(props: ColorModeProviderProps) {
  return (
    <ChakraProvider value={system}>
      <ColorModeProvider forcedTheme="light" {...props} />
    </ChakraProvider>
  )
}
