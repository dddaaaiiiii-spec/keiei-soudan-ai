const state = {
  records: [],
  currentPage: "mainPage",
  selectedFiles: []
};

function getEl(id) {
  return document.getElementById(id);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function renderApp() {
  renderMainPage();
  renderImportPage();
  renderFilters();
}

function renderMainPage() {
  const mainPage = getEl("mainPage");
  if (!mainPage) return;

  const records = ensureArray(state.records);

  mainPage.innerHTML = `
    <section style="padding:16px;">
      <h2>相談入力</h2>
      <div style="display:grid;gap:12px;max-width:900px;">
        <div>
          <label>会社名</label>
          <input id="companyName" type="text" style="width:100%;padding:8px;">
        </div>
        <div>
          <label>業種</label>
          <input id="industry" type="text" style="width:100%;padding:8px;">
        </div>
        <div>
          <label>相談内容</label>
          <textarea id="issue" style="width:100%;min-height:120px;padding:8px;"></textarea>
        </div>
        <div>
          <label>メモ</label>
          <textarea id="notes" style="width:100%;min-height:120px;padding:8px;"></textarea>
        </div>
        <div>
          <button id="saveRecordBtn" style="padding:10px 16px;">保存</button>
        </div>
      </div>

      <hr style="margin:24px 0;">

      <h3>保存済み一覧</h3>
      <div id="recordList">
        ${
          records.length === 0
            ? "<p>まだ相談データはありません。</p>"
            : records
                .slice()
                .reverse()
                .map(
                  (r) => `
            <div style="border:1px solid #ccc;padding:12px;margin-bottom:8px;border-radius:8px;">
              <strong>${escapeHtml(r.companyName || "会社名未入力")}</strong><br>
              <span>${escapeHtml(r.issue || "")}</span><br>
              <small>${escapeHtml(r.createdAt || "")}</small>
            </div>
          `
                )
                .join("")
        }
      </div>
    </section>
  `;

  const saveBtn = getEl("saveRecordBtn");
  if (saveBtn) {
    saveBtn.onclick = handleSaveRecord;
  }
}

function renderImportPage() {
  const importPage = getEl("importPage");
  if (!importPage) return;

  importPage.innerHTML = `
    <section style="padding:16px;">
      <h2>蓄積ページ</h2>
      <p>ここは今後、PDF / Word / 音声 / 画像の取り込みに対応します。</p>
    </section>
  `;
}

function renderFilters() {
  const filterArea = getEl("filterArea");
  if (!filterArea) return;

  const records = ensureArray(state.records);
  const industries = [...new Set(records.map(r => r.industry).filter(Boolean))];

  filterArea.innerHTML = `
    <div style="padding:16px;">
      <strong>業種フィルタ</strong>
      <div>${industries.length ? industries.map(i => `<span style="margin-right:8px;">${escapeHtml(i)}</span>`).join("") : "なし"}</div>
    </div>
  `;
}

function handleSaveRecord() {
  const companyName = getEl("companyName")?.value?.trim() || "";
  const industry = getEl("industry")?.value?.trim() || "";
  const issue = getEl("issue")?.value?.trim() || "";
  const notes = getEl("notes")?.value?.trim() || "";

  if (!companyName && !issue) {
    alert("会社名または相談内容を入力してください。");
    return;
  }

  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    companyName,
    industry,
    issue,
    notes
  };

  state.records = ensureArray(state.records);
  state.records.push(record);

  renderApp();
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function initTabs() {
  const tabButtons = document.querySelectorAll(".nav-tab");
  const mainPage = getEl("mainPage");
  const importPage = getEl("importPage");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;

      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (mainPage) mainPage.style.display = page === "mainPage" ? "block" : "none";
      if (importPage) importPage.style.display = page === "importPage" ? "block" : "none";
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  state.records = [];
  initTabs();
  renderApp();
});
