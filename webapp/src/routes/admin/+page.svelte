<script lang="ts">
  import { onMount } from 'svelte'

  type CacheStatus = Record<string, number | boolean>
  type CachePage = {
    table: string
    page: number
    pageSize: number
    total: number
    totalPages: number
    rows: {
      key: string
      cachedAt: number
      contentType?: string
      dataSize: number
      dataPreview: string
    }[]
  }
  type ActionData = {
    message?: string
    error?: string
    cleared?: Record<string, number>
    status?: CacheStatus
    cachePage?: CachePage
    notice?: NoticeSettings
  }
  type NoticeSettings = {
    enabled: boolean
    title: string
    summary: string
    detail: string
    contentHtml: string
    updatedAt?: number
  }

  let { data, form }: {
    data: {
      user?: { name?: string, email?: string, id: string }
      status: CacheStatus
      cacheTables: string[]
      cachePage: CachePage
      notice: NoticeSettings
    }
    form?: ActionData
  } = $props()
  const status = $derived(form?.status ?? data.status)
  const cachePage = $derived(form?.cachePage ?? data.cachePage)
  const notice = $derived(form?.notice ?? data.notice)
  const statusEntries = $derived(Object.entries(status))
  const displayName = $derived(data.user?.name ?? data.user?.email ?? data.user?.id ?? 'admin')
  let editorElement: HTMLDivElement
  let imageInputElement: HTMLInputElement
  let noticeContentHtml = $state('')
  let appliedNoticeKey = $state('')

  onMount(() => {
    syncNoticeEditor()
  })

  $effect(() => {
    syncNoticeEditor()
  })

  function syncNoticeEditor(): void {
    const nextHtml = notice.contentHtml || (notice.detail ? notice.detail.replace(/\n/g, '<br>') : '')
    const nextKey = `${notice.updatedAt ?? 0}:${nextHtml}`
    if (!editorElement || appliedNoticeKey === nextKey) return
    appliedNoticeKey = nextKey
    noticeContentHtml = nextHtml
    editorElement.innerHTML = nextHtml
  }

  function updateEditorState(): void {
    noticeContentHtml = editorElement?.innerHTML ?? ''
  }

  function runEditorCommand(command: string, value?: string): void {
    editorElement?.focus()
    document.execCommand(command, false, value)
    updateEditorState()
  }

  function createLink(): void {
    const url = window.prompt('링크 URL을 입력하세요')?.trim()
    if (!url) return
    runEditorCommand('createLink', url)
  }

  function triggerImageUpload(): void {
    imageInputElement?.click()
  }

  function insertImage(event: Event): void {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      window.alert('이미지 파일만 업로드할 수 있습니다')
      input.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        runEditorCommand('insertImage', reader.result)
      }
      input.value = ''
    }
    reader.readAsDataURL(file)
  }

  function prepareNoticeSubmit(): void {
    updateEditorState()
  }

  function tableLabel(table: string): string {
    switch (table) {
      case 'restaurants': return 'Restaurants'
      case 'mealTimes': return 'Meal times'
      case 'menus': return 'Menus'
      case 'menuDetails': return 'Menu details'
      case 'menuNutrientDetails': return 'Nutrients'
      case 'precomputedPages': return 'Pages'
      case 'images': return 'Images'
      default: return table
    }
  }

  function pageHref(page: number, pageSize = cachePage.pageSize, table = cachePage.table): string {
    const params = new URLSearchParams({ cacheTable: table, page: String(page), pageSize: String(pageSize) })
    return `/admin?${params.toString()}`
  }

  function formatCachedAt(value: number): string {
    return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  }
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
    <section class="panel" aria-labelledby="notice-title">
      <div class="panel-header">
        <div>
          <p class="panel-kicker">Notice</p>
          <h2 id="notice-title">공지 바 관리</h2>
          <p class="panel-description">모든 페이지 상단에 표시될 클릭형 공지를 작성합니다.</p>
        </div>
      </div>

      <form method="POST" action="?/updateNotice" class="notice-form" onsubmit={prepareNoticeSubmit}>
        <label class="toggle-row">
          <input type="checkbox" name="enabled" checked={notice.enabled} />
          <span>공지 바 표시</span>
        </label>

        <label class="field-row" for="notice-title-input">
          <span>제목</span>
          <input id="notice-title-input" name="title" value={notice.title} maxlength="80" placeholder="예: 서비스 점검 안내" />
        </label>

        <label class="field-row" for="notice-summary-input">
          <span>바 문구</span>
          <input id="notice-summary-input" name="summary" value={notice.summary} maxlength="180" placeholder="상단 바에 짧게 보일 내용" />
        </label>

        <label class="field-row" for="notice-detail-input">
          <span>텍스트 대체 내용</span>
          <textarea id="notice-detail-input" name="detail" rows="4" maxlength="5000" placeholder="HTML을 표시할 수 없는 환경을 위한 텍스트 내용">{notice.detail}</textarea>
        </label>

        <div class="field-row">
          <span>공지 페이지 내용</span>
          <div class="editor-toolbar" aria-label="공지 편집 도구">
            <button type="button" onclick={() => runEditorCommand('formatBlock', 'h2')}>제목</button>
            <button type="button" onclick={() => runEditorCommand('bold')}>굵게</button>
            <button type="button" onclick={() => runEditorCommand('italic')}>기울임</button>
            <button type="button" onclick={() => runEditorCommand('insertUnorderedList')}>목록</button>
            <button type="button" onclick={() => runEditorCommand('formatBlock', 'blockquote')}>인용</button>
            <button type="button" onclick={createLink}>링크</button>
            <button type="button" onclick={triggerImageUpload}>이미지</button>
          </div>
          <div
            class="wysiwyg-editor"
            contenteditable="true"
            role="textbox"
            aria-multiline="true"
            aria-label="공지 페이지 HTML 내용"
            bind:this={editorElement}
            oninput={updateEditorState}
            onblur={updateEditorState}
          ></div>
          <input bind:this={imageInputElement} class="image-input" type="file" accept="image/*" onchange={insertImage} />
          <textarea class="content-html-input" name="contentHtml" bind:value={noticeContentHtml} aria-hidden="true"></textarea>
          <span class="editor-help">이미지는 본문에 base64 데이터 URL로 삽입되어 DB에 함께 저장됩니다.</span>
        </div>

        <div class="form-actions">
          {#if notice.updatedAt}
            <span>최근 수정: {formatCachedAt(notice.updatedAt)}</span>
          {/if}
          <button type="submit" class="primary-button">공지 저장</button>
        </div>
      </form>
    </section>

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

    <section class="panel cache-browser" aria-labelledby="cache-browser-title">
      <div class="panel-header browser-header">
        <div>
          <p class="panel-kicker">Browse</p>
          <h2 id="cache-browser-title">캐시 내용</h2>
          <p class="panel-description">{cachePage.total}개 항목 중 {cachePage.rows.length}개 표시</p>
        </div>
        <form method="GET" class="page-size-form">
          <input type="hidden" name="cacheTable" value={cachePage.table} />
          <input type="hidden" name="page" value="1" />
          <label for="page-size">페이지 크기</label>
          <select id="page-size" name="pageSize" value={cachePage.pageSize}>
            <option value="10">10</option>
            <option value="20">20</option>
            <option value="50">50</option>
            <option value="100">100</option>
          </select>
          <button type="submit" class="secondary-button">적용</button>
        </form>
      </div>

      <nav class="cache-tabs" aria-label="캐시 테이블 선택">
        {#each data.cacheTables as table}
          <a href={pageHref(1, cachePage.pageSize, table)} class:active={cachePage.table === table}>
            {tableLabel(table)}
          </a>
        {/each}
      </nav>

      {#if cachePage.rows.length === 0}
        <p class="empty-state">선택한 캐시에 저장된 항목이 없습니다.</p>
      {:else}
        <div class="cache-table-wrap">
          <table class="cache-table">
            <thead>
              <tr>
                <th>Key</th>
                <th>Cached</th>
                <th>Size</th>
                <th>Preview</th>
              </tr>
            </thead>
            <tbody>
              {#each cachePage.rows as row}
                <tr>
                  <td class="key-cell"><code>{row.key}</code></td>
                  <td>{formatCachedAt(row.cachedAt)}</td>
                  <td>
                    {row.dataSize.toLocaleString()} chars
                    {#if row.contentType}
                      <span class="content-type">{row.contentType}</span>
                    {/if}
                  </td>
                  <td class="preview-cell"><pre>{row.dataPreview}</pre></td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}

      <div class="pagination" aria-label="캐시 페이지 이동">
        <a class:disabled={cachePage.page <= 1} href={cachePage.page <= 1 ? undefined : pageHref(cachePage.page - 1)}>이전</a>
        <span>{cachePage.page} / {cachePage.totalPages}</span>
        <a class:disabled={cachePage.page >= cachePage.totalPages} href={cachePage.page >= cachePage.totalPages ? undefined : pageHref(cachePage.page + 1)}>다음</a>
      </div>
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

  .primary-button {
    min-height: 40px;
    padding: 0 16px;
    border: 0;
    border-radius: 999px;
    background: #0f766e;
    color: #fff;
    font-weight: 800;
    cursor: pointer;
  }

  .primary-button:hover {
    background: #115e59;
  }

  .danger-button:hover {
    background: #b91c1c;
  }

  .secondary-button {
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    background: #fff;
    color: #0f172a;
    font-weight: 800;
    cursor: pointer;
  }

  .secondary-button:hover {
    border-color: #94a3b8;
    background: #f8fafc;
  }

  .panel-description {
    margin: 6px 0 0;
    color: #64748b;
    font-size: 13px;
  }

  .notice-form {
    display: grid;
    gap: 14px;
  }

  .toggle-row {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #0f172a;
    font-weight: 800;
  }

  .toggle-row input {
    width: 18px;
    height: 18px;
    accent-color: #0f766e;
  }

  .field-row {
    display: grid;
    gap: 6px;
    color: #334155;
    font-size: 13px;
    font-weight: 800;
  }

  .field-row input,
  .field-row textarea {
    width: 100%;
    border: 1px solid #cbd5e1;
    border-radius: 12px;
    background: #fff;
    color: #0f172a;
    font: inherit;
    font-weight: 500;
  }

  .field-row input {
    min-height: 42px;
    padding: 0 12px;
  }

  .field-row textarea {
    min-height: 140px;
    padding: 12px;
    resize: vertical;
  }

  .field-row input:focus,
  .field-row textarea:focus {
    border-color: #0f766e;
    outline: 3px solid rgba(15, 118, 110, 0.14);
  }

  .editor-toolbar {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px;
    border: 1px solid #cbd5e1;
    border-radius: 14px;
    background: #f8fafc;
  }

  .editor-toolbar button {
    min-height: 32px;
    padding: 0 10px;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    background: #fff;
    color: #0f172a;
    font-size: 12px;
    font-weight: 900;
    cursor: pointer;
  }

  .editor-toolbar button:hover {
    border-color: #0f766e;
    color: #0f766e;
  }

  .wysiwyg-editor {
    min-height: 260px;
    padding: 16px;
    border: 1px solid #cbd5e1;
    border-radius: 16px;
    background: #fff;
    color: #0f172a;
    font-weight: 500;
    line-height: 1.7;
    overflow: auto;
  }

  .wysiwyg-editor:focus {
    border-color: #0f766e;
    outline: 3px solid rgba(15, 118, 110, 0.14);
  }

  .wysiwyg-editor:empty::before {
    content: '공지 페이지에 표시할 내용을 입력하세요. 이미지는 툴바의 이미지 버튼으로 삽입할 수 있습니다.';
    color: #94a3b8;
  }

  .wysiwyg-editor :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 12px;
  }

  .image-input,
  .content-html-input {
    position: absolute;
    width: 1px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }

  .editor-help {
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }

  .form-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: #64748b;
    font-size: 12px;
    font-weight: 700;
  }

  .browser-header {
    align-items: flex-start;
  }

  .page-size-form {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
  }

  .page-size-form select {
    min-height: 34px;
    border: 1px solid #cbd5e1;
    border-radius: 10px;
    background: #fff;
    color: #0f172a;
    font-weight: 700;
  }

  .cache-tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 16px;
  }

  .cache-tabs a {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 12px;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    color: #334155;
    text-decoration: none;
    font-size: 12px;
    font-weight: 800;
  }

  .cache-tabs a:hover,
  .cache-tabs a.active {
    border-color: #0f766e;
    background: #ccfbf1;
    color: #115e59;
  }

  .empty-state {
    margin: 0;
    padding: 24px;
    border: 1px dashed #cbd5e1;
    border-radius: 14px;
    color: #64748b;
    text-align: center;
  }

  .cache-table-wrap {
    overflow-x: auto;
    border: 1px solid #e2e8f0;
    border-radius: 14px;
  }

  .cache-table {
    width: 100%;
    min-width: 860px;
    border-collapse: collapse;
    font-size: 13px;
  }

  .cache-table th,
  .cache-table td {
    padding: 12px;
    border-bottom: 1px solid #e2e8f0;
    text-align: left;
    vertical-align: top;
  }

  .cache-table th {
    background: #f8fafc;
    color: #475569;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .cache-table tr:last-child td {
    border-bottom: 0;
  }

  .key-cell {
    width: 220px;
    word-break: break-all;
  }

  .key-cell code {
    color: #0f766e;
    font-size: 12px;
  }

  .preview-cell {
    width: 48%;
  }

  .preview-cell pre {
    max-height: 140px;
    margin: 0;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    color: #334155;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    font-size: 12px;
  }

  .content-type {
    display: block;
    margin-top: 4px;
    color: #64748b;
    font-size: 11px;
  }

  .pagination {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
    margin-top: 16px;
  }

  .pagination a,
  .pagination span {
    display: inline-flex;
    align-items: center;
    min-height: 34px;
    padding: 0 12px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 800;
  }

  .pagination a {
    border: 1px solid #cbd5e1;
    color: #0f172a;
    text-decoration: none;
  }

  .pagination a:hover {
    background: #f8fafc;
  }

  .pagination a.disabled {
    pointer-events: none;
    opacity: 0.42;
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

    .page-size-form,
    .pagination {
      justify-content: flex-start;
      flex-wrap: wrap;
    }
  }
</style>
