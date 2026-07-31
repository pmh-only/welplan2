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

    interface ModelContextClientTool {
      annotations?: ToolAnnotations
      description: string
      inputSchema: string
      name: string
      origin: string
      window: Window
    }

    interface ModelContextGetToolsOptions {
      fromOrigins?: string[]
    }

    interface ModelContextExecuteToolOptions {
      signal?: AbortSignal
    }

    interface ModelContext extends EventTarget {
      registerTool(tool: ModelContextTool, options?: ModelContextRegisterToolOptions): Promise<void>
      getTools(options?: ModelContextGetToolsOptions): Promise<ModelContextClientTool[]>
      executeTool(
        tool: ModelContextClientTool,
        input: string,
        options?: ModelContextExecuteToolOptions
      ): Promise<unknown | null>
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
