const STORAGE_KEY = "keiei_soudan_records_v3";

const GOOGLE_CLIENT_ID = "143268570956-6gkgv6efumfbqa5kue0mr2u6e2hoqghe.apps.googleusercontent.com";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const DRIVE_FILENAME = "keiei_soudan_records.json";

const MASTER = {
  industries: [
    "製造", "卸売", "小売", "飲食", "宿泊", "サービス", "建設", "不動産", "運輸",
    "医療", "福祉", "教育", "IT", "デザイン", "士業", "観光", "農業", "食品加工",
    "生活サービス", "文化娯楽", "その他"
  ],
  topics: [
    "売上拡大", "集客", "販路開拓", "新商品", "新サービス", "ブランディング", "SNS", "PR",
    "値上げ", "利益改善", "リピート", "ターゲット整理", "強み整理", "創業", "事業承継",
    "補助金", "資金繰り", "採用", "業務改善", "DX", "その他"
  ],
  categories: ["相談記録", "議事録", "調査メモ", "参考事例", "アイデア", "提案メモ"],
  recordTypes: ["面談", "電話", "オンライン", "訪問", "自主調査", "参考事例", "Web情報"]
};

const state = {
  seedRecords: [],
  userRecords: [],
  records: [],
  selectedSimilarId: null,
  currentPage: "mainPage",
  editingRecordId: null,
  webResearchCache: {},
  webModelResults: [],
  webTrendResults: [],
  webQueryInfo: ""
};

const driveState = {
  accessToken: null,
  tokenClient: null
};

const speechState = {
  recognition: null,
  activeTargetId: null,
  isListening: false
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
  return escapeHtml(str ?? "").replace(/\n/g, "<br>");
}

function uniqueId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeText(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join(" / ");
  return String(value ?? "").trim();
}

function selectOptions(options, selected = "", includeBlank = true) {
  const head = includeBlank ? `<option value="">選択してください</option>` : "";
  return head + options.map((v) =>
    `<option value="${escapeHtml(v)}" ${selected === v ? "selected" : ""}>${escapeHtml(v)}</option>`
  ).join("");
}

function normalizeRecord(record = {}, source = "json") {
  return {
    id: record.id || uniqueId(),
    source: record.source || source,
    createdAt: record.createdAt || new Date().toISOString(),
    updatedAt: record.updatedAt || record.createdAt || new Date().toISOString(),

    companyName: safeText(record.companyName),
    industry: safeText(record.industry),
    topic: safeText(record.topic),
    category: safeText(record.category),
    recordType: safeText(record.recordType),

    issue: safeText(record.issue),
    notes: safeText(record.notes),
    advice: safeText(record.advice),
    result: safeText(record.result),
    nextAction: safeText(record.nextAction),
    meetingLog: safeText(record.meetingLog),

    content: safeText(record.content),

    summary: safeText(record.summary),
    problem: safeText(record.problem),
    approach: safeText(record.approach),
    proposal: safeText(record.proposal),
    resultDetail: safeText(record.resultDetail),
    learning: safeText(record.learning),
    tags: safeText(record.tags),
    memo: safeText(record.memo)
  };
}

async function loadSeedRecords() {
  try {
    const res = await fetch("src/cases_full.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`load error ${res.status}`);
    const data = await res.json();
    state.seedRecords = ensureArray(data).map((r) => normalizeRecord(r, "json"));
  } catch (e) {
    console.error("cases_full.json 読込失敗", e);
    state.seedRecords = [];
  }
}

function loadUserRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    state.userRecords = ensureArray(parsed).map((r) => normalizeRecord(r, "local"));
  } catch (e) {
    console.error("localStorage 読込失敗", e);
    state.userRecords = [];
  }
}

function saveUserRecords() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.userRecords));
}

function syncRecords() {
  state.records = [...state.seedRecords, ...state.userRecords];
}

function getRecordSummary(record) {
  return (
    record.summary ||
    record.issue ||
    record.problem ||
    record.proposal ||
    record.content ||
    record.notes ||
    record.meetingLog ||
    record.memo ||
    ""
  );
}

