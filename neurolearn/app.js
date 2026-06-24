(() => {
  "use strict";

  const data = window.NEURO_DATA;
  const examData = window.EXAM_DATA || { meta: {}, questions: [] };
  if (!data) {
    document.body.innerHTML =
      '<main style="padding:40px;font-family:sans-serif">Nie udało się wczytać danych aplikacji.</main>';
    return;
  }

  const content = document.querySelector("#content");
  const searchInput = document.querySelector("#global-search");
  const drawer = document.querySelector("#detail-drawer");
  const drawerContent = document.querySelector("#drawer-content");
  const backdrop = document.querySelector("#drawer-backdrop");
  const drawerClose = document.querySelector("#drawer-close");
  const progressRing = document.querySelector("#sidebar-progress-ring");
  const progressValue = document.querySelector("#sidebar-progress-value");
  const progressCopy = document.querySelector("#sidebar-progress-copy");

  const state = {
    view: "start",
    topicCategory: "Wszystkie",
    drugCategory: "Wszystkie",
    examTerm: "all",
    examLength: 10,
    examSession: null,
    wrongQuestions: loadWrongQuestions(),
    progress: loadProgress(),
  };

  const searchablePages = data.pages.map((page) => ({
    ...page,
    normalized: normalize(page.text),
  }));

  function normalize(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pl");
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function truncate(value, length = 260) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    return text.length > length ? `${text.slice(0, length).trim()}…` : text;
  }

  const studySectionTitles = [
    "Definicja",
    "Etiologia",
    "Epidemiologia",
    "Patogeneza",
    "Patomechanizm",
    "Czynniki ryzyka",
    "Obraz kliniczny",
    "Objawy",
    "Przebieg",
    "Postacie",
    "Podział",
    "Kryteria rozpoznania",
    "Rozpoznanie",
    "Diagnostyka",
    "Badania dodatkowe",
    "Różnicowanie",
    "Leczenie",
    "Profilaktyka",
    "Powikłania",
    "Rokowanie",
  ];

  function formatStudyText(value, options = {}) {
    const compact = Boolean(options.compact);
    let text = String(value || "")
      .replace(/\r/g, "")
      .replace(/[ \t]+/g, " ")
      .replace(/\n+/g, " ⏎ ")
      .trim();

    if (!text) return '<p class="study-empty">Brak tekstu w tym fragmencie.</p>';

    const titlePattern = studySectionTitles
      .sort((a, b) => b.length - a.length)
      .map((title) => title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|");
    const sectionRegex = new RegExp(`(^|[.;]?[\\s⏎]+)(${titlePattern})\\s*:?\\s*`, "gi");
    text = text.replace(sectionRegex, (_, prefix, title) => ` §SECTION§${title}§ `);

    const rawSections = text.split("§SECTION§").filter((section) => section.trim());
    const sections = rawSections.map((rawSection, index) => {
      const marker = rawSection.indexOf("§");
      if (marker > -1) {
        return {
          title: rawSection.slice(0, marker).trim(),
          body: rawSection.slice(marker + 1).trim(),
        };
      }
      return {
        title: rawSections.length > 1 || !compact ? "Najważniejsze informacje" : "",
        body: rawSection.trim(),
        intro: index === 0,
      };
    });

    return `
      <div class="study-content ${compact ? "is-compact" : ""}">
        ${sections
          .filter((section) => section.body)
          .map(
            (section) => `
              <section class="study-section ${section.intro ? "is-intro" : ""}">
                ${section.title ? `<h3>${escapeHtml(section.title)}</h3>` : ""}
                ${formatStudyBlock(section.body)}
              </section>`,
          )
          .join("")}
      </div>
    `;
  }

  function formatStudyBlock(value) {
    const normalized = String(value)
      .replace(/\s*⏎\s*/g, " ⏎ ")
      .replace(/\s+/g, " ")
      .trim();
    const markerRegex = /([➢❖▪•⎯])\s*/g;
    const matches = [...normalized.matchAll(markerRegex)];
    const items = [];

    if (matches.length) {
      const preamble = normalized.slice(0, matches[0].index).trim(" ;:-");
      if (preamble) items.push({ symbol: "◆", text: preamble, lead: true });
      matches.forEach((match, index) => {
        const start = match.index + match[0].length;
        const end = index + 1 < matches.length ? matches[index + 1].index : normalized.length;
        const item = normalized.slice(start, end).replace(/\s*⏎\s*/g, " ").trim(" ;");
        if (item) items.push({ symbol: studySymbol(match[1]), text: item });
      });
    } else {
      const chunks = normalized
        .split(/\s*⏎\s*|\s*;\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ0-9])/)
        .map((chunk) => chunk.trim(" ;"))
        .filter(Boolean);
      chunks.forEach((chunk, index) =>
        items.push({ symbol: index === 0 ? "◆" : "–", text: chunk, lead: index === 0 }),
      );
    }

    if (items.length === 1 && items[0].text.length > 520) {
      const sentences = items[0].text
        .split(/(?<=[.!?])\s+(?=[A-ZĄĆĘŁŃÓŚŹŻ])/)
        .filter(Boolean);
      if (sentences.length > 1) {
        return `<ul class="study-list">${sentences
          .map((sentence, index) => studyListItem(index === 0 ? "◆" : "–", sentence, index === 0))
          .join("")}</ul>`;
      }
    }

    return `<ul class="study-list">${items
      .map((item) => studyListItem(item.symbol, item.text, item.lead))
      .join("")}</ul>`;
  }

  function studySymbol(symbol) {
    if (symbol === "⎯" || symbol === "▪") return "–";
    if (symbol === "•") return "●";
    return symbol;
  }

  function studyListItem(symbol, value, lead = false) {
    const text = value.trim();
    const pair = text.match(/^([^:–—]{2,48})\s*(?::|–|—)\s+(.+)$/);
    if (pair) {
      return `
        <li class="study-item is-pair">
          <span class="study-symbol">${escapeHtml(symbol)}</span>
          <span class="study-key">${escapeHtml(pair[1])}</span>
          <span class="study-value">${escapeHtml(pair[2])}</span>
        </li>`;
    }
    return `
      <li class="study-item ${lead ? "is-lead" : ""}">
        <span class="study-symbol">${escapeHtml(symbol)}</span>
        <span class="study-value">${escapeHtml(text)}</span>
      </li>`;
  }

  function loadProgress() {
    try {
      return JSON.parse(localStorage.getItem("neurolearn-progress")) || {
        total: 0,
        hard: 0,
        medium: 0,
        easy: 0,
      };
    } catch {
      return { total: 0, hard: 0, medium: 0, easy: 0 };
    }
  }

  function loadWrongQuestions() {
    try {
      return new Set(JSON.parse(localStorage.getItem("neurolearn-wrong-questions")) || []);
    } catch {
      return new Set();
    }
  }

  function saveWrongQuestions() {
    localStorage.setItem(
      "neurolearn-wrong-questions",
      JSON.stringify(Array.from(state.wrongQuestions)),
    );
  }

  function saveProgress() {
    localStorage.setItem("neurolearn-progress", JSON.stringify(state.progress));
    updateProgressUI();
  }

  function updateProgressUI() {
    const total = state.progress.total;
    const score = total ? Math.round((state.progress.easy / total) * 100) : 0;
    progressValue.textContent = `${score}%`;
    progressRing.style.background = `radial-gradient(circle at center, #202f3a 56%, transparent 58%), conic-gradient(var(--teal) ${score * 3.6}deg, rgba(255,255,255,.1) 0)`;
    progressCopy.textContent = total
      ? `${state.progress.easy}/${total} poprawnych. ${state.wrongQuestions.size} pytań czeka na poprawę.`
      : "Rozwiąż pierwsze pytanie, żeby rozpocząć.";
  }

  function setView(view) {
    state.view = view;
    searchInput.value = "";
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.view === view);
    });
    render();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function render() {
    const renderers = {
      start: renderStart,
      topics: renderTopics,
      drugs: renderDrugs,
      diagnostics: renderDiagnostics,
      flashcards: renderFlashcards,
    };
    content.innerHTML = renderers[state.view]();
    wireContentActions();
  }

  function renderStart() {
    const featured = [
      data.topics.find((topic) => topic.title.includes("Udar mózgu")),
      data.topics.find((topic) => topic.title.includes("Stwardnienie rozsiane")),
      data.topics.find((topic) => topic.title.includes("Choroba Parkinsona")),
    ].filter(Boolean);

    return `
      <section class="hero">
        <div class="hero-copy">
          <div class="eyebrow">Neurologia bez przewijania 173 stron</div>
          <h1>Ucz się przez <em>połączenia.</em></h1>
          <p>Choroba → objawy → diagnostyka → leczenie. Cały skrypt jest przeszukiwalny, a wiedzę sprawdzisz na prawdziwych pytaniach egzaminacyjnych.</p>
          <div class="hero-actions">
            <button class="primary-btn" data-view-jump="flashcards">Rozpocznij test</button>
            <button class="secondary-btn" data-view-jump="topics">Przeglądaj materiał</button>
          </div>
        </div>
        <div class="hero-art" aria-hidden="true">
          <div class="brain-orbit"></div>
          <div class="brain-core">N</div>
        </div>
      </section>

      <section class="stats-grid" aria-label="Zawartość bazy">
        ${statCard(data.meta.topicCount, "tematów ze spisu treści")}
        ${statCard(data.meta.drugCount, "leków odnalezionych w skrypcie")}
        ${statCard(examData.meta.questionCount || 150, "pytań z egzaminów 2026")}
        ${statCard(data.meta.sourcePages, "strony materiału")}
      </section>

      <section class="section">
        <div class="section-title">
          <div>
            <h2>Zacznij od dużych tematów</h2>
            <p>Trzy rozdziały, które dobrze spinają objawy, diagnostykę i leczenie.</p>
          </div>
          <button class="link-button" data-view-jump="topics">Wszystkie tematy →</button>
        </div>
        <div class="quick-grid">
          ${featured.map((topic) => topicCard(topic, "quick-card")).join("")}
        </div>
      </section>

      <section class="section">
        <div class="section-title">
          <div>
            <h2>Trzy tryby nauki</h2>
            <p>Wyszukaj fakt, prześledź diagnostykę albo sprawdź pamięć bez zaglądania do odpowiedzi.</p>
          </div>
        </div>
        <div class="quick-grid">
          ${quickMode("Leki", "Zobacz kontekst, kategorię i strony, na których pojawia się substancja.", "drugs", "01")}
          ${quickMode("Diagnostyka", "Wyłapane ze skryptu fragmenty: rozpoznanie, różnicowanie i badania.", "diagnostics", "02")}
          ${quickMode("Testy", "Prawdziwe pytania z I i II terminu 2026, pięć odpowiedzi i klucz katedry.", "flashcards", "03")}
        </div>
      </section>

      <div class="notice">${escapeHtml(data.meta.notice)}</div>
    `;
  }

  function statCard(value, label) {
    return `<article class="stat-card"><strong>${value}</strong><span>${escapeHtml(label)}</span></article>`;
  }

  function quickMode(title, text, view, number) {
    return `
      <button class="quick-card" data-view-jump="${view}">
        <span class="card-kicker">${number}</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(text)}</p>
        <span class="quick-arrow">→</span>
      </button>
    `;
  }

  function renderTopics() {
    const categories = ["Wszystkie", ...data.categories.map((item) => item.name)];
    const visible =
      state.topicCategory === "Wszystkie"
        ? data.topics
        : data.topics.filter((topic) => topic.category === state.topicCategory);

    return `
      ${pageHeading("Tematy i choroby", `${visible.length} pozycji. Każda karta prowadzi do fragmentu skryptu i wskazuje stronę źródłową.`)}
      <div class="filters">
        ${categories
          .map(
            (category) =>
              `<button class="filter-pill ${category === state.topicCategory ? "is-active" : ""}" data-topic-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`,
          )
          .join("")}
      </div>
      <div class="topic-grid">
        ${visible.map((topic) => topicCard(topic)).join("")}
      </div>
      <div class="notice">${escapeHtml(data.meta.notice)}</div>
    `;
  }

  function topicCard(topic, className = "topic-card") {
    return `
      <button class="${className}" data-topic-id="${escapeHtml(topic.id)}" data-level="${topic.level}">
        <span class="page-badge">strona ${topic.page}</span>
        <h3>${escapeHtml(topic.title)}</h3>
        <p>${escapeHtml(truncate(topic.excerpt, 210))}</p>
        <span class="card-meta">
          <span class="category-tag">${escapeHtml(topic.category)}</span>
          <span>Otwórz →</span>
        </span>
      </button>
    `;
  }

  function renderDrugs() {
    const categories = [
      "Wszystkie",
      ...Array.from(new Set(data.drugs.map((drug) => drug.category))).sort((a, b) =>
        a.localeCompare(b, "pl"),
      ),
    ];
    const visible =
      state.drugCategory === "Wszystkie"
        ? data.drugs
        : data.drugs.filter((drug) => drug.category === state.drugCategory);

    return `
      ${pageHeading("Leki", `${visible.length} substancji znalezionych w treści. Kontekst pochodzi bezpośrednio ze skryptu.`)}
      <div class="filters">
        ${categories
          .map(
            (category) =>
              `<button class="filter-pill ${category === state.drugCategory ? "is-active" : ""}" data-drug-category="${escapeHtml(category)}">${escapeHtml(category)}</button>`,
          )
          .join("")}
      </div>
      <div class="drug-grid">
        ${visible.map(drugCard).join("")}
      </div>
      <div class="notice">${escapeHtml(data.meta.notice)}</div>
    `;
  }

  function drugCard(drug) {
    const firstContext = drug.mentions[0]?.context || "Otwórz kartę, aby zobaczyć kontekst.";
    return `
      <button class="drug-card" data-drug-id="${escapeHtml(drug.id)}">
        <span class="drug-symbol">Rx</span>
        <h3>${escapeHtml(drug.name)}</h3>
        <p>${escapeHtml(truncate(firstContext, 200))}</p>
        <span class="count-badge">${drug.count} ${drug.count === 1 ? "wzmianka" : "wzmianek"} · ${escapeHtml(drug.category)}</span>
      </button>
    `;
  }

  function renderDiagnostics() {
    return `
      ${pageHeading("Diagnostyka", `${data.diagnostics.length} fragmentów zawierających rozpoznanie, diagnostykę, różnicowanie lub badania dodatkowe.`)}
      <div class="diagnostic-grid">
        ${data.diagnostics.map(diagnosticCard).join("")}
      </div>
      <div class="notice">${escapeHtml(data.meta.notice)}</div>
    `;
  }

  function diagnosticCard(item) {
    return `
      <button class="diagnostic-card" data-diagnostic-id="${escapeHtml(item.id)}">
        <span class="page-badge">strona ${item.page}</span>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(truncate(item.text, 280))}</p>
        <span class="card-meta"><span>Fragment diagnostyczny</span><span>Otwórz →</span></span>
      </button>
    `;
  }

  function pageHeading(title, description) {
    return `
      <header class="page-heading">
        <div>
          <div class="eyebrow">Baza wiedzy</div>
          <h1>${escapeHtml(title)}</h1>
          <p>${escapeHtml(description)}</p>
        </div>
      </header>
    `;
  }

  function renderFlashcards() {
    if (!state.examSession) return renderExamSetup();
    if (state.examSession.finished) return renderExamSummary();
    return renderExamQuestion();
  }

  function renderExamSetup() {
    const pool = examQuestionPool();
    const selectedLength =
      state.examLength === "all" ? pool.length : Math.min(Number(state.examLength), pool.length);
    return `
      ${pageHeading("Testy egzaminacyjne", "150 prawdziwych pytań z neurologii 2026. Każde ma pięć wariantów A–E i jeden klucz odpowiedzi.")}
      <section class="exam-setup">
        <div class="exam-config">
          <div class="eyebrow">1 · Wybierz pulę</div>
          <div class="choice-grid">
            ${examChoice("all", "Wszystkie", `${examData.meta.questionCount || 150} pytań`)}
            ${examChoice("termin-1", "I termin", `${examData.meta.termOneCount || 100} pytań`)}
            ${examChoice("termin-2", "II termin", `${examData.meta.termTwoCount || 50} pytań`)}
            ${examChoice("wrong", "Moje błędy", `${state.wrongQuestions.size} pytań`)}
          </div>
        </div>
        <div class="exam-config">
          <div class="eyebrow">2 · Wybierz długość</div>
          <div class="choice-grid is-length">
            ${examLengthChoice(10, "Szybki", "10 pytań")}
            ${examLengthChoice(25, "Solidny", "25 pytań")}
            ${examLengthChoice(50, "Pełny blok", "50 pytań")}
            ${examLengthChoice("all", "Cała pula", `${pool.length} pytań`)}
          </div>
        </div>
        <div class="exam-launch">
          <div><strong>${selectedLength}</strong><span>pytań w tej sesji</span></div>
          <button class="primary-btn" data-start-exam ${pool.length ? "" : "disabled"}>Rozpocznij test →</button>
        </div>
      </section>
      <div class="notice">${escapeHtml(examData.meta.key || "Odpowiedzi pochodzą z klucza w przesłanych arkuszach.")}</div>
    `;
  }

  function examChoice(value, title, subtitle) {
    return `
      <button class="exam-choice ${state.examTerm === value ? "is-active" : ""}" data-exam-term="${value}">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </button>`;
  }

  function examLengthChoice(value, title, subtitle) {
    return `
      <button class="exam-choice ${String(state.examLength) === String(value) ? "is-active" : ""}" data-exam-length="${value}">
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </button>`;
  }

  function examQuestionPool() {
    if (state.examTerm === "wrong") {
      return examData.questions.filter((question) => state.wrongQuestions.has(question.id));
    }
    if (state.examTerm === "all") return [...examData.questions];
    return examData.questions.filter((question) => question.term === state.examTerm);
  }

  function shuffle(items) {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function startExam() {
    const pool = shuffle(examQuestionPool());
    const length =
      state.examLength === "all" ? pool.length : Math.min(Number(state.examLength), pool.length);
    if (!length) return;
    state.examSession = {
      questions: pool.slice(0, length),
      index: 0,
      answers: [],
      eliminated: [],
      score: 0,
      finished: false,
    };
    content.innerHTML = renderFlashcards();
    wireContentActions();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderExamQuestion() {
    const session = state.examSession;
    const question = session.questions[session.index];
    const answer = session.answers[session.index];
    const eliminated = new Set(session.eliminated[session.index] || []);
    const labels = ["A", "B", "C", "D", "E"];
    const progress = Math.round(
      ((session.index + (answer ? 1 : 0)) / session.questions.length) * 100,
    );
    const termLabel = question.term === "termin-1" ? "I termin" : "II termin";

    return `
      <div class="exam-topline">
        <div><span>${termLabel} · pytanie ${question.number}</span><strong>${session.index + 1} / ${session.questions.length}</strong></div>
        <div class="exam-progress"><span style="width:${progress}%"></span></div>
      </div>
      <section class="exam-question">
        <div class="exam-question-copy">
          <div class="eyebrow">Wybierz jedną odpowiedź</div>
          <h1>${escapeHtml(question.prompt)}</h1>
          ${
            question.context.length
              ? `<ol class="exam-context">${question.context.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ol>`
              : ""
          }
        </div>
        <div class="exam-options">
          ${question.options
            .map((option, index) => {
              const isCorrect = answer && index === question.correct;
              const isWrong = answer && index === answer.selected && !answer.correct;
              const classes = [
                "exam-option",
                isCorrect ? "is-correct" : "",
                isWrong ? "is-wrong" : "",
                eliminated.has(index) ? "is-eliminated" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return `
                <button class="${classes}" data-exam-option="${index}" ${answer || eliminated.has(index) ? "disabled" : ""}>
                  <span>${labels[index]}</span>
                  <strong>${escapeHtml(option)}</strong>
                  ${isCorrect ? '<b aria-label="Poprawna odpowiedź">✓</b>' : ""}
                  ${isWrong ? '<b aria-label="Błędna odpowiedź">×</b>' : ""}
                </button>`;
            })
            .join("")}
        </div>
        ${
          answer
            ? `<div class="exam-feedback ${answer.correct ? "is-correct" : "is-wrong"}">
                <strong>${answer.correct ? "Dobrze!" : "Nie tym razem."}</strong>
                <span>Poprawna odpowiedź: ${labels[question.correct]}. ${escapeHtml(question.options[question.correct])}</span>
              </div>
              <button class="primary-btn exam-next" data-exam-next>${session.index + 1 === session.questions.length ? "Zobacz wynik" : "Następne pytanie"} →</button>`
            : `<button class="hint-button" data-exam-hint ${eliminated.size ? "disabled" : ""}>−2 Usuń dwa dystraktory</button>`
        }
      </section>
    `;
  }

  function renderExamSummary() {
    const session = state.examSession;
    const percent = Math.round((session.score / session.questions.length) * 100);
    const wrongInSession = session.answers.filter((answer) => !answer.correct).length;
    return `
      ${pageHeading("Wynik testu", "Błędne pytania zostały automatycznie zapisane do osobnej puli.")}
      <section class="exam-summary">
        <div class="score-orbit" style="--score:${percent * 3.6}deg">
          <strong>${percent}%</strong><span>${session.score}/${session.questions.length}</span>
        </div>
        <div class="summary-copy">
          <div class="eyebrow">${percent >= 80 ? "Bardzo dobry kierunek" : percent >= 60 ? "Blisko progu pewności" : "Materiał do dogrania"}</div>
          <h2>${session.score} poprawnych, ${wrongInSession} do powtórki</h2>
          <p>Możesz od razu przejść przez zapisane błędy albo uruchomić nową, losową sesję z tej samej puli.</p>
          <div class="summary-actions">
            <button class="primary-btn" data-exam-restart>Powtórz podobny test</button>
            <button class="secondary-btn dark" data-exam-wrong ${state.wrongQuestions.size ? "" : "disabled"}>Ćwicz moje błędy</button>
            <button class="link-button" data-exam-reset>Wybierz inny test</button>
          </div>
        </div>
      </section>
    `;
  }

  function chooseExamAnswer(optionIndex) {
    const session = state.examSession;
    if (!session || session.answers[session.index]) return;
    const question = session.questions[session.index];
    const correct = optionIndex === question.correct;
    session.answers[session.index] = { selected: optionIndex, correct };
    if (correct) {
      session.score += 1;
      state.progress.easy += 1;
      state.wrongQuestions.delete(question.id);
    } else {
      state.progress.hard += 1;
      state.wrongQuestions.add(question.id);
    }
    state.progress.total += 1;
    saveWrongQuestions();
    saveProgress();
    content.innerHTML = renderFlashcards();
    wireContentActions();
  }

  function eliminateExamOptions() {
    const session = state.examSession;
    if (!session || session.answers[session.index]) return;
    const question = session.questions[session.index];
    const distractors = shuffle(
      question.options.map((_, index) => index).filter((index) => index !== question.correct),
    );
    session.eliminated[session.index] = distractors.slice(0, 2);
    content.innerHTML = renderFlashcards();
    wireContentActions();
  }

  function nextExamQuestion() {
    const session = state.examSession;
    if (session.index + 1 >= session.questions.length) session.finished = true;
    else session.index += 1;
    content.innerHTML = renderFlashcards();
    wireContentActions();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderSearch(query) {
    const normalizedQuery = normalize(query).trim();
    if (!normalizedQuery) {
      render();
      return;
    }

    const topics = data.topics
      .filter((topic) => normalize(`${topic.title} ${topic.category} ${topic.excerpt}`).includes(normalizedQuery))
      .slice(0, 18);
    const drugs = data.drugs
      .filter((drug) =>
        normalize(
          `${drug.name} ${drug.category} ${drug.mentions.map((item) => item.context).join(" ")}`,
        ).includes(normalizedQuery),
      )
      .slice(0, 12);
    const pages = searchablePages
      .filter((page) => page.normalized.includes(normalizedQuery))
      .slice(0, 15);
    const total = topics.length + drugs.length + pages.length;

    content.innerHTML = `
      ${pageHeading(`Wyniki: „${query}”`, total ? `Znaleziono ${total} pasujących kart i stron.` : "Brak wyników. Spróbuj krótszego hasła albo innej odmiany słowa.")}
      ${
        total
          ? `<div class="search-grid">
              ${topics.map((topic) => searchCard("Temat", topic.title, topic.excerpt, `data-topic-id="${escapeHtml(topic.id)}"`, topic.page)).join("")}
              ${drugs.map((drug) => searchCard("Lek", drug.name, drug.mentions[0]?.context, `data-drug-id="${escapeHtml(drug.id)}"`, drug.mentions[0]?.page)).join("")}
              ${pages.map((page) => searchPageCard(page, normalizedQuery)).join("")}
             </div>`
          : `<div class="empty-state">W skrypcie nie znalazłem takiego ciągu znaków.</div>`
      }
    `;
    wireContentActions();
  }

  function searchCard(type, title, text, dataAttribute, page) {
    return `
      <button class="search-card" ${dataAttribute}>
        <span class="page-badge">${escapeHtml(type)} · strona ${page || "—"}</span>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(truncate(text, 260))}</p>
      </button>
    `;
  }

  function searchPageCard(page, normalizedQuery) {
    const index = page.normalized.indexOf(normalizedQuery);
    const rawStart = Math.max(0, index - 160);
    const snippet = page.text.slice(rawStart, rawStart + 520);
    return searchCard(
      "Pełny tekst",
      `Strona ${page.page}`,
      snippet,
      `data-page-number="${page.page}"`,
      page.page,
    );
  }

  function wireContentActions() {
    content.querySelectorAll("[data-view-jump]").forEach((button) => {
      button.addEventListener("click", () => setView(button.dataset.viewJump));
    });
    content.querySelectorAll("[data-topic-id]").forEach((button) => {
      button.addEventListener("click", () => openTopic(button.dataset.topicId));
    });
    content.querySelectorAll("[data-drug-id]").forEach((button) => {
      button.addEventListener("click", () => openDrug(button.dataset.drugId));
    });
    content.querySelectorAll("[data-diagnostic-id]").forEach((button) => {
      button.addEventListener("click", () => openDiagnostic(button.dataset.diagnosticId));
    });
    content.querySelectorAll("[data-page-number]").forEach((button) => {
      button.addEventListener("click", () => openPage(Number(button.dataset.pageNumber)));
    });
    content.querySelectorAll("[data-topic-category]").forEach((button) => {
      button.addEventListener("click", () => {
        state.topicCategory = button.dataset.topicCategory;
        renderTopicsIntoContent();
      });
    });
    content.querySelectorAll("[data-drug-category]").forEach((button) => {
      button.addEventListener("click", () => {
        state.drugCategory = button.dataset.drugCategory;
        content.innerHTML = renderDrugs();
        wireContentActions();
      });
    });
    content.querySelectorAll("[data-exam-term]").forEach((button) => {
      button.addEventListener("click", () => {
        state.examTerm = button.dataset.examTerm;
        content.innerHTML = renderFlashcards();
        wireContentActions();
      });
    });
    content.querySelectorAll("[data-exam-length]").forEach((button) => {
      button.addEventListener("click", () => {
        state.examLength = button.dataset.examLength;
        content.innerHTML = renderFlashcards();
        wireContentActions();
      });
    });
    content.querySelector("[data-start-exam]")?.addEventListener("click", startExam);
    content.querySelectorAll("[data-exam-option]").forEach((button) => {
      button.addEventListener("click", () => {
        chooseExamAnswer(Number(button.dataset.examOption));
      });
    });
    content.querySelector("[data-exam-hint]")?.addEventListener("click", eliminateExamOptions);
    content.querySelector("[data-exam-next]")?.addEventListener("click", nextExamQuestion);
    content.querySelector("[data-exam-restart]")?.addEventListener("click", startExam);
    content.querySelector("[data-exam-reset]")?.addEventListener("click", () => {
      state.examSession = null;
      content.innerHTML = renderFlashcards();
      wireContentActions();
    });
    content.querySelector("[data-exam-wrong]")?.addEventListener("click", () => {
      state.examTerm = "wrong";
      state.examSession = null;
      content.innerHTML = renderFlashcards();
      wireContentActions();
    });
  }

  function renderTopicsIntoContent() {
    content.innerHTML = renderTopics();
    wireContentActions();
  }

  function sourceLink(page) {
    return `<a class="source-link" href="assets/NASIOSKRYPT-NEUROLOGIA.pdf#page=${page + 1}" target="_blank" rel="noreferrer">Otwórz źródłową stronę PDF ↗</a>`;
  }

  function openTopic(id) {
    const topic = data.topics.find((item) => item.id === id);
    if (!topic) return;
    openDrawer(`
      <div class="drawer-kicker">${escapeHtml(topic.category)} · strona ${topic.page}</div>
      <h2>${escapeHtml(topic.title)}</h2>
      <p class="drawer-subtitle">Fragment materiału przypisany do tego hasła.</p>
      <div class="drawer-body">${formatStudyText(topic.excerpt || "Brak krótkiego fragmentu. Otwórz stronę źródłową.")}</div>
      ${sourceLink(topic.page)}
      <div class="notice">${escapeHtml(data.meta.notice)}</div>
    `);
  }

  function openDrug(id) {
    const drug = data.drugs.find((item) => item.id === id);
    if (!drug) return;
    openDrawer(`
      <div class="drawer-kicker">${escapeHtml(drug.category)} · ${drug.count} wzmianek</div>
      <h2>${escapeHtml(drug.name)}</h2>
      <p class="drawer-subtitle">Poniżej są konteksty występowania leku w skrypcie. To nie jest samodzielna informacja o dawkowaniu.</p>
      <div class="drawer-body">
        ${drug.mentions
          .map(
            (mention) => `
              <article class="mention">
                <strong>STRONA ${mention.page}</strong>
                ${formatStudyText(mention.context, { compact: true })}
                ${sourceLink(mention.page)}
              </article>`,
          )
          .join("")}
      </div>
      <div class="notice">${escapeHtml(data.meta.notice)}</div>
    `);
  }

  function openDiagnostic(id) {
    const item = data.diagnostics.find((diagnostic) => diagnostic.id === id);
    if (!item) return;
    openDrawer(`
      <div class="drawer-kicker">Diagnostyka · strona ${item.page}</div>
      <h2>${escapeHtml(item.title)}</h2>
      <div class="drawer-body">${formatStudyText(item.text)}</div>
      ${sourceLink(item.page)}
      <div class="notice">${escapeHtml(data.meta.notice)}</div>
    `);
  }

  function openPage(pageNumber) {
    const page = data.pages.find((item) => item.page === pageNumber);
    if (!page) return;
    openDrawer(`
      <div class="drawer-kicker">Pełny tekst strony</div>
      <h2>Strona ${page.page}</h2>
      <div class="drawer-body">${formatStudyText(page.text)}</div>
      ${sourceLink(page.page)}
      <div class="notice">${escapeHtml(data.meta.notice)}</div>
    `);
  }

  function openDrawer(html) {
    drawerContent.innerHTML = html;
    backdrop.hidden = false;
    requestAnimationFrame(() => {
      drawer.classList.add("is-open");
      drawer.setAttribute("aria-hidden", "false");
    });
    document.body.style.overflow = "hidden";
  }

  function closeDrawer() {
    drawer.classList.remove("is-open");
    drawer.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    window.setTimeout(() => {
      backdrop.hidden = true;
    }, 220);
  }

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => setView(button.dataset.view));
  });
  document.querySelectorAll("[data-view-link]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      setView(link.dataset.viewLink);
    });
  });
  searchInput.addEventListener("input", () => renderSearch(searchInput.value));
  drawerClose.addEventListener("click", closeDrawer);
  backdrop.addEventListener("click", closeDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeDrawer();
    if (event.key === "/" && document.activeElement !== searchInput) {
      event.preventDefault();
      searchInput.focus();
    }
  });

  updateProgressUI();
  render();
})();
