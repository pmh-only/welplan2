<article class="deletion-page">
  <header class="deletion-hero">
    <p class="eyebrow">Data Deletion Request</p>
    <h1>데이터 삭제 요청 안내</h1>
    <p>
      Welplan에서 처리되는 사용자 관련 데이터의 삭제를 요청하려면 이메일로 연락해 주세요.
      별도의 회원 계정이 없으므로, 요청 내용을 확인할 수 있는 최소한의 정보만 보내면 됩니다.
    </p>
  </header>

  <section class="request-card primary-card">
    <h2>삭제 요청 방법</h2>
    <p>
      아래 이메일 주소로 데이터 삭제 요청을 보내 주세요. 제목에는 <strong>Welplan 데이터 삭제 요청</strong>을
      포함하면 더 빠르게 확인할 수 있습니다.
    </p>
    <a class="email-link" href="mailto:pmh_only@pmh.codes?subject=Welplan%20%EB%8D%B0%EC%9D%B4%ED%84%B0%20%EC%82%AD%EC%A0%9C%20%EC%9A%94%EC%B2%AD">pmh_only@pmh.codes</a>
  </section>

  <section class="request-card">
    <h2>이메일에 포함하면 좋은 내용</h2>
    <ul>
      <li>요청 유형: 데이터 삭제 요청</li>
      <li>삭제를 원하는 데이터 범위: 문의 기록, 식당 선택 기록, 분석/세션 재생 데이터 등</li>
      <li>요청 확인에 필요한 정보: 문의에 사용한 이메일 주소, 대략적인 이용 날짜나 문의 날짜</li>
      <li>선택 사항: 문제가 있었던 페이지 주소 또는 삭제를 원하는 기록을 설명하는 짧은 메모</li>
    </ul>
    <p class="note">
      비밀번호, 주민등록번호, 결제정보 같은 민감한 정보는 보내지 마세요. Welplan은 일반 사용자에게
      회원가입이나 결제정보를 요구하지 않습니다.
    </p>
  </section>

  <section class="request-card">
    <h2>삭제할 수 있는 데이터</h2>
    <ul>
      <li>사용자가 문의 과정에서 제공한 이메일 주소, GitHub 계정명, 문의 내용</li>
      <li>서비스 운영을 위해 서버에 기록된 식당 선택 기록</li>
      <li>가능한 범위에서 특정 사용자를 식별할 수 있는 분석 또는 세션 재생 데이터</li>
    </ul>
    <p>
      메뉴 캐시처럼 특정 개인과 연결되지 않은 집계 또는 운영 데이터는 서비스 제공을 위해 계속
      보관될 수 있습니다. 법령 준수, 보안, 분쟁 대응에 필요한 기록은 필요한 기간 동안 보관될 수
      있습니다.
    </p>
  </section>

  <section class="request-card">
    <h2>사용자가 직접 삭제할 수 있는 데이터</h2>
    <p>
      브라우저나 Android 앱의 사이트 데이터 삭제 기능을 사용하면 Welplan이 브라우저에 저장한
      식당 선택 쿠키, 로컬 저장소, 테이크아웃 식당 선호를 직접 삭제할 수 있습니다. Android에서는
      앱 정보 화면에서 저장공간 또는 사이트 데이터를 삭제할 수 있습니다.
    </p>
  </section>

  <section class="request-card">
    <h2>처리 절차</h2>
    <p>
      요청을 받으면 삭제 대상과 확인에 필요한 정보를 검토한 뒤 합리적인 기간 내에 처리합니다.
      요청한 사람과 삭제 대상 데이터를 연결할 수 없는 경우에는 추가 확인 정보를 요청하거나 삭제가
      제한될 수 있습니다.
    </p>
  </section>
</article>

<style>
  .deletion-page {
    display: grid;
    gap: 14px;
    max-width: 920px;
    margin: 0 auto;
  }

  .deletion-hero,
  .request-card {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }

  .deletion-hero {
    padding: 24px;
  }

  .eyebrow {
    color: var(--green);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 8px;
  }

  .deletion-hero h1 {
    color: var(--text);
    font-size: clamp(1.8rem, 4vw, 2.5rem);
    line-height: 1.2;
    margin-bottom: 12px;
  }

  .deletion-hero p,
  .request-card p,
  .request-card li {
    color: var(--text-muted);
    font-size: 14px;
    line-height: 1.8;
  }

  .request-card {
    padding: 20px 22px;
  }

  .primary-card {
    border-color: #bbf7d0;
    background: #f0fdf4;
  }

  .request-card h2 {
    color: var(--text);
    font-size: 1rem;
    font-weight: 700;
    padding-left: 10px;
    border-left: 3px solid var(--green);
    margin-bottom: 10px;
  }

  .request-card ul {
    display: grid;
    gap: 8px;
    padding-left: 18px;
  }

  .request-card a,
  .email-link {
    color: var(--accent);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .email-link {
    display: inline-flex;
    margin-top: 10px;
    font-size: 1rem;
    font-weight: 700;
  }

  .note {
    margin-top: 12px;
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }

  @media (max-width: 640px) {
    .deletion-hero,
    .request-card {
      padding: 18px;
    }
  }
</style>
