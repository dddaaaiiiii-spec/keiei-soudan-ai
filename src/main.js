const STORAGE_KEY = "keiei_soudan_records";

const state = {
  seedRecords: [],
  userRecords: [],
  records: [],
  selectedRecordId: null
};

function getEl(id) {
  return document.getElementById(id);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function nl2br(value) {
  return escapeHtml(value).replace(/\n/g, "<br>");
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), "ja")
  );
}

function normalizeTextField(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean).join(" / ");
  }
  return String(value ?? "").trim();
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
    companyName: normalizeTextField(record.companyName),
    industry: normalizeTextField(record.industry),
    summary: normalizeTextField(record.summary),
    problem: normalizeTextField(record.problem),
    approach: normalizeTextField(record.approach),
    proposal: normalizeTextField(record.proposal),
    result: normalizeTextField(record.result),
    learning: normalizeTextField(record.learning),
    tags: normalizeTextField(record.tags),
    memo: normalizeTextField(record.memo)
  };
}

function mergeRecords(seedRecords, userRecords) {
  const map = new Map();

  [...ensureArray(seedRecords), ...ensureArray(userRecords)].forEach((raw, index) => {
    const record = normalizeRecord(raw, raw?.source || (index < seedRecords.length ? "json" : "local"));
    map.set(record.id, record);
  });

  return [...map.values()];
}

async function loadSeedRecords() {
  try {
    const response = await fetch("src/cases_full.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`cases_full.json の読込失敗: ${response.status}`);
    }
    const data = await response.json();
    state.seedRecords = ensureArray(data).map((r) => normalizeRecord(r, "json"));
  } catch (error) {
    console.error(error);
    state.seedRecords = [];
  }
}

function loadUserRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.userRecords = ensureArray(parsed).map((r) => normalizeRecord(r, r?.source || "local"));
  } catch (error) {
    console.error(error);
    state.userRecords = [];
  }
}

function syncRecords() {
  state.records = mergeRecords(state.seedRecords, state.userRecords);
}

function saveUserRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.userRecords));
  syncRecords();
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[、。,.!！?？/\\()\[\]「」『』【】〖〗・:：;；]/g, " ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractKeywords(record) {
  const text = [
    record.companyName,
    record.industry,
    record.summary,
    record.problem,
    record.approach,
    record.proposal,
    record.result,
    record.learning,
    record.tags,
    record.memo
  ].join(" ");

  const words = tokenize(text);
  const stopWords = new Set([
    "する", "して", "いる", "ある", "こと", "ため", "よう", "そう", "です", "ます",
    "である", "について", "など", "また", "その", "この", "相談", "内容", "会社", "業種",
    "提案", "課題", "対応", "検討", "実施", "必要", "改善", "強化", "向上"
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

function classifyConsultation(record) {
  const text = [
    record.industry,
    record.summary,
    record.problem,
    record.approach,
    record.proposal,
    record.tags,
    record.memo
  ]
    .join(" ")
    .toLowerCase();

  if (/新規|開業|創業|起業|立ち上げ/.test(text)) return "創業・立上げ";
  if (/売上|集客|販促|広告|sns|インスタ|instagram|web|ホームページ|lp|認知/.test(text)) return "集客・販促";
  if (/価格|値上げ|単価|粗利|利益率/.test(text)) return "価格・収益改善";
  if (/採用|人材|教育|育成|定着|人手不足/.test(text)) return "人材・組織";
  if (/補助金|資金|融資|借入|資金繰り/.test(text)) return "資金・財務";
  if (/商品|サービス|メニュー|ブランド|企画|差別化/.test(text)) return "商品・サービス改善";
  if (/業務|効率|オペレーション|dx|システム|自動化/.test(text)) return "業務改善・DX";
  return "経営全般";
}

function buildProposal(record) {
  const text = [
    record.industry,
    record.summary,
    record.problem,
    record.approach,
    record.proposal,
    record.tags,
    record.memo
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

function similarityScore(a, b) {
  const aWords = new Set(extractKeywords(a));
  const bWords = new Set(extractKeywords(b));

  let score = 0;

  if (a.industry && b.industry && a.industry === b.industry) score += 3;
  if (classifyConsultation(a) === classifyConsultation(b)) score += 2;

  for (const w of aWords) {
    if (bWords.has(w)) score += 1;
  }

  return score;
}

function findSimilarRecords(target, records) {
  return ensureArray(records)
    .filter((r) => r.id !== target.id)
    .map((r) => ({ ...r, _score: similarityScore(target, r) }))
    .filter((r) => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, 5);
}

function currentDraft() {
  return {
    id: "draft",
    companyName: getEl("companyName")?.value?.trim() || "",
    industry: getEl("industry")?.value?.trim() || "",
    summary: getEl("summary")?.value?.trim() || "",
    problem: getEl("problem")?.value?.trim() || "",
    approach: getEl("approach")?.value?.trim() || "",
    proposal: getEl("proposal")?.value?.trim() || "",
    result: getEl("result")?.value?.trim() || "",
    learning: getEl("learning")?.value?.trim() || "",
    tags: getEl("tags")?.value?.trim() || "",
    memo: ""
  };
}

function renderAnalysis() {
  const box = getEl("analysisArea");
  if (!box) return;

  const draft = currentDraft();
  const hasInput = Object.entries(draft).some(([key, value]) => key !== "id" && value);

  if (!hasInput) {
    box.innerHTML = `
      <h3>AI提案</h3>
      <p>入力すると、分類・キーワード・打ち手候補・類似事例を表示します。</p>
    `;
    return;
  }

  const category = classifyConsultation(draft);
  const keywords = extractKeywords(draft);
  const proposals = buildProposal(draft);
  const similars = findSimilarRecords(draft, state.records);

  box.innerHTML = `
    <h3>AI提案</h3>

    <div><strong>分類：</strong>${escapeHtml(category)}</div>
    <div style="margin-top:8px;"><strong>キーワード：</strong>${keywords.length ? keywords.map(escapeHtml).join(" / ") : "なし"}</div>

    <div style="margin-top:14px;">
      <strong>打ち手候補</strong>
      <ol style="margin-top:6px; padding-left: 20px;">
        ${proposals.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}
      </ol>
    </div>

    <div style="margin-top:14px;">
      <strong>類似事例</strong>
      ${
        similars.length === 0
          ? `<p style="margin-top:6px;">まだありません。</p>`
          : `
            <div style="margin-top:8px; display:grid; gap:8px;">
              ${similars
                .map(
                  (s) => `
                    <div style="border:1px solid #ddd; border-radius:10px; padding:10px;">
                      <div><strong>${escapeHtml(s.companyName || "会社名未入力")}</strong></div>
                      <div style="font-size:13px; margin-top:4px;">分類：${escapeHtml(classifyConsultation(s))}</div>
                      <div style="font-size:13px; margin-top:4px;">相談概要：${escapeHtml((s.summary || "").slice(0, 80))}</div>
                    </div>
                  `
                )
                .join("")}
            </div>
          `
      }
    </div>
  `;
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

function getFilteredRecords() {
  const category = getEl("filterCategory")?.value || "";
  const industry = getEl("filterIndustry")?.value || "";

  return state.records.filter((r) => {
    if (category && classifyConsultation(r) !== category) return false;
    if (industry && r.industry !== industry) return false;
    return true;
  });
}

function updateIndustryOptions() {
  const industrySelect = getEl("filterIndustry");
  if (!industrySelect) return;

  const selectedCategory = getEl("filterCategory")?.value || "";
  const industries = getUniqueIndustries(selectedCategory);
  const currentValue = industrySelect.value || "";

  industrySelect.innerHTML = `
    <option value="">すべて</option>
    ${industries.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}
  `;

  if (currentValue && industries.includes(currentValue)) {
    industrySelect.value = currentValue;
  } else {
    industrySelect.value = "";
  }
}

function renderRecordSelectors() {
  const box = getEl("recordSelectorsArea");
  if (!box) return;

  const categories = getUniqueCategories();
  const industries = getUniqueIndustries();

  box.innerHTML = `
    <h3>蓄積データ抽出</h3>

    <div style="display:grid; gap:12px;">
      <div>
        <label for="filterCategory"><strong>分類</strong></label><br>
        <select id="filterCategory" style="width:100%; margin-top:6px;">
          <option value="">すべて</option>
          ${categories.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}
        </select>
      </div>

      <div>
        <label for="filterIndustry"><strong>業種</strong></label><br>
        <select id="filterIndustry" style="width:100%; margin-top:6px;">
          <option value="">すべて</option>
          ${industries.map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}
        </select>
      </div>

      <div>
        <strong>該当事例一覧</strong>
        <div id="recordListArea" style="margin-top:8px;"></div>
      </div>
    </div>
  `;

  getEl("filterCategory")?.addEventListener("change", () => {
    updateIndustryOptions();
    renderFilteredRecordList();
  });

  getEl("filterIndustry")?.addEventListener("change", () => {
    renderFilteredRecordList();
  });

  renderFilteredRecordList();
}

function renderFilteredRecordList() {
  const listBox = getEl("recordListArea");
  if (!listBox) return;

  const filtered = getFilteredRecords();

  if (filtered.length === 0) {
    state.selectedRecordId = null;
    listBox.innerHTML = `<div style="color:#666;">該当事例がありません。</div>`;
    renderRecordDetail();
    return;
  }

  const exists = filtered.some((r) => r.id === state.selectedRecordId);
  if (!exists) {
    state.selectedRecordId = filtered[0].id;
  }

  listBox.innerHTML = `
    <div style="display:grid; gap:8px;">
      ${filtered
        .map((record) => {
          const active = record.id === state.selectedRecordId;
          return `
            <button
              type="button"
              class="record-list-item${active ? " active" : ""}"
              data-record-id="${escapeHtml(record.id)}"
              style="
                text-align:left;
                width:100%;
                border:1px solid ${active ? "#333" : "#ddd"};
                background:${active ? "#f3f3f3" : "#fff"};
                border-radius:10px;
                padding:10px;
                cursor:pointer;
              "
            >
              <div style="font-weight:700;">${escapeHtml(record.companyName || "会社名未入力")}</div>
              <div style="font-size:13px; margin-top:4px;">
                ${escapeHtml(classifyConsultation(record))} / ${escapeHtml(record.industry || "業種未入力")}
              </div>
              <div style="font-size:13px; color:#555; margin-top:4px;">
                ${escapeHtml((record.summary || "").slice(0, 60))}
              </div>
            </button>
          `;
        })
        .join("")}
    </div>
  `;

  listBox.querySelectorAll(".record-list-item").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedRecordId = button.dataset.recordId || null;
      renderFilteredRecordList();
      renderRecordDetail();
    });
  });

  renderRecordDetail();
}

function renderRecordDetail() {
  const box = getEl("recordDetailArea");
  if (!box) return;

  const record = state.records.find((r) => r.id === state.selectedRecordId);

  if (!record) {
    box.innerHTML = `
      <h3>事例詳細</h3>
      <p>左の一覧から事例を選択してください。</p>
    `;
    return;
  }

  const similars = findSimilarRecords(record, state.records);

  box.innerHTML = `
    <h3>事例詳細</h3>

    <div><strong>会社名：</strong>${escapeHtml(record.companyName || "")}</div>
    <div style="margin-top:6px;"><strong>業種：</strong>${escapeHtml(record.industry || "")}</div>
    <div style="margin-top:6px;"><strong>分類：</strong>${escapeHtml(classifyConsultation(record))}</div>

    <div style="margin-top:14px;">
      <strong>相談概要</strong>
      <div style="margin-top:6px;">${nl2br(record.summary)}</div>
    </div>

    <div style="margin-top:14px;">
      <strong>課題・悩み</strong>
      <div style="margin-top:6px;">${nl2br(record.problem)}</div>
    </div>

    <div style="margin-top:14px;">
      <strong>支援の切り口</strong>
      <div style="margin-top:6px;">${nl2br(record.approach)}</div>
    </div>

    <div style="margin-top:14px;">
      <strong>提案内容</strong>
      <div style="margin-top:6px;">${nl2br(record.proposal)}</div>
    </div>

    <div style="margin-top:14px;">
      <strong>成果</strong>
      <div style="margin-top:6px;">${nl2br(record.result)}</div>
    </div>

    <div style="margin-top:14px;">
      <strong>学び・ポイント</strong>
      <div style="margin-top:6px;">${nl2br(record.learning)}</div>
    </div>

    <div style="margin-top:14px;">
      <strong>関連キーワード</strong>
      <div style="margin-top:6px;">${nl2br(record.tags)}</div>
    </div>

    ${
      record.memo
        ? `
          <div style="margin-top:14px;">
            <strong>メモ</strong>
            <div style="margin-top:6px;">${nl2br(record.memo)}</div>
          </div>
        `
        : ""
    }

    <div style="margin-top:14px;">
      <strong>類似事例</strong>
      ${
        similars.length === 0
          ? `<div style="margin-top:6px;">ありません。</div>`
          : `
            <div style="margin-top:8px; display:grid; gap:8px;">
              ${similars
                .map(
                  (s) => `
                    <div style="border:1px solid #ddd; border-radius:10px; padding:10px;">
                      <div style="font-weight:700;">${escapeHtml(s.companyName || "会社名未入力")}</div>
                      <div style="font-size:13px; margin-top:4px;">${escapeHtml((s.summary || "").slice(0, 80))}</div>
                    </div>
                  `
                )
                .join("")}
            </div>
          `
      }
    </div>
  `;
}

function renderMainPage() {
  const page = getEl("mainPage");
  if (!page) return;

  page.innerHTML = `
    <h2>相談入力</h2>

    <div style="display:grid; gap:12px;">
      <div>
        <label for="companyName">会社名</label>
        <input id="companyName" type="text">
      </div>

      <div>
        <label for="industry">業種</label>
        <input id="industry" type="text">
      </div>

      <div>
        <label for="summary">相談概要</label>
        <textarea id="summary" rows="3"></textarea>
      </div>

      <div>
        <label for="problem">課題・悩み</label>
        <textarea id="problem" rows="3"></textarea>
      </div>

      <div>
        <label for="approach">支援の切り口</label>
        <textarea id="approach" rows="3"></textarea>
      </div>

      <div>
        <label for="proposal">提案内容</label>
        <textarea id="proposal" rows="3"></textarea>
      </div>

      <div>
        <label for="result">成果</label>
        <textarea id="result" rows="3"></textarea>
      </div>

      <div>
        <label for="learning">学び・ポイント</label>
        <textarea id="learning" rows="3"></textarea>
      </div>

      <div>
        <label for="tags">関連キーワード</label>
        <textarea id="tags" rows="2"></textarea>
      </div>

      <div>
        <button id="saveBtn" type="button">相談データとして保存</button>
      </div>
    </div>
  `;

  [
    "companyName",
    "industry",
    "summary",
    "problem",
    "approach",
    "proposal",
    "result",
    "learning",
    "tags"
  ].forEach((id) => {
    const el = getEl(id);
    if (el) el.addEventListener("input", renderAnalysis);
  });

  getEl("saveBtn")?.addEventListener("click", saveMainRecord);

  renderAnalysis();
  renderRecordSelectors();
  renderRecordDetail();
}

function renderImportPage() {
  const page = getEl("importPage");
  if (!page) return;

  page.innerHTML = `
    <h2>蓄積ページ</h2>
    <p>独自に調べた内容や過去相談事例を、テキストで蓄積します。</p>

    <div style="display:grid; gap:12px;">
      <div>
        <label for="importCompanyName">会社名</label>
        <input id="importCompanyName" type="text">
      </div>

      <div>
        <label for="importIndustry">業種</label>
        <input id="importIndustry" type="text">
      </div>

      <div>
        <label for="importSummary">相談概要</label>
        <textarea id="importSummary" rows="3"></textarea>
      </div>

      <div>
        <label for="importProblem">課題・悩み</label>
        <textarea id="importProblem" rows="3"></textarea>
      </div>

      <div>
        <label for="importApproach">支援の切り口</label>
        <textarea id="importApproach" rows="3"></textarea>
      </div>

      <div>
        <label for="importProposal">提案内容</label>
        <textarea id="importProposal" rows="3"></textarea>
      </div>

      <div>
        <label for="importResult">成果</label>
        <textarea id="importResult" rows="3"></textarea>
      </div>

      <div>
        <label for="importLearning">学び・ポイント</label>
        <textarea id="importLearning" rows="3"></textarea>
      </div>

      <div>
        <label for="importTags">関連キーワード</label>
        <textarea id="importTags" rows="2"></textarea>
      </div>

      <div>
        <label for="importMemo">メモ</label>
        <textarea id="importMemo" rows="3"></textarea>
      </div>

      <div>
        <button id="importSaveBtn" type="button">蓄積事例として保存</button>
      </div>

      <div id="importStatus" style="color:#2d6a4f;"></div>
    </div>
  `;

  getEl("importSaveBtn")?.addEventListener("click", saveImportedRecord);
}

function saveMainRecord() {
  const record = normalizeRecord(
    {
      source: "main",
      companyName: getEl("companyName")?.value?.trim() || "",
      industry: getEl("industry")?.value?.trim() || "",
      summary: getEl("summary")?.value?.trim() || "",
      problem: getEl("problem")?.value?.trim() || "",
      approach: getEl("approach")?.value?.trim() || "",
      proposal: getEl("proposal")?.value?.trim() || "",
      result: getEl("result")?.value?.trim() || "",
      learning: getEl("learning")?.value?.trim() || "",
      tags: getEl("tags")?.value?.trim() || "",
      memo: ""
    },
    "main"
  );

  if (!record.companyName && !record.summary) {
    alert("会社名または相談概要を入力してください");
    return;
  }

  state.userRecords.push(record);
  saveUserRecords();
  state.selectedRecordId = record.id;

  renderMainPage();
}

function saveImportedRecord() {
  const record = normalizeRecord(
    {
      source: "import",
      companyName: getEl("importCompanyName")?.value?.trim() || "",
      industry: getEl("importIndustry")?.value?.trim() || "",
      summary: getEl("importSummary")?.value?.trim() || "",
      problem: getEl("importProblem")?.value?.trim() || "",
      approach: getEl("importApproach")?.value?.trim() || "",
      proposal: getEl("importProposal")?.value?.trim() || "",
      result: getEl("importResult")?.value?.trim() || "",
      learning: getEl("importLearning")?.value?.trim() || "",
      tags: getEl("importTags")?.value?.trim() || "",
      memo: getEl("importMemo")?.value?.trim() || ""
    },
    "import"
  );

  if (!record.companyName && !record.summary) {
    alert("会社名または相談概要を入力してください");
    return;
  }

  state.userRecords.push(record);
  saveUserRecords();

  [
    "importCompanyName",
    "importIndustry",
    "importSummary",
    "importProblem",
    "importApproach",
    "importProposal",
    "importResult",
    "importLearning",
    "importTags",
    "importMemo"
  ].forEach((id) => {
    const el = getEl(id);
    if (el) el.value = "";
  });

  const status = getEl("importStatus");
  if (status) {
    status.textContent = "蓄積事例として保存しました";
  }
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

      if (page === "mainPage") renderMainPage();
      if (page === "importPage") renderImportPage();
    });
  });
}

window.addEventListener("DOMContentLoaded", async () => {
  loadUserRecords();
  await loadSeedRecords();
  syncRecords();
  initTabs();
  renderMainPage();
  renderImportPage();
});
