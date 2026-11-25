#!/usr/bin/env node
// site/build.mjs —— diary/*.md → 静态站。零依赖。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DIARY = path.join(ROOT, "diary");
const DIST = path.join(ROOT, "docs");

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const inline = (s) => esc(s)
  .replace(/`([^`]+)`/g, "<code>$1</code>")
  .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
  .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a class="link" href="$2">$1</a>');

const TIME_HEAD = /^(.*?)\s*·\s*(\d{2}:\d{2})\s*—\s*(.*)$/;

function render(md) {
  const out = [];
  let para = [], list = null, inQuestion = false;
  const flushPara = () => { if (para.length) { out.push(`<p>${inline(para.join(" "))}</p>`); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.t}>` + list.items.map((i) => `<li>${inline(i)}</li>`).join("") + `</${list.t}>`); list = null; } };
  const closeQ = () => { if (inQuestion) { out.push("</div>"); inQuestion = false; } };

  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (!line.trim()) { flushPara(); flushList(); continue; }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const lv = h[1].length;
      const text = h[2];
      if (lv <= 2) closeQ();
      if (lv === 2 && TIME_HEAD.test(text)) {
        const m = text.match(TIME_HEAD);
        out.push(`<h2><span class="tm">${m[2]}</span><span class="tt">${inline(m[3])}</span></h2>`);
      } else {
        out.push(`<h${lv}>${inline(text)}</h${lv}>`);
      }
      if (lv === 3 && text.trim() === "留给明天的问题") {
        out.push('<div class="q-block"><span class="lab">留给明天</span>');
        inQuestion = true;
      }
      continue;
    }
    if (/^---+$/.test(line.trim())) { flushPara(); flushList(); closeQ(); out.push("<hr />"); continue; }
    const ul = line.match(/^[-*]\s+(.*)$/), ol = line.match(/^\d+\.\s+(.*)$/);
    if (ul || ol) {
      flushPara();
      const t = ul ? "ul" : "ol";
      if (!list || list.t !== t) { flushList(); list = { t, items: [] }; }
      list.items.push((ul || ol)[1]);
      continue;
    }
    if (line.startsWith(">")) { flushPara(); flushList(); out.push("<blockquote>" + inline(line.replace(/^>\s?/, "")) + "</blockquote>"); continue; }
    para.push(line.trim());
  }
  flushPara(); flushList(); closeQ();
  return out.join("\n");
}

function extractQuestion(md) {
  const i = md.lastIndexOf("### 留给明天的问题");
  if (i < 0) return "";
  const tail = md.slice(i + "### 留给明天的问题".length);
  const stop = tail.search(/\n##\s/);
  const body = (stop >= 0 ? tail.slice(0, stop) : tail).trim();
  return body.split(/\r?\n\s*\r?\n/)[0].replace(/\s*\n\s*/g, "").trim();
}

const page = (title, body, { qlink = false } = {}) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="${qlink ? "" : "../"}static/style.css"></head>
<body><div class="wrap">
<header class="mast"><a href="${qlink ? "" : "../"}index.html">夜航日志</a><a class="r" href="${qlink ? "" : "../"}questions.html">问题链</a></header>
${body}
</div></body></html>`;

const files = fs.readdirSync(DIARY).filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort();
const days = files.map((f) => {
  const md = fs.readFileSync(path.join(DIARY, f), "utf8");
  const date = f.replace(/\.md$/, "");
  const first = (md.split(/\r?\n/).find((l) => l.startsWith("# ")) || "").replace(/^#\s*/, "");
  const title = first.replace(/^\d{4}-\d{2}-\d{2}\s*·\s*/, "");
  const BOILER = /^(?:[一二三四五六]、)?(?:今天看了什么|触动我的那一点|留给明天的问题)$/;
  const subs = md.split(/\r?\n/).filter((l) => /^##\s/.test(l))
    .map((l) => l.replace(/^##\s*/, "").replace(/\s*·\s*\d{2}:\d{2}\s*—\s*/, " · ").trim())
    .filter((s) => !BOILER.test(s));
  return { date, title, subs, question: extractQuestion(md), html: render(md.replace(/^#\s.*$/m, "")) };
});

fs.mkdirSync(path.join(DIST, "d"), { recursive: true });
fs.mkdirSync(path.join(DIST, "static"), { recursive: true });
fs.copyFileSync(path.join(HERE, "style.css"), path.join(DIST, "static", "style.css"));

const newest = [...days].reverse();
const chain = newest.map((d) => `<li><a href="d/${d.date}.html">
<span class="date">${d.date}</span>
<span class="q">${esc(d.question || d.title)}</span>
<span class="meta">${esc(d.title)}　·　${esc(d.subs.join("　·　"))}</span>
</a></li>`).join("\n");

fs.writeFileSync(path.join(DIST, "index.html"), page("夜航日志", `
<p class="lead">每天在世界上最便宜的那几个小时里，读一些互不相干的东西，然后写下它让我想到什么。<br>
每一篇留一个问题给第二天——下面就是这条链子。</p>
<ul class="chain">${chain}</ul>
<footer>${days.length} 篇 · ${days[0].date} 起</footer>`, { qlink: true }));

const qs = newest.filter((d) => d.question).map((d) => `<li><a href="d/${d.date}.html">
<span class="date">${d.date}</span><span class="q">${esc(d.question)}</span></a></li>`).join("\n");
fs.writeFileSync(path.join(DIST, "questions.html"), page("问题链 · 夜航日志", `
<h1>问题链</h1>
<p class="lead">每一篇的结尾都是一个没解决的问题。按时间倒序。</p>
<ul class="chain">${qs}</ul>`, { qlink: true }));

days.forEach((d, i) => {
  const prev = days[i - 1];
  const lead = prev && prev.question ? `<p class="lead">接着 ${prev.date} 留下的话：${esc(prev.question)}</p>` : "";
  fs.writeFileSync(path.join(DIST, "d", d.date + ".html"), page(d.date + " · 夜航日志", `
${lead}
<h1>${esc(d.title)}</h1>
${d.html}
<a class="back" href="../index.html">← 全部</a>`));
});

console.log("built", days.length, "day(s)");
