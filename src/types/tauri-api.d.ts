declare module '@tauri-apps/api/tauri' {
  export function invoke<T = unknown>(command: string, args?: Record<string, unknown>): Promise<T>;
}

declare module '@tauri-apps/api/event' {
  export type EventCallback<T> = (event: { payload: T }) => void;
  
  export function listen<T>(event: string, callback: EventCallback<T>): Promise<() => void>;
}