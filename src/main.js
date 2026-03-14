const STORAGE_KEY = "keiei_soudan_records";

const state = {
  seedRecords: [],
  userRecords: [],
  records: [],
  currentPage: "mainPage",
  selectedRecordId: null,
  filterCategory: "",
  filterIndustry: ""
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

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[、。,.!！?？/\\()\[\]「」『』【】・:：;；]/g, " ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
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
  return record.summary || record.issue || record.problem || record.proposal || record.notes || "";
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

function extractKeywords(record) {
  const text = [
    record.companyName,
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
  ].join(" ");

  const words = tokenize(text);
  const stopWords = new Set([
    "する", "して", "いる", "ある", "こと", "ため", "よう", "です", "ます",
    "について", "など", "また", "その", "この", "相談", "内容", "提案", "課題",
    "検討", "実施", "必要", "改善", "強化", "向上"
  ]);

  const counts = {};
  for (const w of words) {
    if (w.length <= 1) continue;
    if (stopWords.has(w)) continue;
    counts[w] = (counts[w] || 0) + 1;
  }

  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word]) => word);
}

function similarityScore(a, b) {
  let score = 0;
  if (a.industry && b.industry && a.industry === b.industry) score += 3;
  if (classifyConsultation(a) === classifyConsultation(b)) score += 2;

  const aWords = new Set(extractKeywords(a));
  const bWords = new Set(extractKeywords(b));
  for (const w of aWords) {
    if (bWords.has(w)) score += 1;
  }

  return score;
}

