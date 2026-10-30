/* Editor sign-in and commits.
   Loads on every page but stays completely invisible unless the backend
   reports that editing is available AND an editor signs in. */
(function () {
  "use strict";
  const A = window.EEFAQ;                 // helpers shared by app.js
  if (!A) return;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const esc = A.esc;
  const CFG = window.FAQ_CONFIG || {};
  const API = (CFG.editorApi || CFG.endpoint || "/api").replace(/\/+$/, "");
  const KEY = "ee-editor-token";

  let me = null;          // {name,email,role} when signed in
  let canEdit = false;    // backend supports editing
  let target = null;      // what the open drawer is editing

  const SIGNIN_HASHES = ["#signin", "#editor", "#login"];
  const isSignInHash = () => SIGNIN_HASHES.indexOf(location.hash) >= 0;

  const token = {
    get() { try { return sessionStorage.getItem(KEY) || ""; } catch (e) { return ""; } },
    set(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch (e) {} },
  };

  // One request shape for both backends. No custom headers: that keeps it a
  // "simple" cross-origin request, which is all a Google Apps Script web app allows.
  function post(payload) {
    const body = JSON.stringify(Object.assign({ token: token.get() }, payload));
    return fetch(API, { method: "POST", body }).then((r) => r.json().then((j) => {
      if (r.status === 401 || (j && /sign in again/i.test(j.error || ""))) { token.set(""); me = null; paint(); }
      if (!j || j.ok === false) throw new Error((j && j.error) || "Something went wrong.");
      return j;
    }, () => { throw new Error("The server did not answer."); }));
  }

  // ---------------------------------------------------- HTML -> editable text
  function toText(html) {
    let s = String(html || "");
    s = s.replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, label) => "[" + strip(label) + "](" + href + ")");
    s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, (m, t, inner) => "**" + strip(inner) + "**");
    s = s.replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, (m, t, inner) => "*" + strip(inner) + "*");
    s = s.replace(/<br\s*\/?>/gi, "\n");
    return strip(s);
  }
  function strip(s) {
    const d = document.createElement("div");
    d.innerHTML = String(s).replace(/<[^>]+>/g, "");
    return (d.textContent || "").replace(/\s+/g, " ").trim();
  }
  function blocksToText(blocks) {
    const out = [];
    (blocks || []).forEach((b) => {
      if (b.type === "p") out.push(toText(b.html));
      else if (b.type === "note") out.push("> " + toText(b.html));
      else if (b.type === "ul") b.items.forEach((i) => out.push("- " + toText(i)));
      else if (b.type === "ol") b.items.forEach((i, n) => out.push((n + 1) + ". " + toText(i)));
      else if (b.type === "table") {
        out.push("| " + b.head.map(toText).join(" | ") + " |");
        out.push("|" + b.head.map(() => "---").join("|") + "|");
        b.rows.forEach((r) => out.push("| " + r.map(toText).join(" | ") + " |"));
      } else if (b.type === "forms") {
        b.links.forEach((l) => out.push("Form: [" + l.label + "](" + l.href + ")"));
      }
      if (b.type !== "ul" && b.type !== "ol") out.push("");
    });
    return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  // ---------------------------------------------------- sign-in / console view
  let mode = "";            // "" chooser | "student" | "staff" (faculty & staff share one door)

  const ROLE_LABEL = { coordinator: "Program Coordinator", staff: "Staff", faculty: "Faculty", editor: "Staff" };

  function chooserHTML() {
    return `<div class="view-head"><h2 id="editor-heading">Sign in</h2>
        <p class="muted">The FAQ, the student forms and the contacts are open to everyone &mdash; you do not need an
        account to read them. Sign in only for the things below.</p></div>
      <div class="signin-grid">
        <article class="card signin-card">
          <h3>Students</h3>
          <p>Check a question you already sent the Program Coordinator, and read the reply.</p>
          <ul class="signin-gets"><li>No account or password</li><li>Uses your UTSA email and the reference number you were given, such as EE-260924-001</li></ul>
          <button type="button" class="btn-solid" data-signin="student">Check my question</button>
        </article>
        <article class="card signin-card">
          <h3>Faculty &amp; staff</h3>
          <p>Signing in gives you:</p>
          <ul class="signin-gets">
            <li>A <strong>Faculty &amp; staff</strong> tab with answers students never see: defenses, committees, paperwork students ask you for</li>
            <li><strong>Faculty &amp; staff forms</strong> on the Forms page: defense and proposal evaluations, completion forms, travel forms, letterhead and letter templates</li>
            <li>An <strong>Edit</strong> button on every answer and form to suggest a correction; changes are reviewed before they appear</li>
          </ul>
          <button type="button" class="btn-solid" data-signin="staff">Faculty &amp; staff sign-in</button>
        </article>
      </div>
      <p class="muted small signin-foot">Have a new question instead? <a href="#ask">Ask the Program Coordinator</a>.</p>`;
  }

  // passcode help goes to the Program Coordinator, who issues and resets passcodes
  function passcodeHelp() {
    const to = CFG.coordinatorEmail || "";
    const mail = (subject) => `mailto:${esc(to)}?subject=${encodeURIComponent(subject)}`;
    return `<div class="signin-help">
        <p><strong>No passcode yet?</strong> <a href="${mail("EE FAQ website - faculty/staff access")}">Email the Program Coordinator</a>
        from your UTSA address to request one.</p>
        <p><strong>Forgot your passcode?</strong> Passcodes are stored scrambled, so nobody can look yours up.
        <a href="${mail("EE FAQ website - passcode reset")}">Ask the Program Coordinator for a new one</a>; the old one stops working.</p>
      </div>`;
  }

  function studentHTML() {
    return `<div class="view-head"><h2 id="editor-heading">Check my question</h2>
        <p class="muted">Enter the UTSA email you used and the reference number you were given.
        Both are needed, so nobody else can read your question.</p></div>
      <form id="ed-student" class="ask-form ed-login" novalidate>
        <div class="field"><label for="st-email">UTSA email</label>
          <input id="st-email" type="email" autocomplete="email" maxlength="120" placeholder="firstname.lastname@my.utsa.edu"></div>
        <div class="field"><label for="st-ticket">Reference number</label>
          <input id="st-ticket" maxlength="40" placeholder="EE-260924-001" autocomplete="off">
          <p class="hint">It was shown on screen when you sent the question.</p></div>
        <p id="st-status" class="form-status" role="status" aria-live="polite"></p>
        <button type="submit" class="btn-solid btn-lg">Look it up</button>
        <button type="button" class="link-btn" data-signin="">Back</button>
      </form>
      <div id="st-result"></div>`;
  }

  function passcodeHTML() {
    return `<div class="view-head"><h2 id="editor-heading">Faculty &amp; staff sign-in</h2>
        <p class="muted">For Electrical Engineering faculty and staff. Your sign-in lasts 12 hours on this device,
        or until you sign out.</p></div>
      <form id="ed-login" class="ask-form ed-login" novalidate>
        <div class="field"><label for="ed-email">UTSA email</label>
          <input id="ed-email" type="email" autocomplete="username" maxlength="120" placeholder="firstname.lastname@utsa.edu"></div>
        <div class="field"><label for="ed-code">Passcode</label>
          <input id="ed-code" type="password" autocomplete="current-password" maxlength="80" placeholder="XXXX-XXXX-XXXX"></div>
        <p id="ed-status" class="form-status" role="status" aria-live="polite"></p>
        <button type="submit" class="btn-solid btn-lg">Sign in</button>
        <button type="button" class="link-btn" data-signin="">Back</button>
      </form>
      ${passcodeHelp()}`;
  }

  function viewHTML() {
    if (!me) {
      if (mode === "student") return studentHTML();
      if (mode === "staff" || mode === "faculty") return passcodeHTML();
      return chooserHTML();
    }
    const label = ROLE_LABEL[me.role] || "Staff";
    return `<div class="view-head ed-head">
        <div><h2 id="editor-heading">${me.role === "coordinator" ? "Coordinator console" : label + " console"}</h2>
        <p class="muted">Signed in as <strong>${esc(me.name)}</strong> (${esc(me.email)}) &middot; ${esc(label)}.
        Open any question or form and use <strong>Edit</strong> to send a change.</p></div>
        <button type="button" class="link-btn" id="ed-signout">Sign out</button>
      </div>
      <div class="ed-hint">
        <strong>How it works.</strong> Your edits are not published straight away. Each one is saved as a numbered
        commit, reviewed, and then folded into the Word document and this website so both always match.
      </div>
      <div class="ed-actions">
        <a class="btn-outline" href="#graduate">Graduate questions</a>
        <a class="btn-outline" href="#undergraduate">Undergraduate questions</a>
        <a class="btn-outline" href="#forms">Forms</a>
        <button type="button" class="btn-outline" id="ed-new">Propose a new question</button>
      </div>
      ${me.role === "coordinator" ? `<h3 class="group-title">Usage report <span class="muted">for the department admin</span></h3>
      <form id="ed-report" class="ed-report">
        <p class="muted">Most-read answers, questions sent to you by topic, searches that found nothing, helpful ratings and
        reply times. Counts only: no student names or emails. Leave the dates empty for everything recorded so far.</p>
        <div class="field-row">
          <div class="field"><label for="rep-from">From</label><input id="rep-from" type="date"></div>
          <div class="field"><label for="rep-to">To</label><input id="rep-to" type="date"></div>
        </div>
        <button type="submit" class="btn-solid">Open report</button>
        <button type="button" class="btn-outline" id="rep-csv">Download spreadsheet (CSV)</button>
        <p id="rep-status" class="form-status" role="status" aria-live="polite"></p>
      </form>
      <h3 class="group-title">Student questions <span class="muted" id="ed-q-count"></span></h3>
      <div id="ed-questions"><p class="muted">Loading&hellip;</p></div>` : ""}
      <h3 class="group-title">${me.role === "coordinator" ? "All commits" : "Your commits"}</h3>
      <div id="ed-list"><p class="muted">Loading&hellip;</p></div>`;
  }

  function renderView() {
    const v = $("#view-editor");
    if (!v) return;
    v.innerHTML = viewHTML();
    if (!me) {
      if (mode === "student") {
        $("#ed-student").addEventListener("submit", doStudentLookup);
        setTimeout(() => $("#st-email").focus({ preventScroll: true }), 50);
      } else if (mode) {
        $("#ed-login").addEventListener("submit", doLogin);
        setTimeout(() => $("#ed-email").focus({ preventScroll: true }), 50);
      }
      return;
    }
    $("#ed-signout").addEventListener("click", () => {
      token.set(""); me = null; mode = ""; removeInternal(); removeFacultyForms(); paint(); renderView();
    });
    $("#ed-new").addEventListener("click", () => openDrawer({
      kind: "new", action: "add", title: "", targetId: "", location: "New question",
      before: "", heading: "Propose a new question",
    }));
    loadCommits();
    if (me.role === "coordinator") { loadQuestions(); wireReport(); }
    loadInternal();
  }

  // usage report: opened in a new tab (print it to PDF to send), or saved as CSV
  function wireReport() {
    const form = $("#ed-report");
    if (!form) return;
    const fetchReport = () => {
      $("#rep-status").textContent = "Preparing the report…";
      return post({ type: "usage-report", from: $("#rep-from").value, to: $("#rep-to").value })
        .then((res) => { $("#rep-status").textContent = ""; return res; })
        .catch((err) => { $("#rep-status").textContent = err.message; throw err; });
    };
    const save = (text, type, name) => {
      const url = URL.createObjectURL(new Blob([text], { type }));
      const a = document.createElement("a");
      a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    };
    const stamp = () => ($("#rep-from").value || $("#rep-to").value)
      ? `${$("#rep-from").value || "start"} to ${$("#rep-to").value || "today"}` : new Date().toISOString().slice(0, 10);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const win = window.open("", "_blank");     // opened now, so pop-up blockers allow it
      fetchReport().then((res) => {
        if (win) { win.document.open(); win.document.write(res.html); win.document.close(); }
        else save(res.html, "text/html", `EE FAQ usage report ${stamp()}.html`);
      }).catch(() => { if (win) win.close(); });
    });
    $("#rep-csv").addEventListener("click", () => {
      fetchReport().then((res) => save(res.csv, "text/csv", `EE FAQ usage report ${stamp()}.csv`)).catch(() => {});
    });
  }

  // choosing a door on the sign-in page
  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-signin]");
    if (!b) return;
    mode = b.dataset.signin;
    renderView();
  });

  const STUDENT_STATUS = {
    "New": "Waiting for the Program Coordinator",
    "Answered": "Answered",
    "No reply needed": "Closed - no reply needed",
  };
  function doStudentLookup(e) {
    e.preventDefault();
    const status = $("#st-status"), btn = e.target.querySelector("button");
    const email = $("#st-email").value.trim(), ticket = $("#st-ticket").value.trim();
    if (!email || !ticket) {
      status.className = "form-status is-error";
      status.textContent = "Enter your UTSA email and your reference number.";
      return;
    }
    btn.disabled = true; btn.textContent = "Looking...";
    status.className = "form-status"; status.textContent = "";
    post({ type: "student-lookup", email, ticket })
      .then((res) => {
        const q = res.question;
        btn.disabled = false; btn.textContent = "Look it up";
        $("#st-result").innerHTML = `<article class="card st-card">
          <h3>${esc(q.topic || "Your question")} <span class="ed-pill ${q.status === "Answered" ? "applied" : "pending"}">${esc(STUDENT_STATUS[q.status] || q.status)}</span></h3>
          <div class="meta"><code>${esc(q.ticket)}</code> &middot; sent ${esc((q.received || "").slice(0, 10))}</div>
          <p class="ed-q-text">${esc(q.question || "")}</p>
          ${q.reply
            ? `<h4>Reply</h4><p class="ed-q-text st-reply">${esc(q.reply)}</p>
               <div class="meta">Answered ${esc((q.answeredAt || "").slice(0, 10))}</div>`
            : q.status === "Answered"
              ? `<p class="muted">This was answered by email. Check the inbox of the address you used.</p>`
              : `<p class="muted">Not answered yet. The Program Coordinator usually replies within 2 business days.</p>`}
        </article>`;
      })
      .catch((err) => {
        btn.disabled = false; btn.textContent = "Look it up";
        status.className = "form-status is-error"; status.textContent = err.message;
        $("#st-result").innerHTML = "";
      });
  }

  // ---------------------------------------------------- student questions (coordinator)
  function loadQuestions() {
    const box = $("#ed-questions");
    if (!box) return;
    post({ type: "editor-questions" })
      .then((res) => {
        const rows = res.questions || [];
        const c = $("#ed-q-count");
        if (c) c.textContent = res.new ? res.new + " waiting" : "none waiting";
        if (!rows.length) {
          box.innerHTML = `<p class="muted">No questions have been sent through the website yet.</p>`;
          return;
        }
        box.innerHTML = rows.slice(0, 40).map((q) => {
          const isNew = (q.status || "New") === "New";
          const subject = encodeURIComponent("Re: your question (" + q.ticket + ")");
          const body = encodeURIComponent("\n\n---\nYou asked:\n" + (q.question || ""));
          return `<article class="card ed-q ${isNew ? "is-new" : ""}">
            <h4>${esc(q.topic || "No topic given")} <span class="ed-pill ${isNew ? "pending" : "applied"}">${esc(q.status || "New")}</span></h4>
            <div class="meta"><code>${esc(q.ticket)}</code> &middot; ${esc((q.received || "").slice(0, 16).replace("T", " "))}
              ${q.studentType ? " &middot; " + esc(q.studentType) : ""}</div>
            <div class="meta">${esc(q.name || "")} &middot; <a href="mailto:${esc(q.email)}?subject=${subject}&body=${body}">${esc(q.email)}</a></div>
            <p class="ed-q-text">${esc(q.question || "")}</p>
            ${q.context ? `<div class="meta">They had searched for: ${esc(q.context)}</div>` : ""}
            ${q.suspect ? `<div class="meta ed-suspect">Possibly automated: ${esc(q.suspect)}</div>` : ""}
            ${isNew
              ? `<label class="sr-only" for="rep-${esc(q.ticket)}">Reply for the student</label>
                 <textarea id="rep-${esc(q.ticket)}" class="ed-reply" rows="3"
                   placeholder="Optional: type the answer here and the student can read it when they check their reference number."></textarea>
                 <button type="button" class="btn-solid btn-sm" data-answered="${esc(q.ticket)}">Save reply &amp; mark answered</button>`
              : `${q.reply ? `<h5 class="ed-reply-h">Reply sent</h5><p class="ed-q-text st-reply">${esc(q.reply)}</p>` : ""}
                 <div class="meta">${esc(q.answeredBy || "")} ${esc((q.answeredAt || "").slice(0, 10))}</div>`}
          </article>`;
        }).join("");
      })
      .catch((err) => { box.innerHTML = `<p class="form-status is-error">${esc(err.message)}</p>`; });
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-answered]");
    if (!b) return;
    const box = document.getElementById("rep-" + b.dataset.answered);
    b.disabled = true; b.textContent = "Saving...";
    post({ type: "editor-answered", ticket: b.dataset.answered, status: "Answered",
           reply: box ? box.value.trim() : "" })
      .then(loadQuestions)
      .catch((err) => { b.disabled = false; b.textContent = err.message; });
  });

  function doLogin(e) {
    e.preventDefault();
    const status = $("#ed-status"), btn = e.target.querySelector("button");
    const email = $("#ed-email").value.trim(), passcode = $("#ed-code").value;
    if (!email || !passcode) { status.className = "form-status is-error"; status.textContent = "Enter your email and passcode."; return; }
    btn.disabled = true; btn.textContent = "Signing in...";
    status.className = "form-status"; status.textContent = "";
    post({ type: "editor-login", email, passcode })
      .then((res) => { token.set(res.token); me = res.editor; paint(); renderView(); })
      .catch((err) => {
        btn.disabled = false; btn.textContent = "Sign in";
        status.className = "form-status is-error"; status.textContent = err.message;
      });
  }

  const STATUS_LABEL = { pending: "Waiting", applied: "Applied", rejected: "Closed", "needs-info": "Needs info" };
  function loadCommits() {
    const box = $("#ed-list");
    if (!box) return;
    post({ type: "editor-commits", scope: me.role === "coordinator" ? "all" : "mine" })
      .then((res) => {
        if (!res.commits.length) {
          box.innerHTML = `<p class="muted">No commits yet. Open a question and choose <strong>Edit</strong> to send your first one.</p>`;
          return;
        }
        box.innerHTML = `<table class="ed-table"><thead><tr><th scope="col">Number</th><th scope="col">Change</th>
          <th scope="col">Where</th><th scope="col">Status</th>${me.role === "coordinator" ? '<th scope="col">Editor</th>' : ""}</tr></thead>
          <tbody>${res.commits.map((c) => `<tr>
            <td><code>${esc(c.id)}</code><div class="muted small">${esc((c.created || "").slice(0, 10))}</div></td>
            <td>${esc(c.title || "(untitled)")}${c.note ? `<div class="muted small">${esc(c.note.slice(0, 120))}</div>` : ""}</td>
            <td class="small">${esc(c.location || "")}</td>
            <td><span class="ed-pill ${esc(c.status || "pending")}">${esc(STATUS_LABEL[c.status] || c.status)}</span>
              ${c.statusNote ? `<div class="muted small">${esc(c.statusNote)}</div>` : ""}</td>
            ${me.role === "coordinator" ? `<td class="small">${esc(c.editorName || "")}</td>` : ""}
          </tr>`).join("")}</tbody></table>`;
      })
      .catch((err) => { box.innerHTML = `<p class="form-status is-error">${esc(err.message)}</p>`; });
  }

  // ---------------------------------------------------- staff-only answers
  const INTERNAL_ID = "internal";

  function addInternalTab() {
    const bar = document.querySelector(".audience");
    if (!bar || document.getElementById("tab-" + INTERNAL_ID)) return;
    const b = document.createElement("button");
    b.setAttribute("role", "tab");
    b.id = "tab-" + INTERNAL_ID;
    b.dataset.audience = INTERNAL_ID;
    b.setAttribute("aria-selected", "false");
    b.className = "tab-internal";
    b.innerHTML = "Faculty &amp; staff<small>Not shown to students</small>";
    b.addEventListener("click", () => { location.hash = INTERNAL_ID; });
    bar.appendChild(b);
  }

  function removeInternal() {
    const b = document.getElementById("tab-" + INTERNAL_ID);
    if (b) b.remove();
    const had = !!A.parts[INTERNAL_ID];
    if (had) {
      A.parts[INTERNAL_ID].sections.forEach((sec) => {
        delete A.byId[sec.id];
        (sec.questions || []).forEach((q) => delete A.byId[q.id]);
      });
      delete A.parts[INTERNAL_ID];
    }
    if (!had) return;
    // repaint, or the staff answers stay on screen after signing out
    if (A.renderAudience) A.renderAudience("graduate");
    if (location.hash === "#" + INTERNAL_ID) location.hash = "graduate";
  }

  function loadInternal() {
    if (!me || A.parts[INTERNAL_ID]) return Promise.resolve();
    return post({ type: "internal-faq" })
      .then((res) => {
        const sections = res.sections || [];
        if (!sections.length) return;
        const part = {
          id: INTERNAL_ID,
          title: "Faculty & staff",
          subtitle: (res.note ? res.note + " " : "") +
            "These answers are only visible to signed-in staff and faculty. Students never see them.",
          sections: sections,
        };
        A.parts[INTERNAL_ID] = part;
        sections.forEach((sec) => {
          A.byId[sec.id] = { kind: "section", part: part, section: sec };
          (sec.questions || []).forEach((q) => {
            q.text = q.text || "";
            A.byId[q.id] = { kind: "question", part: part, section: sec, question: q };
          });
        });
        addInternalTab();
      })
      .catch(() => { /* stay quiet: the public FAQ must keep working */ });
  }

  // ---------------------------------------------------- staff-only forms
  // Listed in the Forms view after sign-in; each download is fetched with the session token.
  function addFacultyForms() {
    if (!me || $("#faculty-forms")) return;
    post({ type: "faculty-forms" })
      .then((res) => {
        const files = res.files || [];
        if (!files.length || !me || $("#faculty-forms")) return;
        const wrap = document.createElement("div");
        wrap.id = "faculty-forms";
        wrap.innerHTML = `<h3 class="group-title">Faculty &amp; staff forms <span class="muted">signed-in staff only</span></h3>
          <div class="card-grid">${files.map((f) => `<article class="card card-internal"><h4>
            <a href="#forms" class="file-link" data-faculty-file="${esc(f.name)}">${esc(f.title)}</a></h4>
            <div class="meta"><span class="type ${esc(f.type.toLowerCase())}">${esc(f.type)}</span>${f.kb} KB<span class="badge internal">Faculty &amp; staff</span></div></article>`).join("")}</div>`;
        $("#view-forms").appendChild(wrap);
      })
      .catch(() => { /* hosted backends without faculty forms: nothing to show */ });
  }

  function removeFacultyForms() {
    const w = $("#faculty-forms");
    if (w) w.remove();
  }

  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-faculty-file]");
    if (!a) return;
    e.preventDefault();
    const name = a.dataset.facultyFile;
    a.setAttribute("aria-busy", "true");
    post({ type: "faculty-file", name })
      .then((res) => {
        const bin = atob(res.data), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const url = URL.createObjectURL(new Blob([bytes], { type: res.mime }));
        const dl = document.createElement("a");
        dl.href = url; dl.download = res.name;
        document.body.appendChild(dl); dl.click(); dl.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      })
      .catch((err) => { a.insertAdjacentHTML("afterend", `<span class="form-status is-error small"> ${esc(err.message)}</span>`); })
      .finally(() => a.removeAttribute("aria-busy"));
  });

  // ---------------------------------------------------- edit buttons on content
  function decorate(root) {
    if (!me) return;
    $$("details.qa", root).forEach((d) => {
      const tools = $(".answer-tools", d);
      if (!tools || $(".ed-edit", tools)) return;
      const id = d.dataset.qid || d.id.replace(/^r-/, "");
      const b = document.createElement("button");
      b.type = "button"; b.className = "ed-edit"; b.dataset.qid = id;
      b.textContent = "Edit this answer";
      tools.appendChild(b);
    });
    $$(".faq-section > h2", root).forEach((h) => {
      if ($(".ed-edit", h)) return;
      const b = document.createElement("button");
      b.type = "button"; b.className = "ed-edit ed-edit-sec"; b.dataset.secid = h.parentNode.id;
      b.textContent = "Edit section";
      h.appendChild(b);
    });
    $$("#dept-forms .card, #ext-forms .card", root).forEach((c) => {
      if ($(".ed-edit", c)) return;
      const link = $("h4 a", c);
      const b = document.createElement("button");
      b.type = "button"; b.className = "ed-edit ed-edit-form";
      b.dataset.form = link ? link.textContent : "";
      b.dataset.href = link ? link.getAttribute("href") : "";
      b.textContent = "Edit this form entry";
      c.appendChild(b);
    });
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest(".ed-edit");
    if (!b) return;
    e.preventDefault();
    if (b.dataset.qid) {
      const hit = A.byId[b.dataset.qid];
      if (!hit || hit.kind !== "question") return;
      openDrawer({
        kind: "question", action: "edit", targetId: b.dataset.qid, title: hit.question.q,
        location: hit.part.title + " - " + hit.section.code + ". " + hit.section.title,
        before: blocksToText(hit.question.blocks), heading: "Edit answer",
      });
    } else if (b.dataset.secid) {
      const hit = A.byId[b.dataset.secid];
      if (!hit) return;
      openDrawer({
        kind: "section", action: "edit", targetId: b.dataset.secid,
        title: hit.section.code + ". " + hit.section.title,
        location: hit.part.title,
        before: blocksToText(hit.section.blocks), heading: "Edit section",
      });
    } else {
      openDrawer({
        kind: "form", action: "form", targetId: b.dataset.href || "", title: b.dataset.form || "Form",
        location: "Forms and links", before: b.dataset.href || "", heading: "Edit form entry",
      });
    }
  });

  // ---------------------------------------------------- the commit drawer
  function openDrawer(t) {
    target = t;
    const d = $("#ed-drawer");
    const isText = t.kind === "question" || t.kind === "section" || t.kind === "new";
    $("#ed-drawer-title").textContent = t.heading;
    $("#ed-drawer-sub").textContent = t.title ? t.title + (t.location ? "  -  " + t.location : "") : t.location || "";
    $("#ed-action").value = t.action;
    $("#ed-new-title-row").hidden = t.kind !== "new";
    $("#ed-new-title").value = "";
    $("#ed-text-row").hidden = !isText;
    $("#ed-text").value = t.before || "";
    $("#ed-text").dataset.original = t.before || "";
    $("#ed-note").value = "";
    $("#ed-priority").value = "normal";
    const s = $("#ed-drawer-status"); s.className = "form-status"; s.textContent = "";
    $("#ed-commit").disabled = false;
    $("#ed-commit").textContent = "Commit change";
    d.hidden = false;
    document.body.classList.add("ed-drawer-open");
    setTimeout(() => (t.kind === "new" ? $("#ed-new-title") : isText ? $("#ed-text") : $("#ed-note")).focus(), 60);
  }
  function closeDrawer() {
    $("#ed-drawer").hidden = true;
    document.body.classList.remove("ed-drawer-open");
    target = null;
  }

  function submitCommit() {
    if (!target) return;
    const note = $("#ed-note").value.trim();
    const after = $("#ed-text").value;
    const before = $("#ed-text").dataset.original || "";
    const action = $("#ed-action").value;
    const s = $("#ed-drawer-status");
    const changedText = !$("#ed-text-row").hidden && after.trim() !== before.trim();
    if (!note && !changedText) {
      s.className = "form-status is-error";
      s.textContent = "Edit the text above, or write a note saying what should change.";
      $("#ed-note").focus();
      return;
    }
    if (target.kind === "new" && !$("#ed-new-title").value.trim()) {
      s.className = "form-status is-error";
      s.textContent = "Give the new question a title.";
      $("#ed-new-title").focus();
      return;
    }
    const btn = $("#ed-commit");
    btn.disabled = true; btn.textContent = "Sending...";
    s.className = "form-status"; s.textContent = "";
    post({
      type: "editor-commit",
      kind: target.kind, action,
      targetId: target.targetId,
      title: target.kind === "new" ? $("#ed-new-title").value.trim() : target.title,
      location: target.location,
      priority: $("#ed-priority").value,
      note,
      before: $("#ed-text-row").hidden ? "" : before,
      after: $("#ed-text-row").hidden ? "" : after,
    })
      .then((res) => {
        s.className = "form-status is-ok";
        s.innerHTML = `Saved as <strong>${esc(res.id)}</strong>. It will be reviewed and folded into the FAQ.`;
        btn.textContent = "Sent";
        if ($("#ed-list")) loadCommits();
        setTimeout(closeDrawer, 1800);
      })
      .catch((err) => {
        btn.disabled = false; btn.textContent = "Commit change";
        s.className = "form-status is-error"; s.textContent = err.message;
      });
  }

  function buildDrawer() {
    const d = document.createElement("div");
    d.id = "ed-drawer";
    d.hidden = true;
    d.setAttribute("role", "dialog");
    d.setAttribute("aria-modal", "true");
    d.setAttribute("aria-labelledby", "ed-drawer-title");
    d.innerHTML = `<div class="ed-backdrop" data-ed-close></div>
      <div class="ed-panel">
        <div class="ed-panel-head">
          <div><h2 id="ed-drawer-title">Edit</h2><p id="ed-drawer-sub" class="muted small"></p></div>
          <button type="button" class="ed-close" data-ed-close aria-label="Close">&times;</button>
        </div>
        <div class="ed-panel-body">
          <div class="field-row">
            <div class="field"><label for="ed-action">What kind of change?</label>
              <select id="ed-action">
                <option value="edit">Edit the wording of this answer</option>
                <option value="link">Fix a link or form attachment</option>
                <option value="form">Replace or update a form file</option>
                <option value="add">Add a new question</option>
                <option value="remove">Remove this question</option>
                <option value="other">Something else</option>
              </select></div>
            <div class="field"><label for="ed-priority">How urgent?</label>
              <select id="ed-priority">
                <option value="normal">Normal - next update</option>
                <option value="high">Urgent - students are being misinformed</option>
                <option value="low">Low - whenever convenient</option>
              </select></div>
          </div>
          <div class="field" id="ed-new-title-row" hidden>
            <label for="ed-new-title">New question</label>
            <input id="ed-new-title" maxlength="200" placeholder="How do I ...?">
          </div>
          <div class="field" id="ed-text-row">
            <label for="ed-text">Answer text <span class="muted small">edit it directly</span></label>
            <textarea id="ed-text" rows="14" spellcheck="true"></textarea>
            <p class="hint">Plain text. Keep <code>-</code> for bullets, <code>1.</code> for numbered steps,
              <code>**bold**</code>, and <code>[label](link)</code> for links. Formatting is rebuilt when the change is applied.</p>
          </div>
          <div class="field">
            <label for="ed-note">Note for the coordinator <span class="muted small">what changed and why</span></label>
            <textarea id="ed-note" rows="3" maxlength="4000" placeholder="e.g. The deadline moved to the 12th class day; confirmed with the Graduate School."></textarea>
          </div>
          <p id="ed-drawer-status" class="form-status" role="status" aria-live="polite"></p>
        </div>
        <div class="ed-panel-foot">
          <button type="button" class="link-btn" data-ed-close>Cancel</button>
          <button type="button" class="btn-solid" id="ed-commit">Commit change</button>
        </div>
      </div>`;
    document.body.appendChild(d);
    d.addEventListener("click", (e) => { if (e.target.closest("[data-ed-close]")) closeDrawer(); });
    $("#ed-commit", d).addEventListener("click", submitCommit);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !d.hidden) closeDrawer(); });
  }

  // ---------------------------------------------------- wiring
  function paint() {
    document.body.classList.toggle("is-editor", !!me);
    const link = $("#editor-link");
    const label = me ? (me.role === "coordinator" ? "Coordinator console" : "My console") : "Sign in";
    if (link) link.textContent = label;
    const nav = $("#nav-signin");
    if (nav) { nav.textContent = me ? "My console" : "Sign in"; nav.title = me ? label + " · " + me.name : "Faculty & staff sign-in, or check a question you sent"; }
    if (me) { decorate(document); loadInternal(); addFacultyForms(); }
    else { $$(".ed-edit").forEach((b) => b.remove()); removeInternal(); removeFacultyForms(); }
  }

  function onShow() { renderView(); }

  function start() {
    buildDrawer();
    new MutationObserver((muts) => {
      if (!me) return;
      muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) decorate(n.parentNode || document); }));
    }).observe($("#main"), { childList: true, subtree: true });

    fetch(API + (API.indexOf("?") >= 0 ? "&" : "?") + "action=hello")
      .then((r) => r.json())
      .then((j) => {
        canEdit = !!(j && j.editing);
        if (!canEdit) return;
        $$("[data-editor-only]").forEach((el) => (el.hidden = false));
        if (!token.get()) { paint(); if (isSignInHash()) onShow(); return; }
        post({ type: "editor-session" })
          .then((res) => { me = res.editor; paint(); if (isSignInHash()) onShow(); })
          .catch(() => { paint(); if (isSignInHash()) onShow(); });
      })
      .catch(() => { /* static hosting: no editing, stay hidden */ });
  }

  window.EEEditor = { onShow, decorate: () => decorate(document), get signedIn() { return !!me; } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
