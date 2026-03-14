const STORAGE_KEY = "keiei_soudan_records";

const state = {
  seedRecords: [],
  userRecords: [],
  records: [],
  currentPage: "mainPage",
  selectedRecordId: null
};

function getEl(id) {
  return document.getElementById(id);
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nl2br(str) {
  return escapeHtml(str).replace(/\n/g, "<br>");
}

function safeText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" / ");
  return String(value ?? "").trim();
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), "ja")
  );
}

function normalizeRecord(record = {}, source = "json") {
  return {
    id:
      record.id ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `id_${Date.now()}_${Math.random().toString(16).slice(2)}`),
    createdAt: record.createdAt || new Date().toISOString(),
    source: record.source || source,

    companyName: safeText(record.companyName),
    industry: safeText(record.industry),

    issue: safeText(record.issue),
    notes: safeText(record.notes),

    summary: safeText(record.summary),
    problem: safeText(record.problem),
    approach: safeText(record.approach),
    proposal: safeText(record.proposal),
    result: safeText(record.result),
    learning: safeText(record.learning),
    tags: safeText(record.tags),
    memo: safeText(record.memo)
  };
}

function mergeRecords(seedRecords, userRecords) {
  return [...ensureArray(seedRecords), ...ensureArray(userRecords)].map((r, i) =>
    normalizeRecord(r, r?.source || (i < ensureArray(seedRecords).length ? "json" : "local"))
  );
}

async function loadSeedRecords() {
  try {
    const response = await fetch("src/cases_full.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`cases_full.json load error: ${response.status}`);
    const data = await response.json();
    state.seedRecords = ensureArray(data).map((r) => normalizeRecord(r, "json"));
  } catch (error) {
    console.error("cases_full.json 読込失敗", error);
    state.seedRecords = [];
  }
}

function loadUserRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.userRecords = ensureArray(parsed).map((r) => normalizeRecord(r, "local"));
  } catch (error) {
    console.error("localStorage 読込失敗", error);
    state.userRecords = [];
  }
}

function saveUserRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.userRecords));
}

function syncRecords() {
  state.records = mergeRecords(state.seedRecords, state.userRecords);
}

function getRecordSummary(record) {
  return (
    record.summary ||
    record.issue ||
    record.problem ||
    record.proposal ||
    record.notes ||
    ""
  );
}

function getRecordProblem(record) {
  return record.problem || record.issue || "";
}

function classifyConsultation(record) {
  const text = [
    record.industry,
    record.summary,
    record.issue,
    record.problem,
    record.approach,
    record.proposal,
    record.result,
    record.learning,
    record.tags,
    record.notes,
    record.memo
  ]
    .join(" ")
    .toLowerCase();

  if (/創業|開業|起業|立ち上げ|新規/.test(text)) return "創業・立上げ";
  if (/集客|販促|広告|sns|インスタ|instagram|web|ホームページ|認知|宣伝/.test(text)) return "集客・販促";
  if (/価格|値上げ|単価|粗利|利益率|収益/.test(text)) return "価格・収益改善";
  if (/採用|人材|教育|育成|定着|人手不足|組織/.test(text)) return "人材・組織";
  if (/補助金|資金|融資|借入|資金繰り|財務/.test(text)) return "資金・財務";
  if (/商品|サービス|メニュー|ブランド|企画|差別化/.test(text)) return "商品・サービス改善";
  if (/業務|効率|オペレーション|dx|システム|自動化/.test(text)) return "業務改善・DX";
  return "経営全般";
}

function getUniqueCategories() {
  return uniqueSorted(state.records.map((r) => classifyConsultation(r)));
}

function getUniqueIndustries(category = "") {
  const filtered = category
    ? state.records.filter((r) => classifyConsultation(r) === category)
    : state.records;

  return uniqueSorted(filtered.map((r) => r.industry));
}

function getFilteredRecords(category = "", industry = "") {
  return state.records.filter((record) => {
    if (category && classifyConsultation(record) !== category) return false;
    if (industry && record.industry !== industry) return false;
    return true;
  });
}

