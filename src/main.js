import { createEmptyRecord } from './dataModel.js';
import { loadRecords, saveRecords } from './storage.js';
import { classifyConsultationType, consultationTypeCandidates, findSimilarCases, generateConsultationAdvice, generateTags, summarizeImportedRecord } from './aiService.js';
import { isSpeechRecognitionAvailable, startSpeechRecognition } from './voice.js';

const state = {
  records: loadRecords(),
  currentForm: createEmptyRecord(),
  selectedRecordId: null,
  generatedAiOutput: null,
  similarResults: [],
  filters: {
    keyword: '',
    industry: '',
    issueTag: '',
    actionTag: '',
    consultationType: '',
    sourceType: '',
  },
  importQueue: [],
  importIndex: -1,
};

const issueTagCandidates = ['集客', '販路開拓', '値上げ', '新商品', 'SNS', 'リピート', 'ブランディング', '価格設定', '人手不足', '資金繰り', '営業', 'DX'];
const actionTagCandidates = ['Instagram', 'チラシ', 'LP', 'EC', 'イベント', 'BtoB提案', '商品改善', '導線改善', '値上げ訴求', 'ターゲット再設定'];
const placeholders = {
  consultationDate: '相談日を選択',
  clientName: '例）山田 太郎',
  companyName: '例）株式会社サンプル',
  industry: '例）飲食 / 小売 / 製造業 / サービス業',
  productFeatures: '商品・サービスの特徴、強み、価格帯など',
  valueProposition: '顧客に提供している価値を記載',
  targetCustomer: '主な顧客層（年齢、属性、利用シーン）',
  businessModel: '収益構造・販売チャネル・単価など',
  strengths: '競合との差別化ポイント、実績、独自性',
  consultationDetails: '相談者から聞いた事実・背景・要望を入力',
  currentIssues: '現時点での課題を箇条書きで入力',
  desiredDirection: '目指したい方向性、達成したい状態を入力',
  notes: '気づきや次回確認事項など自由にメモ',
};

const mainPage = document.querySelector('#mainPage');
const importPage = document.querySelector('#importPage');

function initNavigation() {
  document.querySelectorAll('.nav-tab').forEach((button) => {
    button.addEventListener('click', () => {
      document.querySelectorAll('.nav-tab').forEach((tab) => tab.classList.remove('active'));
      button.classList.add('active');
      const target = button.dataset.page;
      document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
      document.querySelector(`#${target}`)?.classList.add('active');
    });
  });
}

