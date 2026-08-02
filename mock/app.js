"use strict";

/*
 * このファイルは画面遷移と操作感を確認するためのモック専用です。
 * API通信や永続化は行わず、ページを再読み込みするとすべて初期状態へ戻ります。
 */

const app = document.querySelector("#app");
const toastRegion = document.querySelector("#toast-region");
const dialog = document.querySelector("#app-dialog");
const dialogContent = document.querySelector("#dialog-content");

const today = toLocalDateString(new Date());

const initialData = {
  categories: [
    { id: 1, name: "草取り", order: 10, status: "ACTIVE", isCommon: false },
    { id: 2, name: "洗車", order: 20, status: "ACTIVE", isCommon: false },
    { id: 3, name: "清掃", order: 30, status: "ACTIVE", isCommon: false },
    { id: 4, name: "共通", order: 0, status: "ACTIVE", isCommon: true },
    { id: 5, name: "設備点検", order: 40, status: "INACTIVE", isCommon: false },
  ],
  tools: [
    {
      id: 1,
      name: "草刈機",
      category: "草取り",
      stock: 2,
      order: 10,
      status: "ACTIVE",
    },
    {
      id: 2,
      name: "鎌",
      category: "草取り",
      stock: 4,
      order: 20,
      status: "ACTIVE",
    },
    {
      id: 3,
      name: "熊手",
      category: "草取り",
      stock: 3,
      order: 30,
      status: "ACTIVE",
    },
    {
      id: 4,
      name: "高圧洗浄機",
      category: "洗車",
      stock: 1,
      order: 10,
      status: "ACTIVE",
    },
    {
      id: 5,
      name: "洗車用ホース",
      category: "洗車",
      stock: 2,
      order: 20,
      status: "ACTIVE",
    },
    {
      id: 6,
      name: "洗車スポンジ",
      category: "洗車",
      stock: 6,
      order: 30,
      status: "ACTIVE",
    },
    {
      id: 7,
      name: "ほうき",
      category: "清掃",
      stock: 4,
      order: 10,
      status: "ACTIVE",
    },
    {
      id: 8,
      name: "ちりとり",
      category: "清掃",
      stock: 3,
      order: 20,
      status: "ACTIVE",
    },
    {
      id: 9,
      name: "安全ヘルメット",
      category: "共通",
      stock: 8,
      order: 10,
      status: "ACTIVE",
    },
    {
      id: 10,
      name: "作業用手袋",
      category: "共通",
      stock: 10,
      order: 20,
      status: "ACTIVE",
    },
    {
      id: 11,
      name: "安全ベスト",
      category: "共通",
      stock: 8,
      order: 30,
      status: "ACTIVE",
    },
  ],
  users: [
    {
      id: 1,
      name: "山田 管理者",
      loginId: "admin",
      role: "ADMIN",
      status: "ACTIVE",
    },
    {
      id: 2,
      name: "佐藤 作業者",
      loginId: "worker",
      role: "WORKER",
      status: "ACTIVE",
    },
    {
      id: 3,
      name: "鈴木 作業者",
      loginId: "suzuki",
      role: "WORKER",
      status: "ACTIVE",
    },
    {
      id: 4,
      name: "田中 退職者",
      loginId: "tanaka",
      role: "WORKER",
      status: "INACTIVE",
    },
  ],
};

const state = {
  view: "login",
  currentUser: null,
  selectedDate: today,
  selectedPeriod: "full",
  checklistOptionsOpen: false,
  homeDate: today,
  today,
  mobileMenuOpen: false,
  search: "",
  statusFilter: "ALL",
  categoryFilter: "ALL",
  data: structuredClone(initialData),
  checklists: {},
};

const saveTimers = new Map();
let lastFocusedElement = null;

render();

/** 現在の画面状態から、必要な画面全体を描画する。 */
function render() {
  if (state.view === "login") {
    app.innerHTML = renderLogin();
    return;
  }

  if (state.view === "first-password") {
    app.innerHTML = renderFirstPassword();
    return;
  }

  if (state.view === "session-expired") {
    app.innerHTML = renderSessionExpired();
    return;
  }

  if (!state.currentUser) {
    state.view = "login";
    app.innerHTML = renderLogin();
    return;
  }

  app.innerHTML = renderAppShell(renderCurrentView());
}

function renderCurrentView() {
  switch (state.view) {
    case "home":
      return renderHome();
    case "checklist":
      return renderChecklist();
    case "tools":
      return state.currentUser.role === "ADMIN"
        ? renderTools()
        : renderForbidden();
    case "categories":
      return state.currentUser.role === "ADMIN"
        ? renderCategories()
        : renderForbidden();
    case "users":
      return state.currentUser.role === "ADMIN"
        ? renderUsers()
        : renderForbidden();
    case "password":
      return renderPasswordChange();
    case "flow":
      return renderFlowGuide();
    default:
      return renderHome();
  }
}

function renderLogin() {
  return `
    <main class="auth-layout" id="main-content">
      <section class="auth-brand" aria-label="FieldFlowの紹介">
        <div class="brand-statement">
          <p class="eyebrow" style="color:#f2a66f">READY BEFORE THE FIELD</p>
          <h1>忘れ物のない朝を、チームでつくる。</h1>
          <p>
            現場へ出る前の道具と数量を、ひとつのチェック表で共有。
            FieldFlowは準備の抜け漏れを減らします。
          </p>
        </div>
      </section>

      <section class="auth-panel">
        <div class="auth-card">
          <div class="brand-mark">FieldFlow</div>
          <h1>ログイン</h1>
          <p class="auth-lead">今日の準備を始めましょう。</p>

          <div class="demo-note">
            これは操作確認用モックです。入力内容は送信・保存されません。
          </div>

          <form data-form="login" novalidate>
            <div class="field">
              <label for="login-id">ログインID</label>
              <input
                id="login-id"
                name="loginId"
                autocomplete="username"
                placeholder="例: admin"
                required
              />
            </div>
            <div class="field">
              <label for="password">パスワード</label>
              <input
                id="password"
                name="password"
                type="password"
                autocomplete="current-password"
                placeholder="12文字以上"
                required
              />
              <p id="login-error" class="field-error" aria-live="polite"></p>
            </div>
            <button class="button button-primary button-block" type="submit">
              ログイン
            </button>
          </form>

          <div class="demo-accounts">
            <p>確認したい役割を選ぶと、デモ情報が入力されます</p>
            ${renderDemoAccount("admin", "管理者", "全画面と管理操作を確認", "管理者を選択")}
            ${renderDemoAccount("worker", "作業者", "日別チェックだけを確認", "作業者を選択")}
            ${renderDemoAccount(
              "first.user",
              "初回ログイン",
              "仮パスワード変更の流れを確認",
              "初回ログインを選択",
            )}
          </div>
        </div>
      </section>
    </main>
  `;
}

function renderDemoAccount(loginId, title, description, buttonLabel) {
  return `
    <button
      class="demo-account"
      type="button"
      data-action="select-demo"
      data-login="${loginId}"
      aria-label="${buttonLabel}"
    >
      <span class="role-dot" aria-hidden="true"></span>
      <span>
        <strong>${title}</strong>
        <small>${description}</small>
      </span>
      <span aria-hidden="true">→</span>
    </button>
  `;
}

function renderFirstPassword() {
  return `
    <main class="auth-layout" id="main-content">
      <section class="auth-brand" aria-label="初回ログインの説明">
        <div class="brand-statement">
          <p class="eyebrow" style="color:#f2a66f">FIRST SIGN IN</p>
          <h1>最初に、自分だけのパスワードへ。</h1>
          <p>
            仮パスワードは一度きりです。変更後は安全のため再ログインします。
          </p>
        </div>
      </section>

      <section class="auth-panel">
        <div class="auth-card">
          <div class="brand-mark">FieldFlow</div>
          <p class="eyebrow">STEP 1 OF 2</p>
          <h1>初回パスワード変更</h1>
          <p class="auth-lead">
            12文字以上の新しいパスワードを設定してください。
          </p>
          <div class="info-banner">
            変更が完了すると、すべてのトークンを無効化してログイン画面へ戻ります。
          </div>

          <form data-form="first-password" novalidate style="margin-top:20px">
            ${renderPasswordFields("first")}
            <p id="password-error" class="field-error" aria-live="polite"></p>
            <button class="button button-primary button-block" type="submit">
              変更して再ログイン
            </button>
            <button
              class="button button-ghost button-block"
              type="button"
              data-action="back-to-login"
            >
              ログインへ戻る
            </button>
          </form>
        </div>
      </section>
    </main>
  `;
}

function renderSessionExpired() {
  return `
    <main class="auth-panel" id="main-content">
      <div class="auth-card">
        <div class="brand-mark">FieldFlow</div>
        <p class="eyebrow" style="margin-top:26px">SESSION EXPIRED</p>
        <h1>セッションが切れました</h1>
        <p class="auth-lead">
          安全のため操作を終了しました。もう一度ログインしてください。
        </p>
        <div class="info-banner">
          入力中の内容は保存されていない可能性があります。
        </div>
        <button
          class="button button-primary button-block"
          type="button"
          data-action="back-to-login"
          style="margin-top:22px"
        >
          ログイン画面へ
        </button>
      </div>
    </main>
  `;
}

