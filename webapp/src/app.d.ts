declare global {
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
