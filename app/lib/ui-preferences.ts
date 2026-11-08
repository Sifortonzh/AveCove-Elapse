export const uiLanguages = ["zh-CN", "zh-TW", "en", "ja", "ko"] as const;
export type UiLanguage = typeof uiLanguages[number];
export type UiLanguageMode = UiLanguage | "system";
export type ThemeMode = "light" | "dark" | "system";

export function resolveUiLanguage(preference: UiLanguageMode, languages: readonly string[]): UiLanguage {
  if (preference !== "system") return preference;
  for (const value of languages) {
    const lang = value.toLowerCase();
    if (/^zh(?:-|$)/.test(lang)) return /(?:^|-)(?:hant|tw|hk|mo)(?:-|$)/.test(lang) ? "zh-TW" : "zh-CN";
    if (/^en(?:-|$)/.test(lang)) return "en";
    if (/^ja(?:-|$)/.test(lang)) return "ja";
    if (/^ko(?:-|$)/.test(lang)) return "ko";
  }
  return "zh-CN";
}

export function resolveSystemDark(dark: boolean, light: boolean, hour: number) {
  return dark || (!light && (hour >= 23 || hour < 6));
}

export function nextTheme(mode: ThemeMode, dark: boolean): ThemeMode {
  return mode === "system" ? (dark ? "light" : "dark") : mode === "light" ? "dark" : "system";
}

const labels = ["home","banks","wrong","favorites","notes","profile","arena","importBank","sync","syncManage","customAi","legal","vault","back","messages","language","system","search","theme","account","today","studyProgress","practice","start","resume","practiceSettings","sequential","challenge","exam","library","viewBanks","insights","ai","total","done","accuracy","questions","previous","next","answerSheet","settings","confirm","learning","uploads","responses","releases","readAll","close","empty","login","retry","loading","themeLight","themeDark"] as const;
type Label = typeof labels[number];
const translations: Record<UiLanguage, string[]> = {
  "zh-CN": ["首页","我的题库","错题","精选题","我的笔记","个人统计","学习榜单","导入题库","开启多端同步","管理多端同步","自定义 AI","版权、声明与协议","藏经阁","返回","消息","语言","跟随设备","搜索题目","切换主题","同步身份","今日学习","学习进度","练习模式","开始学习","继续学习","练习设置","顺序练习","随机挑战","模拟考试","知识书架","查看题库","学习洞察","AI 学习工作台","题目总数","已完成","正确率","道题","上一题","下一题","答题卡","设置","确认答案","学习区","今日上新","回复赞赏","版本更新","全部已读","关闭","暂无消息","登录后查看","重试","正在加载…","日间","夜间"],
  "zh-TW": ["首頁","我的題庫","錯題","精選題","我的筆記","個人統計","學習排行榜","匯入題庫","開啟跨裝置同步","管理跨裝置同步","自訂 AI","版權、聲明與協議","共享題庫","返回","訊息","語言","跟隨裝置","搜尋題目","切換主題","同步帳號","今日學習","學習進度","練習模式","開始學習","繼續學習","練習設定","順序練習","隨機挑戰","模擬考試","知識書架","查看題庫","學習統計","AI 學習工作台","題目總數","已完成","正確率","題","上一題","下一題","答題卡","設定","確認答案","學習區","今日上新","回覆與讚","版本更新","全部已讀","關閉","暫無訊息","登入後查看","重試","載入中…","日間","夜間"],
  en: ["Home","My banks","Wrong answers","Favorites","My notes","Study stats","Leaderboard","Import banks","Enable sync","Manage sync","Custom AI","Copyright & terms","Shared banks","Back","Notifications","Language","System","Search questions","Change theme","Sync account","Today's study","Progress","Practice modes","Start studying","Resume studying","Practice settings","In order","Random challenge","Mock exam","Library","View banks","Study insights","AI study tools","Total questions","Completed","Accuracy","questions","Previous","Next","Answer sheet","Settings","Check answer","Study panel","New today","Replies & likes","Updates","Mark all as read","Close","No notifications","Sign in to view","Retry","Loading…","Light","Dark"],
  ja: ["ホーム","マイ問題集","間違えた問題","お気に入り","マイノート","学習統計","ランキング","問題集を取り込む","同期を有効にする","同期の管理","AI 設定","著作権・利用規約","共有問題集","戻る","通知","言語","端末に合わせる","問題を検索","テーマ切替","同期アカウント","今日の学習","進捗","練習モード","学習開始","学習を再開","練習設定","順番に練習","ランダム練習","模擬試験","ライブラリ","問題集を見る","学習状況","AI 学習ツール","総問題数","完了","正答率","問","前の問題","次の問題","解答一覧","設定","解答を確認","学習パネル","今日の新着","返信・いいね","更新情報","すべて既読","閉じる","通知はありません","ログインして確認","再試行","読み込み中…","ライト","ダーク"],
  ko: ["홈","내 문제집","오답","즐겨찾기","내 노트","학습 통계","순위표","문제집 가져오기","동기화 켜기","동기화 관리","AI 설정","저작권 및 이용약관","공유 문제집","뒤로","알림","언어","시스템 설정","문제 검색","테마 전환","동기화 계정","오늘의 학습","진행률","연습 모드","학습 시작","학습 이어가기","연습 설정","순서대로 연습","무작위 연습","모의고사","라이브러리","문제집 보기","학습 현황","AI 학습 도구","전체 문제","완료","정답률","문항","이전 문제","다음 문제","답안 목록","설정","정답 확인","학습 패널","오늘의 새 문제집","답글과 좋아요","업데이트","모두 읽음","닫기","알림이 없습니다","로그인 후 확인","다시 시도","불러오는 중…","밝게","어둡게"],
};
export const languageNames: Record<UiLanguage, string> = { "zh-CN": "简体中文", "zh-TW": "繁體中文", en: "English", ja: "日本語", ko: "한국어" };
export const systemLanguageNames: Record<UiLanguage, string> = { "zh-CN": "跟随系统", "zh-TW": "跟隨系統", en: "System", ja: "システム", ko: "시스템" };
export function uiText(language: UiLanguage): Record<Label, string> {
  return Object.fromEntries(labels.map((key, i) => [key, translations[language][i] || translations["zh-CN"][i]])) as Record<Label, string>;
}

