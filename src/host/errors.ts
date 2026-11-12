/**
 * Tool errors (problems of the extension or the environment) as opposed to data problems
 * (problems in the file content, which are shown on the cards and never logged).
 */
import type { MessageKey } from '../i18n';

export type ToolErrorCode = 'EDIT_FAILED' | 'EDIT_STALE' | 'EDIT_INVALID' | 'INTERNAL' | 'TOO_LARGE' | 'NO_FILE';

export interface ToolErrorInfo {
  code: ToolErrorCode;
  messageKey: MessageKey;
  args: Array<string | number>;
}

export const MAX_SYNCED_FILE_MB = 50;

export function toolError(code: ToolErrorCode, args: Array<string | number> = []): ToolErrorInfo {
  const keys: Record<ToolErrorCode, MessageKey> = {
    EDIT_FAILED: 'error.editFailed',
    EDIT_STALE: 'error.staleEdit',
    EDIT_INVALID: 'error.editInvalid',
    INTERNAL: 'error.internal',
    TOO_LARGE: 'error.tooLarge',
    NO_FILE: 'error.noFile',
  };
  return { code, messageKey: keys[code], args };
}

/** Where tool errors are recorded (the "chatlines" output channel in VS Code). */
export interface ErrorLog {
  error(code: ToolErrorCode, detail: string): void;
}
