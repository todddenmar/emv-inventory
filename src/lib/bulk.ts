export async function runBulkActions(
  ids: string[],
  action: (id: string) => Promise<void>
): Promise<{ ok: number; failed: number; messages: string[] }> {
  let ok = 0;
  const messages: string[] = [];
  for (const id of ids) {
    try {
      await action(id);
      ok += 1;
    } catch (error) {
      messages.push(error instanceof Error ? error.message : "Failed");
    }
  }
  return { ok, failed: messages.length, messages };
}

export function summarizeBulkResult(
  result: { ok: number; failed: number; messages: string[] },
  verb: string
): { success?: string; error?: string } {
  const success =
    result.ok > 0
      ? `${result.ok} ${verb}`
      : undefined;
  const error =
    result.failed > 0
      ? `${result.failed} failed${
          result.messages[0] ? `: ${result.messages[0]}` : ""
        }`
      : undefined;
  return { success, error };
}
