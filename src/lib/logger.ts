// Log estruturado JSON (§65). Nunca registrar secrets ou dados sensíveis.

type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";

export interface LogContext {
  correlationId?: string;
  tenantId?: string;
  userId?: string;
  projectId?: string;
  event?: string;
  [key: string]: unknown;
}

function emit(level: LogLevel, message: string, context: LogContext = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    service: "mici-api",
    message,
    ...context,
  };
  const line = JSON.stringify(entry);
  if (level === "ERROR") console.error(line);
  else if (level === "WARN") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => emit("DEBUG", message, context),
  info: (message: string, context?: LogContext) => emit("INFO", message, context),
  warn: (message: string, context?: LogContext) => emit("WARN", message, context),
  error: (message: string, context?: LogContext) => emit("ERROR", message, context),
};
