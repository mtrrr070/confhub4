/**
 * Серверная защита от спама для Google Apps Script (Web App, который принимает форму сайта).
 * Клиентская защита (скрытое поле, скорость заполнения, пауза) обходится прямым POST-запросом
 * на адрес скрипта, поэтому те же проверки нужны и здесь.
 *
 * Как подключить: откройте скрипт таблицы → вставьте этот код вместо старого doPost
 * (если колонки в таблице другие — поправьте массив в appendRow) →
 * «Развернуть» → «Управление развертываниями» → «Изменить» → «Новая версия» → «Развернуть».
 */
const SHEET_NAME      = "";   // пусто = первый лист таблицы
const MAX_PER_10_MIN  = 30;   // общий предохранитель от флуда
const DUP_WINDOW_SEC  = 600;  // одна и та же почта — не чаще раза в 10 минут

function isSpam_(d) {
  if (d.hp_check) return "honeypot";                       // бот заполнил скрытое поле
  if (!(Number(d.elapsed) >= 3000)) return "too fast";     // форма заполнена быстрее 3 секунд
  if (!d.name || !d.email || !d.phone) return "empty";
  if (String(d.name).length > 120 || String(d.email).length > 120 ||
      String(d.company || "").length > 150 || String(d.position || "").length > 150) return "too long";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) return "bad email";
  if (String(d.phone).replace(/\D/g, "").length !== 11) return "bad phone";
  if (/https?:\/\/|www\./i.test([d.name, d.company, d.position].join(" "))) return "links";
  return "";
}

// Защита от «формул» в ячейках (=, +, -, @ в начале строки)
function safe_(v) {
  v = String(v == null ? "" : v).slice(0, 200);
  return /^[=+\-@]/.test(v) ? "'" + v : v;
}

function out_(status) {
  return ContentService.createTextOutput(JSON.stringify({ status: status }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    let d;
    try { d = JSON.parse(e.postData.contents); } catch (err) { return out_("bad request"); }

    if (isSpam_(d)) return out_("ignored");                // тихо игнорируем, подробности боту не отдаём

    const cache = CacheService.getScriptCache();
    const dupKey = "dup_" + String(d.email).toLowerCase();
    if (cache.get(dupKey)) return out_("duplicate");
    const n = Number(cache.get("count") || 0);
    if (n >= MAX_PER_10_MIN) return out_("busy");
    cache.put(dupKey, "1", DUP_WINDOW_SEC);
    cache.put("count", String(n + 1), 600);

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sh = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
    sh.appendRow([
      safe_(d.createdAt), safe_(d.name), safe_(d.email), safe_(d.phone),
      safe_(d.company), safe_(d.position), safe_(d.days), safe_(d.format), safe_(d.lang)
    ]);
    return out_("ok");
  } finally {
    lock.releaseLock();
  }
}
