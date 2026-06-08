<script lang="ts">
  type CacheStatus = Record<string, number | boolean>
  type ActionData = {
    message?: string
    error?: string
    cleared?: Record<string, number>
    status?: CacheStatus
  }

  let { data, form }: { data: { user?: { name?: string, email?: string, id: string }, status: CacheStatus }, form?: ActionData } = $props()
  const status = $derived(form?.status ?? data.status)
  const statusEntries = $derived(Object.entries(status))
  const displayName = $derived(data.user?.name ?? data.user?.email ?? data.user?.id ?? 'admin')
</script>

<svelte:head>
  <title>Admin | Welplan</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<section class="admin-page" aria-labelledby="admin-title">
  <div class="admin-hero">
    <div>
      <p class="eyebrow">Admin</p>
      <h1 id="admin-title">Welplan 관리</h1>
      <p class="hero-copy">OIDC로 인증된 관리자 전용 페이지입니다.</p>
    </div>
    <div class="session-card" aria-label="로그인 사용자">
      <span class="session-label">Signed in as</span>
      <strong>{displayName}</strong>
      {#if data.user?.email && data.user.email !== displayName}
        <span>{data.user.email}</span>
      {/if}
      <a href="/admin/logout">로그아웃</a>
    </div>
  </div>

  {#if form?.message}
    <p class="notice success">{form.message}</p>
  {/if}
  {#if form?.error}
    <p class="notice error">{form.error}</p>
  {/if}

  <div class="admin-grid">
    <section class="panel" aria-labelledby="cache-title">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Cache</p>
          <h2 id="cache-title">캐시 상태</h2>
        </div>
        <form method="POST" action="?/clearCaches">
          <button type="submit" class="danger-button">캐시 삭제</button>
        </form>
      </div>

      <dl class="status-list">
        {#each statusEntries as [key, value]}
          <div class="status-row">
            <dt>{key}</dt>
            <dd>{String(value)}</dd>
          </div>
        {/each}
      </dl>
    </section>

    {#if form?.cleared}
      <section class="panel" aria-labelledby="cleared-title">
        <div class="panel-header">
          <div>
            <p class="panel-kicker">Last action</p>
            <h2 id="cleared-title">삭제된 항목</h2>
          </div>
        </div>
        <dl class="status-list compact">
          {#each Object.entries(form.cleared) as [key, value]}
            <div class="status-row">
              <dt>{key}</dt>
              <dd>{value}</dd>
            </div>
          {/each}
        </dl>
      </section>
    {/if}
  </div>
</section>

<style>
  .admin-page {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .admin-hero {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 18px;
    align-items: end;
    padding: 26px;
    border-radius: 22px;
    background: linear-gradient(135deg, #0f172a 0%, #1e293b 56%, #0f766e 100%);
    color: #f8fafc;
    box-shadow: 0 22px 55px rgba(15, 23, 42, 0.22);
  }

  .eyebrow,
  .panel-kicker {
    margin: 0 0 6px;
    color: #5eead4;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1,
  h2 {
    margin: 0;
    letter-spacing: -0.03em;
  }

  h1 {
    font-size: clamp(2rem, 4vw, 3.4rem);
  }

  h2 {
    color: #0f172a;
    font-size: 1.25rem;
  }

  .hero-copy {
    margin: 8px 0 0;
    color: #cbd5e1;
  }

  .session-card {
    min-width: 230px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 16px;
    background: rgba(15, 23, 42, 0.36);
  }

  .session-label,
  .session-card span {
    color: #cbd5e1;
    font-size: 12px;
  }

  .session-card a {
    width: fit-content;
    margin-top: 8px;
    color: #99f6e4;
    font-weight: 700;
    text-decoration: none;
  }

  .notice {
    margin: 0;
    padding: 12px 14px;
    border-radius: 12px;
    font-weight: 700;
  }

  .success {
    border: 1px solid #86efac;
    background: #ecfdf5;
    color: #166534;
  }

  .error {
    border: 1px solid #fecaca;
    background: #fef2f2;
    color: #991b1b;
  }

  .admin-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 18px;
  }

  .panel {
    padding: 22px;
    border: 1px solid #e2e8f0;
    border-radius: 18px;
    background: #fff;
    box-shadow: var(--shadow-sm);
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 16px;
  }

  .danger-button {
    min-height: 40px;
    padding: 0 16px;
    border: 0;
    border-radius: 999px;
    background: #dc2626;
    color: #fff;
    font-weight: 800;
    cursor: pointer;
  }

  .danger-button:hover {
    background: #b91c1c;
  }

  .status-list {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 10px;
    margin: 0;
  }

  .status-list.compact {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .status-row {
    padding: 13px 14px;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
    background: #f8fafc;
  }

  .status-row dt {
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
  }

  .status-row dd {
    margin: 4px 0 0;
    color: #0f172a;
    font-size: 1.35rem;
    font-weight: 800;
  }

  @media (max-width: 720px) {
    .admin-hero {
      grid-template-columns: 1fr;
      padding: 22px;
    }

    .session-card {
      min-width: 0;
    }

    .panel-header {
      align-items: stretch;
      flex-direction: column;
    }
  }
</style>
