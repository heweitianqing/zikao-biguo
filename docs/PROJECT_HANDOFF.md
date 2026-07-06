# 自考必过舱项目交接文档

本文用于在其他电脑上继续开发、补题和维护。项目是上海自考、上海电机学院、数字媒体艺术（专升本）的个人备考 PWA。

## 当前定位

- 项目名称：自考必过舱
- 形态：Vite + React + TypeScript 的网页/PWA
- 仓库：`git@github.com:heweitianqing/zikao-biguo.git`
- 当前远程使用 SSH 443 地址：`ssh://git@ssh.github.com:443/heweitianqing/zikao-biguo.git`
- 目标用户：自己备考使用，优先保证实用、可刷题、可复盘、可继续补真题。

## 已完成功能

- 多课程支持：
  - `15040` 习近平新时代中国特色社会主义思想概论
  - `15043/03708` 中国近现代史纲要
  - `15044/03709` 马克思主义基本原理
  - `14265` 数字媒体艺术概论
  - `13511` 多媒体技术与应用
- 刷题：
  - 支持单选、多选、简答、论述。
  - 客观题自动判题。
  - 简答、论述支持本地关键词估分。
  - 每题显示参考要点、解析、题型、分值、难度、来源。
  - 每题可标记“收藏难题”“再背一遍”“已掌握”，标记只保存在浏览器本地。
- 交卷报告：
  - 显示卷面得分、折算分、是否过 60 分线。
  - 按题型统计得分。
  - 按章节显示薄弱点。
  - 支持从报告回跳错题。
- 错题本：
  - 自动收集最近一次判题中未满分的题。
  - 支持按科目、题型、章节筛选。
  - 显示累计失分和优先复盘章节。
  - 错题列表显示题目标记，便于区分收藏题、待背题和已掌握题。
  - 可按当前筛选生成错题重刷卷。
- 学习进度：
  - 每门课显示判题进度、已交卷数、待复盘数、待导入真题数、最近一次分数。
  - “本课下一步”自动排出继续未完成卷、复盘错题、开刷新卷、补齐最新真题。
  - 学习页显示章节掌握度总览：每章已刷题数、得分率、最近失分和最近判题时间。
  - 学习页显示最近 7 天学习日历、今天判题数、连续学习天数和累计学习天数。
  - 设置页可填写目标考试日，学习页按本地日期显示倒计时。
- 真题时间轴：
  - 按课程列出可刷卷和待导入真题索引。
  - 显示进行中、上次分数、待复盘、待导入等状态。
  - 本地导入卷会覆盖同课程、同年份、同考期的待补索引，避免重复显示。
- 资源与真题补齐：
  - 资源页包含课程来源、历年真题入口、检索词和待补矩阵。
  - 点击待导入真题可预填制卷信息。
  - 支持 JSON 导入/导出本地题库。
  - 支持备份全部导入卷。
  - 支持删除单套本地导入卷。
- 粘贴文本制卷：
  - 从网页、PDF OCR、Word 复制题目文本后可自动解析成试卷。
  - 支持逐题答案、卷尾统一答案、卷尾答案及解析。
  - 支持简答题/论述题卷尾按题号写参考要点。
  - 导入前有预览。
  - 显示题干区、答案/解析区、题目块数、答案记录数和解析记录数，方便排查 OCR 错位。
  - 可校正整卷满分、单题分值、答案、解析。
  - 可按题型批量设置单选、多选、简答、论述题分值，并同步整卷满分。
  - 预览页会提示缺答案、缺解析、解析过短、主观要点过短、选项不足、答案越界、分值异常和满分不一致。
  - 可下载预览 JSON。
- AI 评价：
  - 设置页可填写 DeepSeek API Key。
  - 设置页可自定义 DeepSeek 模型名，默认 `deepseek-chat`，为空时自动回退默认模型。
  - 简答题和论述题可点 AI 评价。
  - AI 评价结果会按题目保存在浏览器本地，回到题目时自动回显；如果答案已改，会提示“基于上次答案”。
  - 未填写 Key 时使用本地估分、命中要点、可能漏点和下一步背诵建议。
- 内置真题扩展包：
  - 应用启动时异步加载 `src/data/generatedPastPapers.ts`。
  - 当前已接入公共课真题扩展包 19 套、195 题。
  - 覆盖习概 2025 年 4 月/10 月与 2026 年 4 月主观题，马原 2022-2026 多套选择/主观题，近代史 2022-2025 多套主观题与部分选择题。
  - 生成来源和缺口记录在 `materials/past-papers/`。
