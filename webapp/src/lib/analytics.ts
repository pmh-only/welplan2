type RybbitProperties = Record<string, string | number>

export function trackEvent(name: string, properties?: RybbitProperties) {
  try {
    window.rybbit?.event(name, properties)
  } catch {
    // Analytics must never interrupt the user flow.
  }
}
