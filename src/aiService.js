const issueTagDictionary = ['集客', '販路開拓', '値上げ', '新商品', 'SNS', 'リピート', 'ブランディング', '価格設定', '人手不足', '資金繰り', '営業', 'DX'];
const actionTagDictionary = ['Instagram', 'チラシ', 'LP', 'EC', 'イベント', 'BtoB提案', '商品改善', '導線改善', '値上げ訴求', 'ターゲット再設定'];
const resultTagDictionary = ['売上増', '客数増', '契約率改善', '客単価改善', 'リピート率改善'];

export const consultationTypeCandidates = ['集客', '販路開拓', '値上げ', '新商品開発', 'ブランディング', 'SNS運用', 'リピート対策', '営業改善', '資金繰り', '人手不足', 'DX', 'その他'];

function toKeywords(text) {
  return [...new Set((text || '').replace(/[\n、。,.]/g, ' ').split(/\s+/).filter((w) => w.length >= 2))];
}

function normalizeRecordInput(input = {}) {
  return {
    id: input.id,
    consultationDate: input.consultationDate || '',
    clientName: input.clientName || '',
    companyName: input.companyName || '',
    industry: input.industry || '',
    productFeatures: input.productFeatures || '',
    valueProposition: input.valueProposition || '',
    targetCustomer: input.targetCustomer || '',
    consultationDetails: input.consultationDetails || '',
    currentIssues: input.currentIssues || '',
    desiredDirection: input.desiredDirection || '',
    proposalSummary: input.proposalSummary || '',
    nextActions: input.nextActions || '',
    notes: input.notes || '',
    rawText: input.rawText || '',
    consultationType: input.consultationType || 'その他',
    tags: {
      industryTags: input.tags?.industryTags || [],
      issueTags: input.tags?.issueTags || [],
      actionTags: input.tags?.actionTags || [],
      resultTags: input.tags?.resultTags || [],
    },
  };
}

function toTime(dateText) {
  const t = new Date(dateText || '').getTime();
  return Number.isNaN(t) ? 0 : t;
}

// AI差し替えポイント1: 相談入力 -> AI提案オブジェクト
export async function generateConsultationAdvice(input) {
  const normalized = normalizeRecordInput(input);
  const issueText = `${normalized.consultationDetails} ${normalized.currentIssues}`;
  const actions = generateTags(issueText, normalized.industry).actionTags;

  return {
    situationSummary: `${normalized.companyName || '対象企業'}は「${normalized.industry || '未設定業種'}」で、現状は${normalized.currentIssues || '課題整理が必要です'}。`,
    issueAnalysis: `相談内容から、${normalized.desiredDirection || '目標設定'}に対して「顧客導線」「価値訴求」「実行体制」の再整理が必要です。`,
    topPriorities: ['顧客ターゲットの優先順位を再定義する', '短期で成果確認できる施策を2件実行する', '次回までの検証指標を決める'],
    quickActions: ['既存顧客ヒアリングを3件実施', '訴求メッセージを1ページで統一', ...(actions[0] ? [`${actions[0]}施策を試験導入`] : [])],
    midTermStrategies: ['主力商品の収益構造を見直し', '販路別に提案資料を整備'],
    differentiationIdeas: ['競合比較表を作り、強みを見える化', '実績ストーリーを提案資料に組み込む'],
    copyIdeas: ['強みが伝わる、選ばれる理由を明確に。', '顧客の不安を減らす一歩先の提案を。'],
    homework: ['売上・件数・単価の3指標を次回までに整理', '見込み顧客ペルソナを2種類作成'],
    consultationSummary: `${normalized.consultationDetails || '相談内容'}を基に、短期施策と中期戦略を同時設計する提案です。`,
  };
}

// AI差し替えポイント2: 取り込み記録 -> 要約オブジェクト
export async function summarizeImportedRecord(input) {
  const normalized = normalizeRecordInput(input);
  const body = normalized.rawText || normalized.consultationDetails;
  const excerpt = body.slice(0, 150);
  return {
    overview: excerpt || '取り込み内容の概要を入力してください。',
    keyIssues: normalized.currentIssues || '課題候補を抽出してください。',
    proposalPoints: normalized.proposalSummary || '提案要点を整理してください。',
    nextCheckpoints: normalized.nextActions || '次回確認事項を設定してください。',
  };
}

// AI差し替えポイント3: テキスト -> タグオブジェクト
export function generateTags(inputText = '', industry = '') {
  const text = `${inputText} ${industry}`;
  return {
    industryTags: industry ? [industry] : [],
    issueTags: issueTagDictionary.filter((tag) => text.includes(tag)),
    actionTags: actionTagDictionary.filter((tag) => text.includes(tag)),
    resultTags: resultTagDictionary.filter((tag) => text.includes(tag)),
  };
}