function renderMainPage() {
  const speechSupported = isSpeechRecognitionAvailable();
  const aiCards = renderAiCards(state.generatedAiOutput);

  mainPage.innerHTML = `
    <div class="layout-grid main-layout">
      <section class="card input-panel">
        <h2>主ページ（現場用）</h2>
        ${!speechSupported ? '<p class="warning">この環境では音声入力を利用できません。Chrome最新版でお試しください。</p>' : ''}
        <div class="button-row sticky-action-row">
          <button id="generateBtn" class="primary">提案生成</button>
          <button id="saveBtn">保存</button>
          <button id="similarBtn">類似案件を検索</button>
          <button id="clearBtn">入力クリア</button>
          <button id="summaryBtn">相談記録を要約表示</button>
        </div>

        <form id="consultationForm" class="form-grid">
          <h3 class="section-title full">基本情報</h3>
          ${renderInput('consultationDate', '相談日', 'date', state.currentForm.consultationDate, placeholders.consultationDate)}
          ${renderInput('clientName', '相談者名', 'text', state.currentForm.clientName, placeholders.clientName)}
          ${renderInput('companyName', '会社名', 'text', state.currentForm.companyName, placeholders.companyName)}
          ${renderInput('industry', '業種', 'text', state.currentForm.industry, placeholders.industry)}
          ${renderSelectField('consultationType', '相談タイプ', consultationTypeCandidates, state.currentForm.consultationType, placeholders.consultationType)}
          ${renderTextarea('productFeatures', '商品特徴', state.currentForm.productFeatures, { placeholder: placeholders.productFeatures })}
          ${renderTextarea('valueProposition', '提供価値', state.currentForm.valueProposition, { placeholder: placeholders.valueProposition })}
          ${renderTextarea('targetCustomer', '顧客ターゲット', state.currentForm.targetCustomer, { placeholder: placeholders.targetCustomer })}
          ${renderTextarea('businessModel', 'ビジネスモデル', state.currentForm.businessModel, { placeholder: placeholders.businessModel })}
          ${renderTextarea('strengths', '強み・差別化ポイント', state.currentForm.strengths, { placeholder: placeholders.strengths })}

          <h3 class="section-title full">相談内容</h3>
          ${renderTextarea('consultationDetails', '相談内容', state.currentForm.consultationDetails, { withMic: true, rows: 8, placeholder: placeholders.consultationDetails })}
          ${renderTextarea('currentIssues', '現在の課題', state.currentForm.currentIssues, { withMic: true, rows: 8, placeholder: placeholders.currentIssues })}
          <div class="full tag-helper">
            <p class="muted">よく使う課題タグ（クリックで追加）</p>
            ${renderTagButtons('issue', issueTagCandidates)}
          </div>
          ${renderTextarea('desiredDirection', '希望する方向性', state.currentForm.desiredDirection, { rows: 8, placeholder: placeholders.desiredDirection })}
          <div class="full tag-helper">
            <p class="muted">よく使う施策タグ（クリックで追加）</p>
            ${renderTagButtons('action', actionTagCandidates)}
          </div>
          ${renderTextarea('notes', '自由メモ', state.currentForm.notes, { withMic: true, rows: 8, placeholder: placeholders.notes })}
          <div class="full"><strong>選択中タグ:</strong> ${renderSelectedTags()}</div>
        </form>
      </section>

      <aside class="side-panel">
        <section class="card" id="aiProposalSection">
          <h2>AI提案</h2>
          <button id="copySummaryBtn" class="copy-btn" ${state.generatedAiOutput?.consultationSummary ? '' : 'disabled'}>相談記録要約をコピー</button>
          ${aiCards}
        </section>

        <section class="card" id="similarSection">
          <h2>類似案件</h2>
          <div id="similarArea">${renderSimilarArea()}</div>
        </section>
      </aside>
    </div>

    <section class="card">
      <h2>保存済み相談一覧</h2>
      ${renderFilters()}
      <div class="table-wrap">${renderRecordTable()}</div>
      <div id="recordDetail">${renderDetailCard()}</div>
    </section>
  `;

  attachMainEvents();
}

function renderInput(name, label, type, value = '', placeholder = '') {
  return `<label><span>${label}</span><input type="${type}" name="${name}" value="${escapeHtml(value || '')}" placeholder="${escapeHtml(placeholder)}" /></label>`;
}

function renderSelectField(name, label, options, currentValue = '', placeholder = '') {
  return `<label><span>${label}</span><select name="${name}"><option value="">${escapeHtml(placeholder || '選択してください')}</option>${options
    .map((opt) => `<option value="${escapeHtml(opt)}" ${currentValue === opt ? 'selected' : ''}>${escapeHtml(opt)}</option>`)
    .join('')}</select></label>`;
}

function renderTextarea(name, label, value = '', options = {}) {
  const { withMic = false, rows = 5, placeholder = '' } = options;
  return `<label class="full"><span>${label}</span><div class="textarea-wrap"><textarea name="${name}" rows="${rows}" placeholder="${escapeHtml(placeholder)}">${escapeHtml(value || '')}</textarea>${withMic ? `<button type="button" class="mic-btn" data-target="${name}">🎤 音声入力</button>` : ''}</div></label>`;
}

function renderTagButtons(type, tags) {
  return `<div class="tag-candidate-row">${tags
    .map((tag) => `<button type="button" class="tag-candidate-btn" data-tag-type="${type}" data-tag-value="${escapeHtml(tag)}">＋${escapeHtml(tag)}</button>`)
    .join('')}</div>`;
}

function renderSelectedTags() {
  const issueTags = state.currentForm.tags?.issueTags || [];
  const actionTags = state.currentForm.tags?.actionTags || [];
  const resultTags = state.currentForm.tags?.resultTags || [];
  const allTags = [...issueTags.map((tag) => `課題:${tag}`), ...actionTags.map((tag) => `施策:${tag}`), ...resultTags.map((tag) => `成果:${tag}`)];
  return allTags.length ? renderChips(allTags) : '<span class="muted">未選択</span>';
}