function renderAppShell(content) {
  const isAdmin = state.currentUser.role === "ADMIN";
  const roleLabel = isAdmin ? "管理者" : "作業者";
  const initials = state.currentUser.name.slice(0, 2);
  const navigation = renderNavigation(isAdmin);

  return `
    <div class="app-shell">
      <header class="app-header">
        <div class="header-inner">
          <div class="app-logo">FieldFlow</div>
          <nav class="desktop-nav" aria-label="メインナビゲーション">
            ${navigation}
          </nav>
          <div class="header-spacer"></div>
          <div class="user-chip" aria-label="ログイン中のユーザー">
            <span class="avatar" aria-hidden="true">${escapeHtml(initials)}</span>
            <span>
              <strong>${escapeHtml(state.currentUser.name)}</strong>
              <small>${roleLabel}</small>
            </span>
          </div>
          <button
            class="mobile-menu-button"
            type="button"
            data-action="toggle-menu"
            aria-expanded="${state.mobileMenuOpen}"
            aria-controls="mobile-navigation"
            aria-label="メニューを${state.mobileMenuOpen ? "閉じる" : "開く"}"
          >
            ${state.mobileMenuOpen ? "✕" : "☰"}
          </button>
        </div>
        <nav
          id="mobile-navigation"
          class="mobile-nav ${state.mobileMenuOpen ? "is-open" : ""}"
          aria-label="モバイルナビゲーション"
        >
          <div class="mobile-user">
            <span class="avatar" aria-hidden="true">${escapeHtml(initials)}</span>
            <span>
              <strong>${escapeHtml(state.currentUser.name)}</strong><br />
              <span class="small muted">${roleLabel}</span>
            </span>
          </div>
          ${navigation}
          <button class="nav-link" type="button" data-action="session-expired">
            セッション切れを確認
          </button>
          <button class="nav-link" type="button" data-action="logout">
            ログアウト
          </button>
        </nav>
      </header>
      ${content}
    </div>
  `;
}

function renderNavigation(isAdmin) {
  const items = [
    ["home", "ホーム"],
    ["checklist", "日別チェック"],
    ...(isAdmin
      ? [
          ["tools", "道具"],
          ["categories", "作業カテゴリ"],
          ["users", "ユーザー"],
        ]
      : []),
    ["flow", "画面フロー"],
    ["password", "アカウント"],
  ];

  return items
    .map(
      ([view, label]) => `
        <button
          class="nav-link"
          type="button"
          data-action="navigate"
          data-view="${view}"
          ${state.view === view ? 'aria-current="page"' : ""}
        >
          ${label}
        </button>
      `,
    )
    .join("");
}

function getCurrentChecklist() {
  return state.checklists[state.selectedDate]?.[state.selectedPeriod] || null;
}

function getChecklistItems() {
  return getCurrentChecklist()?.items || [];
}

const periodOptions = [
  { id: "full", label: "1日通し" },
  { id: "morning", label: "午前" },
  { id: "afternoon", label: "午後" },
];

function getPeriodLabel(periodId) {
  return (
    periodOptions.find((period) => period.id === periodId)?.label || "1日通し"
  );
}

function getDateChecklists(date) {
  return state.checklists[date] || {};
}

function getExistingPeriods(date) {
  const dateChecklists = getDateChecklists(date);
  return periodOptions.filter((period) => Boolean(dateChecklists[period.id]));
}

function getDateScheduleMode(date) {
  const dateChecklists = getDateChecklists(date);
  if (dateChecklists.full) return "full";
  if (dateChecklists.morning || dateChecklists.afternoon) return "split";
  return null;
}

function renderPeriodSelector() {
  const dateChecklists = getDateChecklists(state.selectedDate);
  const scheduleMode = getDateScheduleMode(state.selectedDate);
  const visiblePeriods =
    scheduleMode === "full"
      ? periodOptions.filter((period) => period.id === "full")
      : scheduleMode === "split"
        ? periodOptions.filter((period) => period.id !== "full")
        : periodOptions;

  return `
    <div class="period-switcher" aria-label="チェックする時間帯">
      <span class="period-switcher-label">時間帯</span>
      <div
        class="period-tabs period-tabs-${visiblePeriods.length}"
        role="group"
        aria-label="時間帯を切り替え"
      >
        ${visiblePeriods
          .map(
            (period) => `
              <button
                class="period-tab ${
                  state.selectedPeriod === period.id ? "is-active" : ""
                }"
                type="button"
                data-action="change-period"
                data-period="${period.id}"
                aria-pressed="${state.selectedPeriod === period.id}"
              >
                ${period.label}
                ${
                  dateChecklists[period.id]
                    ? '<span class="period-record-mark" aria-label="チェック表あり"></span>'
                    : ""
                }
              </button>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function renderHome() {
  const todayChecklists = getDateChecklists(state.today);
  const todayPeriods = getExistingPeriods(state.today);
  const hasTodayChecklist = todayPeriods.length > 0;
  const todayItems = todayPeriods.flatMap(
    (period) => todayChecklists[period.id].items,
  );
  const selectedItems = todayItems.filter((item) => item.quantity > 0);
  const preparedItems = selectedItems.filter((item) => item.checked);
  const isAdmin = state.currentUser.role === "ADMIN";

  return `
    <main class="page-shell home-page" id="main-content">
      <div class="home-greeting">
        <div>
          <p class="eyebrow">HOME</p>
          <h1>おはようございます、${escapeHtml(state.currentUser.name)}さん</h1>
          <p>${formatJapaneseDate(state.today)}。今日も安全に準備を始めましょう。</p>
        </div>
        <span class="mock-ribbon">モックデータ・再読み込みでリセット</span>
      </div>

      <section class="panel home-primary" aria-labelledby="today-check-title">
        <div class="home-primary-copy">
          <p class="eyebrow">TODAY'S PREPARATION</p>
          <h2 id="today-check-title">今日の道具チェック</h2>
          ${
            hasTodayChecklist
              ? `
                <div class="home-period-list" aria-label="作成済みの時間帯">
                  ${todayPeriods
                    .map(
                      (period) => `
                        <span>${period.label}<small>チェック表あり</small></span>
                      `,
                    )
                    .join("")}
                </div>
                <div class="home-status-line">
                  <span class="home-status-badge ${
                    selectedItems.length > 0 &&
                    preparedItems.length === selectedItems.length
                      ? "is-complete"
                      : "is-progress"
                  }">
                    ${
                      selectedItems.length === 0
                        ? "持ち出し未設定"
                        : preparedItems.length === selectedItems.length
                          ? "準備完了"
                          : "準備中"
                    }
                  </span>
                  <span>${
                    selectedItems.length > 0
                      ? `準備 ${preparedItems.length} / ${selectedItems.length}`
                      : "数量を入力すると進捗を表示します"
                  }</span>
                </div>
              `
              : `
                <p class="muted">
                  時間帯と作業カテゴリを一度に選んで、必要な道具のチェック表を作成します。
                </p>
              `
          }
        </div>
        <button
          class="button button-primary home-primary-action"
          type="button"
          data-action="open-checklist"
          data-date="${state.today}"
        >
          ${hasTodayChecklist ? "今日のチェックを開く" : "今日のチェックを作成"}
          <span aria-hidden="true">→</span>
        </button>
      </section>

      <div class="home-grid">
        <section class="panel home-section" aria-labelledby="other-date-title">
          <p class="eyebrow">OTHER DATE</p>
          <h2 id="other-date-title">別の日を確認</h2>
          <p class="muted">過去の記録や未来日の準備を確認できます。</p>
          <div class="home-date-control">
            <div class="date-field">
              <label class="field-label" for="home-date">作業日</label>
              <input
                id="home-date"
                type="date"
                value="${state.homeDate}"
                data-action="home-date-change"
              />
            </div>
            <button
              class="button button-secondary"
              type="button"
              data-action="open-checklist"
              data-use-home-date="true"
            >
              この日を開く
            </button>
          </div>
        </section>

        ${
          isAdmin
            ? `
              <section class="panel home-section" aria-labelledby="admin-menu-title">
                <p class="eyebrow">ADMIN MENU</p>
                <h2 id="admin-menu-title">管理メニュー</h2>
                <p class="muted">マスター情報と利用者を管理します。</p>
                <div class="home-shortcuts">
                  <button class="button button-secondary" type="button" data-action="navigate" data-view="tools">道具</button>
                  <button class="button button-secondary" type="button" data-action="navigate" data-view="categories">作業カテゴリ</button>
                  <button class="button button-secondary" type="button" data-action="navigate" data-view="users">ユーザー</button>
                </div>
              </section>
            `
            : `
              <section class="panel home-section home-help" aria-labelledby="home-help-title">
                <p class="eyebrow">HOW TO USE</p>
                <h2 id="home-help-title">準備の流れ</h2>
                <p class="muted">作業を選ぶ → 数量を入力 → 準備済みにする、の3ステップです。</p>
              </section>
            `
        }
      </div>
    </main>
  `;
}

