declare global {
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