- 旧年份预览题整理：
  - 自考生网 2016-2021 马原/近代史公开预览题已整理成结构化草稿。
  - 当前草稿为 24 套、360 题，保存在 `materials/past-papers/structured/zikaosw-preview-bank.json`。
  - 已通过华夏大地教育网、安徽自考365、江苏自考网、浙江自考网、诚为径教育公开页交叉补齐全部 24 套预览题共 360 道答案。
  - 资源页可一键导入“旧年份预览题练习包”，导入后进入本地导入卷，可开刷、导出、校正或删除。
  - 这些题仍不自动混入正式真题包；每套只有 15 道公开预览题，等待找到完整 PDF 后再升级。
- PWA：
  - 有 manifest、图标和 service worker。
  - 可安装到桌面或手机主屏。
  - 基础资源支持离线打开。

## 当前题库状态

- 内置题目以官方考试计划和大纲为基础进行训练化整理。
- 高频强化卷属于模拟训练题，不冒充历年真题。
- 内置题库当前覆盖公共课、数媒概论、计算机的核心概念、客观题、简答和论述。
- 历年真题目前采用“内置已整理包 + 索引 + 本地导入”的方式：
  - 已整理的公共课资料会生成到 `src/data/generatedPastPapers.ts`，打开应用即可刷。
  - 尚未补齐答案、权限或题文的资料只保留来源索引，不强行放进正式刷题入口。
  - 旧年份 24 套预览题可在资源页手动导入为本地练习包；它们是预览练习，不按完整卷统计。
  - 下载或复制到本地的题文，可以通过资源页的“粘贴文本制卷”转成本地可刷试卷。
  - 本地导入数据保存在浏览器 localStorage，不会自动提交到仓库。
- 当前生成题库统计：
  - 习概 `15040`：4 套、68 题。
  - 马原 `15044/03709`：8 套、69 题。
  - 近代史 `15043/03708`：7 套、58 题。
  - 合计：19 套、195 题，正式刷题题库缺答案数为 0。

## 主要文件

- `src/App.tsx`：主应用、页面视图、刷题逻辑、资源页、错题本、报告、AI 评价。
- `src/App.css`：主界面响应式样式。
- `src/data/questionBank.ts`：课程、资料来源、真题索引、内置题库、导入模板。
- `src/data/generatedPastPapers.ts`：由本地真题资料生成的内置真题扩展包。
- `src/data/zikaoswPreviewBank.ts`：由旧年份公开预览题生成的懒加载练习包，资源页手动导入。
- `src/types.ts`：课程、试卷、题目、答题记录等类型。
- `src/utils/paperParser.ts`：粘贴文本制卷解析器。
- `src/utils/scoring.ts`：判题、估分、状态标签。
- `src/utils/storage.ts`：localStorage 读写、导入题库存储。
- `public/manifest.webmanifest`：PWA manifest。
- `public/sw.js`：离线缓存 service worker。
- `materials/past-papers/README.md`：真题资料来源、已下载文件、生成流程和缺口说明。
- `materials/past-papers/structured/generated-import-bank.json`：生成题库的结构化中间文件。
- `materials/past-papers/structured/zikaosw-preview-bank.json`：自考生网旧年份公开预览题草稿，当前 24 套、360 题，其中 360 道已有公开交叉答案。
- `materials/past-papers/tools/build-generated-bank.py`：从本地 PDF/ZIP 等资料生成应用题库的脚本。
- `materials/past-papers/tools/build-zikaosw-preview-bank.mjs`：从旧网页题文和答案抓取结果生成预览题草稿的脚本。
- `materials/past-papers/tools/build-zikaosw-preview-app-bank.mjs`：把预览题草稿转成前端可懒加载的数据包。
- `materials/past-papers/index/source-gaps.json`：已验证但暂时无法直接入库的来源缺口。
- `materials/past-papers/index/zikaosw-answer-queue.json`：旧年份答案抓取队列，后续需要自考生网搜题包或可用查看次数。
- `materials/past-papers/index/zikaosw-access-check.json`：自考生网登录态验证记录，不含 Cookie 和账号信息。
- `materials/past-papers/index/public-answer-overrides.json`：公开页面答案交叉补齐表，目前已包含近代史、马原 2016-2021 共 24 套旧年份预览题的前 15 道答案。

## 在其他电脑继续开发

推荐先配置 GitHub SSH key。如果普通 22 端口不可用，可以继续使用 SSH 443。

```bash
git clone ssh://git@ssh.github.com:443/heweitianqing/zikao-biguo.git
cd zikao-biguo
pnpm install
pnpm dev
```

常用检查：

```bash
pnpm check:bank
pnpm lint
pnpm build
```

更新旧年份预览题练习包：