function renderChecklist() {
  const readOnly = state.selectedDate < state.today;
  const checklist = getCurrentChecklist();

  if (!checklist) {
    return renderMissingChecklist(readOnly);
  }

  const checklistItems = checklist.items;
  const prepared = checklistItems.filter((item) => item.checked).length;
  const selected = checklistItems.filter((item) => item.quantity > 0).length;
  const progressPercent = selected
    ? Math.round((prepared / selected) * 100)
    : 0;
  const groups = groupChecklistItems(checklistItems);
  const selectedCategories = checklist.categoryIds
    .map((categoryId) =>
      state.data.categories.find((category) => category.id === categoryId),
    )
    .filter(Boolean);
  const hasAddableCategory = state.data.categories.some(
    (category) =>
      category.status === "ACTIVE" &&
      !category.isCommon &&
      !checklist.categoryIds.includes(category.id),
  );

  return `
    <main class="page-shell" id="main-content">
      <div class="page-heading">
        <div>
          <p class="eyebrow">DAILY CHECK</p>
          <h1>日別チェック</h1>
          <p>${formatJapaneseDate(state.selectedDate)}・${getPeriodLabel(state.selectedPeriod)}の持ち出し準備</p>
        </div>
        <span class="mock-ribbon">モックデータ・再読み込みでリセット</span>
      </div>

      <section class="panel date-bar" aria-label="日付と準備の進捗">
        <div class="checklist-mobile-actions">
          <button
            class="button button-secondary button-small"
            type="button"
            data-action="toggle-checklist-options"
            aria-expanded="${state.checklistOptionsOpen}"
            aria-controls="checklist-options-panel"
          >
            ${state.checklistOptionsOpen ? "日付・カテゴリ設定を閉じる" : "日付・カテゴリを変更"}
          </button>
        </div>

        <div
          id="checklist-options-panel"
          class="date-bar-top checklist-options ${state.checklistOptionsOpen ? "is-open" : ""}"
        >
          <div class="date-control">
            <div class="date-field">
              <label class="field-label" for="work-date">作業日</label>
              <input
                id="work-date"
                type="date"
                value="${state.selectedDate}"
                data-action="change-date"
              />
            </div>
            <button class="button button-secondary" type="button" data-action="today">
              今日
            </button>
          </div>
          ${
            !readOnly && hasAddableCategory
              ? `
                <div class="date-actions">
                  <button
                    class="button button-secondary"
                    type="button"
                    data-action="open-category-selection"
                    data-mode="add"
                  >
                    ＋ 作業カテゴリを追加
                  </button>
                </div>
              `
              : ""
          }
        </div>

        ${renderPeriodSelector()}

        <div class="progress-inline">
          <div class="progress-label">
            <span>準備</span>
            <strong>${selected > 0 ? `${prepared} / ${selected}` : "持ち出し未設定"}</strong>
          </div>
          <div
            class="progress-track"
            role="progressbar"
            aria-label="準備の進捗"
            aria-valuemin="0"
            aria-valuemax="100"
            aria-valuenow="${progressPercent}"
          >
            <span style="width:${progressPercent}%"></span>
          </div>
          <strong class="progress-percent">${selected > 0 ? `${progressPercent}%` : "—"}</strong>
        </div>

        <div class="selected-categories" aria-label="選択中の作業カテゴリ">
          ${selectedCategories
            .map(
              (category) => `
                <span class="category-chip ${category.isCommon ? "is-common" : ""}">
                  ${escapeHtml(category.name)}${category.isCommon ? "（自動）" : ""}
                </span>
              `,
            )
            .join("")}
        </div>
      </section>

      ${
        readOnly
          ? `
            <div class="readonly-banner" role="note" style="margin-bottom:14px">
              <span aria-hidden="true">🔒</span>
              <span>過去日のチェック表は閲覧専用です。数量や準備状態は変更できません。</span>
            </div>
          `
          : ""
      }

      <div class="checklist">
        ${Object.entries(groups)
          .map(([category, items]) =>
            renderChecklistCategory(category, items, readOnly),
          )
          .join("")}
      </div>
    </main>
  `;
}

function renderMissingChecklist(readOnly) {
  return `
    <main class="page-shell" id="main-content">
      <div class="page-heading">
        <div>
          <p class="eyebrow">DAILY CHECK</p>
          <h1>日別チェック</h1>
          <p>${formatJapaneseDate(state.selectedDate)}・${getPeriodLabel(state.selectedPeriod)}の持ち出し準備</p>
        </div>
      </div>

      <section class="panel date-bar compact-date-bar" aria-label="日付と時間帯">
        <div class="date-control">
          <div class="date-field">
            <label class="field-label" for="work-date">作業日</label>
            <input
              id="work-date"
              type="date"
              value="${state.selectedDate}"
              data-action="change-date"
            />
          </div>
          <button class="button button-secondary" type="button" data-action="today">
            今日
          </button>
        </div>
        ${renderPeriodSelector()}
      </section>

      <section class="panel empty-state empty-checklist">
        <p class="eyebrow">${readOnly ? "NO RECORD" : "GET STARTED"}</p>
        <h2>${readOnly ? `この日の${getPeriodLabel(state.selectedPeriod)}の記録はありません` : `${getPeriodLabel(state.selectedPeriod)}のチェック表を作成`}</h2>
        <p class="muted">
          ${
            readOnly
              ? "過去日のチェック表は新しく作成できません。"
              : "選んだ作業の道具に、共通の安全用品を加えて準備を始めます。"
          }
        </p>
        ${
          readOnly
            ? `
              <button class="button button-secondary" type="button" data-action="navigate" data-view="home">
                ホームへ戻る
              </button>
            `
            : `
              <button class="button button-primary" type="button" data-action="open-category-selection" data-mode="create">
                作業カテゴリを選ぶ
              </button>
            `
        }
      </section>
    </main>
  `;
}

function renderChecklistCategory(category, items, readOnly) {
  return `
    <section class="panel category-section" aria-labelledby="category-${slugify(category)}">
      <div class="category-title">
        <h2 id="category-${slugify(category)}">${escapeHtml(category)}</h2>
        <span>${items.length}種類</span>
      </div>
      <div class="checklist-column-headings" aria-hidden="true">
        <span>道具・在庫</span>
        <span>持ち出し数</span>
        <span>準備状態</span>
      </div>
      ${items.map((item) => renderChecklistRow(item, readOnly)).join("")}
    </section>
  `;
}

function renderChecklistRow(item, readOnly) {
  const canCheck = item.quantity > 0 && !readOnly;
  const statusLabels = {
    saving: "保存中…",
    saved: "保存済み",
    error: "保存失敗",
  };

  return `
    <article class="checklist-row">
      <div class="tool-identity">
        <h3>${escapeHtml(item.name)}</h3>
        <span class="stock-label">在庫 <strong>${item.stock}</strong></span>
      </div>

      <div class="quantity-field">
        <span class="field-label">持ち出し数</span>
        <div class="quantity-control" aria-label="${escapeHtml(item.name)}の持ち出し数">
          <button
            type="button"
            data-action="quantity"
            data-direction="-1"
            data-id="${item.id}"
            aria-label="${escapeHtml(item.name)}を1つ減らす"
            ${readOnly || item.quantity <= 0 ? "disabled" : ""}
          >−</button>
          <input
            type="number"
            min="0"
            max="${item.stock}"
            value="${item.quantity}"
            inputmode="numeric"
            data-action="quantity-input"
            data-id="${item.id}"
            aria-label="${escapeHtml(item.name)}の持ち出し数"
            ${readOnly ? "disabled" : ""}
          />
          <button
            type="button"
            data-action="quantity"
            data-direction="1"
            data-id="${item.id}"
            aria-label="${escapeHtml(item.name)}を1つ増やす"
            ${readOnly || item.quantity >= item.stock ? "disabled" : ""}
          >＋</button>
        </div>
      </div>

      <div class="ready-control">
        <label class="check-label">
          <input
            type="checkbox"
            data-action="toggle-check"
            data-id="${item.id}"
            ${item.checked ? "checked" : ""}
            ${canCheck ? "" : "disabled"}
          />
          <span>${item.checked ? "準備済み" : "未準備"}</span>
        </label>
        <span class="save-status" data-status="${item.saveStatus}">
          ${statusLabels[item.saveStatus]}
        </span>
        ${
          item.saveStatus === "error"
            ? `
              <button
                class="button button-ghost button-small"
                type="button"
                data-action="retry-save"
                data-id="${item.id}"
              >
                再試行
              </button>
            `
            : ""
        }
      </div>
    </article>
  `;
}