function getRecordProblem(record) {
  return record.problem || record.issue || record.content || "";
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[、。,.!！?？/\\()\[\]「」『』【】・:：;；]/g, " ")
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractKeywords(record) {
  const words = tokenize([
    record.companyName,
    record.industry,
    record.topic,
    record.summary,
    record.issue,
    record.problem,
    record.approach,
    record.proposal,
    record.result,
    record.resultDetail,
    record.learning,
    record.tags,
    record.notes,
    record.advice,
    record.nextAction,
    record.meetingLog,
    record.memo,
    record.content
  ].join(" "));

  const stopWords = new Set([
    "する", "して", "いる", "ある", "こと", "ため", "よう", "です", "ます",
    "相談", "内容", "提案", "課題", "検討", "実施", "改善", "強化", "向上"
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

function detectCategoryFromText(record) {
  const text = [
    record.topic,
    record.industry,
    record.summary,
    record.issue,
    record.problem,
    record.approach,
    record.proposal,
    record.tags,
    record.notes,
    record.advice,
    record.result,
    record.nextAction,
    record.meetingLog,
    record.memo,
    record.content
  ].join(" ").toLowerCase();

  if (/創業|開業|起業/.test(text)) return "創業";
  if (/売上|集客|販促|広告|sns|インスタ|pr|認知/.test(text)) return "集客・販促";
  if (/価格|値上げ|粗利|利益/.test(text)) return "価格・利益";
  if (/商品|サービス|ブランド|新商品|新サービス/.test(text)) return "商品・サービス";
  if (/採用|人材|教育|定着/.test(text)) return "人材";
  if (/補助金|融資|資金繰り|資金/.test(text)) return "資金";
  if (/業務|dx|効率|オペレーション/.test(text)) return "業務改善";
  return "経営全般";
}

function getDraftRecord() {
  return normalizeRecord({
    id: state.editingRecordId || uniqueId(),
    companyName: getEl("mainCompanyName")?.value || "",
    industry: getEl("mainIndustry")?.value || "",
    topic: getEl("mainTopic")?.value || "",
    issue: getEl("mainIssue")?.value || "",
    notes: getEl("mainNotes")?.value || "",
    advice: getEl("mainAdvice")?.value || "",
    result: getEl("mainResult")?.value || "",
    nextAction: getEl("mainNextAction")?.value || "",
    meetingLog: getEl("mainMeetingLog")?.value || "",
    summary: getEl("mainIssue")?.value || "",
    problem: getEl("mainIssue")?.value || "",
    memo: getEl("mainNotes")?.value || ""
  }, "draft");
}

function similarityScore(a, b) {
  let score = 0;
  if (a.industry && b.industry && a.industry === b.industry) score += 3;
  if (a.topic && b.topic && a.topic === b.topic) score += 3;
  if (detectCategoryFromText(a) === detectCategoryFromText(b)) score += 2;

  const aWords = new Set(extractKeywords(a));
  const bWords = new Set(extractKeywords(b));
  for (const w of aWords) {
    if (bWords.has(w)) score += 1;
  }
  return score;
}

function findSimilarRecords(target, limit = 5) {
  return state.records
    .filter((r) => r.id !== target.id)
    .map((r) => ({ ...r, _score: similarityScore(target, r) }))
    .filter((r) => r._score > 0)
    .sort((a, b) => b._score - a._score)
    .slice(0, limit);
}

function buildResourcePoints(record) {
  const items = [];
  if (record.companyName) items.push(`対象企業は「${record.companyName}」`);
  if (record.industry) items.push(`業種は「${record.industry}」`);
  if (record.topic) items.push(`相談テーマは「${record.topic}」`);
  if (record.notes) items.push("相談員メモから現場感のある材料がある");
  if (record.advice) items.push("助言内容まで入力されている");
  if (!items.length) items.push("入力情報がまだ少ないため、追加ヒアリング余地がある");
  return items.slice(0, 5);
}

/* ===== 事業構造整理 ===== */

function inferBusinessStructure(record) {
  const text = [
    record.industry,
    record.topic,
    record.issue,
    record.notes,
    record.advice,
    record.result,
    record.memo,
    record.content,
    record.tags
  ].join(" ").toLowerCase();

  let businessType = record.industry ? `${record.industry}事業` : "事業内容の整理が必要";
  let offer = "提供商品・サービスの具体化が必要";
  let customer = "主要顧客の明確化が必要";
  let revenueModel = "収益構造の整理が必要";
  let strengths = "強み・差別化ポイントの整理が必要";

  if (/宿泊|ホテル|旅館|民宿|ゲストハウス/.test(text)) {
    businessType = "宿泊事業";
    offer = "宿泊体験・滞在価値・地域滞在の機会を提供";
    customer = "観光客、出張客、週末旅行層";
    revenueModel = "宿泊料金を中心に、付帯サービスや体験商品の追加販売";
    strengths = "立地、滞在体験、食事、接客、季節プランの差別化が重要";
  } else if (/飲食|レストラン|居酒屋|カフェ|食堂/.test(text)) {
    businessType = "飲食事業";
    offer = "食事・空間・接客を組み合わせた飲食体験を提供";
    customer = "地域住民、来店客、観光客、リピーター候補";
    revenueModel = "店内飲食、テイクアウト、物販、コース・イベント販売";
    strengths = "看板商品、世界観、立地、接客、写真映え、口コミ導線";
  } else if (/小売|販売|物販|店舗|ec|通販/.test(text)) {
    businessType = "小売・物販事業";
    offer = "商品選定や見せ方を通じて購買価値を提供";
    customer = "来店客、既存顧客、EC利用者、ギフト需要";
    revenueModel = "商品の販売差益、セット販売、定期購入、関連商品の追加販売";
    strengths = "品揃え、専門性、提案力、ストーリー、独自仕入れ";
  } else if (/製造|加工|工場|OEM|ODM/.test(text)) {
    businessType = "製造事業";
    offer = "製品・部品・加工技術を提供";
    customer = "法人取引先、メーカー、卸先、特定業界の企業";
    revenueModel = "受注生産、継続取引、OEM供給、加工賃";
    strengths = "技術力、品質、対応力、小ロット、多品種、短納期";
  } else if (/美容|サロン|整体|エステ|治療院/.test(text)) {
    businessType = "施術・美容サービス事業";
    offer = "施術やケアによる身体・美容・気分面の価値を提供";
    customer = "個人顧客、継続来店見込み客、悩みを持つ特定層";
    revenueModel = "単発利用、回数券、定期来店、物販";
    strengths = "専門性、安心感、結果実感、接客、紹介導線";
  } else if (/教育|講座|スクール|教室|研修/.test(text)) {
    businessType = "教育・講座事業";
    offer = "知識習得、技術習得、変化実感の機会を提供";
    customer = "学びたい個人、保護者、企業、初心者層";
    revenueModel = "受講料、継続講座、会員制、教材販売";
    strengths = "教え方、専門性、成果実感、継続性、世界観";
  } else if (/士業|コンサル|支援|アドバイス/.test(text)) {
    businessType = "専門サービス事業";
    offer = "専門知識を活かした課題解決支援を提供";
    customer = "課題を抱える事業者、個人、継続支援先";
    revenueModel = "相談料、顧問契約、スポット支援、成果連動";
    strengths = "専門性、信頼性、実績、伴走力、提案力";
  } else if (/観光|体験|ツアー|地域資源/.test(text)) {
    businessType = "観光・体験事業";
    offer = "地域資源を活かした体験価値を提供";
    customer = "観光客、家族、カップル、来訪者";
    revenueModel = "体験料金、物販、セット販売、予約販売";
    strengths = "地域性、非日常感、写真映え、季節性、ストーリー";
  } else if (/it|システム|アプリ|ソフト|web/.test(text)) {
    businessType = "IT・デジタルサービス事業";
    offer = "システム・アプリ・Web機能による効率化や利便性を提供";
    customer = "法人顧客、事業者、利用者、特定業界";
    revenueModel = "初期導入費、月額課金、保守契約、追加開発";
    strengths = "機能性、使いやすさ、サポート、専門性、改善速度";
  }

  if (record.topic === "集客" || record.topic === "売上拡大") {
    customer = `${customer}。特に「誰を増やしたいか」の整理が重要`;
  }
  if (record.topic === "新商品" || record.topic === "新サービス") {
    offer = `${offer}。新しい提供価値の設計余地あり`;
  }
  if (record.topic === "値上げ" || record.topic === "利益改善") {
    revenueModel = `${revenueModel}。単価・粗利・商品構成の見直し余地あり`;
  }
  if (record.topic === "ブランディング" || record.topic === "強み整理") {
    strengths = `${strengths}。選ばれる理由の言語化が重要`;
  }

  return {
    businessType,
    offer,
    customer,
    revenueModel,
    strengths
  };
}

function buildFABE(record) {
  const structure = inferBusinessStructure(record);

  let feature = structure.offer;
  let advantage = structure.strengths;
  let benefit = "顧客にとっての利用価値の具体化が必要";
  let evidence = record.result || record.notes || record.memo || "実績・顧客の声・具体事例の補強が必要";

  if (record.topic === "集客") {
    benefit = "来店・利用のきっかけを作り、比較時に選ばれやすくなる";
  } else if (record.topic === "売上拡大") {
    benefit = "利用頻度・客単価・継続率の向上につながる";
  } else if (record.topic === "販路開拓") {
    benefit = "新しい顧客接点を増やし、売上源の分散につながる";
  } else if (record.topic === "新商品" || record.topic === "新サービス") {
    benefit = "既存顧客の新たな需要を取り込み、比較優位を作りやすい";
  } else if (record.topic === "値上げ" || record.topic === "利益改善") {
    benefit = "価格ではなく価値で選ばれる状態を作り、粗利改善につながる";
  } else if (record.topic === "リピート") {
    benefit = "再来店・再購入の理由を作り、安定収益化しやすくなる";
  } else if (/夏|季節|旬/.test([record.issue, record.notes, record.memo].join(" "))) {
    benefit = "季節需要に合わせた訴求で、利用理由を作りやすい";
  } else {
    benefit = "顧客が選ぶ理由を明確にし、比較時の優位性につながる";
  }

  return { feature, advantage, benefit, evidence };
}

function buildAdviceDirections(record) {
  const results = [];
  const topic = record.topic;
  const industry = record.industry;

  if (topic === "集客" || topic === "売上拡大" || topic === "SNS" || topic === "PR") {
    results.push("ターゲットを絞り、誰に向けた訴求かを明確にする");
    results.push("強みを顧客ベネフィットに言い換えて見せ方を変える");
    results.push("店頭・紹介・SNSの役割分担を整理する");
  }
  if (topic === "値上げ" || topic === "利益改善") {
    results.push("価格ではなく価値の伝え方を先に整える");
    results.push("高粗利商品の比率を上げる導線を検討する");
  }
  if (topic === "新商品" || topic === "新サービス" || topic === "ブランディング") {
    results.push("弱みの言い換えや偏愛の事業化を検討する");
    results.push("競合比較ではなく独自背景を前面に出す");
  }
  if (topic === "販路開拓") {
    results.push("既存市場ではなく別市場への転用可能性を探る");
    results.push("連携先・紹介先・異業種コラボを検討する");
  }
  if (topic === "創業") {
    results.push("小さく試せる商品から始めて反応を確認する");
    results.push("誰のどの悩みを解決するかを先に固定する");
  }
  if (topic === "採用") {
    results.push("仕事内容の魅力をベネフィットで表現する");
    results.push("教育しやすい受入設計を先に考える");
  }
  if (industry === "観光" || industry === "飲食" || industry === "小売" || industry === "宿泊") {
    results.push("体験価値・写真映え・口コミ導線を意識する");
  }
  if (results.length === 0) {
    results.push("リソースの棚卸しから始め、強みを言語化する");
    results.push("ターゲットを狭めて、一番刺さる訴求を試す");
    results.push("今すぐ試せる小さな打ち手を1つ決める");
  }
  return [...new Set(results)].slice(0, 4);
}

function buildNextActions(record) {
  const actions = [];
  if (!record.industry) actions.push("業種を確定する");
  if (!record.topic) actions.push("相談テーマを1つに絞る");
  if (!record.advice) actions.push("今回の助言内容を明文化する");
  actions.push("顧客が選ぶ理由を3つ言語化する");
  actions.push("今すぐ試す施策を1つ決める");
  return [...new Set(actions)].slice(0, 4);
}

function buildMeetingLogText(record) {
  const lines = [
    "■相談概要",
    record.issue || "未入力",
    "",
    "■相談者の主な課題",
    record.issue || "未入力",
    "",
    "■相談員メモ",
    record.notes || "未入力",
    "",
    "■今回の助言",
    record.advice || "未入力",
    "",
    "■相談の成果",
    record.result || "未入力",
    "",
    "■次回相談までの論点",
    record.nextAction || "未入力"
  ];
  return lines.join("\n");
}

/* ===== Google Drive連携 ===== */

function initDriveClient() {
  if (!window.google || !google.accounts || !google.accounts.oauth2) return;

  driveState.tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: DRIVE_SCOPE,
    callback: (response) => {
      if (response && response.access_token) {
        driveState.accessToken = response.access_token;
      }
    }
  });
}

function ensureDriveToken() {
  return new Promise((resolve, reject) => {
    if (driveState.accessToken) {
      resolve(driveState.accessToken);
      return;
    }
    if (!driveState.tokenClient) {
      reject(new Error("Drive認証クライアントが初期化されていません。"));
      return;
    }

    driveState.tokenClient.callback = (response) => {
      if (response && response.access_token) {
        driveState.accessToken = response.access_token;
        resolve(response.access_token);
      } else {
        reject(new Error("Drive認証に失敗しました。"));
      }
    };

    driveState.tokenClient.requestAccessToken({ prompt: "consent" });
  });
}

async function findDriveFileByName(fileName) {
  const token = await ensureDriveToken();
  const escapedName = fileName.replace(/'/g, "\\'");
  const q = encodeURIComponent(`name='${escapedName}' and trashed=false`);

  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,modifiedTime)`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) throw new Error("Drive上の既存ファイル検索に失敗しました。");
  const data = await res.json();
  return (data.files && data.files[0]) || null;
}

async function uploadJsonToDrive(fileName, jsonText, existingFileId = null) {
  const token = await ensureDriveToken();

  const metadata = { name: fileName, mimeType: "application/json" };
  const boundary = "-------314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelim = `\r\n--${boundary}--`;

  const body =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    jsonText +
    closeDelim;

  const url = existingFileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`
    : `https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart`;

  const method = existingFileId ? "PATCH" : "POST";

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Driveへの保存に失敗しました: ${errorText}`);
  }

  return await res.json();
}

async function downloadDriveJsonFile(fileId) {
  const token = await ensureDriveToken();
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` }
  });

  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`Driveからの読込に失敗しました: ${errorText}`);
  }
  return await res.json();
}