// AI差し替えポイント4: 相談内容 -> 相談タイプ
export function classifyConsultationType(input) {
  const normalized = normalizeRecordInput(input);
  const text = `${normalized.consultationDetails} ${normalized.currentIssues} ${normalized.desiredDirection} ${normalized.notes} ${normalized.proposalSummary}`;

  const rules = [
    ['SNS運用', ['SNS', 'Instagram']],
    ['リピート対策', ['リピート', '再来店', '会員']],
    ['販路開拓', ['販路', 'BtoB', '新規取引']],
    ['値上げ', ['値上げ', '価格改定']],
    ['新商品開発', ['新商品', '新メニュー', '開発']],
    ['ブランディング', ['ブランド', '差別化', '認知']],
    ['営業改善', ['営業', '提案力', '商談']],
    ['資金繰り', ['資金繰り', 'キャッシュ', '融資']],
    ['人手不足', ['人手不足', '採用', '人材']],
    ['DX', ['DX', 'デジタル', 'システム']],
    ['集客', ['集客', '来店', '問い合わせ']],
  ];

  for (const [type, keywords] of rules) {
    if (keywords.some((k) => text.includes(k))) return type;
  }
  return 'その他';
}

// AI差し替えポイント5: 類似理由生成（説明文の一元化）
export function explainSimilarityReason(context) {
  const reasons = [];
  if (context.sameType && context.consultationType) reasons.push(`相談タイプが${context.consultationType}で一致`);
  if (context.sameIndustry && context.industry) reasons.push(`同じ${context.industry}業`);
  if (context.matchedIssueTags?.length) reasons.push(`課題タグが${context.matchedIssueTags.join('・')}で一致`);
  if (context.matchedActionTags?.length) reasons.push(`施策タグが${context.matchedActionTags.join('・')}で一致`);
  if (context.keywordMatches?.length) reasons.push(`相談内容のキーワード「${context.keywordMatches.slice(0, 3).join('・')}」が近い`);

  if (reasons.length) return reasons.join('、');
  if (context.industryDifferent) return '業種は異なるが、相談内容の傾向が近い';
  return '相談内容に共通点があります';
}

// AI差し替えポイント6: 現在案件 + 保存案件配列 -> 類似案件配列
export function findSimilarCases(currentCase, savedCases) {
  const current = normalizeRecordInput(currentCase);
  const currentText = `${current.consultationDetails} ${current.productFeatures} ${current.valueProposition} ${current.targetCustomer}`;
  const currentKeywords = toKeywords(currentText);

  return savedCases
    .filter((record) => record.id !== currentCase.id)
    .map((record) => {
      const candidate = normalizeRecordInput(record);
      let score = 0;

      const sameType = !!(current.consultationType && candidate.consultationType && current.consultationType === candidate.consultationType);
      if (sameType) score += 20;

      const sameIndustry = !!(current.industry && current.industry === candidate.industry);
      if (sameIndustry) score += 20;

      const matchedIssueTags = candidate.tags.issueTags.filter((t) => current.tags.issueTags.includes(t));
      if (matchedIssueTags.length) score += Math.min(20, matchedIssueTags.length * 10);

      const matchedActionTags = candidate.tags.actionTags.filter((t) => current.tags.actionTags.includes(t));
      if (matchedActionTags.length) score += Math.min(20, matchedActionTags.length * 10);

      const candidateText = `${candidate.consultationDetails} ${candidate.productFeatures} ${candidate.valueProposition} ${candidate.targetCustomer}`;
      const candidateKeywords = toKeywords(candidateText);
      const keywordMatches = currentKeywords.filter((k) => candidateKeywords.includes(k));
      if (keywordMatches.length) score += Math.min(20, keywordMatches.length * 3);

      return {
        record,
        score: Math.min(100, Math.round(score)),
        similarityReason: explainSimilarityReason({
          sameType,
          consultationType: candidate.consultationType,
          sameIndustry,
          industry: candidate.industry,
          matchedIssueTags,
          matchedActionTags,
          keywordMatches,
          industryDifferent: !!(current.industry && candidate.industry && current.industry !== candidate.industry),
        }),
        consultationDateTs: toTime(candidate.consultationDate),
      };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.consultationDateTs - a.consultationDateTs;
    })
    .slice(0, 5)
    .map(({ consultationDateTs, ...rest }) => rest);
}