export const homeDetails = {
  "zh-CN": { bankResults: "题库搜索结果", summary: "AI 解析", source: "原题解析", related: "同类考点", tryAi: "去体验", blog: "访问作者博客", examNote: "随机挑战最多 20 题，模拟考试最多 100 题。仅从普通练习已确认作答的题中按章节比例抽取，交卷后独立评分。", importShort: "导入" },
  "zh-TW": { bankResults: "題庫搜尋結果", summary: "AI 解析", source: "原題解析", related: "相關考點", tryAi: "試用", blog: "造訪作者部落格", examNote: "隨機挑戰最多 20 題，模擬考試最多 100 題。按章節比例抽取已確認作答的題目，交卷後獨立計分。", importShort: "匯入" },
  en: { bankResults: "Bank search results", summary: "AI explanation", source: "Source explanation", related: "Related topics", tryAi: "Try it", blog: "Author's blog", examNote: "Random challenges have up to 20 questions and mock exams up to 100. Questions are sampled by chapter from confirmed practice answers and scored separately.", importShort: "Import" },
  ja: { bankResults: "問題集の検索結果", summary: "AI 解説", source: "原典の解説", related: "関連項目", tryAi: "試す", blog: "作者のブログ", examNote: "ランダム練習は最大20問、模擬試験は最大100問です。通常練習で解答済みの問題を章ごとに抽出し、提出後に別集計します。", importShort: "取り込む" },
  ko: { bankResults: "문제집 검색 결과", summary: "AI 해설", source: "원문 해설", related: "관련 주제", tryAi: "사용해 보기", blog: "작성자 블로그", examNote: "무작위 연습은 최대 20문항, 모의고사는 최대 100문항입니다. 일반 연습에서 답을 확정한 문항을 장별로 추출하고 별도로 채점합니다.", importShort: "가져오기" },
} as const;

export const homeQuotes = [
  { title: "黑发不知勤学早，白首方悔读书迟。", source: "颜真卿《劝学》" },
  { title: "纸上得来终觉浅，绝知此事要躬行。", source: "陆游《冬夜读书示子聿》" },
  { title: "旧书不厌百回读，熟读深思子自知。", source: "苏轼《送安惇秀才失解西归》" },
  { title: "少年辛苦终身事，莫向光阴惰寸功。", source: "杜荀鹤《题弟侄书堂》" },
  { title: "读书破万卷，下笔如有神。", source: "杜甫《奉赠韦左丞丈二十二韵》" },
  { title: "及时当勉励，岁月不待人。", source: "陶渊明《杂诗》" },
  { title: "问渠那得清如许？为有源头活水来。", source: "朱熹《观书有感》" },
] as const;
export function dailyQuoteIndex(date: Date) {
  const days = Math.floor(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000);
  return ((days % homeQuotes.length) + homeQuotes.length) % homeQuotes.length;
}
