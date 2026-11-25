const RAW_COMMANDS = new Set(["help", "?", "status", "mic", "search", "say", "listen", "stop", "perf", "api"]);

/** Plain questions remain speech; recognized firmware commands pass through unchanged. */
export function consoleCommand(input: string): string {
  const text = input.trim();
  if (!text) return "";
  const verb = text.split(/\s+/, 1)[0]?.toLowerCase() ?? "";
  return RAW_COMMANDS.has(verb) ? text : `say ${text}`;
}