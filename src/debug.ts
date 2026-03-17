export interface DebugLogger {
  enabled: boolean;
  log(event: string, payload: unknown): void;
}

export function createDebugLogger(enabled: boolean): DebugLogger {
  return {
    enabled,
    log(event, payload) {
      if (!enabled) {
        return;
      }

      const line = {
        ts: new Date().toISOString(),
        event,
        payload
      };
      console.error(JSON.stringify(line));
    }
  };
}