async function syncAllDataToDrive() {
  const payload = {
    exportedAt: new Date().toISOString(),
    records: state.records
  };

  const existing = await findDriveFileByName(DRIVE_FILENAME);
  return await uploadJsonToDrive(
    DRIVE_FILENAME,
    JSON.stringify(payload, null, 2),
    existing ? existing.id : null
  );
}

async function loadAllDataFromDrive() {
  const existing = await findDriveFileByName(DRIVE_FILENAME);
  if (!existing) return false;

  const json = await downloadDriveJsonFile(existing.id);
  const driveRecords = ensureArray(json.records).map((r) => normalizeRecord(r, r?.source || "drive"));

  state.userRecords = driveRecords;
  saveUserRecords();
  syncRecords();
  return true;
}

/* ===== Web検索（別タブでGoogleを開く方式） ===== */

function buildBusinessModelQuery(record) {
  const keywordText = extractKeywords(record).slice(0, 3).join(" ");
  const parts = [
    record.industry,
    record.topic,
    keywordText,
    "ビジネスモデル",
    "事例"
  ].filter(Boolean);
  return parts.join(" ");
}

function buildTrendQuery(record) {
  const year = new Date().getFullYear();
  const parts = [
    record.industry,
    record.topic,
    "トレンド",
    "市場動向",
    "最新",
    String(year)
  ].filter(Boolean);
  return parts.join(" ");
}

