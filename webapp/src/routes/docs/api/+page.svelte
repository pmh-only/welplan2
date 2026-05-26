<script lang="ts">
  import {
    AGENT_SKILLS_INDEX_PATH,
    API_CATALOG_PATH,
    MCP_SERVER_CARD_PATH,
    OPENAPI_PATH,
    WEB_MCP_TOOLS
  } from '$lib/agent'
</script>

<div class="docs-page">

  <section class="section">
    <div class="section-head">
      <div class="section-head-left">
        <h2>AI 어시스턴트로 사용하기</h2>
      </div>
    </div>
    <div class="section-body">
      <p class="lead">AI 어시스턴트는 아래 두 단계로 Welplan을 사용할 수 있습니다.</p>
      <ol class="steps">
        <li>
          <strong>식당 검색</strong>
          <code class="inline-code">GET /proxy/search?q={'{키워드}'}</code>
          <p>JSON 배열을 반환합니다. 각 항목은 <code>id</code>, <code>name</code>, <code>vendor</code>, <code>path</code>를 포함합니다.</p>
        </li>
        <li>
          <strong>메뉴 조회</strong>
          <code class="inline-code">GET /restaurants/{'{vendor}'}/{'{id}'}/{'{slug}'}/{'{YYYYMMDD}'}</code>
          <p>날짜 세그먼트를 생략하면 오늘 메뉴로 이동합니다. <code>Accept: text/markdown</code> 헤더를 추가하면 마크다운으로 응답합니다.</p>
        </li>
      </ol>
      <div class="tip-block">
        <code>/llms.txt</code> — AI 어시스턴트를 위한 전체 사용 안내서
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div class="section-head-left">
        <h2>HTTP Endpoints</h2>
      </div>
    </div>
    <div class="section-body">
      <div class="endpoint-list">
        <article class="endpoint-card">
          <span class="method get">GET</span>
          <code>/proxy/search?q=...</code>
          <p>키워드로 웰스토리·신세계푸드 식당을 검색합니다. JSON 배열로 응답합니다.</p>
        </article>

        <article class="endpoint-card">
          <span class="method get">GET</span>
          <code>/restaurants/[vendor]/[id]/[slug]/[date]</code>
          <p>식당의 하루 전체 메뉴 갤러리 페이지. <code>Accept: text/markdown</code>으로 메뉴 목록을 텍스트로 받을 수 있습니다.</p>
        </article>

        <article class="endpoint-card">
          <span class="method get">GET</span>
          <code>/restaurants/[vendor]/[id]/[slug]/[date]/rss.xml</code>
          <p>식당의 하루 메뉴 RSS 2.0 피드. 식사 시간별로 메뉴 목록을 HTML 리스트로 제공합니다.</p>
        </article>

        <article class="endpoint-card">
          <span class="method get">GET</span>
          <code>/rss.xml</code>
          <p>전체 식당의 향후 7일 메뉴 RSS 피드.</p>
        </article>

        <article class="endpoint-card">
          <span class="method get">GET</span>
          <code>/api/health</code>
          <p>서비스 상태 확인용 헬스체크 엔드포인트.</p>
        </article>
      </div>
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div class="section-head-left">
        <h2>Markdown Negotiation</h2>
      </div>
    </div>
    <div class="section-body prose-block">
      <p>
        모든 HTML 페이지는 <code>Accept: text/markdown</code> 헤더를 통해 마크다운으로 응답합니다.
        브라우저는 기존과 동일하게 HTML을 받습니다.
      </p>
      <pre><code>curl https://welplan.pmh.codes/restaurants/welstory/REST000007/r5-b1f/$(date +%Y%m%d) \
  -H "Accept: text/markdown"</code></pre>
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div class="section-head-left">
        <h2>WebMCP Tools</h2>
      </div>
    </div>
    <div class="section-body">
      <p class="lead">브라우저 내 AI 어시스턴트가 WebMCP를 지원하면 아래 도구를 직접 호출할 수 있습니다.</p>
      <ul class="tool-list">
        {#each WEB_MCP_TOOLS as tool (tool.name)}
          <li class="tool-item">
            <div>
              <strong>{tool.title}</strong>
              <p>{tool.description}</p>
            </div>
            <code>{tool.name}</code>
          </li>
        {/each}
      </ul>
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div class="section-head-left">
        <h2>Discovery Endpoints</h2>
      </div>
    </div>
    <div class="section-body">
      <div class="doc-grid">
        <article class="doc-card">
          <h3>LLMs.txt</h3>
          <p><code>/llms.txt</code></p>
          <p>AI 어시스턴트를 위한 사용 안내서 (llms.txt 표준).</p>
        </article>

        <article class="doc-card">
          <h3>OpenAPI</h3>
          <p><code>{OPENAPI_PATH}</code></p>
          <p>OpenAPI 3.1 — 검색 및 메뉴 엔드포인트 명세.</p>
        </article>

        <article class="doc-card">
          <h3>Agent Skills</h3>
          <p><code>{AGENT_SKILLS_INDEX_PATH}</code></p>
          <p>에이전트 스킬 탐색 인덱스 (SHA-256 다이제스트 포함).</p>
        </article>

        <article class="doc-card">
          <h3>API Catalog</h3>
          <p><code>{API_CATALOG_PATH}</code></p>
          <p>RFC 9727 API 카탈로그 (<code>application/linkset+json</code>).</p>
        </article>

        <article class="doc-card">
          <h3>MCP Server Card</h3>
          <p><code>{MCP_SERVER_CARD_PATH}</code></p>
          <p>WebMCP 도구 탐색용 서버 카드.</p>
        </article>
      </div>
    </div>
  </section>

</div>

<style>
  .docs-page {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .section {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }

  .section-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--border);
  }

  .section-head-left { display: flex; align-items: center; gap: 10px; }

  .section-head h2 {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--text);
    padding-left: 10px;
    border-left: 3px solid var(--green);
  }

  .section-body {
    padding: 16px;
  }

  .lead {
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.6;
    margin-bottom: 14px;
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding-left: 20px;
    margin-bottom: 14px;
  }

  .steps li {
    color: var(--text);
    font-size: 13px;
    line-height: 1.6;
  }

  .steps li strong {
    display: block;
    font-weight: 600;
    margin-bottom: 2px;
  }

  .steps li p {
    color: var(--text-muted);
    margin-top: 3px;
  }

  .inline-code {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    border: 1px solid var(--border);
    font-size: 12px;
    color: var(--text);
  }

  .tip-block {
    padding: 10px 14px;
    border-radius: var(--radius-sm);
    background: var(--green-dim);
    border: 1px solid #86efac;
    color: #065f46;
    font-size: 12px;
  }

  .doc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
  }

  .doc-card,
  .endpoint-card,
  .tool-item {
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }

  .doc-card {
    padding: 14px;
  }

  .doc-card h3 {
    color: var(--text);
    font-size: 13px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .doc-card p {
    color: var(--text-muted);
    font-size: 12px;
    line-height: 1.6;
    margin-top: 4px;
  }

  .endpoint-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .endpoint-card {
    padding: 12px 14px;
  }

  .endpoint-card p {
    margin-top: 6px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  .method {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    margin-right: 8px;
    border-radius: 999px;
    padding: 2px 8px;
    font-size: 11px;
    font-weight: 700;
  }

  .method.get {
    background: #dcfce7;
    color: #166534;
  }

  .method.post {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .prose-block p {
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.7;
    margin-bottom: 12px;
  }

  .prose-block pre {
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    background: #0f172a;
    color: #e2e8f0;
    font-size: 12px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }

  .tool-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tool-item {
    padding: 12px 14px;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .tool-item strong {
    color: var(--text);
    font-size: 13px;
  }

  .tool-item p {
    margin-top: 4px;
    color: var(--text-muted);
    font-size: 13px;
    line-height: 1.5;
  }

  @media (max-width: 640px) {
    .tool-item {
      flex-direction: column;
    }
  }
</style>