function renderTools() {
  const rows = filteredItems(state.data.tools, ["name", "category"]);

  return renderManagementPage({
    eyebrow: "TOOL MASTER",
    title: "道具管理",
    description: "作業カテゴリごとの道具と在庫数を管理します。",
    resource: "tool",
    createLabel: "道具を追加",
    filterExtra: `
      <div class="toolbar-field">
        <label for="category-filter">作業カテゴリ</label>
        <select id="category-filter" data-action="category-filter">
          <option value="ALL" ${state.categoryFilter === "ALL" ? "selected" : ""}>すべて</option>
          ${state.data.categories
            .filter((category) => category.status === "ACTIVE")
            .map(
              (category) =>
                `<option value="${escapeHtml(category.name)}" ${
                  state.categoryFilter === category.name ? "selected" : ""
                }>${escapeHtml(category.name)}</option>`,
            )
            .join("")}
        </select>
      </div>
    `,
    headers: ["道具名", "作業カテゴリ", "在庫", "表示順", "状態", "操作"],
    rows: rows.map(renderToolRow).join(""),
    columnCount: 6,
  });
}

function renderToolRow(tool) {
  return `
    <tr>
      <td data-label="道具名"><strong>${escapeHtml(tool.name)}</strong></td>
      <td data-label="作業カテゴリ">${escapeHtml(tool.category)}</td>
      <td data-label="在庫">${tool.stock}</td>
      <td data-label="表示順">${tool.order}</td>
      <td data-label="状態">${renderStatusBadge(tool.status)}</td>
      <td data-label="操作">
        ${renderRowActions("tool", tool)}
      </td>
    </tr>
  `;
}

function renderCategories() {
  const categories = filteredItems(state.data.categories, ["name"]);
  const statusOptions = `
    <option value="ALL" ${state.statusFilter === "ALL" ? "selected" : ""}>すべて</option>
    <option value="ACTIVE" ${state.statusFilter === "ACTIVE" ? "selected" : ""}>利用中</option>
    <option value="INACTIVE" ${state.statusFilter === "INACTIVE" ? "selected" : ""}>利用停止</option>
  `;

  return `
    <main class="page-shell" id="main-content">
      <div class="page-heading">
        <div>
          <p class="eyebrow">WORK CATEGORY</p>
          <h1>作業カテゴリ管理</h1>
          <p>日別チェックで選ぶ作業と、その道具のまとまりを管理します。</p>
        </div>
        <button
          class="button button-primary"
          type="button"
          data-action="open-resource-form"
          data-resource="category"
        >
          ＋ 作業カテゴリを追加
        </button>
      </div>

      <section class="panel toolbar category-toolbar" aria-label="作業カテゴリの絞り込み">
        <div class="toolbar-field">
          <label for="search-input">検索</label>
          <input
            id="search-input"
            type="search"
            value="${escapeHtml(state.search)}"
            placeholder="作業カテゴリ名で検索"
            data-action="search"
          />
        </div>
        <div class="toolbar-field">
          <label for="status-filter">状態</label>
          <select id="status-filter" data-action="status-filter">${statusOptions}</select>
        </div>
      </section>

      <section class="work-category-grid" aria-label="作業カテゴリ一覧">
        ${
          categories.length
            ? categories.map(renderCategoryCard).join("")
            : `
              <div class="panel empty-state">
                <strong>該当する作業カテゴリがありません</strong>
                <span class="muted">検索条件を変更してください。</span>
              </div>
            `
        }
      </section>
    </main>
  `;
}

function renderCategoryCard(category) {
  const toolCount = state.data.tools.filter(
    (tool) =>
      tool.category === category.name && tool.status === "ACTIVE",
  ).length;
  return `
    <article class="panel work-category-card">
      <div class="work-category-card-header">
        <div>
          <span class="category-card-kicker">${category.isCommon ? "AUTO INCLUDE" : "WORK"}</span>
          <h2>${escapeHtml(category.name)}</h2>
        </div>
        <div class="category-card-actions">
          <button
            class="button button-secondary button-small"
            type="button"
            data-action="open-resource-form"
            data-resource="category"
            data-id="${category.id}"
          >
            編集
          </button>
          ${
            category.isCommon
              ? ""
              : `
                <button
                  class="button button-ghost button-small"
                  type="button"
                  data-action="confirm-status"
                  data-resource="category"
                  data-id="${category.id}"
                >
                  ${category.status === "ACTIVE" ? "利用停止" : "再有効化"}
                </button>
              `
          }
        </div>
      </div>
      <div class="work-category-meta">
        ${renderStatusBadge(category.status)}
        <span>${toolCount}種類の道具</span>
        <span>表示順 ${category.order}</span>
      </div>
      ${
        category.isCommon
          ? '<p class="common-card-note">日別チェックへ自動で追加される道具です。</p>'
          : ""
      }
    </article>
  `;
}

function renderUsers() {
  const rows = filteredItems(state.data.users, ["name", "loginId", "role"]);
  return renderManagementPage({
    eyebrow: "USER MANAGEMENT",
    title: "ユーザー管理",
    description: "利用者、ログインID、権限、利用状態を管理します。",
    resource: "user",
    createLabel: "ユーザーを追加",
    headers: ["氏名", "ログインID", "権限", "状態", "操作"],
    rows: rows.map(renderUserRow).join(""),
    columnCount: 5,
  });
}

function renderUserRow(user) {
  return `
    <tr>
      <td data-label="氏名"><strong>${escapeHtml(user.name)}</strong></td>
      <td data-label="ログインID">${escapeHtml(user.loginId)}</td>
      <td data-label="権限">${renderRoleBadge(user.role)}</td>
      <td data-label="状態">${renderStatusBadge(user.status)}</td>
      <td data-label="操作">
        ${renderRowActions("user", user)}
      </td>
    </tr>
  `;
}

function renderManagementPage(config) {
  const statusOptions = `
    <option value="ALL" ${state.statusFilter === "ALL" ? "selected" : ""}>すべて</option>
    <option value="ACTIVE" ${state.statusFilter === "ACTIVE" ? "selected" : ""}>利用中</option>
    <option value="INACTIVE" ${state.statusFilter === "INACTIVE" ? "selected" : ""}>利用停止</option>
  `;

  return `
    <main class="page-shell" id="main-content">
      <div class="page-heading">
        <div>
          <p class="eyebrow">${config.eyebrow}</p>
          <h1>${config.title}</h1>
          <p>${config.description}</p>
        </div>
        <button
          class="button button-primary"
          type="button"
          data-action="open-resource-form"
          data-resource="${config.resource}"
        >
          ＋ ${config.createLabel}
        </button>
      </div>

      <section class="panel toolbar" aria-label="一覧の絞り込み">
        <div class="toolbar-field">
          <label for="search-input">検索</label>
          <input
            id="search-input"
            type="search"
            value="${escapeHtml(state.search)}"
            placeholder="名前やIDで検索"
            data-action="search"
          />
        </div>
        <div class="toolbar-field">
          <label for="status-filter">状態</label>
          <select id="status-filter" data-action="status-filter">
            ${statusOptions}
          </select>
        </div>
        ${config.filterExtra || ""}
      </section>

      <section class="panel data-panel">
        <table class="data-table">
          <thead>
            <tr>${config.headers.map((header) => `<th scope="col">${header}</th>`).join("")}</tr>
          </thead>
          <tbody>
            ${
              config.rows ||
              `
                <tr>
                  <td colspan="${config.columnCount}">
                    <div class="empty-state">
                      <strong>該当するデータがありません</strong>
                      <span class="muted">検索条件を変更してください。</span>
                    </div>
                  </td>
                </tr>
              `
            }
          </tbody>
        </table>
      </section>
    </main>
  `;
}

function renderRowActions(resource, item) {
  return `
    <div class="table-actions">
      <button
        class="button button-secondary button-small"
        type="button"
        data-action="open-resource-form"
        data-resource="${resource}"
        data-id="${item.id}"
      >
        編集
      </button>
      <button
        class="button button-ghost button-small"
        type="button"
        data-action="confirm-status"
        data-resource="${resource}"
        data-id="${item.id}"
      >
        ${item.status === "ACTIVE" ? "利用停止" : "再有効化"}
      </button>
    </div>
  `;
}

function renderStatusBadge(status) {
  return `
    <span class="status-badge ${status === "ACTIVE" ? "is-active" : "is-inactive"}">
      ${status === "ACTIVE" ? "利用中" : "利用停止"}
    </span>
  `;
}

function renderRoleBadge(role) {
  return `
    <span class="role-badge ${role === "ADMIN" ? "is-admin" : "is-worker"}">
      ${role === "ADMIN" ? "管理者" : "作業者"}
    </span>
  `;
}

