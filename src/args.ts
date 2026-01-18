export type ParsedArgs = {
  positionals: string[];
  options: Record<string, string>;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const positionals: string[] = [];
  const options: Record<string, string> = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const trimmed = arg.slice(2);
    const [key, inlineValue] = trimmed.split("=");
    if (inlineValue !== undefined) {
      options[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (next && !next.startsWith("--")) {
      options[key] = next;
      index += 1;
      continue;
    }

    options[key] = "true";
  }

  return { positionals, options };
}

export function isFlagEnabled(options: Record<string, string>, name: string): boolean {
  const value = options[name];
  return value === "true" || value === "1" || value === "yes";
}