function openGoogleSearch(query) {
  if (!query || !query.trim()) {
    alert("検索キーワードが不足しています。");
    return;
  }
  const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  window.open(url, "_blank", "noopener,noreferrer");
}

function clearWebSearchResults() {
  state.webModelResults = [];
  state.webTrendResults = [];
  state.webQueryInfo = "";
}

function searchWebModelsOnly() {
  const draft = getDraftRecord();
  const hasInput = draft.industry || draft.topic || draft.issue;
  if (!hasInput) {
    alert("業種・相談テーマ・相談内容のいずれかを入力してください。");
    return;
  }

  const modelQuery = buildBusinessModelQuery(draft);
  state.webQueryInfo = `類似モデル検索語：${modelQuery}`;
  state.webModelResults = [];
  refreshAIProposal();
  openGoogleSearch(modelQuery);
}

function searchWebTrendsOnly() {
  const draft = getDraftRecord();
  const hasInput = draft.industry || draft.topic || draft.issue;
  if (!hasInput) {
    alert("業種・相談テーマ・相談内容のいずれかを入力してください。");
    return;
  }

  const trendQuery = buildTrendQuery(draft);
  state.webQueryInfo = state.webQueryInfo
    ? `${state.webQueryInfo} / トレンド検索語：${trendQuery}`
    : `トレンド検索語：${trendQuery}`;
  state.webTrendResults = [];
  refreshAIProposal();
  openGoogleSearch(trendQuery);
}

function bindWebSearchButtons() {
  const modelBtn = getEl("searchWebModelsBtn");
  if (modelBtn) {
    modelBtn.addEventListener("click", () => {
      searchWebModelsOnly();
    });
  }

  const trendBtn = getEl("searchWebTrendsBtn");
  if (trendBtn) {
    trendBtn.addEventListener("click", () => {
      searchWebTrendsOnly();
    });
  }

  const clearBtn = getEl("clearWebSearchBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      clearWebSearchResults();
      refreshAIProposal();
    });
  }
}

/* ===== 音声入力 ===== */

function getSpeechRecognitionClass() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function updateSpeechButtons() {
  document.querySelectorAll(".speech-btn").forEach((btn) => {
    const target = btn.dataset.target || "";
    if (speechState.isListening && speechState.activeTargetId === target) {
      btn.textContent = "■ 音声停止";
      btn.style.background = "#9a3412";
      btn.style.borderColor = "#9a3412";
      btn.style.color = "#fff";
    } else {
      btn.textContent = "🎤 音声入力";
      btn.style.background = "#fff";
      btn.style.borderColor = "#1f3b64";
      btn.style.color = "#1f3b64";
    }
  });
}