function renderPasswordChange() {
  return `
    <main class="page-shell" id="main-content">
      <div class="page-heading">
        <div>
          <p class="eyebrow">ACCOUNT</p>
          <h1>アカウント</h1>
          <p>自分のパスワードとセッションを管理します。</p>
        </div>
      </div>

      <section class="panel" style="max-width:620px;padding:22px">
        <h2 style="margin-top:0">パスワード変更</h2>
        <p class="muted">
          変更後は安全のため、すべての端末からログアウトします。
        </p>
        <form data-form="password-change" novalidate>
          <div class="field">
            <label for="current-password">現在のパスワード</label>
            <input
              id="current-password"
              name="currentPassword"
              type="password"
              autocomplete="current-password"
              required
            />
          </div>
          ${renderPasswordFields("account")}
          <p id="password-error" class="field-error" aria-live="polite"></p>
          <button class="button button-primary" type="submit">
            パスワードを変更
          </button>
        </form>
      </section>

      <section class="panel" style="max-width:620px;padding:22px;margin-top:16px">
        <h2 style="margin-top:0">モック用の確認操作</h2>
        <p class="muted">
          通信失敗やRefresh Token失効時の画面遷移を確認できます。
        </p>
        <div class="table-actions" style="justify-content:flex-start">
          <button
            class="button button-secondary"
            type="button"
            data-action="simulate-save-error"
          >
            保存失敗を再現
          </button>
          <button
            class="button button-secondary"
            type="button"
            data-action="session-expired"
          >
            セッション切れを再現
          </button>
        </div>
      </section>
    </main>
  `;
}

function renderPasswordFields(prefix) {
  return `
    <div class="field">
      <label for="${prefix}-new-password">新しいパスワード</label>
      <input
        id="${prefix}-new-password"
        name="newPassword"
        type="password"
        autocomplete="new-password"
        minlength="12"
        required
      />
      <p class="field-hint">12〜128文字で入力してください。</p>
    </div>
    <div class="field">
      <label for="${prefix}-confirm-password">新しいパスワード（確認）</label>
      <input
        id="${prefix}-confirm-password"
        name="confirmPassword"
        type="password"
        autocomplete="new-password"
        minlength="12"
        required
      />
    </div>
  `;
}

function renderFlowGuide() {
  const isAdmin = state.currentUser.role === "ADMIN";
  return `
    <main class="page-shell" id="main-content">
      <div class="page-heading">
        <div>
          <p class="eyebrow">SCREEN FLOW</p>
          <h1>画面と動きの流れ</h1>
          <p>${isAdmin ? "管理者" : "作業者"}として確認できる範囲です。</p>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:14px">
        <section class="panel flow-card">
          <h2 style="margin-top:0">毎日の準備</h2>
          <ol class="flow-list">
            <li>
              <div><strong>ログイン</strong><span>IDとパスワードで本人確認</span></div>
            </li>
            <li>
              <div><strong>ホームを確認</strong><span>今日のチェックまたは別の日を選択</span></div>
            </li>
            <li>
              <div><strong>チェック表の分け方を選択</strong><span>1日通しか、午前・午後の2区分を選ぶ</span></div>
            </li>
            <li>
              <div><strong>作業カテゴリを選択</strong><span>午前・午後ではそれぞれ別に選び、共通道具を自動追加</span></div>
            </li>
            <li>
              <div><strong>持ち出し数を入力</strong><span>在庫数を上限に数量を指定</span></div>
            </li>
            <li>
              <div><strong>準備済みにする</strong><span>数量が1以上の道具だけチェック可能</span></div>
            </li>
            <li>
              <div><strong>自動保存を確認</strong><span>行ごとに保存状態を文字で表示</span></div>
            </li>
          </ol>
        </section>

        <section class="panel flow-card">
          <h2 style="margin-top:0">${isAdmin ? "管理者の管理作業" : "作業者の権限"}</h2>
          ${
            isAdmin
              ? `
                <ol class="flow-list">
                  <li>
                    <div><strong>作業カテゴリを整える</strong><span>作業名と表示順を管理</span></div>
                  </li>
                  <li>
                    <div><strong>道具を登録する</strong><span>作業カテゴリ、在庫、表示順を設定</span></div>
                  </li>
                  <li>
                    <div><strong>ユーザーを追加する</strong><span>権限と仮パスワードを発行</span></div>
                  </li>
                  <li>
                    <div><strong>利用状態を管理する</strong><span>削除せず利用停止・再有効化</span></div>
                  </li>
                </ol>
              `
              : `
                <div class="info-banner">
                  作業者には管理メニューを表示しません。URLを直接指定した場合も、
                  本実装ではAPIが403 Forbiddenを返します。
                </div>
                <button
                  class="button button-primary"
                  type="button"
                  data-action="navigate"
                  data-view="checklist"
                  style="margin-top:18px"
                >
                  日別チェックへ戻る
                </button>
              `
          }
        </section>
      </div>
    </main>
  `;
}

function renderForbidden() {
  return `
    <main class="page-shell" id="main-content">
      <section class="panel empty-state">
        <p class="eyebrow">403 FORBIDDEN</p>
        <h1>この画面を利用する権限がありません</h1>
        <p class="muted">管理者へ権限を確認してください。</p>
        <button
          class="button button-primary"
          type="button"
          data-action="navigate"
          data-view="checklist"
        >
          日別チェックへ戻る
        </button>
      </section>
    </main>
  `;
}

/** クリック操作を一か所で受け、画面ごとの動作へ振り分ける。 */
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (!target) return;

  const action = target.dataset.action;

  if (action === "select-demo") {
    selectDemoAccount(target.dataset.login);
  } else if (action === "back-to-login") {
    resetToLogin();
  } else if (action === "navigate") {
    navigateTo(target.dataset.view);
  } else if (action === "toggle-menu") {
    state.mobileMenuOpen = !state.mobileMenuOpen;
    render();
  } else if (action === "logout") {
    resetToLogin();
    showToast("ログアウトしました。", "info");
  } else if (action === "session-expired") {
    state.currentUser = null;
    state.view = "session-expired";
    state.mobileMenuOpen = false;
    render();
  } else if (action === "today") {
    state.selectedDate = state.today;
    state.selectedPeriod = getExistingPeriods(state.today)[0]?.id || "full";
    render();
  } else if (action === "change-period") {
    state.selectedPeriod = target.dataset.period || "full";
    render();
  } else if (action === "toggle-checklist-options") {
    state.checklistOptionsOpen = !state.checklistOptionsOpen;
    render();
  } else if (action === "open-checklist") {
    const date = target.dataset.useHomeDate
      ? state.homeDate
      : target.dataset.date || state.today;
    openChecklistForDate(date);
  } else if (action === "open-category-selection") {
    openCategorySelectionDialog(target.dataset.mode || "create");
  } else if (action === "quantity") {
    changeQuantity(Number(target.dataset.id), Number(target.dataset.direction));
  } else if (action === "open-resource-form") {
    openResourceForm(target.dataset.resource, Number(target.dataset.id) || null);
  } else if (action === "confirm-status") {
    openStatusConfirmation(
      target.dataset.resource,
      Number(target.dataset.id),
    );
  } else if (action === "close-dialog") {
    closeDialog();
  } else if (action === "copy-password") {
    copyTemporaryPassword(target.dataset.password);
  } else if (action === "simulate-save-error") {
    simulateSaveError();
  } else if (action === "retry-save") {
    queueSave(Number(target.dataset.id));
  }
});

/** フォーム送信を実際のAPI送信の代わりにモック状態へ反映する。 */
document.addEventListener("submit", (event) => {
  const form = event.target;
  event.preventDefault();

  if (form.dataset.form === "login") {
    handleLogin(form);
  } else if (form.dataset.form === "first-password") {
    handleFirstPassword(form);
  } else if (form.dataset.form === "password-change") {
    handlePasswordChange(form);
  } else if (form.dataset.form === "resource") {
    saveResource(form);
  } else if (form.dataset.form === "status") {
    updateResourceStatus(form);
  } else if (form.dataset.form === "category-selection") {
    saveCategorySelection(form);
  }
});

document.addEventListener("change", (event) => {
  const target = event.target;
  const action = target.dataset.action;

  if (action === "change-date") {
    state.selectedDate = target.value || state.today;
    state.selectedPeriod = getExistingPeriods(state.selectedDate)[0]?.id || "full";
    render();
  } else if (action === "home-date-change") {
    state.homeDate = target.value || state.today;
  } else if (action === "quantity-input") {
    setQuantity(Number(target.dataset.id), Number(target.value));
  } else if (action === "toggle-check") {
    toggleChecklistItem(Number(target.dataset.id), target.checked);
  } else if (action === "status-filter") {
    state.statusFilter = target.value;
    render();
  } else if (action === "category-filter") {
    state.categoryFilter = target.value;
    render();
  }
});

document.addEventListener("input", (event) => {
  if (event.target.dataset.action !== "search") return;
  state.search = event.target.value;
  const selectionStart = event.target.selectionStart;
  render();
  const nextSearch = document.querySelector('[data-action="search"]');
  if (nextSearch) {
    nextSearch.focus();
    nextSearch.setSelectionRange(selectionStart, selectionStart);
  }
});

dialog.addEventListener("close", () => {
  dialogContent.innerHTML = "";
  if (lastFocusedElement?.isConnected) {
    lastFocusedElement.focus();
  }
});

function selectDemoAccount(loginId) {
  const loginInput = document.querySelector("#login-id");
  const passwordInput = document.querySelector("#password");
  if (!loginInput || !passwordInput) return;
  loginInput.value = loginId;
  passwordInput.value = "FieldFlow-demo-2026";
  document.querySelector('[data-form="login"] button[type="submit"]')?.focus();
}

