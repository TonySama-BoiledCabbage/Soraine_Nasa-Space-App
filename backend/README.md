# Flame in Freefall 后端入口

结构沿用 Impact Watch：从含 `index.html` 的项目根目录运行，仅用 Python 标准库。

```powershell
python -m backend check                          # 校验 scenarios.json、页面脚本引用、import map
python -m backend build ..\flame-release          # 生成 Vercel 发布目录（含 vercel.json）
python -m backend build ..\flame-static --host static
```

- `contracts.py`：校验场景数据契约（slug 唯一、必须有 earth、颜色/角度范围、flame 五个字段、每条 fact 必须带 `src`），以及 `index.html`、`kitchen/*.js` 引用的文件都存在。
- `release.py`：显式白名单复制公开文件，并删掉 `main.js` 末尾的 `window.__kitchen` 调试句柄。**新增运行时文件必须加入 `FILES`。**
- `science/`：离线算法占位。火焰形态目前是 `scenarios.json` 里的示意参数（schematic），不是计算结果；换成数据驱动时在 `__main__.py` 的 `JOBS` 注册脚本。
- `data/scenarios.json` 的 `facts[].src` 只有三种语义：具体来源名、`schematic`（示意）、`unverified`（未验证）。前端会把后两种显示成标签。

## 材料检索连接（PR #8）

`research-source.js` 提供 `research.search(query, {filters, limit})`：POST 同源 `/api/material-search`，原样返回材料、证据、原始行引用与来源。例：`research.search('月球 Nomex', {filters: {gravity: 'moon'}, limit: 5})`。错误含 `status`、`code`、`retryAfter`；超时 12 秒，相同请求共享并缓存 60 秒，最多 20 条。

本地使用 `serve.py`，Vercel 使用 `vercel.json` rewrite，均转发至 `https://soraine-dashboard-334840303039.us-central1.run.app/api/material-search`，不需要浏览器凭据。普通静态服务器不提供此接口，物品本地研究记录仍可使用。后端源码由[队友 PR #8](https://github.com/goodenough7000/Soraine_Nasa-Space-App/pull/8)维护，不在此复制第二份服务。

当前仅 keyword 检索，未配置 AI。接口最多返回每种材料 10 条证据，`totalEvidenceCount` 为总数；界面继续展示本地完整记录，不能用检索前 10 条覆盖。BigQuery / snapshot 按响应标识，不能将示意燃烧反应解释为研究预测。端到端连接已实测，未在此重新发布前端。

从工作区根目录执行 `node outputs/local-review/check-material-search.cjs` 检查请求契约、并发共享、缓存、限流和断网恢复；`node outputs/local-review/check-material-search-live.cjs` 启动临时预览，用 Chrome 实测物品详情 → 本地转发 → Cloud Run，验证无匹配、400 错误和离线时本地记录保留（需要联网，Python 路径可用 `SEARCH_TEST_PYTHON` 指定）。

## 材料反应运行

材料反应在浏览器内运行，不需要新后台服务。核心为 `kitchen/material-reactions.js`，材料配置为 `material-profiles.js`，场景适配为 `reaction-visuals.js`。三个文件都已加入发布白名单。按样品实例保存状态，不根据检索接口的实验数值直接生成点火阈值；实现、限制及检查命令见根目录 `MATERIAL_REACTION_PLAN.md`。

## 地表模型

`models/planet_surfaces/{moon,mars}.glb` 来自 Tony 的 Blender 脚本 `generate_surfaces.py`（原件在 `Flame_in_Freefall_2026/09_assets/frontend_models/planet_surfaces`）。重新生成后同名替换即可。
`scenarios.json` 的 `terrain.offset` 是厨房在该地块上的落点：对每个 GLB 做 0.5 m 网格高度搜索，取厨房占地内高度起伏最小、无岩石、尽量居中的位置。换了模型要重算。
前端在加载时把每块地形切成约 8 m 的瓦片，相机视锥外的瓦片不绘制；只在当前或目标场景用到时显示该星球地形。