function renderAiCards(aiOutput) {
  if (!aiOutput) return '<p class="muted">「提案生成」を押すと、論点整理や提案候補が表示されます。</p>';

  const sections = [
    ['現状整理', aiOutput.situationSummary],
    ['優先課題3つ', (aiOutput.topPriorities || []).join(' / ')],
    ['今すぐやること', (aiOutput.quickActions || []).join(' / ')],
    ['次回までの宿題', (aiOutput.homework || []).join(' / ')],
    ['中期施策', (aiOutput.midTermStrategies || []).join(' / ')],
    ['差別化案', (aiOutput.differentiationIdeas || []).join(' / ')],
    ['キャッチコピー案', (aiOutput.copyIdeas || []).join(' / ')],
    ['相談記録要約', aiOutput.consultationSummary],
  ];

  return `<div class="ai-grid">${sections
    .map(([title, content]) => `<article class="mini-card"><h3>${title}</h3><p>${escapeHtml(content || '')}</p><button class="copy-btn" data-copy-text="${escapeHtml(content || '')}">コピー</button></article>`)
    .join('')}</div>`;
}

function renderSimilarArea() {
  if (!state.similarResults.length) return '<p class="muted">類似案件検索を実行すると表示されます。</p>';
  return state.similarResults
    .map(
      ({ record, score, similarityReason }) => `<article class="mini-card similar-card" data-open-id="${record.id}">
      <h3>類似度: ${score}点</h3>
      <p><strong>相談日:</strong> ${escapeHtml(record.consultationDate || '')}</p>
      <p><strong>会社名:</strong> ${escapeHtml(record.companyName || '')}</p>
      <p><strong>業種:</strong> ${escapeHtml(record.industry || '')}</p>
      <p><strong>主な課題:</strong> ${escapeHtml(record.currentIssues || '')}</p>
      <p><strong>提案要点:</strong> ${escapeHtml(record.proposalSummary || record.summary?.proposalPoints || '')}</p>
      <p><strong>タグ:</strong> ${renderChips([...(record.tags?.industryTags || []), ...(record.tags?.issueTags || []), ...(record.tags?.actionTags || []), ...(record.tags?.resultTags || [])])}</p>
      <p><strong>なぜ似ているか:</strong> ${escapeHtml(similarityReason || '')}</p>
    </article>`,
    )
    .join('');
}

function renderFilters() {
  const industries = [...new Set(state.records.map((r) => r.industry).filter(Boolean))];
  const issueTags = [...new Set(state.records.flatMap((r) => r.tags?.issueTags || []))];
  const actionTags = [...new Set(state.records.flatMap((r) => r.tags?.actionTags || []))];
  const consultationTypes = [...new Set(state.records.map((r) => r.consultationType).filter(Boolean))];

  return `
    <div class="filters">
      <input id="keywordFilter" placeholder="キーワード検索" value="${escapeHtml(state.filters.keyword)}" />
      ${renderSelect('industryFilter', '業種で絞り込み', industries, state.filters.industry)}
      ${renderSelect('issueTagFilter', '課題タグで絞り込み', issueTags, state.filters.issueTag)}
      ${renderSelect('actionTagFilter', '施策タグで絞り込み', actionTags, state.filters.actionTag)}
      ${renderSelect('consultationTypeFilter', '相談タイプで絞り込み', consultationTypes, state.filters.consultationType)}
      ${renderSelect('sourceFilter', '区分', ['manual', 'imported'], state.filters.sourceType, { manual: '手入力', imported: '取り込み' })}
    </div>
  `;
}

function renderSelect(id, placeholder, options, current, labels = {}) {
  return `<select id="${id}"><option value="">${placeholder}</option>${options
    .map((opt) => `<option value="${escapeHtml(opt)}" ${current === opt ? 'selected' : ''}>${escapeHtml(labels[opt] || opt)}</option>`)
    .join('')}</select>`;
}