function appendTextToField(fieldId, text) {
  const el = getEl(fieldId);
  if (!el) return;
  const current = el.value.trim();
  el.value = current ? `${current}\n${text}` : text;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

function stopSpeechInput() {
  if (speechState.recognition) speechState.recognition.stop();
  speechState.isListening = false;
  speechState.activeTargetId = null;
  updateSpeechButtons();
}

function startSpeechInput(targetId) {
  const SpeechRecognitionClass = getSpeechRecognitionClass();
  if (!SpeechRecognitionClass) {
    alert("このブラウザでは音声入力に対応していません。Chromeでお試しください。");
    return;
  }

  if (speechState.isListening && speechState.activeTargetId === targetId) {
    stopSpeechInput();
    return;
  }
  if (speechState.isListening) stopSpeechInput();

  const recognition = new SpeechRecognitionClass();
  recognition.lang = "ja-JP";
  recognition.interimResults = true;
  recognition.continuous = true;

  speechState.recognition = recognition;
  speechState.activeTargetId = targetId;
  speechState.isListening = true;
  updateSpeechButtons();

  let finalTranscript = "";

  recognition.onresult = (event) => {
    let interimTranscript = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) finalTranscript += transcript;
      else interimTranscript += transcript;
    }

    const previewEl = getEl("speechStatus");
    if (previewEl) {
      previewEl.textContent = interimTranscript
        ? `音声認識中: ${interimTranscript}`
        : speechState.isListening
          ? "音声認識中..."
          : "";
    }
  };

  recognition.onerror = (event) => {
    console.error("speech error", event);
    const status = getEl("speechStatus");
    if (status) status.textContent = `音声入力エラー: ${event.error || "不明"}`;
    speechState.isListening = false;
    speechState.activeTargetId = null;
    updateSpeechButtons();
  };

  recognition.onend = () => {
    if (finalTranscript.trim()) appendTextToField(targetId, finalTranscript.trim());
    const status = getEl("speechStatus");
    if (status) status.textContent = "";
    speechState.isListening = false;
    speechState.activeTargetId = null;
    updateSpeechButtons();
  };

  recognition.start();
}

/* ===== AI表示 ===== */

function renderSimilarCaseList(similars) {
  if (!similars.length) {
    return `<div class="muted">類似事例はまだ見つかっていません。</div>`;
  }

  if (!state.selectedSimilarId || !similars.some((x) => x.id === state.selectedSimilarId)) {
    state.selectedSimilarId = similars[0].id;
  }

  return `
    <div class="case-list">
      ${similars.map((item) => `
        <button
          type="button"
          class="case-button ${item.id === state.selectedSimilarId ? "active" : ""}"
          data-case-id="${escapeHtml(item.id)}"
        >
          <div><strong>${escapeHtml(item.companyName || "会社名未入力")}</strong></div>
          <div class="muted">${escapeHtml(item.industry || "業種未入力")} / ${escapeHtml(item.topic || detectCategoryFromText(item))}</div>
          <div class="muted">${escapeHtml(getRecordSummary(item).slice(0, 56))}</div>
        </button>
      `).join("")}
    </div>
  `;
}

function renderSimilarCaseDetail(record) {
  if (!record) {
    return `<div class="muted">一覧から事例を選ぶと詳細が出ます。</div>`;
  }

  return `
    <div class="detail-grid">
      <div><strong>会社名：</strong>${escapeHtml(record.companyName || "")}</div>
      <div><strong>業種：</strong>${escapeHtml(record.industry || "")}</div>
      <div><strong>相談テーマ：</strong>${escapeHtml(record.topic || "")}</div>
      <div><strong>相談概要</strong><br>${nl2br(getRecordSummary(record))}</div>
      <div><strong>課題・悩み</strong><br>${nl2br(getRecordProblem(record))}</div>
      <div><strong>助言</strong><br>${nl2br(record.advice || record.proposal || "")}</div>
      <div><strong>成果</strong><br>${nl2br(record.result || record.resultDetail || "")}</div>
      <div><strong>次回メモ</strong><br>${nl2br(record.nextAction || "")}</div>
      <div><strong>議事録</strong><br>${nl2br(record.meetingLog || "")}</div>
      <div><strong>タグ</strong><br>${nl2br(record.tags || "")}</div>
    </div>
  `;
}

function renderBusinessStructure(structure) {
  return `
    <div class="detail-grid">
      <div><strong>事業タイプ</strong><br>${nl2br(structure.businessType)}</div>
      <div><strong>提供価値</strong><br>${nl2br(structure.offer)}</div>
      <div><strong>主な顧客</strong><br>${nl2br(structure.customer)}</div>
      <div><strong>収益構造</strong><br>${nl2br(structure.revenueModel)}</div>
      <div><strong>強み・差別化</strong><br>${nl2br(structure.strengths)}</div>
    </div>
  `;
}

