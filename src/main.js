fetch("src/cases_full.json")
  .then(r => r.json())
  .then(data => {
    state.records = data;
    renderMainPage();
  });
const state = {
  records: [],
  selectedRecordId: null
};

function getEl(id) {
  return document.getElementById(id);
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

function loadRecords() {
  try {
    const raw = localStorage.getItem("keiei_soudan_records");
    const parsed = raw ? JSON.parse(raw) : [];
    state.records = ensureArray(parsed);
  } catch (e) {
    state.records = [];
  }
}

function saveRecords() {
  localStorage.setItem("keiei_soudan_records", JSON.stringify(state.records));
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[、。,.!！?？/\\()\[\]「」『』【】]/g, " ")
    .split(/\s+/)
    .map(s => s.trim())
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
    record.tags
  ].join(" ");

  const words = tokenize(text);
  const stopWords = new Set([
    "する","して","いる","ある","こと","ため","よう","そう","です","ます",
    "である","について","など","また","その","この","相談","内容","会社","業種",
    "提案","課題","対応","検討","実施","必要","改善","強化","向上"
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
    record.tags
  ].join(" ").toLowerCase();

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
    record.tags
  ].join(" ").toLowerCase();

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
    .filter(r => r.id !== target.id)
    .map(r => ({ ...r, _score: similarityScore(target, r) }))
    .filter(r => r._score > 0)
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
    tags: getEl("tags")?.value?.trim() || ""
  };
}