function filteredRecords() {
  return state.records.filter((record) => {
    const joined = `${record.clientName} ${record.companyName} ${record.consultationDetails} ${record.currentIssues}`;
    if (state.filters.keyword && !joined.includes(state.filters.keyword)) return false;
    if (state.filters.industry && record.industry !== state.filters.industry) return false;
    if (state.filters.issueTag && !(record.tags?.issueTags || []).includes(state.filters.issueTag)) return false;
    if (state.filters.actionTag && !(record.tags?.actionTags || []).includes(state.filters.actionTag)) return false;
    if (state.filters.consultationType && record.consultationType !== state.filters.consultationType) return false;
    if (state.filters.sourceType && record.sourceType !== state.filters.sourceType) return false;
    return true;
  });
}

function renderRecordTable() {
  const rows = filteredRecords()
    .map((record) => {
      const similarCount = findSimilarCases(record, state.records).length;
      return `<tr data-open-id="${record.id}">
        <td>${escapeHtml(record.consultationDate || '')}</td>
        <td>${escapeHtml(record.clientName || '')}</td>
        <td>${escapeHtml(record.companyName || '')}</td>
        <td>${escapeHtml(record.industry || '')}</td>
        <td>${renderChips([record.consultationType || 'その他'])}</td>
        <td>${escapeHtml((record.consultationDetails || '').slice(0, 30))}</td>
        <td>${renderChips([...(record.tags?.issueTags || []), ...(record.tags?.actionTags || []), ...(record.tags?.resultTags || [])])}</td>
        <td>${similarCount}</td>
      </tr>`;
    })
    .join('');

  return `<table><thead><tr><th>相談日</th><th>相談者名</th><th>会社名</th><th>業種</th><th>相談タイプ</th><th>相談内容冒頭</th><th>付与タグ</th><th>類似候補数</th></tr></thead><tbody>${rows || '<tr><td colspan="8">データなし</td></tr>'}</tbody></table>`;
}

function renderDetailCard() {
  const record = state.records.find((r) => r.id === state.selectedRecordId);
  if (!record) return '<p class="muted">一覧から行をクリックすると詳細が表示されます。</p>';

  return `<article class="detail-card">
    <h3>${escapeHtml(record.companyName || '詳細')}</h3>
    <p><strong>区分:</strong> ${record.sourceType === 'manual' ? '手入力記録' : '取り込み記録'}</p>
    <p><strong>基本情報:</strong> 相談日 ${escapeHtml(record.consultationDate || '')} / 相談者 ${escapeHtml(record.clientName || '')} / 会社 ${escapeHtml(record.companyName || '')} / 業種 ${escapeHtml(record.industry || '')} / 相談タイプ ${escapeHtml(record.consultationType || 'その他')}</p>
    <p><strong>相談内容:</strong> ${escapeHtml(record.consultationDetails || '')}</p>
    <p><strong>課題:</strong> ${escapeHtml(record.currentIssues || '')}</p>
    <p><strong>提案内容:</strong> ${escapeHtml(record.proposalSummary || '')}</p>
    <p><strong>次回宿題:</strong> ${escapeHtml(record.nextActions || '')}</p>
    <p><strong>要約:</strong> ${escapeHtml(record.aiOutput?.consultationSummary || record.summary?.overview || '')}</p>
    <p><strong>タグ:</strong> ${renderChips([...(record.tags?.industryTags || []), ...(record.tags?.issueTags || []), ...(record.tags?.actionTags || []), ...(record.tags?.resultTags || [])])}</p>
    <p><strong>原文:</strong></p>
    <pre class="raw-text">${escapeHtml(record.rawText || '原文なし')}</pre>
  </article>`;
}