function renderAIProposal() {
  const draft = getDraftRecord();
  const hasInput = draft.companyName || draft.industry || draft.topic || draft.issue || draft.notes || draft.advice;

  if (!hasInput) {
    return `
      <div class="ai-section">
        <div class="ai-block">
          <h4>AI提案</h4>
          <div class="muted">左側に入力すると、ここに相談整理・事業構造整理・FABE・助言方向性・類似事例が表示されます。</div>
        </div>
      </div>
    `;
  }

  const structure = inferBusinessStructure(draft);
  const resourcePoints = buildResourcePoints(draft);
  const fabe = buildFABE(draft);
  const advice = buildAdviceDirections(draft);
  const similars = findSimilarRecords(draft, 5);
  const selected = similars.find((x) => x.id === state.selectedSimilarId) || similars[0] || null;
  const nextActions = buildNextActions(draft);

  return `
    <div class="ai-section">
      <div class="ai-block">
        <h4>① 相談整理</h4>
        <div>${escapeHtml(draft.issue || "相談内容を入力してください")}</div>
      </div>

      <div class="ai-block">
        <h4>② 事業構造整理</h4>
        ${renderBusinessStructure(structure)}
      </div>

      <div class="ai-block">
        <h4>③ リソース抽出</h4>
        <ul>${resourcePoints.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
      </div>

      <div class="ai-block">
        <h4>④ FABE整理</h4>
        <div><strong>F：</strong>${escapeHtml(fabe.feature)}</div>
        <div><strong>A：</strong>${escapeHtml(fabe.advantage)}</div>
        <div><strong>B：</strong>${escapeHtml(fabe.benefit)}</div>
        <div><strong>E：</strong>${escapeHtml(fabe.evidence)}</div>
      </div>

      <div class="ai-block">
        <h4>⑤ 助言方向性</h4>
        <ul>${advice.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
      </div>

      <div class="ai-block">
        <h4>⑥ 類似事例</h4>
        ${renderSimilarCaseList(similars)}
      </div>

      <div class="ai-block">
        <h4>類似事例の詳細</h4>
        ${renderSimilarCaseDetail(selected)}
      </div>

      <div class="ai-block">
        <h4>⑦ Web類似モデル</h4>
        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
          <button id="searchWebModelsBtn" type="button" class="secondary">類似モデル検索</button>
          <button id="searchWebTrendsBtn" type="button" class="secondary">トレンド検索</button>
          <button id="clearWebSearchBtn" type="button" class="secondary">検索結果クリア</button>
        </div>
        <div id="webQueryInfo" class="muted" style="margin-bottom:8px;">${escapeHtml(state.webQueryInfo || "")}</div>
        <div id="webModelsArea">
          <div class="muted">「類似モデル検索」を押すと、別タブでGoogle検索を開きます。</div>
        </div>
      </div>

      <div class="ai-block">
        <h4>⑦-2 Webトレンド</h4>
        <div id="webTrendsArea">
          <div class="muted">「トレンド検索」を押すと、別タブでGoogle検索を開きます。</div>
        </div>
      </div>

      <div class="ai-block">
        <h4>⑧ 次の一手</h4>
        <ul>${nextActions.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>
      </div>
    </div>
  `;
}

/* ===== 履歴 ===== */

