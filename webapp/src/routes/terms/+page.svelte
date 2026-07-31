<script lang="ts">
  import TermsDocument from '$lib/components/TermsDocument.svelte'
  import {
    TERMS_NOTICE_DATE_LABEL,
    TERMS_PRIOR_VERSION,
    TERMS_PRIOR_VERSION_LABEL,
    TERMS_VERSION,
    TERMS_VERSION_LABEL
  } from '$lib/legal'
  import type { PageData } from './$types'

  let { data }: { data: PageData } = $props()
  const version = $derived(data.termsVersion)
</script>

{#if version === TERMS_PRIOR_VERSION}
  <aside class="terms-change-notice" aria-label="이용약관 개정 안내">
    <strong>이용약관 개정 안내</strong>
    <p>
      조항 간 우선관계와 자동화 기준, 삭제·권리 조치의 관계, 책임 조항의 역할을 명확히 하고 웹훅의
      명시적 동의 절차를 반영하기 위해 약관을 개정합니다.
    </p>
    <p>
      공고일은 {TERMS_NOTICE_DATE_LABEL}, 시행일은 {TERMS_VERSION_LABEL}입니다. 시행 전까지는
      <a href={`/terms/${TERMS_PRIOR_VERSION}`}>{TERMS_PRIOR_VERSION_LABEL} 약관</a>이 적용됩니다.
      <a href={`/terms/${TERMS_VERSION}`}>개정 약관 전문</a>을 미리 확인할 수 있습니다.
    </p>
  </aside>
{/if}

<TermsDocument {version} />

<style>
  .terms-change-notice { max-width: 920px; margin: 0 auto 14px; padding: 16px 18px; border: 1px solid #93c5fd; border-radius: var(--radius); color: #1e3a8a; background: #eff6ff; box-shadow: var(--shadow-sm); }
  .terms-change-notice strong { display: block; margin-bottom: 6px; color: #1e40af; font-size: 14px; }
  .terms-change-notice p { font-size: 13px; line-height: 1.7; }
  .terms-change-notice p + p { margin-top: 6px; }
  .terms-change-notice a { color: #1d4ed8; font-weight: 700; text-decoration: underline; text-underline-offset: 2px; }
  @media (max-width: 640px) { .terms-change-notice { padding: 14px 16px; } }
</style>