function attachMainEvents() {
  const form = document.querySelector('#consultationForm');
  form?.addEventListener('input', () => {
    const formData = new FormData(form);
    Object.keys(state.currentForm).forEach((key) => {
      if (formData.has(key)) state.currentForm[key] = formData.get(key);
    });
  });

  document.querySelectorAll('.mic-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetName = btn.dataset.target;
      const targetArea = document.querySelector(`textarea[name="${targetName}"]`);
      startSpeechRecognition({
        onResult: (text) => {
          targetArea.value = `${targetArea.value}${targetArea.value ? '\n' : ''}${text}`;
          targetArea.dispatchEvent(new Event('input', { bubbles: true }));
        },
        onError: (message) => window.alert(message),
      });
    });
  });

  document.querySelector('#generateBtn')?.addEventListener('click', async () => {
    state.currentForm.tags = mergeGeneratedTags(state.currentForm.tags, generateTags(`${state.currentForm.consultationDetails} ${state.currentForm.currentIssues}`, state.currentForm.industry));
    state.currentForm.consultationType = classifyConsultationType(state.currentForm);
    state.generatedAiOutput = await generateConsultationAdvice(state.currentForm);
    renderMainPage();
  });

  document.querySelector('#saveBtn')?.addEventListener('click', () => {
    const record = {
      ...state.currentForm,
      id: crypto.randomUUID(),
      sourceType: 'manual',
      createdAt: new Date().toISOString(),
      tags: mergeGeneratedTags(state.currentForm.tags, generateTags(`${state.currentForm.consultationDetails} ${state.currentForm.currentIssues}`, state.currentForm.industry)),
      consultationType: state.currentForm.consultationType || classifyConsultationType(state.currentForm),
      aiOutput: state.generatedAiOutput || state.currentForm.aiOutput,
    };
    state.records.unshift(record);
    saveRecords(state.records);
    state.selectedRecordId = record.id;
    window.alert('相談記録を保存しました。');
    renderMainPage();
  });

  document.querySelector('#clearBtn')?.addEventListener('click', () => {
    state.currentForm = createEmptyRecord();
    state.generatedAiOutput = null;
    state.similarResults = [];
    renderMainPage();
  });

  document.querySelector('#summaryBtn')?.addEventListener('click', async () => {
    const summary = await summarizeImportedRecord(state.currentForm);
    state.generatedAiOutput = { ...(state.generatedAiOutput || {}), consultationSummary: summary.overview };
    renderMainPage();
  });

  document.querySelector('#similarBtn')?.addEventListener('click', () => {
    const currentCase = {
      ...state.currentForm,
      tags: mergeGeneratedTags(state.currentForm.tags, generateTags(`${state.currentForm.consultationDetails} ${state.currentForm.currentIssues}`, state.currentForm.industry)),
      consultationType: state.currentForm.consultationType || classifyConsultationType(state.currentForm),
    };
    state.similarResults = findSimilarCases(currentCase, state.records);
    renderMainPage();
  });

  document.querySelectorAll('[data-open-id]').forEach((el) => {
    el.addEventListener('click', () => {
      state.selectedRecordId = el.dataset.openId;
      renderMainPage();
    });
  });

  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const content = btn.dataset.copyText || btn.parentElement.querySelector('p')?.innerText || '';
      await navigator.clipboard.writeText(content);
      btn.textContent = 'コピー済み';
      setTimeout(() => {
        btn.textContent = 'コピー';
      }, 1000);
    });
  });

  document.querySelector('#copySummaryBtn')?.addEventListener('click', async (e) => {
    const text = state.generatedAiOutput?.consultationSummary || '';
    if (!text) return;
    await navigator.clipboard.writeText(text);
    e.target.textContent = '要約をコピー済み';
    setTimeout(() => {
      e.target.textContent = '相談記録要約をコピー';
    }, 1200);
  });

  document.querySelectorAll('.tag-candidate-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.tagType;
      const value = btn.dataset.tagValue;
      const currentTags = state.currentForm.tags || { industryTags: [], issueTags: [], actionTags: [], resultTags: [] };
      const key = type === 'issue' ? 'issueTags' : 'actionTags';
      const updated = [...new Set([...(currentTags[key] || []), value])];
      state.currentForm.tags = {
        industryTags: currentTags.industryTags || (state.currentForm.industry ? [state.currentForm.industry] : []),
        issueTags: key === 'issueTags' ? updated : currentTags.issueTags || [],
        actionTags: key === 'actionTags' ? updated : currentTags.actionTags || [],
        resultTags: currentTags.resultTags || [],
      };
      renderMainPage();
    });
  });

  const filterMap = [
    ['#keywordFilter', 'keyword'],
    ['#industryFilter', 'industry'],
    ['#issueTagFilter', 'issueTag'],
    ['#actionTagFilter', 'actionTag'],
    ['#consultationTypeFilter', 'consultationType'],
    ['#sourceFilter', 'sourceType'],
  ];
  filterMap.forEach(([selector, key]) => {
    document.querySelector(selector)?.addEventListener('input', (e) => {
      state.filters[key] = e.target.value;
      renderMainPage();
    });
  });
}