function handleLogin(form) {
  const formData = new FormData(form);
  const loginId = String(formData.get("loginId") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const error = document.querySelector("#login-error");

  if (!loginId || !password) {
    error.textContent = "ログインIDとパスワードを入力してください。";
    return;
  }

  if (loginId === "first.user") {
    state.view = "first-password";
    render();
    return;
  }

  const isWorker = loginId === "worker";
  state.currentUser = isWorker
    ? { name: "佐藤 作業者", role: "WORKER" }
    : { name: "山田 管理者", role: "ADMIN" };
  state.view = "home";
  state.selectedDate = state.today;
  state.selectedPeriod = "full";
  state.checklistOptionsOpen = false;
  state.homeDate = state.today;
  render();
  showToast(`${isWorker ? "作業者" : "管理者"}としてログインしました。`);
}

function handleFirstPassword(form) {
  if (!validateNewPassword(form)) return;
  resetToLogin();
  showToast("パスワードを変更しました。新しいパスワードでログインしてください。");
}

function handlePasswordChange(form) {
  const formData = new FormData(form);
  const currentPassword = String(formData.get("currentPassword") || "");
  if (!currentPassword) {
    document.querySelector("#password-error").textContent =
      "現在のパスワードを入力してください。";
    return;
  }
  if (!validateNewPassword(form)) return;

  resetToLogin();
  showToast("パスワードを変更し、すべての端末からログアウトしました。");
}

function validateNewPassword(form) {
  const formData = new FormData(form);
  const newPassword = String(formData.get("newPassword") || "");
  const confirmPassword = String(formData.get("confirmPassword") || "");
  const error = document.querySelector("#password-error");

  if (newPassword.length < 12) {
    error.textContent = "新しいパスワードは12文字以上で入力してください。";
    return false;
  }
  if (newPassword !== confirmPassword) {
    error.textContent = "確認用パスワードが一致しません。";
    return false;
  }
  error.textContent = "";
  return true;
}

function navigateTo(view) {
  if (view !== state.view) {
    state.checklistOptionsOpen = false;
  }

  if (view === "checklist") {
    const existingPeriods = getExistingPeriods(state.selectedDate);
    if (!getCurrentChecklist() && existingPeriods.length > 0) {
      state.selectedPeriod = existingPeriods[0].id;
    }
  }

  if (view === "checklist" && !getCurrentChecklist()) {
    if (state.selectedDate < state.today) {
      state.view = "checklist";
      render();
    } else {
      openCategorySelectionDialog("create");
    }
    return;
  }

  state.view = view;
  state.mobileMenuOpen = false;
  state.search = "";
  state.statusFilter = "ALL";
  state.categoryFilter = "ALL";
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function openChecklistForDate(date) {
  state.selectedDate = date || state.today;
  state.homeDate = state.selectedDate;
  state.mobileMenuOpen = false;
  state.checklistOptionsOpen = false;
  const existingPeriods = getExistingPeriods(state.selectedDate);
  state.selectedPeriod = existingPeriods[0]?.id || "full";

  if (existingPeriods.length > 0 || state.selectedDate < state.today) {
    state.view = "checklist";
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }

  openCategorySelectionDialog("create");
}

/** 作業カテゴリのチェック項目を、用途別のname属性で描画する。 */
function renderCategoryChoices(categories, inputName) {
  if (categories.length === 0) {
    return `
      <div class="empty-state">
        <strong>追加できるカテゴリはありません</strong>
        <span class="muted">すべての作業カテゴリを追加済みです。</span>
      </div>
    `;
  }

  return `
    <div class="category-choice-grid">
      ${categories
        .map((category) => {
          const toolCount = state.data.tools.filter(
            (tool) =>
              tool.status === "ACTIVE" && tool.category === category.name,
          ).length;
          return `
            <label class="category-choice">
              <input type="checkbox" name="${inputName}" value="${category.id}" />
              <span>
                <strong>${escapeHtml(category.name)}</strong>
                <small>${toolCount}種類の道具</small>
              </span>
            </label>
          `;
        })
        .join("")}
    </div>
  `;
}

/** 初回作成では、1日通しか午前・午後の2区分かを一度に設定する。 */
function renderInitialChecklistPlanner(categories) {
  return `
    <fieldset class="schedule-choice-fieldset">
      <legend>チェック表の分け方</legend>
      <div class="schedule-choice-grid">
        <label class="schedule-choice">
          <input type="radio" name="scheduleMode" value="full" checked />
          <span><strong>1日通し</strong><small>終日同じ作業</small></span>
        </label>
        <label class="schedule-choice">
          <input type="radio" name="scheduleMode" value="split" />
          <span><strong>午前・午後</strong><small>時間帯ごとに作業を分ける</small></span>
        </label>
      </div>
    </fieldset>

    <section class="schedule-mode-panel" data-schedule-panel="full">
      <h3>1日通しの作業カテゴリ</h3>
      <p class="muted">この日に行う作業を1つ以上選んでください。</p>
      ${renderCategoryChoices(categories, "fullCategoryIds")}
    </section>

    <section class="schedule-mode-panel" data-schedule-panel="split">
      <div class="split-period-tabs" role="group" aria-label="設定する時間帯">
        <label>
          <input type="radio" name="splitPeriodPanel" value="morning" checked />
          <span>午前</span>
        </label>
        <label>
          <input type="radio" name="splitPeriodPanel" value="afternoon" />
          <span>午後</span>
        </label>
      </div>
      <p class="selection-keep-note">タブを切り替えても、選択したカテゴリは保持されます。</p>
      <div class="split-category-panel" data-split-panel="morning">
        <h3>午前の作業カテゴリ</h3>
        ${renderCategoryChoices(categories, "morningCategoryIds")}
      </div>
      <div class="split-category-panel" data-split-panel="afternoon">
        <h3>午後の作業カテゴリ</h3>
        ${renderCategoryChoices(categories, "afternoonCategoryIds")}
      </div>
    </section>
  `;
}

/**
 * 日別チェックの作成前、または作成後の追加時に作業カテゴリを選ぶ。
 * 「共通」は利用者に選ばせず、必要な安全用品を漏らさないため自動で含める。
 */
function openCategorySelectionDialog(mode) {
  const checklist = getCurrentChecklist();
  const isInitialCreate =
    mode === "create" && getExistingPeriods(state.selectedDate).length === 0;
  const selectedIds = new Set(checklist?.categoryIds || []);
  const categories = state.data.categories.filter(
    (category) =>
      category.status === "ACTIVE" &&
      !category.isCommon &&
      (mode !== "add" || !selectedIds.has(category.id)),
  );
  const commonCategory = state.data.categories.find(
    (category) => category.isCommon && category.status === "ACTIVE",
  );
  const commonToolCount = commonCategory
    ? state.data.tools.filter(
        (tool) =>
          tool.status === "ACTIVE" && tool.category === commonCategory.name,
      ).length
    : 0;

  openDialog(`
    <form
      data-form="category-selection"
      data-mode="${mode}"
      data-creation-type="${isInitialCreate ? "initial" : "single"}"
    >
      <div class="dialog-header">
        <p class="eyebrow">SELECT WORK</p>
        <h2 id="dialog-title">${
          mode === "add"
            ? `${getPeriodLabel(state.selectedPeriod)}の作業を追加`
            : isInitialCreate
              ? "今日のチェック表を作成"
              : `${getPeriodLabel(state.selectedPeriod)}の作業を選択`
        }</h2>
      </div>
      <div class="dialog-body">
        ${
          isInitialCreate
            ? renderInitialChecklistPlanner(categories)
            : `
              <p class="muted">
                ${mode === "add" ? "追加する作業を選んでください。一度追加したカテゴリは削除できません。" : "この時間帯に行う作業を1つ以上選んでください。"}
              </p>
              ${renderCategoryChoices(categories, "categoryIds")}
            `
        }
        <div class="common-category-note">
          <span class="common-category-mark" aria-hidden="true">＋</span>
          <span>
            <strong>共通の道具は自動で追加</strong>
            <small>各チェック表に、手袋・ヘルメットなど${commonToolCount}種類を追加</small>
          </span>
        </div>
        <p id="dialog-error" class="field-error" aria-live="polite"></p>
      </div>
      <div class="dialog-actions">
        <button class="button button-secondary" type="button" data-action="close-dialog">
          キャンセル
        </button>
        ${
          categories.length
            ? `<button class="button button-primary" type="submit">${mode === "add" ? "カテゴリを追加" : "チェック表を作成"}</button>`
            : ""
        }
      </div>
    </form>
  `);
}

function getSelectedCategoryIds(formData, inputName) {
  return formData.getAll(inputName).map(Number).filter(Number.isInteger);
}

function createChecklist(categoryIds, commonCategory) {
  const allCategoryIds = [
    ...categoryIds,
    ...(commonCategory ? [commonCategory.id] : []),
  ];
  return {
    categoryIds: [...new Set(allCategoryIds)],
    items: buildChecklistItems(allCategoryIds),
  };
}

function saveCategorySelection(form) {
  const mode = form.dataset.mode;
  const creationType = form.dataset.creationType;
  const formData = new FormData(form);
  const error = dialog.querySelector("#dialog-error");
  const commonCategory = state.data.categories.find(
    (category) => category.isCommon && category.status === "ACTIVE",
  );

  if (mode === "create" && creationType === "initial") {
    const scheduleMode = String(formData.get("scheduleMode") || "");
    const fullCategoryIds = getSelectedCategoryIds(
      formData,
      "fullCategoryIds",
    );
    const morningCategoryIds = getSelectedCategoryIds(
      formData,
      "morningCategoryIds",
    );
    const afternoonCategoryIds = getSelectedCategoryIds(
      formData,
      "afternoonCategoryIds",
    );

    if (scheduleMode === "full" && fullCategoryIds.length === 0) {
      error.textContent = "1日通しの作業カテゴリを1つ以上選択してください。";
      return;
    }
    if (
      scheduleMode === "split" &&
      (morningCategoryIds.length === 0 || afternoonCategoryIds.length === 0)
    ) {
      error.textContent =
        "午前と午後、それぞれの作業カテゴリを1つ以上選択してください。";
      return;
    }
    if (scheduleMode !== "full" && scheduleMode !== "split") {
      error.textContent = "チェック表の分け方を選択してください。";
      return;
    }

    state.checklists[state.selectedDate] = {};
    if (scheduleMode === "full") {
      state.checklists[state.selectedDate].full = createChecklist(
        fullCategoryIds,
        commonCategory,
      );
      state.selectedPeriod = "full";
    } else {
      state.checklists[state.selectedDate].morning = createChecklist(
        morningCategoryIds,
        commonCategory,
      );
      state.checklists[state.selectedDate].afternoon = createChecklist(
        afternoonCategoryIds,
        commonCategory,
      );
      state.selectedPeriod = "morning";
    }
  } else {
    const categoryIds = getSelectedCategoryIds(formData, "categoryIds");
    if (categoryIds.length === 0) {
      error.textContent = "作業カテゴリを1つ以上選択してください。";
      return;
    }

    if (mode === "create") {
      if (!state.checklists[state.selectedDate]) {
        state.checklists[state.selectedDate] = {};
      }
      state.checklists[state.selectedDate][state.selectedPeriod] =
        createChecklist(categoryIds, commonCategory);
    } else {
      const checklist = getCurrentChecklist();
      checklist.categoryIds = [
        ...new Set([...checklist.categoryIds, ...categoryIds]),
      ];
      const existingToolIds = new Set(checklist.items.map((item) => item.id));
      const addedItems = buildChecklistItems(categoryIds).filter(
        (item) => !existingToolIds.has(item.id),
      );
      checklist.items.push(...addedItems);
    }
  }

  closeDialog();
  state.view = "checklist";
  state.checklistOptionsOpen = false;
  render();
  // 画面遷移後にホーム側のスクロール位置を引き継がないよう、先頭から表示する。
  window.scrollTo({ top: 0, behavior: "smooth" });
  showToast(
    mode === "add"
      ? "作業カテゴリと道具を追加しました。"
      : "日別チェックを作成しました。",
  );
}

function buildChecklistItems(categoryIds) {
  const categoryNames = new Set(
    categoryIds
      .map(
        (categoryId) =>
          state.data.categories.find((category) => category.id === categoryId)
            ?.name,
      )
      .filter(Boolean),
  );

  return state.data.tools
    .filter(
      (tool) => tool.status === "ACTIVE" && categoryNames.has(tool.category),
    )
    .map((tool) => ({
      id: tool.id,
      name: tool.name,
      category: tool.category,
      stock: tool.stock,
      quantity: 0,
      checked: false,
      saveStatus: "saved",
    }));
}

function resetToLogin() {
  state.currentUser = null;
  state.view = "login";
  state.mobileMenuOpen = false;
  render();
}

function changeQuantity(itemId, direction) {
  const item = getChecklistItems().find((row) => row.id === itemId);
  if (!item) return;
  setQuantity(itemId, item.quantity + direction);
}

function setQuantity(itemId, nextQuantity) {
  const item = getChecklistItems().find((row) => row.id === itemId);
  if (!item) return;

  if (
    !Number.isInteger(nextQuantity) ||
    nextQuantity < 0 ||
    nextQuantity > item.stock
  ) {
    showToast(`数量は0〜${item.stock}の整数で入力してください。`, "error");
    render();
    return;
  }

  item.quantity = nextQuantity;
  if (nextQuantity === 0) {
    item.checked = false;
  }
  queueSave(itemId);
}

function toggleChecklistItem(itemId, checked) {
  const item = getChecklistItems().find((row) => row.id === itemId);
  if (!item) return;

  if (item.quantity === 0 && checked) {
    showToast("持ち出し数が0の道具は準備済みにできません。", "error");
    render();
    return;
  }

  item.checked = checked;
  queueSave(itemId);
}

/**
 * 行単位の自動保存を再現する。
 * 実装版ではここがPUT APIと楽観ロック処理へ置き換わる。
 */
function queueSave(itemId) {
  const item = getChecklistItems().find((row) => row.id === itemId);
  if (!item) return;
  const timerKey = `${state.selectedDate}:${state.selectedPeriod}:${itemId}`;

  window.clearTimeout(saveTimers.get(timerKey));
  item.saveStatus = "saving";
  render();

  const timerId = window.setTimeout(() => {
    item.saveStatus = "saved";
    if (state.view === "checklist") render();
  }, 650);
  saveTimers.set(timerKey, timerId);
}

function simulateSaveError() {
  const checklistItems = getChecklistItems();
  const item =
    checklistItems.find((row) => row.quantity > 0) || checklistItems[0];
  if (!item) {
    showToast("先に日別チェックを作成してください。", "info");
    return;
  }
  const timerKey = `${state.selectedDate}:${state.selectedPeriod}:${item.id}`;
  window.clearTimeout(saveTimers.get(timerKey));
  item.saveStatus = "error";
  state.view = "checklist";
  state.mobileMenuOpen = false;
  render();
  showToast(
    `${item.name}を保存できませんでした。通信状況を確認して再試行してください。`,
    "error",
  );
}

function openResourceForm(resource, id) {
  const collection = getResourceCollection(resource);
  const item = id ? collection.find((entry) => entry.id === id) : null;
  const labels = {
    tool: "道具",
    category: "作業カテゴリ",
    user: "ユーザー",
  };
  const mode = item ? "編集" : "追加";

  openDialog(`
    <form data-form="resource" data-resource="${resource}" data-id="${id || ""}" novalidate>
      <div class="dialog-header">
        <p class="eyebrow">${item ? "EDIT" : "CREATE"}</p>
        <h2 id="dialog-title">${labels[resource]}を${mode}</h2>
      </div>
      <div class="dialog-body">
        ${renderResourceFields(resource, item)}
        <p id="dialog-error" class="field-error" aria-live="polite"></p>
      </div>
      <div class="dialog-actions">
        <button class="button button-secondary" type="button" data-action="close-dialog">
          キャンセル
        </button>
        <button class="button button-primary" type="submit">
          ${item ? "変更を保存" : `${labels[resource]}を追加`}
        </button>
      </div>
    </form>
  `);
}

function renderResourceFields(resource, item) {
  if (resource === "tool") {
    const categoryOptions = state.data.categories
      .filter((category) => category.status === "ACTIVE")
      .map(
        (category) => `
          <option
            value="${escapeHtml(category.name)}"
            ${item?.category === category.name ? "selected" : ""}
          >${escapeHtml(category.name)}</option>
        `,
      )
      .join("");

    return `
      <div class="field">
        <label for="resource-name">道具名</label>
        <input id="resource-name" name="name" value="${escapeHtml(item?.name || "")}" maxlength="100" required />
      </div>
      <div class="field">
        <label for="resource-category">作業カテゴリ</label>
        <select id="resource-category" name="category" required>${categoryOptions}</select>
      </div>
      <div class="field">
        <label for="resource-stock">在庫数</label>
        <input id="resource-stock" name="stock" type="number" min="0" max="9999" value="${item?.stock ?? 1}" required />
      </div>
      <div class="field">
        <label for="resource-order">表示順</label>
        <input id="resource-order" name="order" type="number" min="0" max="9999" value="${item?.order ?? 10}" required />
      </div>
    `;
  }

  if (resource === "category") {
    return `
      <div class="field">
        <label for="resource-name">作業カテゴリ名</label>
        <input id="resource-name" name="name" value="${escapeHtml(item?.name || "")}" maxlength="50" ${item?.isCommon ? "readonly" : ""} required />
        ${item?.isCommon ? '<p class="field-hint">「共通」は自動追加に使うため名称を変更できません。</p>' : ""}
      </div>
      <div class="field">
        <label for="resource-order">表示順</label>
        <input id="resource-order" name="order" type="number" min="0" max="9999" value="${item?.order ?? 10}" required />
      </div>
    `;
  }

  return `
    <div class="field">
      <label for="resource-name">氏名</label>
      <input id="resource-name" name="name" value="${escapeHtml(item?.name || "")}" maxlength="100" required />
    </div>
    <div class="field">
      <label for="resource-login-id">ログインID</label>
      <input
        id="resource-login-id"
        name="loginId"
        value="${escapeHtml(item?.loginId || "")}"
        pattern="[A-Za-z0-9._-]{4,50}"
        required
      />
      <p class="field-hint">4〜50文字の半角英数字と . _ - を使用できます。</p>
    </div>
    <div class="field">
      <label for="resource-role">権限</label>
      <select id="resource-role" name="role">
        <option value="WORKER" ${item?.role !== "ADMIN" ? "selected" : ""}>作業者</option>
        <option value="ADMIN" ${item?.role === "ADMIN" ? "selected" : ""}>管理者</option>
      </select>
    </div>
  `;
}

function saveResource(form) {
  const resource = form.dataset.resource;
  const id = Number(form.dataset.id) || null;
  const collection = getResourceCollection(resource);
  const formData = new FormData(form);
  const name = String(formData.get("name") || "").trim();
  const error = document.querySelector("#dialog-error");

  if (!name) {
    error.textContent = "名前を入力してください。";
    return;
  }

  const duplicated = collection.some(
    (entry) =>
      entry.id !== id && entry.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (duplicated) {
    error.textContent = "同じ名前がすでに登録されています。";
    return;
  }

  const existing = id ? collection.find((entry) => entry.id === id) : null;
  const common = {
    id: existing?.id || nextId(collection),
    name,
    status: existing?.status || "ACTIVE",
  };

  let nextItem;
  if (resource === "tool") {
    nextItem = {
      ...common,
      category: String(formData.get("category")),
      stock: clampInteger(formData.get("stock"), 0, 9999),
      order: clampInteger(formData.get("order"), 0, 9999),
    };
  } else if (resource === "category") {
    nextItem = {
      ...common,
      order: clampInteger(formData.get("order"), 0, 9999),
      isCommon: existing?.isCommon || false,
    };
  } else {
    const loginId = String(formData.get("loginId") || "").trim();
    if (!/^[A-Za-z0-9._-]{4,50}$/.test(loginId)) {
      error.textContent =
        "ログインIDは4〜50文字の半角英数字と . _ - で入力してください。";
      return;
    }
    const loginDuplicated = collection.some(
      (entry) =>
        entry.id !== id &&
        entry.loginId.toLowerCase() === loginId.toLowerCase(),
    );
    if (loginDuplicated) {
      error.textContent = "同じログインIDがすでに登録されています。";
      return;
    }
    nextItem = {
      ...common,
      loginId,
      role: String(formData.get("role")),
    };
  }

  if (existing) {
    // 作業カテゴリ名を変更した場合も、紐づく道具を同じカテゴリとして扱えるよう連動させる。
    if (resource === "category" && existing.name !== nextItem.name) {
      state.data.tools.forEach((tool) => {
        if (tool.category === existing.name) {
          tool.category = nextItem.name;
        }
      });
    }
    Object.assign(existing, nextItem);
  } else {
    collection.push(nextItem);
  }

  closeDialog();
  render();

  if (resource === "user" && !existing) {
    window.setTimeout(() => openTemporaryPasswordDialog(nextItem), 80);
  } else {
    showToast(`${resourceLabel(resource)}を${existing ? "更新" : "追加"}しました。`);
  }
}

function openStatusConfirmation(resource, id) {
  const item = getResourceCollection(resource).find((entry) => entry.id === id);
  if (!item) return;
  const nextStatus = item.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
  const actionLabel = nextStatus === "ACTIVE" ? "再有効化" : "利用停止";

  openDialog(`
    <form data-form="status" data-resource="${resource}" data-id="${id}" data-status="${nextStatus}">
      <div class="dialog-header">
        <p class="eyebrow">CONFIRM</p>
        <h2 id="dialog-title">${actionLabel}しますか？</h2>
      </div>
      <div class="dialog-body">
        <p>
          <strong>${escapeHtml(item.name)}</strong> を${actionLabel}します。
          データは削除されず、後から状態を戻せます。
        </p>
        ${
          resource === "category" && nextStatus === "INACTIVE"
            ? '<div class="readonly-banner">有効な道具が紐づくカテゴリは利用停止できません。</div>'
            : ""
        }
      </div>
      <div class="dialog-actions">
        <button class="button button-secondary" type="button" data-action="close-dialog">
          キャンセル
        </button>
        <button class="button ${nextStatus === "ACTIVE" ? "button-primary" : "button-danger"}" type="submit">
          ${actionLabel}する
        </button>
      </div>
    </form>
  `);
}

function updateResourceStatus(form) {
  const resource = form.dataset.resource;
  const id = Number(form.dataset.id);
  const nextStatus = form.dataset.status;
  const item = getResourceCollection(resource).find((entry) => entry.id === id);
  if (!item) return;

  // 「共通」は毎回自動追加する前提のため、利用停止にはしない。
  if (resource === "category" && item.isCommon) {
    closeDialog();
    showToast("共通カテゴリは利用停止できません。", "info");
    return;
  }

  if (resource === "category" && nextStatus === "INACTIVE") {
    const hasActiveTool = state.data.tools.some(
      (tool) => tool.category === item.name && tool.status === "ACTIVE",
    );
    if (hasActiveTool) {
      const error = dialog.querySelector(".readonly-banner");
      error.textContent =
        "利用中の道具があるため停止できません。先に道具を利用停止してください。";
      return;
    }
  }

  item.status = nextStatus;
  closeDialog();
  render();
  showToast(
    `${item.name}を${nextStatus === "ACTIVE" ? "再有効化" : "利用停止"}しました。`,
  );
}

function openTemporaryPasswordDialog(user) {
  const temporaryPassword = "Fk7!mQ2#vR9@xP4s";
  openDialog(`
    <div class="dialog-header">
      <p class="eyebrow">CREATED</p>
      <h2 id="dialog-title">ユーザーを作成しました</h2>
    </div>
    <div class="dialog-body">
      <p><strong>${escapeHtml(user.name)}</strong>さんの仮パスワードです。</p>
      <div class="temporary-password">
        <code>${temporaryPassword}</code>
        <button
          class="button button-secondary button-small"
          type="button"
          data-action="copy-password"
          data-password="${temporaryPassword}"
        >
          コピー
        </button>
      </div>
      <div class="readonly-banner">
        この画面を閉じると再表示できません。安全な方法で本人へ伝えてください。
      </div>
    </div>
    <div class="dialog-actions">
      <button class="button button-primary" type="button" data-action="close-dialog">
        確認して閉じる
      </button>
    </div>
  `);
}

function openDialog(html) {
  lastFocusedElement = document.activeElement;
  dialogContent.innerHTML = html;
  dialog.showModal();
  dialog.querySelector("input, select, button")?.focus();
}

function closeDialog() {
  if (dialog.open) dialog.close();
}

async function copyTemporaryPassword(password) {
  try {
    await navigator.clipboard.writeText(password);
    showToast("仮パスワードをコピーしました。");
  } catch {
    showToast("コピーできませんでした。文字列を選択してコピーしてください。", "error");
  }
}

function filteredItems(items, keys) {
  const query = state.search.trim().toLowerCase();
  return items
    .filter(
      (item) =>
        state.statusFilter === "ALL" || item.status === state.statusFilter,
    )
    .filter((item) => {
      if (!query) return true;
      return keys.some((key) =>
        String(item[key] || "")
          .toLowerCase()
          .includes(query),
      );
    })
    .filter((item) => {
      if (!state.categoryFilter || state.categoryFilter === "ALL") return true;
      return item.category === state.categoryFilter;
    });
}

function getResourceCollection(resource) {
  const collections = {
    tool: state.data.tools,
    category: state.data.categories,
    user: state.data.users,
  };
  return collections[resource];
}

function resourceLabel(resource) {
  return { tool: "道具", category: "作業カテゴリ", user: "ユーザー" }[
    resource
  ];
}

function groupChecklistItems(items) {
  return items.reduce((groups, item) => {
    groups[item.category] ||= [];
    groups[item.category].push(item);
    return groups;
  }, {});
}

function nextId(collection) {
  return Math.max(0, ...collection.map((item) => item.id)) + 1;
}

function clampInteger(value, min, max) {
  const number = Number(value);
  if (!Number.isInteger(number)) return min;
  return Math.min(max, Math.max(min, number));
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "error" ? "is-error" : type === "info" ? "is-info" : ""}`;
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3600);
}

function formatJapaneseDate(dateString) {
  const date = new Date(`${dateString}T00:00:00`);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(date);
}

function toLocalDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function slugify(value) {
  return Array.from(value)
    .map((character) => character.codePointAt(0).toString(16))
    .join("-");
}

/**
 * フォーム入力をHTMLへ戻す箇所では必ずエスケープする。
 * モックでも、入力値をそのままinnerHTMLへ入れる習慣を避けるため。
 */
function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
