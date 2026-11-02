(function () {
  "use strict";
  const FAQ = window.FAQ, FORMS = window.FORMS;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const AUD_LABEL = { graduate: "Graduate", undergraduate: "Undergraduate", all: "All students" };

  // ---------- index ----------
  const parts = {};
  const byId = {};      // section / question id -> {kind, part, section, question}
  FAQ.parts.forEach((p) => {
    parts[p.id] = p;
    p.sections.forEach((s) => {
      byId[s.id] = { kind: "section", part: p, section: s };
      s.questions.forEach((q) => (byId[q.id] = { kind: "question", part: p, section: s, question: q }));
    });
  });
  // shared with editor.js
  window.EEFAQ = { parts, byId, esc, blockHTML: null, renderAudience: null };

  // ---------- rendering ----------
  function blockHTML(b) {
    switch (b.type) {
      case "p": return `<p${b.muted ? ' class="muted"' : ""}>${b.html}</p>`;
      case "note": return `<div class="note">${b.html}</div>`;
      case "ul": return `<ul>${b.items.map((i) => `<li>${i}</li>`).join("")}</ul>`;
      case "ol": return `<ol>${b.items.map((i) => `<li>${i}</li>`).join("")}</ol>`;
      case "table":
        return `<div class="table-wrap"><table><thead><tr>${b.head.map((h) => `<th scope="col">${h}</th>`).join("")}</tr></thead><tbody>${
          b.rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
      case "forms":
        return `<div class="form-links"><strong>Forms &amp; links</strong><ul>${b.links.map((l) =>
          `<li><a href="${esc(l.href)}"${l.external ? ' target="_blank" rel="noopener"' : ' class="file-link"'}>${esc(l.label)}</a></li>`).join("")}</ul></div>`;
      default: return "";
    }
  }

  function questionHTML(q, part, withBadge) {
    return `<details class="qa" id="${q.id}">
      <summary>${esc(q.q)}${withBadge ? `<span class="badge ${part.id}">${AUD_LABEL[part.id]}</span>` : ""}</summary>
      <div class="answer">${q.blocks.map(blockHTML).join("")}
        <div class="answer-tools">
          <div class="helpful" data-id="${q.id}"><span>Was this helpful?</span>
            <button type="button" data-helpful="yes">Yes</button><button type="button" data-helpful="no">No</button></div>
          <button type="button" class="copy-link" data-id="${q.id}">Copy link</button>
        </div>
      </div></details>`;
  }

  function sectionHTML(s, part) {
    return `<section class="faq-section" id="${s.id}" aria-labelledby="${s.id}-h">
      <h2 id="${s.id}-h"><span class="code">${esc(s.code)}</span>${esc(s.title)}</h2>
      ${s.blocks.map(blockHTML).join("")}
      ${s.questions.map((q) => questionHTML(q, part, false)).join("")}
    </section>`;
  }

  window.EEFAQ.blockHTML = blockHTML;

  let currentAudience = null;
  function renderAudience(aud) {
    if (currentAudience === aud) return;
    currentAudience = aud;
    const part = parts[aud];
    $("#faq-content").innerHTML =
      `<p class="muted">${esc(part.subtitle)}</p>` + part.sections.map((s) => sectionHTML(s, part)).join("");
    $("#faq-content").setAttribute("aria-labelledby", "tab-" + aud);
    $$(".audience [role=tab]").forEach((t) => t.setAttribute("aria-selected", String(t.dataset.audience === aud)));
    $("#toc-list").innerHTML = part.sections.map((s) =>
      `<li><a href="#${s.id}" data-sec="${s.id}"><span class="code">${esc(s.code)}</span><span>${esc(s.title)}</span></a></li>`).join("");
    $("#toc-select").innerHTML = `<option value="">Jump to a section…</option>` +
      part.sections.map((s) => `<option value="${s.id}">${esc(s.code)}. ${esc(s.title)}</option>`).join("");
    $("#expand-all").textContent = "Expand all answers";
    observeSections();
    if (window.EEEditor) window.EEEditor.decorate();
  }
  window.EEFAQ.renderAudience = renderAudience;

  // ids from the Sept 2026 FAQ ("a3-what-…") -> the current id with the same wording, if any
  function legacyId(id) {
    if (!/^[a-c]\d*-/.test(id)) return null;
    const tail = id.replace(/^[a-c]\d*-/, "");
    return Object.keys(byId).find((cur) => cur.replace(/^\d+-/, "") === tail) || null;
  }

  // ---------- views & routing ----------
  const views = ["faq", "search", "forms", "faculty", "contacts", "ask", "editor"];
  function show(view) {
    views.forEach((v) => ($("#view-" + v).hidden = v !== view));
    $("#notice").hidden = view === "faculty";   // the deadlines notice has nothing to do with the directory
    $$(".top-nav [data-nav]").forEach((a) => { if (a.dataset.nav === view) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  }

  function route() {
    const h = decodeURIComponent(location.hash.slice(1));
    if (h === "forms") { show("forms"); renderForms(); return; }
    if (h === "faculty" && FACULTY) { show("faculty"); renderFaculty(); return; }
    if (h === "contacts") { show("contacts"); return; }
    if (h === "ask") { show("ask"); onAskShown(); return; }
    if (h === "editor" || h === "signin" || h === "login") { show("editor"); if (window.EEEditor) window.EEEditor.onShow(); window.scrollTo({ top: 0 }); return; }
    if (parts[h]) { renderAudience(h); show("faq"); window.scrollTo({ top: 0 }); return; }
    // links shared before the Oct 2026 renumbering ("a1-…", "b4-…") open the same question if it still exists
    const legacy = !byId[h] && legacyId(h);
    if (legacy) { history.replaceState(null, "", "#" + legacy); route(); return; }
    const hit = byId[h];
    if (hit) {
      renderAudience(hit.part.id); show("faq");
      requestAnimationFrame(() => {
        const el = document.getElementById(h);
        if (!el) return;
        if (hit.kind === "question") { el.open = true; el.classList.remove("flash"); void el.offsetWidth; el.classList.add("flash"); }
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    renderAudience(currentAudience || "graduate"); show("faq");
  }
  // following any link leaves search mode (the search text is kept for "Ask the coordinator")
  window.addEventListener("hashchange", () => { if (searchActive()) input.value = ""; route(); });

  // ---------- search ----------
  const input = $("#q");
  const searchActive = () => input.value.trim().length > 0;
  const norm = (s) => s.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
  const allQuestions = [];
  FAQ.parts.forEach((p) => p.sections.forEach((s) => s.questions.forEach((q) =>
    allQuestions.push({ p, s, q, hq: norm(q.q), ht: norm(q.text + " " + s.title) }))));

  function highlight(root, terms) {
    if (!terms.length) return;
    const re = new RegExp("(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentNode.closest("mark, button") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => {
      if (!re.test(n.nodeValue)) return;
      re.lastIndex = 0;
      const span = document.createElement("span");
      span.innerHTML = esc(n.nodeValue).replace(re, "<mark>$1</mark>");
      n.parentNode.replaceChild(span, n);
    });
  }

  function scoreQuestions(raw) {
    const terms = norm(raw).split(/\s+/).filter((t) => t.length > 2 && !STOP.has(t));
    if (!terms.length) return [];
    return allQuestions.map((x) => {
      let score = 0;
      terms.forEach((t) => { if (x.hq.includes(t)) score += 3; else if (x.ht.includes(t)) score += 1; });
      return { x, score };
    }).filter((r) => r.score >= Math.min(3, terms.length)).sort((a, b) => b.score - a.score);
  }
  const STOP = new Set("the and for you your how what when where who why can do does did are is was were with from that this have has had not but any all our get got into about will would should could i me my a an to of in on at or it be as by".split(" "));

  let searchTimer;
  function runSearch() {
    const raw = input.value.trim();
    if (!raw) { route(); return; }
    const terms = norm(raw).split(/\s+/).filter((t) => t.length > 1 || /\d/.test(t));
    const phrase = norm(raw);
    const scored = allQuestions.map((x) => {
      let score = 0;
      if (x.hq.includes(phrase)) score += 12;
      if (x.ht.includes(phrase)) score += 6;
      let all = true;
      terms.forEach((t) => {
        const inQ = x.hq.includes(t), inT = x.ht.includes(t);
        if (inQ) score += 4; if (inT) score += 1;
        if (!inQ && !inT) all = false;
      });
      return { x, score: all ? score : 0 };
    }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);

    const formHits = FORMS.files.concat(FORMS.external).filter((f) =>
      terms.every((t) => norm((f.title || f.label) + " " + (f.who || "")).includes(t))).slice(0, 6);

    const facHits = allFacultyMatching(terms).slice(0, 6);

    show("search");
    $("#result-count").textContent = scored.length
      ? `${scored.length} question${scored.length === 1 ? "" : "s"} match “${raw}”`
      : facHits.length ? `${facHits.length} faculty match “${raw}”` : `No questions match “${raw}”.`;
    let out = "";
    if (formHits.length) {
      out += `<h3 class="result-group">Forms</h3><div class="card-grid">${formHits.map(formCard).join("")}</div>`;
    }
    if (scored.length) {
      out += `<h3 class="result-group">Questions</h3>` + scored.map((r, i) => questionHTML(r.x.q, r.x.p, true).replace('<details class="qa"', `<details class="qa"${i < 3 ? " open" : ""}`).replace(`id="${r.x.q.id}"`, `id="r-${r.x.q.id}" data-qid="${r.x.q.id}"`)).join("");
    } else if (!facHits.length) {
      out += `<div class="empty"><p>Try a shorter word, or browse the <a href="#graduate">graduate</a> or <a href="#undergraduate">undergraduate</a> questions.</p><p>We may not have answered this one yet. Use <strong>Ask the coordinator</strong> below and we'll reply by email.</p></div>`;
    }
    if (facHits.length) {
      out += `<h3 class="result-group">Faculty</h3><div class="card-grid">${facHits.map(personCard).join("")}</div>`;
    }
    $("#results").innerHTML = out;
    highlight($("#results"), terms);
    $("#search-ask").classList.toggle("is-strong", scored.length + facHits.length === 0);
    lastSearch = raw;
    clearTimeout(trackTimer);
    trackTimer = setTimeout(() => track.search(raw, scored.length + facHits.length), 1500);
  }
  let lastSearch = "", trackTimer;
  input.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(runSearch, 120); });
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") { input.value = ""; runSearch(); } });
  $("#clear-search").addEventListener("click", () => { input.value = ""; runSearch(); input.focus(); });
  $$("[data-search]").forEach((b) => b.addEventListener("click", () => {
    input.value = b.dataset.search; runSearch(); $("#view-search").scrollIntoView({ behavior: "smooth" });
  }));

  // ---------- forms view ----------
  let formAud = "all";
  function formCard(f) {
    if (f.label) {  // external
      return `<article class="card"><h4><a href="${esc(f.href)}" target="_blank" rel="noopener">${esc(f.label)}</a></h4>
        <div class="meta">${f.who ? esc(f.who) + " · " : ""}${f.audiences.map((a) => `<span class="badge ${a}">${AUD_LABEL[a]}</span>`).join("")}</div>
        ${f.submit && f.submit !== "—" ? `<div class="meta">Submit to: ${esc(f.submit)}</div>` : ""}</article>`;
    }
    const t = f.type.toLowerCase();
    return `<article class="card"><h4><a href="${esc(f.href)}" class="file-link" download>${esc(f.title)}</a></h4>
      <div class="meta"><span class="type ${t}">${esc(f.type)}</span>${f.kb} KB<span class="badge ${f.audience}">${AUD_LABEL[f.audience]}</span></div>
      ${f.who ? `<div class="meta">For: ${esc(f.who)}</div>` : ""}
      ${f.submit && f.submit !== "—" ? `<div class="meta">Submit to: ${esc(f.submit)}</div>` : ""}</article>`;
  }
  function renderForms() {
    const terms = norm($("#form-filter").value.trim()).split(/\s+/).filter(Boolean);
    const match = (s) => terms.every((t) => norm(s).includes(t));
    const files = FORMS.files.filter((f) => (formAud === "all" || f.audience === formAud) && match(f.title + " " + f.who + " " + f.submit));
    const ext = FORMS.external.filter((f) => (formAud === "all" || f.audiences.includes(formAud)) && match(f.label + " " + f.who + " " + f.submit));
    $("#dept-forms").innerHTML = files.map(formCard).join("") || `<p class="muted">No department forms match.</p>`;
    $("#ext-forms").innerHTML = ext.map(formCard).join("") || `<p class="muted">No UTSA links match.</p>`;
  }
  $("#form-filter").addEventListener("input", renderForms);
  $$("[data-form-aud]").forEach((b) => b.addEventListener("click", () => {
    formAud = b.dataset.formAud;
    $$("[data-form-aud]").forEach((x) => x.classList.toggle("is-on", x === b));
    renderForms();
  }));

  // ---------- contacts view ----------
  function renderContacts() {
    const rows = FAQ.contacts.rows;
    $("#contact-cards").innerHTML = rows.map((r) =>
      `<article class="card"><h4>${r[0]}</h4><div>${r[1].replace(/\s+·\s+/g, "<br>")}</div><div class="meta">${r[2]}</div></article>`).join("");
    const wellness = parts.all && parts.all.sections.find((s) => /wellness/i.test(s.title));
    if (wellness) {
      $("#wellness").innerHTML = `<h3 class="group-title">${esc(wellness.title.replace(/\s*\(all students\)/i, ""))}</h3>` + wellness.blocks.map(blockHTML).join("");
    }
  }

  // ---------- faculty view ----------
  const FACULTY = window.FACULTY;
  if (!FACULTY) { const link = $('[data-nav="faculty"]'); if (link) link.remove(); }
  const FAC_GROUPS = FACULTY ? [{ id: "core", title: "Faculty", people: FACULTY.faculty }].concat(FACULTY.groups) : [];
  const personText = (p) => [p.name, p.title || "", (p.titles || []).join(" "), p.office || "", p.email || "", p.degree || "", (p.research || []).join(" ")].join(" ");
  const personMatches = (p, terms) => terms.every((t) => norm(personText(p)).includes(t));
  const allFacultyMatching = (terms) => FAC_GROUPS.flatMap((g) => g.people).filter((p) => personMatches(p, terms));

  function initials(name) {
    const words = name.split(",")[0].replace(/\(.*?\)/g, " ").trim().split(/\s+/);
    return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
  }
  const externalLink = (url, label) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a>`;

  function personCard(p) {
    if (p.titles === undefined) {   // courtesy, adjunct, and industrial lists give only a name and title
      return `<article class="card fac-mini"><h4>${p.url ? externalLink(p.url, p.name) : esc(p.name)}</h4>
        ${p.title ? `<div class="meta">${esc(p.title)}</div>` : ""}</article>`;
    }
    const links = (p.profile ? [externalLink(p.profile, "UTSA profile")] : []).concat(p.links.map((l) => externalLink(l.url, l.label)));
    const place = [p.office, p.phone && `<a href="tel:${esc(p.phone)}">${esc(p.phone)}</a>`].filter(Boolean);
    return `<article class="card fac-card">
      <div class="fac-top">
        ${p.photo ? `<img class="fac-photo" src="${esc(p.photo)}" alt="" width="72" height="72" loading="lazy" data-initials="${esc(initials(p.name))}">`
                  : `<span class="fac-photo fac-initials" aria-hidden="true">${esc(initials(p.name))}</span>`}
        <div><h4>${esc(p.name)}</h4>${p.titles.map((t) => `<div class="fac-title">${esc(t)}</div>`).join("")}</div>
      </div>
      <div class="fac-contact">
        ${p.email ? `<div><a href="mailto:${esc(p.email)}">${esc(p.email)}</a></div>` : ""}
        ${place.length ? `<div>${place.join(" · ")}</div>` : ""}
      </div>
      ${p.degree ? `<div class="meta">${esc(p.degree)}</div>` : ""}
      ${p.research.length ? `<div class="meta"><strong>Research:</strong> ${p.research.map(esc).join("; ")}</div>` : ""}
      ${links.length ? `<div class="fac-links">${links.join("")}</div>` : ""}
    </article>`;
  }

  // a photo that fails to load falls back to the person's initials
  document.addEventListener("error", (e) => {
    const img = e.target;
    if (!img.classList || !img.classList.contains("fac-photo")) return;
    const s = document.createElement("span");
    s.className = "fac-photo fac-initials"; s.setAttribute("aria-hidden", "true"); s.textContent = img.dataset.initials;
    img.replaceWith(s);
  }, true);

  let facGroup = "all", facBuilt = false;
  function renderFaculty() {
    if (!facBuilt) {
      facBuilt = true;
      $("#fac-leaders").innerHTML = FACULTY.leadership.length ? `<h3 class="group-title">Department leadership</h3><div class="fac-leaders">${
        FACULTY.leadership.map((l) => `<div class="fac-leader"><div class="fac-role">${esc(l.role)}</div><div>${esc(l.name)}</div>
          ${l.email ? `<div class="small"><a href="mailto:${esc(l.email)}">${esc(l.email)}</a></div>` : ""}</div>`).join("")}</div>` : "";
      const chip = (id, label) => `<button type="button" class="chip${id === facGroup ? " is-on" : ""}" data-fac-group="${id}">${esc(label)}</button>`;
      $("#fac-chips").innerHTML = chip("all", "All") + FAC_GROUPS.map((g) => chip(g.id, g.id === "core" ? "Faculty" : g.title.replace(/ faculty$| appointments$/i, ""))).join("");
      $$("[data-fac-group]").forEach((b) => b.addEventListener("click", () => {
        facGroup = b.dataset.facGroup;
        $$("[data-fac-group]").forEach((x) => x.classList.toggle("is-on", x === b));
        renderFaculty();
      }));
      $("#fac-filter").addEventListener("input", renderFaculty);
      $("#fac-areas-list").innerHTML = FACULTY.researchAreas.map((a) => `<li>${esc(a)}</li>`).join("");
      $(".fac-areas").hidden = !FACULTY.researchAreas.length;
      $("#fac-source").innerHTML = `From UTSA's public <a href="${esc(FACULTY.source)}" target="_blank" rel="noopener">faculty directory</a>
        and <a href="${esc(FACULTY.researchSource)}" target="_blank" rel="noopener">research page</a>, checked ${esc(FACULTY.checked)}.`;
    }
    const terms = norm($("#fac-filter").value.trim()).split(/\s+/).filter(Boolean);
    const shown = FAC_GROUPS.filter((g) => facGroup === "all" || g.id === facGroup)
      .map((g) => ({ g, people: g.people.filter((p) => personMatches(p, terms)) }))
      .filter((x) => x.people.length);
    const total = shown.reduce((n, x) => n + x.people.length, 0);
    $("#fac-count").textContent = `Showing ${total} ${total === 1 ? "person" : "people"}`;
    $("#fac-results").innerHTML = shown.map((x) =>
      `<h3 class="group-title">${esc(x.g.title)} <span class="muted">${x.people.length}</span></h3><div class="card-grid">${x.people.map(personCard).join("")}</div>`).join("")
      || `<p class="muted">No faculty match that filter.</p>`;
  }

  // ---------- misc interactions ----------
  $$(".audience [role=tab]").forEach((t) => {
    t.addEventListener("click", () => { location.hash = t.dataset.audience; });
    t.addEventListener("keydown", (e) => {
      const tabs = $$(".audience [role=tab]"), i = tabs.indexOf(t);
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        n.focus(); n.click();
      }
    });
  });
  $("#toc-select").addEventListener("change", (e) => { if (e.target.value) location.hash = e.target.value; });
  $("#expand-all").addEventListener("click", (e) => {
    const open = e.target.textContent.startsWith("Expand");
    $$("#faq-content details.qa").forEach((d) => (d.open = open));
    e.target.textContent = open ? "Collapse all answers" : "Expand all answers";
  });
  document.addEventListener("click", (e) => {
    const btn = e.target.closest(".copy-link");
    if (!btn) return;
    const url = location.href.split("#")[0] + "#" + btn.dataset.id;
    const done = () => { btn.textContent = "Link copied"; setTimeout(() => (btn.textContent = "Copy link"), 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(url).then(done, () => prompt("Copy this link:", url));
    else prompt("Copy this link:", url);
  });
  // opening a result keeps the canonical deep link available
  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.matches && d.matches("#faq-content details.qa") && d.open) history.replaceState(null, "", "#" + d.id);
  }, true);
  window.addEventListener("beforeprint", () => $$("details.qa").forEach((d) => (d.open = true)));

  let observer;
  function observeSections() {
    if (!("IntersectionObserver" in window)) return;
    if (observer) observer.disconnect();
    observer = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) $$("#toc-list a").forEach((a) => a.classList.toggle("active", a.dataset.sec === en.target.id));
      });
    }, { rootMargin: "-100px 0px -65% 0px" });
    $$("#faq-content .faq-section").forEach((s) => observer.observe(s));
  }

  // make plain email addresses and phone numbers tappable (skips text already inside links)
  function linkify(root) {
    const re = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})|(\b210-\d{3}-\d{4}\b)/g;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (n.parentNode.closest("a, button, script") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    const nodes = [];
    while (walker.nextNode()) { re.lastIndex = 0; if (re.test(walker.currentNode.nodeValue)) nodes.push(walker.currentNode); }
    nodes.forEach((n) => {
      re.lastIndex = 0;
      const span = document.createElement("span");
      span.innerHTML = esc(n.nodeValue).replace(re, (m, email, phone) =>
        email ? `<a href="mailto:${email}">${email}</a>` : `<a href="tel:+1${phone.replace(/-/g, "")}">${phone}</a>`);
      n.parentNode.replaceChild(span, n);
    });
  }
  new MutationObserver((muts) => muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) linkify(n); })))
    .observe($("#main"), { childList: true, subtree: true });


  // ---------- usage tracking (anonymous) ----------
  const CFG = window.FAQ_CONFIG || {};
  const ENDPOINT = (CFG.endpoint || "").trim();
  const COORD = CFG.coordinatorEmail || "Belinda.Guevara@utsa.edu";
  const once = (key) => {
    try {
      if (sessionStorage.getItem(key)) return false;
      sessionStorage.setItem(key, "1");
    } catch (e) { /* storage blocked: still count */ }
    return true;
  };
  const post = (payload) => {
    if (!ENDPOINT) return;
    const body = JSON.stringify(payload);
    try {
      if (navigator.sendBeacon && navigator.sendBeacon(ENDPOINT, new Blob([body], { type: "text/plain;charset=UTF-8" }))) return;
    } catch (e) { /* fall through */ }
    fetch(ENDPOINT, { method: "POST", body, mode: "no-cors", keepalive: true }).catch(() => {});
  };
  const track = {
    view(id) {
      const hit = byId[id];
      if (!hit || hit.kind !== "question" || !once("v:" + id)) return;
      post({ type: "view", id, title: hit.question.q, audience: hit.part.id });
    },
    helpful(id, value) {
      const hit = byId[id];
      if (!hit || !once("h:" + id)) return;
      post({ type: "helpful", id, title: hit.question.q, audience: hit.part.id, value });
    },
    search(term, results) {
      const t = term.trim().toLowerCase();
      if (t.length < 3 || !once("s:" + t)) return;
      post({ type: "search", term: t, results });
    },
  };
  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.matches && d.matches("details.qa") && d.open) track.view(d.dataset.qid || d.id);
  }, true);

  // ---------- most asked ----------
  function renderMostAsked(ids, live) {
    const items = ids.map((id) => byId[id]).filter((h) => h && h.kind === "question").slice(0, 6);
    if (!items.length) { $(".most-asked").hidden = true; return; }
    $("#most-asked-list").innerHTML = items.map((h) =>
      `<li><a href="#${h.question.id}">${esc(h.question.q)}</a><span class="badge ${h.part.id}">${AUD_LABEL[h.part.id]}</span></li>`).join("");
    $("#most-asked-note").textContent = live ? "Based on what students open most" : "Popular with students";
  }
  function loadMostAsked() {
    const defaults = CFG.defaultMostAsked || [];
    renderMostAsked(defaults, false);
    if (!ENDPOINT) return;
    fetch(ENDPOINT + (ENDPOINT.includes("?") ? "&" : "?") + "action=top&limit=12")
      .then((r) => r.json())
      .then((d) => {
        const top = (d && d.top) || [];
        const total = top.reduce((n, t) => n + (Number(t.views) || 0), 0);
        if (total >= (CFG.minViewsForLiveRanking || 25)) {
          const liveIds = [...new Set(top.map((t) => byId[t.id] ? t.id : legacyId(t.id)).filter(Boolean))];
          renderMostAsked(liveIds.concat(defaults.filter((id) => !liveIds.includes(id))), true);
        }
      })
      .catch(() => {});
  }

  // ---------- helpful votes ----------
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-helpful]");
    if (!b) return;
    const box = b.closest(".helpful"), id = box.dataset.id, value = b.dataset.helpful;
    track.helpful(id, value);
    const title = byId[id] ? byId[id].question.q : "";
    box.innerHTML = value === "yes"
      ? `<span class="thanks">Thanks for letting us know!</span>`
      : `<span class="thanks">Sorry about that.</span> <a href="#ask" data-ask-about="${esc(id)}">Ask the coordinator about this</a>`;
    if (value === "no") askContext = { topicQuestion: title };
  });

  // ---------- ask the coordinator ----------
  let askContext = {}, askShownAt = 0;
  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-ask-from-search]")) askContext = { search: lastSearch || input.value.trim() };
  });
  const form = $("#ask-form"), status = $("#ask-status");
  const qField = $("#ask-question");
  function onAskShown() {
    askShownAt = Date.now();
    window.scrollTo({ top: $("#view-ask").getBoundingClientRect().top + window.scrollY - 90 });
    if (!qField.value) {
      if (askContext.search) qField.value = `I searched for "${askContext.search}" but couldn't find an answer.\n\n`;
      else if (askContext.topicQuestion) qField.value = `About "${askContext.topicQuestion}":\n\n`;
    }
    suggest();
    if (!form.dataset.sent) setTimeout(() => $("#ask-name").focus({ preventScroll: true }), 50);
  }
  let suggestTimer;
  function suggest() {
    const hits = scoreQuestions(qField.value).slice(0, 4);
    $("#ask-suggestions").innerHTML = hits.length
      ? hits.map((r) => `<li><a href="#${r.x.q.id}">${esc(r.x.q.q)}</a></li>`).join("")
      : `<li class="muted">Start typing your question to see related answers.</li>`;
  }
  qField.addEventListener("input", () => { clearTimeout(suggestTimer); suggestTimer = setTimeout(suggest, 250); });

  function fieldError(el, msg) {
    el.setAttribute("aria-invalid", msg ? "true" : "false");
    let m = el.parentNode.querySelector(".field-error");
    if (!m && msg) { m = document.createElement("p"); m.className = "field-error"; m.id = el.id + "-err"; el.parentNode.appendChild(m); }
    if (m) m.textContent = msg || "";
    if (msg) el.setAttribute("aria-describedby", el.id + "-err"); else el.removeAttribute("aria-describedby");
    return !msg;
  }
  function validate() {
    const name = $("#ask-name"), email = $("#ask-email");
    const okName = fieldError(name, name.value.trim() ? "" : "Please enter your name.");
    const ev = email.value.trim();
    const okEmail = fieldError(email, !ev ? "Please enter your UTSA email." :
      !/^[^\s@]+@(my\.)?utsa\.edu$/i.test(ev) ? "Use your UTSA email (…@my.utsa.edu or …@utsa.edu)." : "");
    const qv = qField.value.trim();
    const okQ = fieldError(qField, qv.length < 10 ? "Please describe your question (at least 10 characters)." : "");
    if (/\b\d{3}-\d{2}-\d{4}\b/.test(qv)) { fieldError(qField, "Please remove the Social Security number from your message."); return false; }
    const first = [name, email, qField].find((el) => el.getAttribute("aria-invalid") === "true");
    if (first) first.focus();
    return okName && okEmail && okQ;
  }
  function mailtoFallback(data) {
    const body = `Name: ${data.name}\nUTSA email: ${data.email}\nStudent type: ${data.studentType || "-"}\nTopic: ${data.topic || "-"}\n${data.context ? "Searched for: " + data.context + "\n" : ""}\n${data.question}\n`;
    return `mailto:${COORD}?subject=${encodeURIComponent("Student FAQ question: " + (data.topic || data.question.slice(0, 50)))}&body=${encodeURIComponent(body)}`;
  }
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!validate()) return;
    const data = {
      type: "ask",
      name: $("#ask-name").value.trim(), email: $("#ask-email").value.trim(),
      studentType: $("#ask-type").value, topic: $("#ask-topic").value,
      question: qField.value.trim(), context: askContext.search || askContext.topicQuestion || "",
      website: $("#ask-website").value, elapsedMs: Date.now() - askShownAt,
    };
    const btn = $("#ask-submit");
    if (!ENDPOINT) {
      status.className = "form-status";
      status.innerHTML = `Your email app should open with your question ready to send. If it doesn't, email <a href="mailto:${COORD}">${COORD}</a>.`;
      location.href = mailtoFallback(data);
      return;
    }
    btn.disabled = true; btn.textContent = "Sending…";
    status.className = "form-status"; status.textContent = "";
    fetch(ENDPOINT, { method: "POST", body: JSON.stringify(data) })
      .then((r) => r.json())
      .then((res) => {
        if (!res || !res.ok) throw new Error((res && res.error) || "Something went wrong.");
        form.dataset.sent = "1";
        const confirmLine = res.emailed === false
          ? `<p>The Program Coordinator will reply to <strong>${esc(data.email)}</strong>, usually within 2 business days. You will not get an automatic confirmation email, so keep your reference number.</p>`
          : `<p>The Program Coordinator will reply to <strong>${esc(data.email)}</strong>, usually within 2 business days. A confirmation email is on its way.</p>`;
        const redactedLine = res.redacted
          ? `<p class="muted">Part of your message looked like an ID number and was removed before it was saved. Never send those by email.</p>`
          : "";
        form.innerHTML = `<div class="sent" tabindex="-1"><h3>Question sent</h3>
          <p>Thanks, ${esc(data.name.split(" ")[0])}. Your reference number is <strong>${esc(res.ticket)}</strong>.</p>
          ${confirmLine}${redactedLine}
          <p><a href="#graduate">Back to the FAQ</a></p></div>`;
        $(".sent", form).focus();
      })
      .catch((err) => {
        btn.disabled = false; btn.textContent = "Send question";
        status.className = "form-status is-error";
        status.innerHTML = `${esc(err.message || "We couldn't send your question.")} You can also <a href="${esc(mailtoFallback(data))}">send it by email instead</a>.`;
      });
  });

  // ---------- init ----------
  $("#notice").innerHTML = FAQ.notes.join(" ");
  renderContacts();
  renderForms();
  route();
  linkify($("#main"));
  loadMostAsked();
})();