function getCompanyHistory(companyName) {
  const name = safeText(companyName);
  if (!name) return [];
  return state.userRecords
    .filter((r) => safeText(r.companyName) === name)
    .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function renderHistoryOptions(companyName) {
  const items = getCompanyHistory(companyName);
  if (!items.length) return `<option value="">履歴なし</option>`;

  return `<option value="">選択してください</option>` + items.map((item) => {
    const label = [
      item.updatedAt ? new Date(item.updatedAt).toLocaleString("ja-JP") : "",
      item.topic || "",
      (item.issue || "").slice(0, 20)
    ].filter(Boolean).join(" / ");

    return `<option value="${escapeHtml(item.id)}">${escapeHtml(label)}</option>`;
  }).join("");
}

function loadMainRecordToForm(recordId) {
  const record = state.userRecords.find((r) => r.id === recordId);
  if (!record) return;

  state.editingRecordId = record.id;
  getEl("mainCompanyName").value = record.companyName || "";
  getEl("mainIndustry").value = record.industry || "";
  getEl("mainTopic").value = record.topic || "";
  getEl("mainIssue").value = record.issue || "";
  getEl("mainNotes").value = record.notes || "";
  getEl("mainAdvice").value = record.advice || "";
  getEl("mainResult").value = record.result || "";
  getEl("mainNextAction").value = record.nextAction || "";
  getEl("mainMeetingLog").value = record.meetingLog || "";

  const saveMsg = getEl("mainSaveMessage");
  if (saveMsg) saveMsg.textContent = "過去相談を読み込みました。追記して保存できます。";

  refreshAIProposal();
}

function refreshHistorySelect() {
  const companyName = getEl("mainCompanyName")?.value || "";
  const historySelect = getEl("mainHistorySelect");
  if (!historySelect) return;

  historySelect.innerHTML = renderHistoryOptions(companyName);

  if (state.editingRecordId && getCompanyHistory(companyName).some((x) => x.id === state.editingRecordId)) {
    historySelect.value = state.editingRecordId;
  } else {
    historySelect.value = "";
  }
}

/* ===== 画面描画 ===== */

function renderMainPage() {
  const mainPage = getEl("mainPage");
  if (!mainPage) return;

  mainPage.innerHTML = `
    <div class="two-column">
      <div class="card">
        <h2>相談入力</h2>
        <div class="form-grid">
          <div>
            <label for="mainCompanyName">会社名</label>
            <input id="mainCompanyName" type="text" placeholder="会社名を入力">
          </div>

          <div>
            <label for="mainHistorySelect">同一会社の過去相談履歴</label>
            <select id="mainHistorySelect">
              <option value="">会社名を入れると履歴が出ます</option>
            </select>
          </div>

          <div>
            <label for="mainIndustry">業種</label>
            <select id="mainIndustry">${selectOptions(MASTER.industries)}</select>
          </div>

          <div>
            <label for="mainTopic">相談テーマ</label>
            <select id="mainTopic">${selectOptions(MASTER.topics)}</select>
          </div>

          <div>
            <label for="mainIssue">相談者発言</label>
            <textarea id="mainIssue" placeholder="相手から言われたこと、相談内容など"></textarea>
            <div style="margin-top:8px;">
              <button type="button" class="secondary speech-btn" data-target="mainIssue">🎤 音声入力</button>
            </div>
          </div>

          <div>
            <label for="mainNotes">相談員メモ</label>
            <textarea id="mainNotes" placeholder="気づいたこと、論点、補足メモなど"></textarea>
            <div style="margin-top:8px;">
              <button type="button" class="secondary speech-btn" data-target="mainNotes">🎤 音声入力</button>
            </div>
          </div>

          <div>
            <label for="mainAdvice">助言内容</label>
            <textarea id="mainAdvice" placeholder="こちらから何を助言したか"></textarea>
            <div style="margin-top:8px;">
              <button type="button" class="secondary speech-btn" data-target="mainAdvice">🎤 音声入力</button>
            </div>
          </div>

          <div>
            <label for="mainResult">相談の成果</label>
            <textarea id="mainResult" placeholder="今回の相談で整理できたこと、決まったこと"></textarea>
          </div>

          <div>
            <label for="mainNextAction">次回相談メモ</label>
            <textarea id="mainNextAction" placeholder="次回までの宿題、次回論点"></textarea>
          </div>

          <div>
            <label for="mainMeetingLog">議事録</label>
            <textarea id="mainMeetingLog" placeholder="議事録生成ボタンで自動作成、手修正も可能"></textarea>
          </div>

          <div id="speechStatus" class="muted"></div>

          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button id="loadDriveBtn" class="secondary" type="button">Drive読込</button>
            <button id="generateMeetingLogBtn" class="secondary" type="button">議事録生成</button>
            <button id="saveMainBtn" class="primary" type="button">保存</button>
            <button id="clearMainBtn" class="secondary" type="button">クリア</button>
          </div>

          <div id="mainSaveMessage" class="success-message"></div>
        </div>
      </div>

      <div class="card">
        <h2>AI提案</h2>
        <div id="aiProposalArea">${renderAIProposal()}</div>
      </div>
    </div>
  `;

  bindMainEvents();
  refreshHistorySelect();
}

function renderSubPage() {
  const subPage = getEl("subPage");
  if (!subPage) return;

  subPage.innerHTML = `
    <div class="card" style="max-width:900px;">
      <h2>サブページ（蓄積用）</h2>
      <div class="form-grid">
        <div>
          <label for="subCompanyName">会社名</label>
          <input id="subCompanyName" type="text" placeholder="会社名を入力">
        </div>

        <div>
          <label for="subIndustry">業種</label>
          <select id="subIndustry">${selectOptions(MASTER.industries)}</select>
        </div>

        <div>
          <label for="subCategory">分類</label>
          <select id="subCategory">${selectOptions(MASTER.categories)}</select>
        </div>

        <div>
          <label for="subTopic">相談テーマ</label>
          <select id="subTopic">${selectOptions(MASTER.topics)}</select>
        </div>

        <div>
          <label for="subRecordType">記録種別</label>
          <select id="subRecordType">${selectOptions(MASTER.recordTypes)}</select>
        </div>

        <div>
          <label for="subContent">内容</label>
          <textarea id="subContent" placeholder="他で調べたこと、参考事例、気づきなど"></textarea>
        </div>

        <div>
          <label for="subTags">タグ</label>
          <input id="subTags" type="text" placeholder="例：価格戦略, 観光, SNS">
        </div>

        <div style="display:flex; gap:8px; flex-wrap:wrap;">
          <button id="saveSubBtn" class="primary" type="button">保存</button>
          <button id="clearSubBtn" class="secondary" type="button">クリア</button>
        </div>

        <div id="subSaveMessage" class="success-message"></div>
      </div>
    </div>
  `;

  bindSubEvents();
}

/* ===== イベント ===== */

function refreshAIProposal() {
  const area = getEl("aiProposalArea");
  if (area) area.innerHTML = renderAIProposal();
  bindSimilarCaseButtons();
  bindWebSearchButtons();
}

function bindMainEvents() {
  [
    "mainCompanyName", "mainIndustry", "mainTopic", "mainIssue", "mainNotes",
    "mainAdvice", "mainResult", "mainNextAction", "mainMeetingLog"
  ].forEach((id) => {
    const el = getEl(id);
    if (!el) return;

    el.addEventListener("input", () => {
      if (id === "mainCompanyName") refreshHistorySelect();
      refreshAIProposal();
    });

    el.addEventListener("change", () => {
      if (id === "mainCompanyName") refreshHistorySelect();
      refreshAIProposal();
    });
  });

  const historySelect = getEl("mainHistorySelect");
  if (historySelect) {
    historySelect.addEventListener("change", () => {
      const recordId = historySelect.value || "";
      if (recordId) loadMainRecordToForm(recordId);
    });
  }

  const loadDriveBtn = getEl("loadDriveBtn");
  if (loadDriveBtn) {
    loadDriveBtn.addEventListener("click", async () => {
      const msg = getEl("mainSaveMessage");
      try {
        if (msg) msg.textContent = "Driveから読込中...";
        const loaded = await loadAllDataFromDrive();
        if (loaded) {
          if (msg) msg.textContent = "Driveから最新データを読込みました。";
          refreshHistorySelect();
          refreshAIProposal();
        } else {
          if (msg) msg.textContent = "Driveに読込対象ファイルがありません。";
        }
      } catch (error) {
        console.error(error);
        if (msg) msg.textContent = "Drive読込に失敗しました。";
      }
    });
  }

  const saveBtn = getEl("saveMainBtn");
  if (saveBtn) saveBtn.addEventListener("click", handleSaveMainRecord);

  const clearBtn = getEl("clearMainBtn");
  if (clearBtn) clearBtn.addEventListener("click", clearMainForm);

  const logBtn = getEl("generateMeetingLogBtn");
  if (logBtn) {
    logBtn.addEventListener("click", () => {
      const draft = getDraftRecord();
      getEl("mainMeetingLog").value = buildMeetingLogText(draft);
      const msg = getEl("mainSaveMessage");
      if (msg) msg.textContent = "議事録を生成しました。必要に応じて修正してください。";
      refreshAIProposal();
    });
  }

  document.querySelectorAll(".speech-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.dataset.target || "";
      if (targetId) startSpeechInput(targetId);
    });
  });

  bindSimilarCaseButtons();
  bindWebSearchButtons();
  updateSpeechButtons();
}

function bindSimilarCaseButtons() {
  document.querySelectorAll(".case-button").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.selectedSimilarId = btn.dataset.caseId || null;
      refreshAIProposal();
    });
  });
}

