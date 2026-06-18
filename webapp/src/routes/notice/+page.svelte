<script lang="ts">
  import { browser } from '$app/environment'

  type NoticeSettings = {
    enabled: boolean
    title: string
    summary: string
    detail: string
    contentHtml: string
    updatedAt?: number
  }

  let { data }: { data: { notice: NoticeSettings } } = $props()
  const notice = $derived(data.notice)

  function formatUpdatedAt(value?: number): string {
    if (!value) return ''
    return new Date(value).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })
  }

  function closeNotice(): void {
    if (browser && window.history.length > 1) {
      window.history.back()
      return
    }

    window.location.href = '/'
  }
</script>

<svelte:head>
  <title>{notice.title || '공지사항'} | Welplan</title>
</svelte:head>

<article class="notice-page" aria-labelledby="notice-title">
  <div class="notice-actions">
    <button type="button" class="close-button" onclick={closeNotice} aria-label="공지 닫기">닫기</button>
  </div>

  <header class="notice-hero">
    <p class="eyebrow">Notice</p>
    <h1 id="notice-title">{notice.title || '공지사항'}</h1>
    {#if notice.summary}
      <p class="summary">{notice.summary}</p>
    {/if}
    {#if notice.updatedAt}
      <p class="updated">최근 수정: {formatUpdatedAt(notice.updatedAt)}</p>
    {/if}
  </header>

  {#if notice.contentHtml}
    <div class="notice-content">{@html notice.contentHtml}</div>
  {:else if notice.detail}
    <div class="notice-content plain">{notice.detail}</div>
  {:else}
    <div class="empty-state">현재 게시된 공지가 없습니다.</div>
  {/if}
</article>

<style>
  .notice-page {
    display: grid;
    gap: 14px;
  }

  .notice-actions {
    display: flex;
    justify-content: flex-end;
  }

  .close-button {
    min-height: 40px;
    padding: 0 16px;
    border: 1px solid #cbd5e1;
    border-radius: 999px;
    background: #fff;
    color: #0f172a;
    font-weight: 900;
    cursor: pointer;
    box-shadow: var(--shadow-sm);
  }

  .close-button:hover {
    border-color: #94a3b8;
    background: #f8fafc;
  }

  .notice-hero,
  .notice-content,
  .empty-state {
    border: 1px solid #e2e8f0;
    border-radius: 20px;
    background: #fff;
    box-shadow: var(--shadow-sm);
  }

  .notice-hero {
    padding: clamp(22px, 4vw, 34px);
  }

  .eyebrow {
    margin: 0 0 8px;
    color: #0f766e;
    font-size: 12px;
    font-weight: 900;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    color: #0f172a;
    font-size: clamp(1.8rem, 5vw, 3rem);
    letter-spacing: -0.05em;
  }

  .summary {
    max-width: 760px;
    margin: 12px 0 0;
    color: #475569;
    font-size: 1.05rem;
    line-height: 1.65;
  }

  .updated {
    margin: 16px 0 0;
    color: #64748b;
    font-size: 13px;
    font-weight: 700;
  }

  .notice-content {
    padding: clamp(22px, 4vw, 36px);
    color: #1e293b;
    line-height: 1.75;
    overflow-wrap: anywhere;
  }

  .notice-content.plain {
    white-space: pre-wrap;
  }

  .notice-content :global(h1),
  .notice-content :global(h2),
  .notice-content :global(h3) {
    margin: 1.2em 0 0.45em;
    color: #0f172a;
    letter-spacing: -0.03em;
    line-height: 1.25;
  }

  .notice-content :global(h1:first-child),
  .notice-content :global(h2:first-child),
  .notice-content :global(h3:first-child),
  .notice-content :global(p:first-child) {
    margin-top: 0;
  }

  .notice-content :global(p) {
    margin: 0 0 1em;
  }

  .notice-content :global(a) {
    color: #0f766e;
    font-weight: 800;
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .notice-content :global(ul),
  .notice-content :global(ol) {
    padding-left: 1.4em;
  }

  .notice-content :global(img) {
    max-width: 100%;
    height: auto;
    border-radius: 16px;
    box-shadow: var(--shadow-sm);
  }

  .notice-content :global(blockquote) {
    margin: 1.2em 0;
    padding: 14px 18px;
    border-left: 4px solid #14b8a6;
    border-radius: 12px;
    background: #f0fdfa;
    color: #334155;
  }

  .empty-state {
    padding: 28px;
    color: #64748b;
    font-weight: 800;
    text-align: center;
  }
</style>
