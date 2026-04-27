type LogFields = Record<string, unknown>

const TRUE_VALUES = new Set(['1', 'true', 'yes', 'on', 'debug', 'verbose'])

function readFlag(name: string): boolean {
  const value = process.env[name]?.trim().toLowerCase()
  return value ? TRUE_VALUES.has(value) : false
}

function isEnabled(scope: string): boolean {
  const verbose = readFlag('WELPLAN_VERBOSE_LOGS')
  if (verbose) return true

  switch (scope) {
    case 'traffic':
      return readFlag('WELPLAN_TRAFFIC_LOGS')
    default:
      return false
  }
}

function formatValue(value: unknown): string {
  if (value === null) return 'null'
  if (value instanceof Error) {
    return JSON.stringify({
      name: value.name,
      message: value.message,
      stack: value.stack
    })
  }

  switch (typeof value) {
    case 'string':
      return JSON.stringify(value)
    case 'number':
    case 'boolean':
    case 'bigint':
      return String(value)
    case 'undefined':
      return 'undefined'
    default:
      try {
        return JSON.stringify(value)
      } catch {
        return JSON.stringify(String(value))
      }
  }
}

function write(
  level: 'debug' | 'info' | 'warn' | 'error',
  scope: string,
  message: string,
  fields: LogFields = {}
): void {
  const parts = [
    `[${new Date().toISOString()}]`,
    '[welplan]',
    '[planeat]',
    `[${scope}]`,
    `[${level}]`,
    message,
    ...Object.entries(fields)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${formatValue(value)}`)
  ]
  const line = parts.join(' ')

  switch (level) {
    case 'debug':
      console.debug(line)
      return
    case 'info':
      console.info(line)
      return
    case 'warn':
      console.warn(line)
      return
    case 'error':
      console.error(line)
  }
}

export function createLogger(scope: string) {
  return {
    enabled(): boolean {
      return isEnabled(scope)
    },
    debug(message: string, fields?: LogFields): void {
      if (isEnabled(scope)) write('debug', scope, message, fields)
    },
    info(message: string, fields?: LogFields): void {
      if (isEnabled(scope)) write('info', scope, message, fields)
    },
    warn(message: string, fields?: LogFields): void {
      write('warn', scope, message, fields)
    },
    error(message: string, fields?: LogFields): void {
      write('error', scope, message, fields)
    }
  }
}