function getCurrentImportItem() {
  if (state.importIndex < 0 || state.importIndex >= state.importQueue.length) return null;
  return state.importQueue[state.importIndex];
}

function renderImportPage() {
  const item = getCurrentImportItem();
  importPage.innerHTML = `
    <section class="card">
      <h2>蓄積ページ（過去議事録取り込み）</h2>
      <p class="muted">複数ファイルを順番に確認し、編集してから保存できます（txt/json/csv対応）。</p>
      <div class="import-grid">
        <label class="full"><span>議事録テキスト貼り付け</span><textarea id="rawImportText" rows="8" placeholder="ここに議事録を貼り付けるとキューに追加されます"></textarea></label>
        <label><span>ファイルアップロード（txt / json / csv）</span><input type="file" id="textFileInput" accept=".txt,.json,.csv" multiple /></label>
        <label><span>PDF/Word（将来対応）</span><input type="file" disabled /><small class="muted">現在未対応です</small></label>
        <label><span>音声ファイル（将来対応）</span><input type="file" disabled /><small class="muted">現在未対応です</small></label>
      </div>
      <div class="button-row">
        <button id="addTextImportBtn" class="primary">テキストを取り込みキューへ追加</button>
        <button id="prevImportBtn" ${state.importIndex <= 0 ? 'disabled' : ''}>前へ</button>
        <button id="nextImportBtn" ${state.importIndex >= state.importQueue.length - 1 ? 'disabled' : ''}>次へ</button>
        <button id="saveImportBtn" ${item ? '' : 'disabled'}>この1件を保存</button>
      </div>
      <div class="queue-status-row">${renderQueueStatus()}</div>
    </section>

    <section class="card">
      <h2>取り込み確認（原文と抽出結果）</h2>
      ${item ? renderImportReview(item) : '<p class="muted">キューに取り込みデータがありません。テキスト貼り付けまたはファイルを追加してください。</p>'}
    </section>
  `;
  attachImportEvents();
}

function renderQueueStatus() {
  if (!state.importQueue.length) return '<p class="muted">取り込み待ちデータはありません。</p>';
  return state.importQueue
    .map((item, idx) => `<span class="queue-chip ${item.status}" data-queue-index="${idx}">${idx + 1}. ${escapeHtml(item.name)} (${statusLabel(item.status)})</span>`)
    .join(' ');
}

function statusLabel(status) {
  if (status === 'saved') return '保存済み';
  if (status === 'error') return 'エラー';
  return '未保存';
}

function renderImportReview(item) {
  return `
    <div class="import-review-grid">
      <article class="mini-card">
        <h3>原文（左）</h3>
        <textarea id="importRawEdit" rows="20">${escapeHtml(item.rawText || '')}</textarea>
      </article>
      <article class="mini-card">
        <h3>抽出結果（右・保存前に編集可）</h3>
        <div class="import-form-grid">
          <label><span>相談日 *</span><input id="importConsultationDate" type="date" value="${escapeHtml(item.parsed.consultationDate || '')}" /></label>
          <label><span>相談者名 *</span><input id="importClientName" value="${escapeHtml(item.parsed.clientName || '')}" /></label>
          <label><span>会社名 *</span><input id="importCompanyName" value="${escapeHtml(item.parsed.companyName || '')}" /></label>
          <label><span>業種 *</span><input id="importIndustry" value="${escapeHtml(item.parsed.industry || '')}" /></label>
          <label><span>相談タイプ *</span>${renderInlineTypeSelect('importConsultationType', item.parsed.consultationType || 'その他')}</label>
          <label class="full"><span>相談内容 *</span><textarea id="importConsultationDetails" rows="4">${escapeHtml(item.parsed.consultationDetails || '')}</textarea></label>
          <label class="full"><span>課題 *</span><textarea id="importCurrentIssues" rows="4">${escapeHtml(item.parsed.currentIssues || '')}</textarea></label>
          <label class="full"><span>提案内容 *</span><textarea id="importProposalSummary" rows="3">${escapeHtml(item.parsed.proposalSummary || '')}</textarea></label>
          <label class="full"><span>次回宿題 *</span><textarea id="importNextActions" rows="3">${escapeHtml(item.parsed.nextActions || '')}</textarea></label>
          <label class="full"><span>要約 *</span><textarea id="importSummaryOverview" rows="4">${escapeHtml(item.parsed.summary?.overview || '')}</textarea></label>
          <label><span>業種タグ</span><input id="industryTagsEdit" value="${escapeHtml((item.parsed.tags?.industryTags || []).join(','))}" /></label>
          <label><span>課題タグ</span><input id="issueTagsEdit" value="${escapeHtml((item.parsed.tags?.issueTags || []).join(','))}" /></label>
          <label><span>施策タグ</span><input id="actionTagsEdit" value="${escapeHtml((item.parsed.tags?.actionTags || []).join(','))}" /></label>
          <label><span>成果タグ（空可）</span><input id="resultTagsEdit" value="${escapeHtml((item.parsed.tags?.resultTags || []).join(','))}" /></label>
        </div>
        <div class="button-row">
          <button id="reanalyzeBtn">抽出再実行</button>
        </div>
      </article>
    </div>
  `;
}

