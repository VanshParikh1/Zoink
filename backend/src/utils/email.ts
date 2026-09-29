// Accounts are stored and looked up by this form, so `Alice@` and `alice@`
// are one account whichever way the address was typed.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

// `name+anything@` delivers to the same mailbox as `name@`, so allowing it at
// sign-up would let one student email open unlimited accounts.
export function hasPlusInLocalPart(email: string): boolean {
  const at = email.lastIndexOf('@')
  return at > 0 && email.slice(0, at).includes('+')
}

export const PLUS_ADDRESS_MESSAGE =
  "Email addresses with a '+' can't be used to sign up. Please use your plain student email address."
