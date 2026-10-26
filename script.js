"use strict";

/* ===== Настройки ===== */
// Дата начала конференции (Алматы, UTC+5)
const EVENT_DATE = new Date("2026-10-30T10:00:00+05:00");
// Адрес, куда отправляются данные формы (PHP, Google Apps Script, Formspree и т.п.).
// Пока пусто — заявка сохраняется локально в браузере (режим демо).
const FORM_ENDPOINT = "https://script.google.com/macros/s/AKfycbzEKcBIVDILJk6HocCkUCMuod1xIuFNWsMmhL13OrXxLgaJmSuJzmE4N6dyQmfBYWBi/exec";
// Телефон, который показывается в сообщении об ошибке отправки
const CONTACT_PHONE = "+7 (701) 427-88-11";

/* ===== Язык: ru / kk / en (тексты — в i18n.js) ===== */
let currentLang = "ru";
function tr(key, params) {
  const dict = window.I18N[currentLang] || {};
  let text = dict[key] ?? window.I18N.ru[key] ?? key;
  for (const k in params || {}) text = text.replace("{" + k + "}", params[k]);
  return text;
}

/* ===== Меню ===== */
const menu = document.getElementById("menu");
document.getElementById("burger").addEventListener("click", () => menu.classList.toggle("open"));
menu.addEventListener("click", e => { if (e.target.tagName === "A") menu.classList.remove("open"); });

/* ===== Таймер ===== */
const tEls = { d: t("t-d"), h: t("t-h"), m: t("t-m"), s: t("t-s") };
function t(id) { return document.getElementById(id); }
function tick() {
  let diff = Math.max(0, EVENT_DATE - new Date());
  const d = Math.floor(diff / 864e5); diff %= 864e5;
  const h = Math.floor(diff / 36e5);  diff %= 36e5;
  const m = Math.floor(diff / 6e4);   diff %= 6e4;
  tEls.d.textContent = d;
  tEls.h.textContent = String(h).padStart(2, "0");
  tEls.m.textContent = String(m).padStart(2, "0");
  tEls.s.textContent = String(Math.floor(diff / 1000)).padStart(2, "0");
}
tick();
setInterval(tick, 1000);

/* ===== Вкладки программы ===== */
document.querySelectorAll(".tab").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(b => b.classList.toggle("active", b === btn));
    document.querySelectorAll(".schedule").forEach(s => { s.hidden = s.id !== btn.dataset.day; });
  });
});

/* ===== Маска телефона +7 (XXX) XXX-XX-XX ===== */
const phone = document.getElementById("phone");
phone.addEventListener("input", () => {
  let digits = phone.value.replace(/\D/g, "");
  if (digits.startsWith("8")) digits = "7" + digits.slice(1);
  if (!digits.startsWith("7")) digits = "7" + digits;
  digits = digits.slice(0, 11);
  const p = digits.slice(1);
  let out = "+7";
  if (p.length) out += " (" + p.slice(0, 3);
  if (p.length >= 3) out += ")";
  if (p.length > 3) out += " " + p.slice(3, 6);
  if (p.length > 6) out += "-" + p.slice(6, 8);
  if (p.length > 8) out += "-" + p.slice(8, 10);
  phone.value = out;
});

/* ===== Валидация ===== */
const form = document.getElementById("regForm");
const msg = document.getElementById("formMsg");
const btn = document.getElementById("submitBtn");

const rules = {
  // правило возвращает true или ключ текста ошибки из i18n.js
  name:    v => v.trim().split(/\s+/).length >= 2 || "err.name",
  email:   v => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) || "err.email",
  phone:   v => v.replace(/\D/g, "").length === 11 || "err.phone",
  days:    v => v !== "" || "err.days",
  format:  v => v !== "" || "err.format",
};

function setError(input, key) {
  const field = input.closest(".field");
  field.classList.toggle("invalid", !!key);
  if (key) field.dataset.err = key; else delete field.dataset.err;
  field.querySelector(".error").textContent = key ? tr(key) : "";
}

