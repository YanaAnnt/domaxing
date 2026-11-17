// Local type-checking only (not deployed): minimal Deno globals used by the edge function.
declare namespace Deno {
  const env: { get(key: string): string | undefined };
  function serve(handler: (req: Request) => Response | Promise<Response>): void;
}
