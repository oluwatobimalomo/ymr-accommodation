/**
 * Never show a raw backend/SQL error to a customer (brief section 47).
 * Only Error instances deliberately thrown by our own service/validation
 * code carry a safe, human-readable message; anything else (a raw DB driver
 * error that slipped through, e.g. "Failed query: ...") gets a generic
 * message instead of exposing internals.
 */
export function safeErrorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (e instanceof Error && e.message && !e.message.includes("Failed query") && !e.message.toLowerCase().includes("syntax error")) {
    return e.message;
  }
  return fallback;
}