function findSimilarRecords(target, records, limit = 5) {
  return ensureArray(records)
    .filter((r) => r.id !== target.id)
    .map((r) => ({ ...r, _score: similarityScore(target, r) }))
    .filter((r) => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

function buildProposal(record) {
  const text = [
    record.industry,
    record.summary,
    record.issue,
    record.problem,
    record.approach,
    record.proposal,
    record.tags,
    record.notes
  ]
    .join(" ")
    .toLowerCase();

  const suggestions = [];

  if (/売上|集客|販促|広告|認知|web|sns|インスタ|instagram/.test(text)) {
    suggestions.push("顧客像を絞り、訴求軸を明確化する");
    suggestions.push("既存客の再来店・再購入導線を先に整える");
    suggestions.push("SNS・店頭・紹介の役割分担を整理する");
  }

  if (/価格|値上げ|単価|粗利|利益/.test(text)) {
    suggestions.push("値上げではなく価値の見せ方変更も含めて検討する");
    suggestions.push("商品別の粗利と売れ筋を分けて見る");
    suggestions.push("高粗利商品への誘導導線を作る");
  }

  if (/商品|サービス|メニュー|差別化|ブランド/.test(text)) {
    suggestions.push("誰向けかを絞り、選ばれる理由を言語化する");
    suggestions.push("用途別・価格別に商品構成を整理する");
    suggestions.push("競合比較ではなく独自背景や強みを前面化する");
  }

  if (/採用|人材|教育|定着/.test(text)) {
    suggestions.push("仕事内容の見せ方と採用導線を見直す");
    suggestions.push("定着理由と離職理由を分けて整理する");
    suggestions.push("教育負担の少ない受入導線を作る");
  }

  if (/補助金|資金|融資|資金繰り/.test(text)) {
    suggestions.push("資金使途と回収計画を先に明確化する");
    suggestions.push("補助金ありきではなく事業計画を先に整理する");
    suggestions.push("投資優先順位をつけて必要額を絞る");
  }

  if (/開業|創業|起業/.test(text)) {
    suggestions.push("顧客像・提供価値・販売導線の3点を固める");
    suggestions.push("小さく検証できる商品から始める");
    suggestions.push("固定費を抑えた立ち上げ方を優先する");
  }

  if (suggestions.length === 0) {
    suggestions.push("課題を顧客・商品・導線・収益の4視点で分解する");
    suggestions.push("優先順位の高い打ち手を1つに絞る");
    suggestions.push("短期で試せる施策から着手する");
  }

  return suggestions.slice(0, 3);
}

function currentDraft() {
  return normalizeRecord({
    companyName: getEl("companyName")?.value?.trim() || "",
    industry: getEl("industry")?.value?.trim() || "",
    issue: getEl("issue")?.value?.trim() || "",
    notes: getEl("notes")?.value?.trim() || "",
    summary: getEl("issue")?.value?.trim() || "",
    problem: getEl("issue")?.value?.trim() || "",
    memo: getEl("notes")?.value?.trim() || ""
  }, "draft");
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
  if (!category && !industry) return [];
  return state.records.filter((record) => {
    if (category && classifyConsultation(record) !== category) return false;
    if (industry && record.industry !== industry) return false;
    return true;
  });
}

function renderAIProposal() {
  const draft = currentDraft();
  const hasInput =
    draft.companyName || draft.industry || draft.issue || draft.notes;

  if (!hasInput) {
    return `
      <div style="border:1px solid #ccc;border-radius:10px;padding:14px;background:#fff;">
        <h3 style="margin:0 0 10px 0;">AI提案</h3>
        <p style="margin:0;">入力すると、分類・キーワード・打ち手候補・類似事例を表示します。</p>
      </div>
    `;
  }

  const category = classifyConsultation(draft);
  const keywords = extractKeywords(draft);
  const proposals = buildProposal(draft);
  const similars = findSimilarRecords(draft, state.records, 3);

  return `
    <div style="border:1px solid #ccc;border-radius:10px;padding:14px;background:#fff;">
      <h3 style="margin:0 0 10px 0;">AI提案</h3>

      <div style="display:grid;gap:10px;font-size:14px;line-height:1.6;">
        <div><strong>分類：</strong>${escapeHtml(category)}</div>
        <div><strong>キーワード：</strong>${keywords.length ? keywords.map(escapeHtml).join(" / ") : "なし"}</div>

        <div>
          <strong>打ち手候補</strong>
          <ol style="margin:6px 0 0 20px;padding:0;">
            ${proposals.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}
          </ol>
        </div>

        <div>
          <strong>参考になる類似事例</strong>
          ${
            similars.length === 0
              ? `<div style="margin-top:6px;">該当なし</div>`
              : `
                <div style="margin-top:6px;display:grid;gap:6px;">
                  ${similars
                    .map(
                      (s) => `
                        <div style="border:1px solid #ddd;border-radius:8px;padding:8px;background:#fafafa;">
                          <div style="font-weight:700;">${escapeHtml(s.companyName || "会社名未入力")}</div>
                          <div style="font-size:12px;color:#555;">${escapeHtml(classifyConsultation(s))} / ${escapeHtml(s.industry || "業種未入力")}</div>
                        </div>
                      `
                    )
                    .join("")}
                </div>
              `
          }
        </div>
      </div>
    </div>
  `;
}

function renderRecordList(records) {
  if (!state.filterCategory && !state.filterIndustry) {
    state.selectedRecordId = null;
    return `<div style="color:#666;">分類または業種を選択してください。</div>`;
  }

  if (!records.length) {
    state.selectedRecordId = null;
    return `<div style="color:#666;">該当事例がありません。</div>`;
  }

  const selectedExists = records.some((r) => r.id === state.selectedRecordId);
  if (!selectedExists) {
    state.selectedRecordId = records[0].id;
  }

  return `
    <div style="display:grid;gap:8px;max-height:520px;overflow:auto;">
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
              <div style="font-weight:700;">${escapeHtml(record.companyName || "会社名未入力")}</div>
              <div style="font-size:12px;color:#555;margin-top:4px;">
                ${escapeHtml(classifyConsultation(record))} / ${escapeHtml(record.industry || "業種未入力")}
              </div>
              <div style="font-size:12px;color:#666;margin-top:4px;">
                ${escapeHtml(getRecordSummary(record).slice(0, 70))}
              </div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderRecordDetail(record) {
  if (!state.filterCategory && !state.filterIndustry) {
    return `
      <h3 style="margin-top:0;">事例詳細</h3>
      <p>分類または業種を選択してください。</p>
    `;
  }

  if (!record) {
    return `
      <h3 style="margin-top:0;">事例詳細</h3>
      <p>該当事例がありません。</p>
    `;
  }

  return `
    <h3 style="margin-top:0;">事例詳細</h3>

    <div style="display:grid;gap:10px;font-size:14px;line-height:1.6;">
      <div><strong>会社名：</strong>${escapeHtml(record.companyName || "")}</div>
      <div><strong>業種：</strong>${escapeHtml(record.industry || "")}</div>
      <div><strong>分類：</strong>${escapeHtml(classifyConsultation(record))}</div>

      <div><strong>相談概要</strong><br>${nl2br(getRecordSummary(record))}</div>
      <div><strong>課題・悩み</strong><br>${nl2br(getRecordProblem(record))}</div>
      <div><strong>支援の切り口</strong><br>${nl2br(record.approach || "")}</div>
      <div><strong>提案内容</strong><br>${nl2br(record.proposal || "")}</div>
      <div><strong>成果</strong><br>${nl2br(record.result || "")}</div>
      <div><strong>学び・ポイント</strong><br>${nl2br(record.learning || "")}</div>
      <div><strong>関連キーワード</strong><br>${nl2br(record.tags || "")}</div>
      ${(record.notes || record.memo) ? `<div><strong>メモ</strong><br>${nl2br(record.notes || record.memo || "")}</div>` : ""}
    </div>
  `;
}

function renderMainPage() {
  const mainPage = getEl("mainPage");
  if (!mainPage) return;

  const categories = getUniqueCategories();
  const industries = getUniqueIndustries(state.filterCategory);
  const filteredRecords = getFilteredRecords(state.filterCategory, state.filterIndustry);
  const selectedRecord =
    state.records.find((r) => r.id === state.selectedRecordId && filteredRecords.some((x) => x.id === r.id)) ||
    filteredRecords[0] ||
    null;

  if (selectedRecord) {
    state.selectedRecordId = selectedRecord.id;
  }

  mainPage.innerHTML = `
    <section style="padding:16px;">
      <div style="display:grid;grid-template-columns:minmax(0, 1.5fr) minmax(340px, 0.95fr);gap:20px;align-items:start;">
        
        <div style="display:grid;gap:14px;">
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

          <div id="aiProposalArea">
            ${renderAIProposal()}
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
                  ${categories.map((c) => `<option value="${escapeHtml(c)}" ${state.filterCategory === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
                </select>
              </div>

              <div>
                <label for="filterIndustry"><strong>業種</strong></label>
                <select id="filterIndustry" style="width:100%;padding:8px;margin-top:6px;box-sizing:border-box;">
                  <option value="">すべて</option>
                  ${industries.map((i) => `<option value="${escapeHtml(i)}" ${state.filterIndustry === i ? "selected" : ""}>${escapeHtml(i)}</option>`).join("")}
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

  ["companyName", "industry", "issue", "notes"].forEach((id) => {
    const el = getEl(id);
    if (el) {
      el.addEventListener("input", () => {
        const aiArea = getEl("aiProposalArea");
        if (aiArea) aiArea.innerHTML = renderAIProposal();
      });
    }
  });

  const categorySelect = getEl("filterCategory");
  const industrySelect = getEl("filterIndustry");

  if (categorySelect) {
    categorySelect.addEventListener("change", () => {
      state.filterCategory = categorySelect.value || "";
      const newIndustries = getUniqueIndustries(state.filterCategory);

      if (industrySelect) {
        if (!newIndustries.includes(state.filterIndustry)) {
          state.filterIndustry = "";
        }

        industrySelect.innerHTML = `
          <option value="">すべて</option>
          ${newIndustries.map((i) => `<option value="${escapeHtml(i)}" ${state.filterIndustry === i ? "selected" : ""}>${escapeHtml(i)}</option>`).join("")}
        `;
      }

      state.selectedRecordId = null;
      refreshFilteredPanel();
    });
  }

  if (industrySelect) {
    industrySelect.addEventListener("change", () => {
      state.filterIndustry = industrySelect.value || "";
      state.selectedRecordId = null;
      refreshFilteredPanel();
    });
  }

  bindRecordListEvents();
}

function refreshFilteredPanel() {
  const records = getFilteredRecords(state.filterCategory, state.filterIndustry);

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

  getEl("companyName").value = "";
  getEl("industry").value = "";
  getEl("issue").value = "";
  getEl("notes").value = "";

  const aiArea = getEl("aiProposalArea");
  if (aiArea) aiArea.innerHTML = renderAIProposal();

  if (!state.filterCategory && !state.filterIndustry) {
    state.filterCategory = classifyConsultation(record);
    state.filterIndustry = record.industry || "";
  }

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