function renderRecordList(records) {
  if (!records.length) {
    state.selectedRecordId = null;
    return `<div style="color:#666;">該当事例がありません。</div>`;
  }

  const selectedExists = records.some((r) => r.id === state.selectedRecordId);
  if (!selectedExists) {
    state.selectedRecordId = records[0].id;
  }

  return `
    <div style="display:grid;gap:8px;">
      ${records
        .map((record) => {
          const active = record.id === state.selectedRecordId;
          return `
            <button
              type="button"
              class="record-item"
              data-record-id="${escapeHtml(record.id)}"
              style="
                width:100%;
                text-align:left;
                padding:10px;
                border:1px solid ${active ? "#1d3b64" : "#ccc"};
                background:${active ? "#eef4fb" : "#fff"};
                border-radius:8px;
                cursor:pointer;
              "
            >
              <div style="font-weight:700;">
                ${escapeHtml(record.companyName || "会社名未入力")}
              </div>
              <div style="font-size:12px;color:#555;margin-top:4px;">
                ${escapeHtml(classifyConsultation(record))} / ${escapeHtml(record.industry || "業種未入力")}
              </div>
              <div style="font-size:12px;color:#666;margin-top:4px;">
                ${escapeHtml(getRecordSummary(record).slice(0, 60))}
              </div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderRecordDetail(record) {
  if (!record) {
    return `
      <h3 style="margin-top:0;">事例詳細</h3>
      <p>上の一覧から事例を選択してください。</p>
    `;
  }

  return `
    <h3 style="margin-top:0;">事例詳細</h3>

    <div style="display:grid;gap:10px;font-size:14px;line-height:1.6;">
      <div><strong>会社名：</strong>${escapeHtml(record.companyName || "")}</div>
      <div><strong>業種：</strong>${escapeHtml(record.industry || "")}</div>
      <div><strong>分類：</strong>${escapeHtml(classifyConsultation(record))}</div>

      <div>
        <strong>相談概要</strong><br>
        ${nl2br(getRecordSummary(record))}
      </div>

      <div>
        <strong>課題・悩み</strong><br>
        ${nl2br(getRecordProblem(record))}
      </div>

      <div>
        <strong>支援の切り口</strong><br>
        ${nl2br(record.approach || "")}
      </div>

      <div>
        <strong>提案内容</strong><br>
        ${nl2br(record.proposal || "")}
      </div>

      <div>
        <strong>成果</strong><br>
        ${nl2br(record.result || "")}
      </div>

      <div>
        <strong>学び・ポイント</strong><br>
        ${nl2br(record.learning || "")}
      </div>

      <div>
        <strong>関連キーワード</strong><br>
        ${nl2br(record.tags || "")}
      </div>

      ${
        record.notes || record.memo
          ? `
            <div>
              <strong>メモ</strong><br>
              ${nl2br(record.notes || record.memo || "")}
            </div>
          `
          : ""
      }
    </div>
  `;
}

function renderMainPage() {
  const mainPage = getEl("mainPage");
  if (!mainPage) return;

  const categories = getUniqueCategories();
  const industries = getUniqueIndustries();
  const filteredRecords = getFilteredRecords();
  const selectedRecord = state.records.find((r) => r.id === state.selectedRecordId) || filteredRecords[0] || null;

  if (!state.selectedRecordId && selectedRecord) {
    state.selectedRecordId = selectedRecord.id;
  }

  mainPage.innerHTML = `
    <section style="padding:16px;">
      <div style="display:grid;grid-template-columns:minmax(0, 1.4fr) minmax(320px, 0.9fr);gap:20px;align-items:start;">
        
        <div style="border:1px solid #ccc;border-radius:10px;padding:16px;background:#fff;">
          <h2 style="margin-top:0;">相談入力</h2>

          <div style="display:grid;gap:12px;">
            <div>
              <label>会社名</label>
              <input id="companyName" type="text" style="width:100%;padding:8px;box-sizing:border-box;">
            </div>

            <div>
              <label>業種</label>
              <input id="industry" type="text" style="width:100%;padding:8px;box-sizing:border-box;">
            </div>

            <div>
              <label>相談内容</label>
              <textarea id="issue" style="width:100%;min-height:120px;padding:8px;box-sizing:border-box;"></textarea>
            </div>

            <div>
              <label>メモ</label>
              <textarea id="notes" style="width:100%;min-height:120px;padding:8px;box-sizing:border-box;"></textarea>
            </div>

            <div>
              <button id="saveRecordBtn" type="button" style="padding:10px 16px;">保存</button>
            </div>
          </div>
        </div>

        <div style="display:grid;gap:14px;">
          <div style="border:1px solid #ccc;border-radius:10px;padding:14px;background:#fff;">
            <h3 style="margin:0 0 12px 0;">蓄積データ抽出</h3>

            <div style="display:grid;gap:12px;">
              <div>
                <label for="filterCategory"><strong>分類</strong></label>
                <select id="filterCategory" style="width:100%;padding:8px;margin-top:6px;box-sizing:border-box;">
                  <option value="">すべて</option>
                  ${categories.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
                </select>
              </div>

              <div>
                <label for="filterIndustry"><strong>業種</strong></label>
                <select id="filterIndustry" style="width:100%;padding:8px;margin-top:6px;box-sizing:border-box;">
                  <option value="">すべて</option>
                  ${industries.map((i) => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join("")}
                </select>
              </div>

              <div>
                <strong>該当事例一覧</strong>
                <div id="recordListArea" style="margin-top:8px;">
                  ${renderRecordList(filteredRecords)}
                </div>
              </div>
            </div>
          </div>

          <div id="recordDetailArea" style="border:1px solid #ccc;border-radius:10px;padding:14px;background:#fff;">
            ${renderRecordDetail(selectedRecord)}
          </div>
        </div>
      </div>
    </section>
  `;

  const saveBtn = getEl("saveRecordBtn");
  if (saveBtn) {
    saveBtn.onclick = handleSaveRecord;
  }

  const categorySelect = getEl("filterCategory");
  const industrySelect = getEl("filterIndustry");

  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
      const newIndustries = getUniqueIndustries(categorySelect.value || "");
      const currentIndustry = industrySelect?.value || "";

      if (industrySelect) {
        industrySelect.innerHTML = `
          <option value="">すべて</option>
          ${newIndustries.map((i) => `<option value="${escapeHtml(i)}">${escapeHtml(i)}</option>`).join("")}
        `;

        if (currentIndustry && newIndustries.includes(currentIndustry)) {
          industrySelect.value = currentIndustry;
        } else {
          industrySelect.value = "";
        }
      }

      refreshFilteredPanel();
    });
  }

  if (industrySelect) {
    industrySelect.addEventListener("change", () => {
      refreshFilteredPanel();
    });
  }

  bindRecordListEvents();
}

