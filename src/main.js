const state = {
  records: [],
  currentPage: "mainPage",
  selectedFiles: []
};

function getEl(id) {
  return document.getElementById(id);
}

function renderApp() {
  renderMainPage();
  renderImportPage();
}

function renderMainPage() {
  const page = getEl("mainPage");
  if (!page) return;

  const records = Array.isArray(state.records) ? state.records : [];

  page.innerHTML = `
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
          <textarea id="issue" style="width:100%;height:120px;"></textarea>
        </div>

        <div>
          <label>メモ</label>
          <textarea id="notes" style="width:100%;height:120px;"></textarea>
        </div>

        <button id="saveBtn">保存</button>

      </div>

      <hr style="margin:24px 0">

      <h3>保存データ</h3>

      ${
        records.length === 0
          ? "<p>まだデータがありません</p>"
          : records
              .map(
                r => `
          <div style="border:1px solid #ccc;padding:10px;margin-bottom:8px;border-radius:8px;">
            <strong>${r.companyName}</strong><br>
            ${r.issue}<br>
            <small>${r.createdAt}</small>
          </div>
        `
              )
              .join("")
      }

    </section>
  `;

  const saveBtn = getEl("saveBtn");
  if (saveBtn) {
    saveBtn.onclick = saveRecord;
  }
}

function renderImportPage() {
  const page = getEl("importPage");
  if (!page) return;

  page.innerHTML = `
    <section style="padding:16px;">
      <h2>蓄積ページ</h2>
      <p>ここにPDFや音声の取り込み機能を追加予定</p>
    </section>
  `;
}

function saveRecord() {
  const companyName = getEl("companyName").value.trim();
  const industry = getEl("industry").value.trim();
  const issue = getEl("issue").value.trim();
  const notes = getEl("notes").value.trim();

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

  renderApp();
}

window.addEventListener("DOMContentLoaded", () => {
  renderApp();
});
