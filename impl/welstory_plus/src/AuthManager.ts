import { createLogger } from './log.js'

export class WelstoryAuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number
  ) {
    super(message)
    this.name = 'WelstoryAuthError'
  }
}

function decodeJwtExp(token: string): number {
  const parts = token.split('.')
  if (parts.length < 3) throw new WelstoryAuthError('Invalid JWT format')
  // Convert base64url to base64 before decoding
  const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8')) as Record<
    string,
    unknown
  >
  if (typeof payload.exp !== 'number') throw new WelstoryAuthError('JWT missing exp claim')
  return payload.exp
}

export interface AuthManagerOptions {
  username: string
  password: string
  deviceId: string
  baseUrl: string
}

export class AuthManager {
  private token: string | null = null
  private tokenExp: number | null = null
  private pendingAuth: Promise<void> | null = null

  private readonly authLog = createLogger('auth')

  constructor(private readonly options: AuthManagerOptions) {}

  get deviceId(): string {
    return this.options.deviceId
  }

  private setToken(token: string): void {
    this.token = token
    this.tokenExp = decodeJwtExp(token)
  }

  private isExpiringSoon(): boolean {
    if (!this.tokenExp) return true
    return this.tokenExp - Math.floor(Date.now() / 1000) < 300 // 5-minute threshold
  }

  private async doLogin(): Promise<void> {
    const startedAt = Date.now()
    this.authLog.info('login started')

    try {
      const response = await fetch(`${this.options.baseUrl}/login`, {
        method: 'POST',
        headers: {
          'User-Agent': 'Welplus',
          'X-Device-Id': this.options.deviceId,
          'X-Autologin': 'N',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          username: this.options.username,
          password: this.options.password,
          'remember-me': 'false'
        }).toString()
      })

      if (!response.ok) {
        this.authLog.warn('login failed', {
          status: response.status,
          durationMs: Date.now() - startedAt
        })
        throw new WelstoryAuthError(
          `Login failed: ${response.status} ${response.statusText}`,
          response.status
        )
      }

      const authHeader = response.headers.get('Authorization')
      if (!authHeader) {
        this.authLog.warn('login response missing authorization header', {
          status: response.status,
          durationMs: Date.now() - startedAt
        })
        throw new WelstoryAuthError('No Authorization header in login response')
      }

      this.setToken(authHeader)
      this.authLog.info('login succeeded', {
        status: response.status,
        durationMs: Date.now() - startedAt,
        expiresAt: this.tokenExp
      })
    } catch (error) {
      if (!(error instanceof WelstoryAuthError)) {
        this.authLog.warn('login request failed', {
          durationMs: Date.now() - startedAt,
          error
        })
      }
      throw error
    }
  }

  private async doRefresh(): Promise<void> {
    const startedAt = Date.now()
    this.authLog.info('session refresh started')

    try {
      const response = await fetch(`${this.options.baseUrl}/session`, {
        headers: {
          'User-Agent': 'Welplus',
          'X-Device-Id': this.options.deviceId,
          Authorization: this.token!
        }
      })

      if (!response.ok) {
        this.authLog.warn('session refresh failed, falling back to login', {
          status: response.status,
          durationMs: Date.now() - startedAt
        })
        // Fallback to full login if session refresh fails
        await this.doLogin()
        return
      }

      try {
        const body = (await response.json()) as { data: string }
        if (!body.data) throw new WelstoryAuthError('No data field in session refresh response')
        this.setToken(body.data)
        this.authLog.info('session refresh succeeded', {
          status: response.status,
          durationMs: Date.now() - startedAt,
          expiresAt: this.tokenExp
        })
      } catch (error) {
        if (error instanceof SyntaxError || error instanceof WelstoryAuthError) {
          this.authLog.warn('session refresh returned unusable data, falling back to login', {
            durationMs: Date.now() - startedAt,
            error
          })
          // Welstory sometimes returns a logged-out or malformed refresh response; recover with a full login.
          await this.doLogin()
          return
        }
        throw error
      }
    } catch (error) {
      if (!(error instanceof WelstoryAuthError)) {
        this.authLog.warn('session refresh request failed', {
          durationMs: Date.now() - startedAt,
          error
        })
      }
      throw error
    }
  }

  async getToken(): Promise<string> {
    // If an auth operation is already in flight, wait for it
    if (this.pendingAuth) {
      this.authLog.debug('waiting for in-flight auth operation')
      await this.pendingAuth
      return this.token!
    }

    if (this.token && !this.isExpiringSoon()) {
      this.authLog.debug('using cached token')
      return this.token
    }

    this.authLog.info(this.token ? 'refreshing expiring token' : 'requesting initial token')

    const op = this.token ? this.doRefresh() : this.doLogin()
    this.pendingAuth = op.finally(() => {
      this.pendingAuth = null
    })
    await this.pendingAuth
    return this.token!
  }

  async forceLogin(): Promise<string> {
    this.authLog.info('forcing new login')
    this.token = null
    this.tokenExp = null
    this.pendingAuth = this.doLogin().finally(() => {
      this.pendingAuth = null
    })
    await this.pendingAuth
    return this.token!
  }
}