// Сообщение под формой (хранится ключом, чтобы переводиться при смене языка)
let msgState = null;
function showMsg(cls, key, params) {
  msgState = key ? { key, params } : null;
  msg.className = "form-msg" + (cls ? " " + cls : "");
  msg.textContent = key ? tr(key, params) : "";
}

function validateField(input) {
  if (input.type === "checkbox") {
    const ok = input.checked;
    setError(input, ok ? "" : "err.consent");
    return ok;
  }
  const rule = rules[input.name];
  if (!rule) return true;
  const res = rule(input.value);
  setError(input, res === true ? "" : res);
  return res === true;
}

form.querySelectorAll("input, select").forEach(el => {
  el.addEventListener("blur", () => validateField(el));
  el.addEventListener("input", () => el.closest(".field").classList.contains("invalid") && validateField(el));
});

/* ===== Отправка ===== */
form.addEventListener("submit", async e => {
  e.preventDefault();
  showMsg("");

  const inputs = [...form.querySelectorAll("input[required], select[required]")];
  const valid = inputs.map(validateField).every(Boolean);
  if (!valid) {
    form.querySelector(".invalid input, .invalid select")?.focus();
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  data.createdAt = new Date().toISOString();
  data.lang = currentLang; // на каком языке заполнена форма

  btn.disabled = true;
  btn.textContent = tr("f.sending");
  try {
    if (FORM_ENDPOINT) {
      const res = await fetch(FORM_ENDPOINT, {
        method: "POST",
        // text/plain нужен для Google Apps Script (иначе браузер блокирует запрос)
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(data)
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Server error");
    } else {
      // Демо-режим: без сервера сохраняем в браузере
      const list = JSON.parse(localStorage.getItem("registrations") || "[]");
      list.push(data);
      localStorage.setItem("registrations", JSON.stringify(list));
    }
    showMsg("ok", "msg.ok", { email: data.email });
    form.reset();
    } catch (err) {
    console.error(err);
    showMsg("fail", "msg.fail", { phone: CONTACT_PHONE });
});

/* ===== Переключение языка ===== */
function applyLang(lang) {
  currentLang = window.I18N[lang] ? lang : "ru";
  document.documentElement.lang = currentLang;
  document.title = tr("meta.title");

  document.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = tr(el.dataset.i18n); });
  // data-i18n-html — только для наших собственных строк из i18n.js (там есть <b>)
  document.querySelectorAll("[data-i18n-html]").forEach(el => { el.innerHTML = tr(el.dataset.i18nHtml); });
  document.querySelectorAll("[data-i18n-attr]").forEach(el => {
    el.dataset.i18nAttr.split(";").forEach(pair => {
      const [attr, key] = pair.split(":").map(x => x.trim());
      if (attr && key) el.setAttribute(attr, tr(key));
    });
  });

  // уже показанные ошибки, сообщение формы и кнопка
  form.querySelectorAll(".field[data-err]").forEach(f => {
    f.querySelector(".error").textContent = tr(f.dataset.err);
  });
  if (msgState) msg.textContent = tr(msgState.key, msgState.params);
  if (btn.disabled) btn.textContent = tr("f.sending");

  document.querySelectorAll(".lang button").forEach(b => {
    const on = b.dataset.lang === currentLang;
    b.classList.toggle("active", on);
    b.setAttribute("aria-pressed", on);
  });
}

document.querySelectorAll(".lang button").forEach(b => {
  b.addEventListener("click", () => {
    applyLang(b.dataset.lang);
    try { localStorage.setItem("lang", currentLang); } catch (e) {}
  });
});

// Стартовый язык: ?lang=kk в адресе → сохранённый выбор → русский
(function initLang() {
  let saved = null;
  try { saved = localStorage.getItem("lang"); } catch (e) {}
  const fromUrl = new URLSearchParams(location.search).get("lang");
  const start = [fromUrl, saved].find(l => l && window.I18N[l]) || "ru";
  if (start !== "ru") applyLang(start);
})();
