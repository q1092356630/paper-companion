export const PAPER = {
  id: 'limited-data-demo',
  title: 'Learning from Limited Data',
  subtitle: '小样本条件下的可靠学习',
  totalPages: 12,
};

const sections = [
  ['Abstract', '摘要', 'This demonstration paper explores how repeated evaluation can help us understand the uncertainty of learning from limited data. A simple linear model provides a transparent baseline.', '这篇示例论文讨论如何通过重复评估理解小样本学习中的不确定性，并使用简单的线性模型作为易于解释的基线。'],
  ['1. Introduction', '1. 引言', 'When observations are scarce, the choice of training and test samples can have a substantial influence on a reported result. We therefore distinguish a promising single result from a consistently observed pattern.', '当样本数量有限时，训练和测试样本的选择会显著影响报告的结果。因此，我们区分一次表现良好的结果与重复观察到的稳定规律。'],
  ['2. Evaluation principles', '2. 评估原则', 'A fair comparison uses the same data partitions and evaluation metrics for every method. Test data should remain separate from model selection and training.', '公平比较要求所有方法使用相同的数据划分和评价指标。测试数据应与模型选择及训练过程保持分离。'],
  ['2.1 A transparent baseline', '2.1 可解释的基线', 'We use a linear model to establish a transparent reference point. Its simplicity helps isolate the effect of data splitting, but it does not capture arbitrary nonlinear relationships.', '我们使用线性模型建立易于解释的参照。其简单结构有助于考察数据划分的影响，但无法表达任意非线性关系。'],
  ['3. Experimental setup', '3. 实验设计', '', ''],
  ['4. Results', '4. 结果', 'For each method, performance is reported across repeated train-test splits. The mean describes the observed central tendency, while the standard deviation describes variation between splits.', '对于每种方法，我们报告重复训练—测试划分下的表现。均值描述观察结果的集中趋势，标准差描述不同划分之间的波动。'],
  ['4.1 Comparing methods', '4.1 方法比较', 'An observed difference between two means is not, by itself, evidence of a reliable improvement. A comparison must also consider variability, sample size, and whether the evaluation conditions are comparable.', '两个均值之间的差异本身并不能证明改进可靠。比较还需要考虑波动、样本量，以及评价条件是否具有可比性。'],
  ['4.2 Robustness', '4.2 稳健性', 'Repeated splits assess sensitivity to the allocation of available observations. They do not replace evaluation on genuinely independent datasets or under different collection conditions.', '重复划分用于评估模型对现有样本分配的敏感程度，不能替代在真正独立的数据集或不同采集条件下进行的评价。'],
  ['5. Limitations', '5. 局限性', 'This example does not establish that a model will generalize to new populations or domains. Small datasets and a linear baseline limit the conclusions that can be drawn.', '这个示例并不能证明模型可以推广到新的人群或领域。较小的数据集和线性基线模型限制了可得出的结论。'],
  ['6. Discussion', '6. 讨论', 'Evaluation should communicate what is known and what remains uncertain. Reporting repeated results alongside the experimental conditions makes the analysis easier to interpret and reproduce.', '评价应说明哪些结论已有依据，哪些问题仍存在不确定性。将重复实验结果与实验条件一起报告，有助于理解和复现分析。'],
  ['7. Conclusion', '7. 结论', 'Repeated data splits help assess the variability of an evaluation. Reliable interpretation also requires independent validation and transparent reporting of the experimental conditions.', '重复划分数据有助于评估结果的波动。可靠的解释还需要独立验证，并透明报告实验条件。'],
  ['Reading notes', '阅读说明', 'This document and its figure are synthetic examples created to demonstrate a reading interface. They are not a published study and should not be used as research evidence.', '本文及图表是用于演示阅读界面的虚构示例，并非已发表研究，不应作为科研证据引用。'],
];

