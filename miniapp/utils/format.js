function fmt(score) {
  if (score >= 0) return '+' + score;
  return String(score);
}

function cls(score) {
  if (score > 0) return 'win';
  if (score < 0) return 'lose';
  return '';
}

function esc(s) {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmtTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}小时${m}分${s}秒`;
  return `${m}分${s}秒`;
}

function groupTxs(txs) {
  const groups = [];
  for (const tx of txs) {
    const last = groups[groups.length - 1];
    const diff = last ? tx.timestamp - last.items[last.items.length - 1].timestamp : Infinity;
    if (diff <= 60000) {
      last.items.push(tx);
    } else {
      groups.push({ time: tx.timestamp, items: [tx] });
    }
  }
  return groups;
}

function randomName() {
  const adj = ['低调', '疯狂', '冷静', '无敌', '神秘', '幸运', '暴躁', '佛系'];
  const noun = ['老千', '荷官', '赌神', 'king', '玩家', '高手', '菜鸟', '素人'];
  return adj[Math.floor(Math.random() * adj.length)] + noun[Math.floor(Math.random() * noun.length)];
}

// 头像颜色
const COLORS = ['#e94560', '#4ecca3', '#3498db', '#f39c12', '#9b59b6', '#1abc9c', '#e74c3c', '#2ecc71'];

module.exports = { fmt, cls, esc, fmtTime, fmtDuration, groupTxs, randomName, COLORS };
