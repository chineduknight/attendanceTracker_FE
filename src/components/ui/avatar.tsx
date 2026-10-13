import { Avatar } from "@chakra-ui/react";

// Solid palettes with readable contrast text (no yellow), like v2's avatars.
const AVATAR_PALETTES = [
  "red",
  "orange",
  "green",
  "teal",
  "blue",
  "cyan",
  "purple",
  "pink",
] as const;

/** The same name always gets the same colour. */
export const avatarPalette = (name = "") => {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
};

export interface NameAvatarProps extends Omit<Avatar.RootProps, "children"> {
  name?: string;
  src?: string;
}

/**
 * Initials on a solid colour picked from the name, or the image when there
 * is one: v2's Avatar behaviour (v3's default is a plain grey fallback).
 */
export const NameAvatar = ({ name, src, ...rootProps }: NameAvatarProps) => (
  <Avatar.Root variant="solid" colorPalette={avatarPalette(name)} {...rootProps}>
    <Avatar.Fallback name={name} />
    {src && <Avatar.Image src={src} alt={name} />}
  </Avatar.Root>
);