function refreshFilteredPanel() {
  const category = getEl("filterCategory")?.value || "";
  const industry = getEl("filterIndustry")?.value || "";
  const records = getFilteredRecords(category, industry);

  const listArea = getEl("recordListArea");
  if (listArea) {
    listArea.innerHTML = renderRecordList(records);
  }

  const selectedRecord =
    state.records.find((r) => r.id === state.selectedRecordId && records.some((x) => x.id === r.id)) ||
    records[0] ||
    null;

  state.selectedRecordId = selectedRecord ? selectedRecord.id : null;

  const detailArea = getEl("recordDetailArea");
  if (detailArea) {
    detailArea.innerHTML = renderRecordDetail(selectedRecord);
  }

  bindRecordListEvents();
}

function bindRecordListEvents() {
  document.querySelectorAll(".record-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedRecordId = button.dataset.recordId || null;
      refreshFilteredPanel();
    });
  });
}

function renderImportPage() {
  const importPage = getEl("importPage");
  if (!importPage) return;

  importPage.innerHTML = `
    <section style="padding:16px;">
      <div style="border:1px solid #ccc;border-radius:10px;padding:16px;background:#fff;">
        <h2 style="margin-top:0;">蓄積ページ</h2>
        <p>ここは今後、PDF / Word / 音声 / 画像の取り込みに対応します。</p>
      </div>
    </section>
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

  const record = normalizeRecord(
    {
      companyName,
      industry,
      issue,
      notes,
      summary: issue,
      problem: issue,
      memo: notes,
      source: "main"
    },
    "main"
  );

  state.userRecords.push(record);
  saveUserRecords();
  syncRecords();
  state.selectedRecordId = record.id;

  renderMainPage();
}

function initTabs() {
  const tabButtons = document.querySelectorAll(".nav-tab");
  const mainPage = getEl("mainPage");
  const importPage = getEl("importPage");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;

      tabButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      if (mainPage) mainPage.style.display = page === "mainPage" ? "block" : "none";
      if (importPage) importPage.style.display = page === "importPage" ? "block" : "none";

      state.currentPage = page;

      if (page === "mainPage") renderMainPage();
      if (page === "importPage") renderImportPage();
    });
  });

  if (mainPage) mainPage.style.display = "block";
  if (importPage) importPage.style.display = "none";
}

window.addEventListener("DOMContentLoaded", async () => {
  loadUserRecords();
  await loadSeedRecords();
  syncRecords();
  initTabs();
  renderMainPage();
  renderImportPage();
});
