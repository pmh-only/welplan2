declare global {
  namespace WebMCP {
    type MaybePromise<T> = T | Promise<T>
    type ToolExecuteCallback<T extends Record<string, unknown> = Record<string, unknown>> =
      (input: T) => MaybePromise<unknown>

    interface ToolAnnotations {
      readOnlyHint?: boolean
      untrustedContentHint?: boolean
    }

    interface ModelContextTool {
      name: string
      title?: string
      description: string
      inputSchema?: object
      execute: ToolExecuteCallback
      annotations?: ToolAnnotations
    }

    interface ModelContextRegisterToolOptions {
      signal?: AbortSignal
      exposedTo?: string[]
    }

    interface ModelContext extends EventTarget {
      registerTool(tool: ModelContextTool, options?: ModelContextRegisterToolOptions): Promise<void>
    }
  }

  interface Document {
    readonly modelContext?: WebMCP.ModelContext
  }

  interface Window {
    rybbit?: {
      event: (name: string, properties?: Record<string, string | number>) => void
    }
  }

  namespace App {
    interface Locals {
      adminUser?: {
        id: string
        name?: string
        email?: string
      }
    }
  }
}

export {}