function bindSubEvents() {
  const saveBtn = getEl("saveSubBtn");
  if (saveBtn) saveBtn.addEventListener("click", handleSaveSubRecord);

  const clearBtn = getEl("clearSubBtn");
  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      ["subCompanyName", "subIndustry", "subCategory", "subTopic", "subRecordType", "subContent", "subTags"]
        .forEach((id) => {
          const el = getEl(id);
          if (el) el.value = "";
        });
      const msg = getEl("subSaveMessage");
      if (msg) msg.textContent = "";
    });
  }
}

/* ===== 保存 ===== */

function clearMainForm() {
  [
    "mainCompanyName", "mainIndustry", "mainTopic", "mainIssue", "mainNotes",
    "mainAdvice", "mainResult", "mainNextAction", "mainMeetingLog"
  ].forEach((id) => {
    const el = getEl(id);
    if (el) el.value = "";
  });

  state.selectedSimilarId = null;
  state.editingRecordId = null;
  clearWebSearchResults();

  const historySelect = getEl("mainHistorySelect");
  if (historySelect) {
    historySelect.innerHTML = `<option value="">会社名を入れると履歴が出ます</option>`;
  }

  const msg = getEl("mainSaveMessage");
  if (msg) msg.textContent = "";

  const speechStatus = getEl("speechStatus");
  if (speechStatus) speechStatus.textContent = "";

  stopSpeechInput();
  refreshAIProposal();
}

async function handleSaveMainRecord() {
  const companyName = safeText(getEl("mainCompanyName")?.value);
  const industry = safeText(getEl("mainIndustry")?.value);
  const topic = safeText(getEl("mainTopic")?.value);
  const issue = safeText(getEl("mainIssue")?.value);
  const notes = safeText(getEl("mainNotes")?.value);
  const advice = safeText(getEl("mainAdvice")?.value);
  const result = safeText(getEl("mainResult")?.value);
  const nextAction = safeText(getEl("mainNextAction")?.value);
  const meetingLog = safeText(getEl("mainMeetingLog")?.value);

  if (!companyName && !issue) {
    alert("会社名または相談者発言を入力してください。");
    return;
  }

  const now = new Date().toISOString();

  const record = normalizeRecord({
    id: state.editingRecordId || uniqueId(),
    companyName,
    industry,
    topic,
    category: "相談記録",
    recordType: "面談",
    issue,
    notes,
    advice,
    result,
    nextAction,
    meetingLog,
    summary: issue,
    problem: issue,
    memo: notes,
    tags: [topic, industry].filter(Boolean).join(", "),
    source: "main",
    updatedAt: now
  }, "main");

  const existingIndex = state.userRecords.findIndex((r) => r.id === record.id);

  if (existingIndex >= 0) {
    const previous = state.userRecords[existingIndex];
    state.userRecords[existingIndex] = {
      ...previous,
      ...record,
      createdAt: previous.createdAt || record.createdAt,
      updatedAt: now
    };
  } else {
    state.userRecords.push(record);
  }

  saveUserRecords();
  syncRecords();
  state.editingRecordId = record.id;

  try {
    await syncAllDataToDrive();
    const msg = getEl("mainSaveMessage");
    if (msg) {
      msg.textContent = existingIndex >= 0
        ? "更新しました（Drive同期済み）。"
        : "保存しました（Drive同期済み）。";
    }
  } catch (error) {
    console.error(error);
    const msg = getEl("mainSaveMessage");
    if (msg) {
      msg.textContent = existingIndex >= 0
        ? "更新は完了。Drive同期は失敗。"
        : "ローカル保存は完了。Drive同期は失敗。";
    }
  }

  refreshHistorySelect();
  refreshAIProposal();
}

async function handleSaveSubRecord() {
  const companyName = safeText(getEl("subCompanyName")?.value);
  const industry = safeText(getEl("subIndustry")?.value);
  const category = safeText(getEl("subCategory")?.value);
  const topic = safeText(getEl("subTopic")?.value);
  const recordType = safeText(getEl("subRecordType")?.value);
  const content = safeText(getEl("subContent")?.value);
  const tags = safeText(getEl("subTags")?.value);

  if (!companyName && !content) {
    alert("会社名または内容を入力してください。");
    return;
  }

  const now = new Date().toISOString();

  const record = normalizeRecord({
    companyName,
    industry,
    category,
    topic,
    recordType,
    content,
    summary: content,
    problem: content,
    notes: content,
    tags,
    source: "sub",
    updatedAt: now
  }, "sub");

  state.userRecords.push(record);
  saveUserRecords();
  syncRecords();

  try {
    await syncAllDataToDrive();
    const msg = getEl("subSaveMessage");
    if (msg) msg.textContent = "保存しました（Drive同期済み）。";
  } catch (error) {
    console.error(error);
    const msg = getEl("subSaveMessage");
    if (msg) msg.textContent = "ローカル保存は完了。Drive同期は失敗。";
  }
}

/* ===== タブ ===== */

function initTabs() {
  const buttons = document.querySelectorAll(".nav-tab");
  const mainPage = getEl("mainPage");
  const subPage = getEl("subPage");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const page = btn.dataset.page;
      state.currentPage = page;

      buttons.forEach((x) => x.classList.remove("active"));
      btn.classList.add("active");

      if (mainPage) mainPage.classList.toggle("active", page === "mainPage");
      if (subPage) subPage.classList.toggle("active", page === "subPage");
    });
  });

  if (mainPage) mainPage.classList.add("active");
  if (subPage) subPage.classList.remove("active");
}

/* ===== 初期化 ===== */

window.addEventListener("DOMContentLoaded", async () => {
  loadUserRecords();
  await loadSeedRecords();
  syncRecords();
  initDriveClient();
  initTabs();
  renderMainPage();
  renderSubPage();

  try {
    await loadAllDataFromDrive();
    renderMainPage();
    renderSubPage();
    const msg = getEl("mainSaveMessage");
    if (msg) msg.textContent = "Driveの最新データを読み込みました。";
  } catch (error) {
    console.error("Drive自動読込スキップ", error);
  }
});
