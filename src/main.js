const state = {
  records: [],
  currentPage: "mainPage",
  selectedFiles: []
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
    record.issue,
    record.notes
  ].join(" ");

  const words = tokenize(text);
  const stopWords = new Set([
    "する","して","いる","ある","こと","ため","よう","そう","です","ます",
    "である","について","など","また","その","この","相談","内容","会社","業種",
    "メモ","事例","提案","課題","対応","検討","実施","必要","改善","強化","向上"
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
  const text = [record.industry, record.issue, record.notes].join(" ").toLowerCase();

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
  const issue = [record.industry, record.issue, record.notes].join(" ").toLowerCase();
  const suggestions = [];

  if (/売上|集客|販促|広告|認知|web|sns|インスタ|instagram/.test(issue)) {
    suggestions.push("顧客像を1つに絞り、訴求軸を明確化する");
    suggestions.push("既存客の再来店・再購入導線を先に整える");
    suggestions.push("SNS・店頭・チラシ・紹介の役割分担を整理する");
  }

  if (/価格|値上げ|単価|粗利|利益/.test(issue)) {
    suggestions.push("値上げではなく価値の見せ方変更も含めて検討する");
    suggestions.push("商品別の粗利と売れ筋を分けて見る");
    suggestions.push("高粗利商品への誘導導線を作る");
  }

  if (/商品|サービス|メニュー|差別化|ブランド/.test(issue)) {
    suggestions.push("誰向けの商品かを絞り、選ばれる理由を言語化する");
    suggestions.push("既存商品を用途別・価格別に再整理する");
    suggestions.push("競合比較ではなく独自の背景や強みを前面化する");
  }

  if (/採用|人材|教育|定着/.test(issue)) {
    suggestions.push("採用条件だけでなく仕事内容の見せ方を見直す");
    suggestions.push("定着理由と離職理由を分けて整理する");
    suggestions.push("教育負担の少ない受入導線を作る");
  }

  if (/補助金|資金|融資|資金繰り/.test(issue)) {
    suggestions.push("資金調達の前に使途と回収計画を明確にする");
    suggestions.push("補助金ありきではなく事業計画を先に整理する");
    suggestions.push("投資優先順位をつけて必要額を絞る");
  }

  if (/開業|創業|起業/.test(issue)) {
    suggestions.push("顧客像・提供価値・販売導線の3点を先に固める");
    suggestions.push("小さく検証できる商品から始める");
    suggestions.push("固定費を抑えた立ち上げ方を優先する");
  }

  if (suggestions.length === 0) {
    suggestions.push("現状課題を顧客・商品・導線・収益の4視点で分解する");
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
    .slice(0, 3);
}

function currentDraft() {
  return {
    id: "draft",
    createdAt: "",
    companyName: getEl("companyName")?.value?.trim() || "",
    industry: getEl("industry")?.value?.trim() || "",
    issue: getEl("issue")?.value?.trim() || "",
    notes: getEl("notes")?.value?.trim() || ""
  };
}

function renderAnalysis() {
  const box = getEl("analysisArea");
  if (!box) return;

  const draft = currentDraft();
  const hasInput = draft.companyName || draft.industry || draft.issue || draft.notes;

  if (!hasInput) {
    box.innerHTML = `
      <div style="border:1px solid #ccc;padding:12px;border-radius:8px;background:#fff;">
        <h3 style="margin-top:0;">AI提案</h3>
        <p>入力すると、分類・キーワード・打ち手候補・過去類似事例を表示します。</p>
      </div>
    `;
    return;
  }

  const category = classifyConsultation(draft);
  const keywords = extractKeywords(draft);
  const proposals = buildProposal(draft);
  const similars = findSimilarRecords(draft, state.records);

  box.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <div style="border:1px solid #ccc;padding:12px;border-radius:8px;background:#fff;">
        <h3 style="margin-top:0;">AI提案</h3>
        <div><strong>相談タイプ分類：</strong>${escapeHtml(category)}</div>
        <div style="margin-top:8px;"><strong>キーワード：</strong>${keywords.length ? keywords.map(k => `<span style="display:inline-block;margin:2px 6px 2px 0;padding:2px 8px;border:1px solid #ccc;border-radius:999px;">${escapeHtml(k)}</span>`).join("") : "なし"}</div>
        <div style="margin-top:10px;"><strong>打ち手候補</strong></div>
        <ol style="margin-top:6px;padding-left:20px;">
          ${proposals.map(p => `<li>${escapeHtml(p)}</li>`).join("")}
        </ol>
      </div>

      <div style="border:1px solid #ccc;padding:12px;border-radius:8px;background:#fff;">
        <h3 style="margin-top:0;">過去類似事例</h3>
        ${
          similars.length === 0
            ? "<p>まだ類似事例はありません。</p>"
            : similars.map(s => `
              <div style="border-top:1px solid #eee;padding:10px 0;">
                <div><strong>${escapeHtml(s.companyName || "会社名未入力")}</strong></div>
                <div>分類：${escapeHtml(classifyConsultation(s))}</div>
                <div>業種：${escapeHtml(s.industry || "")}</div>
                <div>相談：${escapeHtml((s.issue || "").slice(0, 80))}</div>
              </div>
            `).join("")
        }
      </div>
    </div>
  `;
}

function renderSavedRecords() {
  const box = getEl("savedRecordsArea");
  if (!box) return;

  const records = ensureArray(state.records);

  box.innerHTML = `
    <h3>保存データ</h3>
    ${
      records.length === 0
        ? "<p>まだデータがありません</p>"
        : records
            .slice()
            .reverse()
            .map(
              r => `
              <div style="border:1px solid #ccc;padding:10px;margin-bottom:8px;border-radius:8px;background:#fff;">
                <div><strong>${escapeHtml(r.companyName || "会社名未入力")}</strong></div>
                <div>分類：${escapeHtml(classifyConsultation(r))}</div>
                <div>業種：${escapeHtml(r.industry || "")}</div>
                <div>相談内容：${escapeHtml(r.issue || "")}</div>
                <div style="font-size:12px;color:#666;margin-top:4px;">${escapeHtml(r.createdAt || "")}</div>
              </div>
            `
            )
            .join("")
    }
  `;
}

function renderMainPage() {
  const page = getEl("mainPage");
  if (!page) return;

  page.innerHTML = `
    <section style="padding:16px;max-width:1400px;">
      <div style="display:grid;grid-template-columns:1.1fr 0.9fr;gap:20px;align-items:start;">
        
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
              <label>相談内容</label>
              <textarea id="issue" style="width:100%;height:120px;"></textarea>
            </div>

            <div>
              <label>メモ</label>
              <textarea id="notes" style="width:100%;height:120px;"></textarea>
            </div>

            <button id="saveBtn">保存</button>
          </div>

          <hr style="margin:24px 0;">
          <div id="savedRecordsArea"></div>
        </div>

        <div id="analysisArea"></div>
      </div>
    </section>
  `;

  const fields = ["companyName", "industry", "issue", "notes"];
  fields.forEach(id => {
    const el = getEl(id);
    if (el) {
      el.addEventListener("input", renderAnalysis);
    }
  });

  const saveBtn = getEl("saveBtn");
  if (saveBtn) {
    saveBtn.onclick = saveRecord;
  }

  renderAnalysis();
  renderSavedRecords();
}

function renderImportPage() {
  const page = getEl("importPage");
  if (!page) return;

  page.innerHTML = `
    <section style="padding:16px;">
      <h2>蓄積ページ</h2>
      <p>このページは次に、PDF / Word / 音声 / 画像アップロード対応へ進めます。</p>
    </section>
  `;
}

function saveRecord() {
  const companyName = getEl("companyName")?.value?.trim() || "";
  const industry = getEl("industry")?.value?.trim() || "";
  const issue = getEl("issue")?.value?.trim() || "";
  const notes = getEl("notes")?.value?.trim() || "";

  if (!companyName && !issue) {
    alert("会社名または相談内容を入力してください");
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

  state.records.push(record);
  saveRecords();
  renderMainPage();
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
    });
  });
}

window.addEventListener("DOMContentLoaded", () => {
  loadRecords();
  initTabs();
  renderMainPage();
  renderImportPage();
});