function renderAnalysis() {
  const box = getEl("analysisArea");
  if (!box) return;

  const draft = currentDraft();
  const hasInput = Object.values(draft).some(v => v && v !== "draft");

  if (!hasInput) {
    box.innerHTML = `
      <div style="border:1px solid #ccc;padding:12px;border-radius:8px;background:#fff;">
        <h3 style="margin-top:0;">AI提案</h3>
        <p>入力すると、分類・キーワード・打ち手候補・類似事例を表示します。</p>
      </div>
    `;
    return;
  }

  const category = classifyConsultation(draft);
  const keywords = extractKeywords(draft);
  const proposals = buildProposal(draft);
  const similars = findSimilarRecords(draft, state.records);

  box.innerHTML = `
    <div style="border:1px solid #ccc;padding:12px;border-radius:8px;background:#fff;">
      <h3 style="margin-top:0;">AI提案</h3>
      <div><strong>分類：</strong>${escapeHtml(category)}</div>
      <div style="margin-top:8px;"><strong>キーワード：</strong>${
        keywords.length
          ? keywords.map(k => `<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;border:1px solid #ccc;border-radius:999px;">${escapeHtml(k)}</span>`).join("")
          : "なし"
      }</div>
      <div style="margin-top:10px;"><strong>打ち手候補</strong></div>
      <ol style="padding-left:20px;">
        ${proposals.map(p => `<li>${escapeHtml(p)}</li>`).join("")}
      </ol>

      <div style="margin-top:16px;"><strong>類似事例</strong></div>
      ${
        similars.length === 0
          ? "<p>まだありません。</p>"
          : similars.map(s => `
            <div style="border-top:1px solid #eee;padding:8px 0;">
              <div><strong>${escapeHtml(s.companyName || "会社名未入力")}</strong></div>
              <div>分類：${escapeHtml(classifyConsultation(s))}</div>
              <div>相談概要：${escapeHtml((s.summary || "").slice(0, 80))}</div>
            </div>
          `).join("")
      }
    </div>
  `;
}

function getUniqueValues(key) {
  return [...new Set(state.records.map(r => r[key]).filter(Boolean))].sort();
}

function renderRecordSelectors() {
  const box = getEl("recordSelectorsArea");
  if (!box) return;

  const industries = getUniqueValues("industry");
  const companies = getUniqueValues("companyName");
  const categories = [...new Set(state.records.map(r => classifyConsultation(r)))].sort();

  box.innerHTML = `
    <div style="border:1px solid #ccc;padding:12px;border-radius:8px;background:#fff;">
      <h3 style="margin-top:0;">蓄積データ抽出</h3>

      <div style="display:grid;gap:10px;">
        <div>
          <label>分類</label>
          <select id="filterCategory" style="width:100%;padding:8px;">
            <option value="">すべて</option>
            ${categories.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}
          </select>
        </div>

        <div>
          <label>業種</label>
          <select id="filterIndustry" style="width:100%;padding:8px;">
            <option value="">すべて</option>
            ${industries.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}
          </select>
        </div>

        <div>
          <label>会社名</label>
          <select id="filterCompany" style="width:100%;padding:8px;">
            <option value="">すべて</option>
            ${companies.map(v => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join("")}
          </select>
        </div>

        <div>
          <label>事例</label>
          <select id="recordSelect" style="width:100%;padding:8px;"></select>
        </div>
      </div>
    </div>
  `;

  ["filterCategory", "filterIndustry", "filterCompany"].forEach(id => {
    getEl(id).addEventListener("change", updateRecordSelectOptions);
  });

  getEl("recordSelect").addEventListener("change", (e) => {
    state.selectedRecordId = e.target.value || null;
    renderRecordDetail();
  });

  updateRecordSelectOptions();
}

function getFilteredRecords() {
  const category = getEl("filterCategory")?.value || "";
  const industry = getEl("filterIndustry")?.value || "";
  const company = getEl("filterCompany")?.value || "";

  return state.records.filter(r => {
    if (category && classifyConsultation(r) !== category) return false;
    if (industry && r.industry !== industry) return false;
    if (company && r.companyName !== company) return false;
    return true;
  });
}

function updateRecordSelectOptions() {
  const select = getEl("recordSelect");
  if (!select) return;

  const filtered = getFilteredRecords();

  select.innerHTML = filtered.length
    ? `<option value="">選択してください</option>` +
      filtered.map(r =>
        `<option value="${escapeHtml(r.id)}">${escapeHtml(r.companyName || "会社名未入力")}｜${escapeHtml(r.industry || "")}｜${escapeHtml((r.summary || "").slice(0, 30))}</option>`
      ).join("")
    : `<option value="">該当なし</option>`;

  if (state.selectedRecordId && filtered.some(r => r.id === state.selectedRecordId)) {
    select.value = state.selectedRecordId;
  } else {
    state.selectedRecordId = null;
  }

  renderRecordDetail();
}

function renderRecordDetail() {
  const box = getEl("recordDetailArea");
  if (!box) return;

  const record = state.records.find(r => r.id === state.selectedRecordId);

  if (!record) {
    box.innerHTML = `
      <div style="border:1px solid #ccc;padding:12px;border-radius:8px;background:#fff;">
        <h3 style="margin-top:0;">事例詳細</h3>
        <p>プルダウンから事例を選択してください。</p>
      </div>
    `;
    return;
  }

  const similars = findSimilarRecords(record, state.records);

  box.innerHTML = `
    <div style="border:1px solid #ccc;padding:12px;border-radius:8px;background:#fff;">
      <h3 style="margin-top:0;">事例詳細</h3>
      <div><strong>会社名：</strong>${escapeHtml(record.companyName)}</div>
      <div><strong>業種：</strong>${escapeHtml(record.industry)}</div>
      <div><strong>分類：</strong>${escapeHtml(classifyConsultation(record))}</div>

      <div style="margin-top:10px;"><strong>相談概要</strong><br>${escapeHtml(record.summary).replaceAll("\n", "<br>")}</div>
      <div style="margin-top:10px;"><strong>課題・悩み</strong><br>${escapeHtml(record.problem).replaceAll("\n", "<br>")}</div>
      <div style="margin-top:10px;"><strong>支援の切り口</strong><br>${escapeHtml(record.approach).replaceAll("\n", "<br>")}</div>
      <div style="margin-top:10px;"><strong>提案内容</strong><br>${escapeHtml(record.proposal).replaceAll("\n", "<br>")}</div>
      <div style="margin-top:10px;"><strong>成果</strong><br>${escapeHtml(record.result).replaceAll("\n", "<br>")}</div>
      <div style="margin-top:10px;"><strong>学び・ポイント</strong><br>${escapeHtml(record.learning).replaceAll("\n", "<br>")}</div>
      <div style="margin-top:10px;"><strong>関連キーワード</strong><br>${escapeHtml(record.tags).replaceAll("\n", "<br>")}</div>

      <div style="margin-top:14px;"><strong>類似事例</strong></div>
      ${
        similars.length === 0
          ? "<p>ありません。</p>"
          : similars.map(s => `
            <div style="border-top:1px solid #eee;padding:8px 0;">
              <div><strong>${escapeHtml(s.companyName)}</strong></div>
              <div>${escapeHtml((s.summary || "").slice(0, 80))}</div>
            </div>
          `).join("")
      }
    </div>
  `;
}

function renderMainPage() {
  const page = getEl("mainPage");
  if (!page) return;

  page.innerHTML = `
    <section style="padding:16px;max-width:1600px;">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px;align-items:start;">
        <div>
          <h2>相談入力</h2>

          <div style="display:grid;gap:12px;">
            <div>
              <label>会社名</label>
              <input id="companyName" type="text" style="width:100%;padding:8px;">
            </div>
            <div>
              <label>業種</label>
              <input id="industry" type="text" style="width:100%;padding:8px;">
            </div>
            <div>
              <label>相談概要</label>
              <textarea id="summary" style="width:100%;height:90px;"></textarea>
            </div>
            <div>
              <label>課題・悩み</label>
              <textarea id="problem" style="width:100%;height:90px;"></textarea>
            </div>
            <div>
              <label>支援の切り口</label>
              <textarea id="approach" style="width:100%;height:90px;"></textarea>
            </div>
            <div>
              <label>提案内容</label>
              <textarea id="proposal" style="width:100%;height:90px;"></textarea>
            </div>
            <div>
              <label>成果</label>
              <textarea id="result" style="width:100%;height:70px;"></textarea>
            </div>
            <div>
              <label>学び・ポイント</label>
              <textarea id="learning" style="width:100%;height:70px;"></textarea>
            </div>
            <div>
              <label>関連キーワード</label>
              <input id="tags" type="text" style="width:100%;padding:8px;">
            </div>

            <button id="saveBtn">相談データとして保存</button>
          </div>
        </div>

        <div id="analysisArea"></div>
        <div>
          <div id="recordSelectorsArea"></div>
          <div style="margin-top:16px;" id="recordDetailArea"></div>
        </div>
      </div>
    </section>
  `;

  [
    "companyName","industry","summary","problem","approach",
    "proposal","result","learning","tags"
  ].forEach(id => {
    const el = getEl(id);
    if (el) el.addEventListener("input", renderAnalysis);
  });

  getEl("saveBtn").addEventListener("click", saveMainRecord);

  renderAnalysis();
  renderRecordSelectors();
  renderRecordDetail();
}

function renderImportPage() {
  const page = getEl("importPage");
  if (!page) return;

  page.innerHTML = `
    <section style="padding:16px;max-width:1100px;">
      <h2>蓄積ページ</h2>
      <div style="border:1px solid #ccc;padding:16px;border-radius:8px;background:#fff;">
        <p>独自に調べた内容や過去相談事例を、テキストで蓄積します。</p>

        <div style="display:grid;gap:12px;">
          <div>
            <label>会社名</label>
            <input id="importCompanyName" type="text" style="width:100%;padding:8px;">
          </div>
          <div>
            <label>業種</label>
            <input id="importIndustry" type="text" style="width:100%;padding:8px;">
          </div>
          <div>
            <label>相談概要</label>
            <textarea id="importSummary" style="width:100%;height:90px;"></textarea>
          </div>
          <div>
            <label>課題・悩み</label>
            <textarea id="importProblem" style="width:100%;height:90px;"></textarea>
          </div>
          <div>
            <label>支援の切り口</label>
            <textarea id="importApproach" style="width:100%;height:90px;"></textarea>
          </div>
          <div>
            <label>提案内容</label>
            <textarea id="importProposal" style="width:100%;height:90px;"></textarea>
          </div>
          <div>
            <label>成果</label>
            <textarea id="importResult" style="width:100%;height:70px;"></textarea>
          </div>
          <div>
            <label>学び・ポイント</label>
            <textarea id="importLearning" style="width:100%;height:70px;"></textarea>
          </div>
          <div>
            <label>関連キーワード</label>
            <input id="importTags" type="text" style="width:100%;padding:8px;">
          </div>

          <button id="importSaveBtn">蓄積事例として保存</button>
        </div>

        <div id="importStatus" style="margin-top:12px;"></div>
      </div>
    </section>
  `;

  getEl("importSaveBtn").addEventListener("click", saveImportedRecord);
}

function saveMainRecord() {
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: "main",
    companyName: getEl("companyName")?.value?.trim() || "",
    industry: getEl("industry")?.value?.trim() || "",
    summary: getEl("summary")?.value?.trim() || "",
    problem: getEl("problem")?.value?.trim() || "",
    approach: getEl("approach")?.value?.trim() || "",
    proposal: getEl("proposal")?.value?.trim() || "",
    result: getEl("result")?.value?.trim() || "",
    learning: getEl("learning")?.value?.trim() || "",
    tags: getEl("tags")?.value?.trim() || ""
  };

  if (!record.companyName && !record.summary) {
    alert("会社名または相談概要を入力してください");
    return;
  }

  state.records.push(record);
  saveRecords();
  state.selectedRecordId = record.id;
  renderMainPage();
}

function saveImportedRecord() {
  const record = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    source: "import",
    companyName: getEl("importCompanyName")?.value?.trim() || "",
    industry: getEl("importIndustry")?.value?.trim() || "",
    summary: getEl("importSummary")?.value?.trim() || "",
    problem: getEl("importProblem")?.value?.trim() || "",
    approach: getEl("importApproach")?.value?.trim() || "",
    proposal: getEl("importProposal")?.value?.trim() || "",
    result: getEl("importResult")?.value?.trim() || "",
    learning: getEl("importLearning")?.value?.trim() || "",
    tags: getEl("importTags")?.value?.trim() || ""
  };

  if (!record.companyName && !record.summary) {
    alert("会社名または相談概要を入力してください");
    return;
  }

  state.records.push(record);
  saveRecords();

  [
    "importCompanyName","importIndustry","importSummary","importProblem","importApproach",
    "importProposal","importResult","importLearning","importTags"
  ].forEach(id => {
    const el = getEl(id);
    if (el) el.value = "";
  });

  const status = getEl("importStatus");
  if (status) status.textContent = "蓄積事例として保存しました";
}

function initTabs() {
  const tabButtons = document.querySelectorAll(".nav-tab");
  const mainPage = getEl("mainPage");
  const importPage = getEl("importPage");

  tabButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;

      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      if (mainPage) mainPage.style.display = page === "mainPage" ? "block" : "none";
      if (importPage) importPage.style.display = page === "importPage" ? "block" : "none";

      if (page === "mainPage") renderMainPage();
      if (page === "importPage") renderImportPage();
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  loadRecords();
  initTabs();
  renderMainPage();
  renderImportPage();
});