```bash
pnpm build:preview-bank
```

当前项目已统一使用 pnpm。`package.json` 声明了 `pnpm@11.7.0`，仓库只保留 `pnpm-lock.yaml`，不要提交 `package-lock.json`、`yarn.lock`、`.pnp.*` 或 `.yarn/`。

常规开发流程：

```bash
git status -sb
pnpm lint
pnpm build
git add .
git commit -m "你的提交说明"
git push
```

如果换电脑后想带走自己浏览器里的本地导入真题：

1. 在旧电脑应用的资源页点“备份全部导入卷”。
2. 把下载的 JSON 文件带到新电脑。
3. 新电脑打开应用资源页，选择 JSON 文件导入。

## 真题导入格式

推荐粘贴结构：

```text
一、单项选择题
1. 题干（ ）
A. 选项
B. 选项
C. 选项
D. 选项

二、简答题
5. 简述某个知识点。

参考答案：
1.B
5. 答案：第一要点；第二要点；第三要点。解析：这里写易错点。
```

导入预览后重点检查：

- 科目、年份、考期、试卷名。
- 整卷满分是否是 100。
- 每题分值是否符合真题。
- 客观题答案是否识别正确。
- 简答/论述参考要点是否拆分清楚。
- 解析是否为空或混入下一题。

## 后续想做的功能

优先级高：

- 批量补充公共课历年真题：
  - 马原 `15044/03709`
  - 近代史 `15043/03708`
  - 习概 `15040`
- 校对新生成的 19 套真题扩展包：
  - 核对题干是否被 PDF 换行/OCR 切断。
  - 核对选择题选项和答案是否一一对应。
  - 核对简答/论述题评分要点是否拆分合理。
  - 对回忆版资料增加“需人工校对”标识或质量标签。
  - 已新增 `pnpm check:bank`，会扫描正式扩展包和旧年份预览练习包里的缺答案、题型标题、页眉页脚和广告噪声。
- 批量补充 `13511` 多媒体技术与应用真题或高质量模拟卷。
- 继续处理旧年份资料：
  - 2016-2021 马原/近代史公开页只有预览题，答案入口登录后仍提示需要搜题包/可用次数。
  - 当前已从公开网页交叉补齐 360 道预览题答案；这些题仍只是每套前 15 道预览题，后续继续优先找完整真题 PDF 或完整公开题文。
  - 拿到自考生网 Cookie 且账号具备搜题包次数后，可用 `ZIKAOSW_COOKIE=... node materials/past-papers/tools/fetch-zikaosw-answers.mjs` 批量拉取答案。
  - 如果从其他公开页面找到答案，可先补 `materials/past-papers/index/public-answer-overrides.json`，再运行预览题生成脚本合并。
  - 抓到答案后运行 `node materials/past-papers/tools/build-zikaosw-preview-bank.mjs` 合并答案，检查 `structured/zikaosw-preview-bank.json`。
  - 中国自考资料网 2016-2026 打包页需要登录/购买，已记录在 `source-gaps.json`。
- 继续增强“导入质量检查”：
  - 标出疑似题干被页眉页脚或广告污染。
  - 标出重复题号、重复题干或题号跳跃。
  - 给每条质量问题增加一键跳转。
  - 支持导入前批量过滤明显噪声段落。
优先级中：

- 增强 AI 评价：
  - 让 AI 按评分点逐条打勾。
  - 增加“帮我重写满分答案”。
- 增加移动端体验细节：
  - 刷题页题号抽屉。
  - 底部固定判题/下一题按钮。
  - 手势切题。

优先级低：

- 增加导入题库的云同步。
- 增加多套主题皮肤。
- 增加打印错题/导出 PDF。
- 增加完整考试模式倒计时。
- 增加题目搜索。
- 增加错题间隔复习算法。

## 当前注意事项

- 不要把来源不明、版权状态不清的完整第三方真题直接硬编码进仓库；未确认的资料先放索引和缺口记录。
- 可以把自己的本地整理题库通过导入 JSON 使用；如果要提交进仓库，最好确认来源和授权。
- DeepSeek API Key 只保存在浏览器本地。
- localStorage 数据清空后，答题记录和本地导入卷会消失；重要导入卷要先备份。
- 后续如果改 `Paper`、`Question` 类型，记得同步修改导入模板、解析器、localStorage 兼容逻辑。

## 最近提交

- `a187ebf` feat: 修改
- `1a93bcc` Allow score correction for pasted papers
- `ab2cc18` Parse subjective answers from pasted papers
- `0c02cd0` Add course study queue
- `b2d40c7` Add course progress overview
- `b8f1925` Expand media art drill bank
