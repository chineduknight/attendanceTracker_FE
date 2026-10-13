import { RegisterOptions } from "react-hook-form";

/** The backend's minimum; signup, reset and change password all enforce it. */
export const PASSWORD_MIN_LENGTH = 6;

export const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export const emailRules: RegisterOptions = {
  required: "Email is required",
  pattern: { value: EMAIL_PATTERN, message: "Enter a valid email" },
};

/** A password being chosen: required and at least PASSWORD_MIN_LENGTH long. */
export const newPasswordRules = (requiredMessage = "Password is required"): RegisterOptions => ({
  required: requiredMessage,
  minLength: {
    value: PASSWORD_MIN_LENGTH,
    message: `Password must be at least ${PASSWORD_MIN_LENGTH} characters`,
  },
});

/**
 * Usernames are matched case- and space-insensitively by the backend, so a
 * phone's auto-capitalise does no harm, but autocorrect can swap a username
 * for a dictionary word. Spread onto every username input.
 */
export const usernameInputProps = {
  autoCapitalize: "none",
  autoCorrect: "off",
  spellCheck: false,
} as const;
