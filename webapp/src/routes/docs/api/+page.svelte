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
        <h2>API Discovery</h2>
      </div>
    </div>

    <div class="section-body">
      <p class="lead">
        Welplan publishes machine-readable discovery metadata for agents and browser automation.
      </p>

      <div class="doc-grid">
        <article class="doc-card">
          <h3>API Catalog</h3>
          <p><code>{API_CATALOG_PATH}</code></p>
          <p>RFC 9727 API catalog published as <code>application/linkset+json</code>.</p>
        </article>

        <article class="doc-card">
          <h3>OpenAPI</h3>
          <p><code>{OPENAPI_PATH}</code></p>
          <p>OpenAPI 3.1 document for the JSON endpoints used by the app.</p>
        </article>

        <article class="doc-card">
          <h3>Agent Skills</h3>
          <p><code>{AGENT_SKILLS_INDEX_PATH}</code></p>
          <p>Agent Skills discovery index with SHA-256 digests for each published skill.</p>
        </article>

        <article class="doc-card">
          <h3>MCP Server Card</h3>
          <p><code>{MCP_SERVER_CARD_PATH}</code></p>
          <p>Discovery metadata for the browser-side WebMCP tools exposed by the site.</p>
        </article>
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
          <code>/api/health</code>
          <p>Lightweight health response for agent and uptime checks.</p>
        </article>

        <article class="endpoint-card">
          <span class="method get">GET</span>
          <code>/api/cache/status</code>
          <p>Returns server cache counters used by the app.</p>
        </article>

        <article class="endpoint-card">
          <span class="method post">POST</span>
          <code>/api/cache/clear</code>
          <p>Clears cached menu data and returns the updated cache status.</p>
        </article>

        <article class="endpoint-card">
          <span class="method get">GET</span>
          <code>/proxy/search?q=...</code>
          <p>Searches available restaurants across supported vendors.</p>
        </article>

        <article class="endpoint-card">
          <span class="method get">GET</span>
          <code>/proxy/[id]/menus/detail</code>
          <p>Returns menu detail or nutrient detail for a restaurant menu entry.</p>
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
        HTML pages support content negotiation for agents. Send <code>Accept: text/markdown</code>
        to receive a markdown response with <code>Content-Type: text/markdown; charset=utf-8</code>
        while browsers continue to receive HTML by default.
      </p>
      <pre><code>curl https://example.com/ -H "Accept: text/markdown"</code></pre>
    </div>
  </section>

  <section class="section">
    <div class="section-head">
      <div class="section-head-left">
        <h2>WebMCP Tools</h2>
      </div>
    </div>

    <div class="section-body">
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
    line-height: 1.6;
    margin-bottom: 16px;
  }

  .doc-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
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

  .doc-card h3,
  .endpoint-card code,
  .tool-item strong {
    color: var(--text);
  }

  .doc-card p {
    color: var(--text-muted);
    line-height: 1.6;
    margin-top: 6px;
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
    line-height: 1.7;
    margin-bottom: 12px;
  }

  .prose-block pre {
    padding: 12px 14px;
    border-radius: var(--radius-sm);
    background: #0f172a;
    color: #e2e8f0;
    overflow-x: auto;
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

  .tool-item p {
    margin-top: 4px;
    color: var(--text-muted);
    line-height: 1.5;
  }

  @media (max-width: 640px) {
    .tool-item {
      flex-direction: column;
    }
  }
</style>