function renderInlineTypeSelect(id, value) {
  return `<select id="${id}">${consultationTypeCandidates
    .map((type) => `<option value="${escapeHtml(type)}" ${value === type ? 'selected' : ''}>${escapeHtml(type)}</option>`)
    .join('')}</select>`;
}

function pushImportItem(name, rawText) {
  const item = {
    id: crypto.randomUUID(),
    name,
    rawText,
    parsed: createEmptyRecord(),
    status: 'pending',
    errorMessage: '',
  };
  state.importQueue.push(item);
  if (state.importIndex === -1) state.importIndex = 0;
}

function extractStructured(rawText) {
  const draft = createEmptyRecord();
  draft.sourceType = 'imported';
  draft.rawText = rawText;
  const lines = rawText.split(/\n+/);
  lines.forEach((line) => {
    const [k, ...rest] = line.split(':');
    const val = rest.join(':').trim();
    switch (k.trim()) {
      case '相談日':
        draft.consultationDate = val;
        break;
      case '相談者名':
        draft.clientName = val;
        break;
      case '会社名':
        draft.companyName = val;
        break;
      case '業種':
        draft.industry = val;
        break;
      case '相談内容':
        draft.consultationDetails = val;
        break;
      case '課題':
      case '現在の課題':
        draft.currentIssues = val;
        break;
      case '提案内容':
        draft.proposalSummary = val;
        break;
      case '次回宿題':
        draft.nextActions = val;
        break;
      default:
        break;
    }
  });
  draft.consultationType = classifyConsultationType(draft);
  return draft;
}

async function analyzeImportItem(item) {
  const parsed = extractStructured(item.rawText || '');
  parsed.summary = await summarizeImportedRecord(parsed);
  parsed.tags = mergeGeneratedTags(parsed.tags, generateTags(parsed.rawText, parsed.industry));
  parsed.consultationType = classifyConsultationType(parsed);
  parsed.rawText = item.rawText;
  item.parsed = parsed;
  item.status = 'pending';
  item.errorMessage = '';
}

function updateCurrentImportFromForm() {
  const item = getCurrentImportItem();
  if (!item) return;
  item.rawText = document.querySelector('#importRawEdit')?.value || item.rawText;
  item.parsed = {
    ...item.parsed,
    rawText: item.rawText,
    consultationDate: document.querySelector('#importConsultationDate')?.value || '',
    clientName: document.querySelector('#importClientName')?.value || '',
    companyName: document.querySelector('#importCompanyName')?.value || '',
    industry: document.querySelector('#importIndustry')?.value || '',
    consultationType: document.querySelector('#importConsultationType')?.value || 'その他',
    consultationDetails: document.querySelector('#importConsultationDetails')?.value || '',
    currentIssues: document.querySelector('#importCurrentIssues')?.value || '',
    proposalSummary: document.querySelector('#importProposalSummary')?.value || '',
    nextActions: document.querySelector('#importNextActions')?.value || '',
    summary: {
      ...(item.parsed.summary || {}),
      overview: document.querySelector('#importSummaryOverview')?.value || '',
    },
    tags: {
      industryTags: parseTagInput('#industryTagsEdit'),
      issueTags: parseTagInput('#issueTagsEdit'),
      actionTags: parseTagInput('#actionTagsEdit'),
      resultTags: parseTagInput('#resultTagsEdit'),
    },
  };
}