export const getSection = (page) => sections[page - 1];
export const selectedText = '重复划分数据有助于评估结果的波动。';
export const initialMessages = [
  { id: 'intro-question', role: 'user', text: '为什么需要重复划分训练集？' },
  { id: 'intro-answer', role: 'assistant', text: '用来观察不同样本划分造成的结果波动，避免把一次偶然结果当成稳定结论。', quote: 'Repeated data splits help assess the variability of an evaluation.', page: 5, resolved: true },
];

export function demoAnswer(question, currentPage) {
  const q = question.toLowerCase();
  if (/非线性|线性|公式|权重|xw|baseline/.test(q)) return { text: '示例使用线性模型 y = Xw + b：X 是输入特征，w 是权重，b 是偏置。它便于解释，但不能表达任意非线性关系；这是方法的局限之一。', page: 4, resolved: true };
  if (/泛化|推广|其他数据|其它数据|局限|独立|稳定性是否/.test(q)) return { text: '重复划分能检验现有样本中的结果波动，但无法直接证明跨数据集的泛化能力。还需要在独立数据集上验证；这篇示例没有提供这样的证据。', page: 9, resolved: true };
  if (/图|标准差|误差|均值|波动|划分|重复|为什么|解释|总结|核心/.test(q)) return { text: '这段的核心是：一次训练—测试划分可能偶然有利于某个方法。重复划分后报告平均表现与标准差，能同时看到结果水平和波动。图 2 的误差线表示示例中的标准差，不能直接当作置信区间。', page: 5, resolved: true };
  return { text: '这个问题已记下。当前为示例问答，还没有连接 AI 模型，无法可靠回答这个新问题；生成卡片时会将它放入“尚未解决”，方便之后继续讨论。', page: currentPage, resolved: false };
}

export function createCard(messages, notes, existing) {
  const qa = [];
  messages.forEach((message, index) => {
    if (message.role !== 'user') return;
    const answer = messages[index + 1];
    qa.push({ question: message.text, answer: answer?.role === 'assistant' ? answer.text : '待继续讨论', page: answer?.page, resolved: answer?.resolved === true });
  });
  return {
    id: PAPER.id,
    title: PAPER.title,
    subtitle: PAPER.subtitle,
    savedAt: existing?.savedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    conclusion: existing?.conclusion || '重复划分数据有助于评估结果的波动；理解模型表现时，应同时关注平均水平、稳定性和验证范围。',
    method: existing?.method || '使用线性模型作为基线，在多次训练—测试划分下报告平均表现和标准差。',
    limitations: existing?.limitations || '小样本及线性模型限制了结论范围；重复划分不能替代独立数据集验证。',
    insight: existing?.insight || '',
    suggestion: '在自己的实验中，可以同时报告多次数据划分的均值与波动，避免仅依据单次实验下结论。',
    qa,
    notes,
    sources: [...new Set(qa.filter(x => x.resolved && x.page).map(x => x.page))].sort((a,b) => a-b),
  };
}

export function cardMarkdown(card) {
  return `# ${card.title}\n\n${card.subtitle}\n\n> 示例文献 · 示例问答整理，非已发表研究\n> 保存时间：${new Date(card.updatedAt).toLocaleString('zh-CN')}\n\n## 一句话结论\n${card.conclusion}\n\n## 论文要点\n- 方法：${card.method}\n- 局限：${card.limitations}\n\n## 我的问题与理解\n${card.qa.filter(q=>q.resolved).map(q=>`### ${q.question}\n${q.answer}\n\n原文：第 ${q.page} 页`).join('\n\n')}\n\n## 尚未解决\n${card.qa.filter(q=>!q.resolved).map(q=>`- ${q.question}`).join('\n') || '- 当前讨论中没有未回答的问题。'}\n\n## 我的想法\n${card.insight || '尚未填写。'}\n\n## AI 建议 · 待确认\n${card.suggestion}\n\n## 阅读批注\n${card.notes.map(n=>`- 第 ${n.page} 页：${n.text}${n.comment ? `\n  我的想法：${n.comment}` : ''}`).join('\n') || '无'}\n`;
}