function parseTagInput(selector) {
  return (document.querySelector(selector)?.value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

function validateImportRecord(record) {
  const required = [
    record.consultationDate,
    record.clientName,
    record.companyName,
    record.industry,
    record.consultationType,
    record.consultationDetails,
    record.currentIssues,
    record.proposalSummary,
    record.nextActions,
    record.summary?.overview,
  ];
  return required.every((v) => String(v || '').trim()) && String(record.rawText || '').trim();
}

function mergeGeneratedTags(current = {}, generated = {}) {
  return {
    industryTags: [...new Set([...(current.industryTags || []), ...(generated.industryTags || [])])],
    issueTags: [...new Set([...(current.issueTags || []), ...(generated.issueTags || [])])],
    actionTags: [...new Set([...(current.actionTags || []), ...(generated.actionTags || [])])],
    resultTags: [...new Set([...(current.resultTags || [])])],
  };
}

function attachImportEvents() {
  document.querySelector('#addTextImportBtn')?.addEventListener('click', async () => {
    const text = document.querySelector('#rawImportText')?.value || '';
    if (!text.trim()) {
      window.alert('取り込みテキストを入力してください。');
      return;
    }
    pushImportItem(`貼り付け_${new Date().toISOString().slice(11, 19)}`, text);
    await analyzeImportItem(getCurrentImportItem());
    renderImportPage();
  });

  document.querySelector('#textFileInput')?.addEventListener('change', async (e) => {
    const files = [...(e.target.files || [])];
    if (!files.length) return;
    for (const file of files) {
      const text = await file.text();
      pushImportItem(file.name, text);
      const item = state.importQueue[state.importQueue.length - 1];
      await analyzeImportItem(item);
    }
    if (state.importIndex === -1) state.importIndex = 0;
    renderImportPage();
  });

  document.querySelector('#prevImportBtn')?.addEventListener('click', () => {
    updateCurrentImportFromForm();
    state.importIndex = Math.max(0, state.importIndex - 1);
    renderImportPage();
  });

  document.querySelector('#nextImportBtn')?.addEventListener('click', () => {
    updateCurrentImportFromForm();
    state.importIndex = Math.min(state.importQueue.length - 1, state.importIndex + 1);
    renderImportPage();
  });

  document.querySelectorAll('[data-queue-index]').forEach((chip) => {
    chip.addEventListener('click', () => {
      updateCurrentImportFromForm();
      state.importIndex = Number(chip.dataset.queueIndex);
      renderImportPage();
    });
  });

  document.querySelector('#reanalyzeBtn')?.addEventListener('click', async () => {
    updateCurrentImportFromForm();
    const item = getCurrentImportItem();
    if (!item) return;
    await analyzeImportItem(item);
    renderImportPage();
  });

  document.querySelector('#saveImportBtn')?.addEventListener('click', () => {
    updateCurrentImportFromForm();
    const item = getCurrentImportItem();
    if (!item) return;

    const record = {
      ...item.parsed,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      sourceType: 'imported',
      rawText: item.rawText,
      tags: mergeGeneratedTags(item.parsed.tags, {}),
    };

    if (!validateImportRecord(record)) {
      item.status = 'error';
      item.errorMessage = '必須項目（相談日/相談者名/会社名/業種/相談内容/課題/提案内容/次回宿題/要約/原文）を入力してください。';
      window.alert(item.errorMessage);
      renderImportPage();
      return;
    }

    state.records.unshift(record);
    saveRecords(state.records);
    item.status = 'saved';
    item.errorMessage = '';
    state.selectedRecordId = record.id;
    window.alert('取り込み記録を保存しました。');
    renderImportPage();
    renderMainPage();
  });
}

function renderChips(tags = []) {
  return tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join(' ');
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

initNavigation();
renderMainPage();
renderImportPage();
