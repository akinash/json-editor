// Core application for JSON background config editor
(function () {
  "use strict";

  const DEFAULT_URL =
    "https://cdnweb.sberbank.ru/greeting/loaders/web_config_v3.json";

  const DATE_RULE_TYPES = {
    DEFAULT: "default",
    RANGE: "range",
    DAY_OF_YEAR: "day_of_year",
    WEEKDAY_IN_MONTH: "weekday_in_month",
  };

  const DATE_RULE_KEYS = {
    range: ["start", "end"],
    dayOfYear: ["startDayOfYear", "endDayOfYear"],
    weekdayInMonth: ["xDayOfWeek", "yWeek", "zMonth"],
  };

  const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const MONTH_SHORT = [
    "янв",
    "фев",
    "мар",
    "апр",
    "май",
    "июн",
    "июл",
    "авг",
    "сен",
    "окт",
    "ноя",
    "дек",
  ];
  const WEEKDAY_SHORT = {
    1: "пн",
    2: "вт",
    3: "ср",
    4: "чт",
    5: "пт",
    6: "сб",
    7: "вс",
  };
  const TIME_OF_DAY_KEYS = ["morning", "day", "evening", "night"];
  const TIME_OF_DAY_DEFAULT_MAP = {
    morning: "day",
    day: "day",
    evening: "night",
    night: "night",
  };
  const TIME_OF_DAY_LABELS = {
    morning: "Утро",
    day: "День",
    evening: "Вечер",
    night: "Ночь",
  };

  /**
   * Application state
   * entries: [{ key: string, data: any }]
   */
  const state = {
    entries: [],
    lastValidJsonText: "",
    lastValidJsonObj: null,
  };

  let editor = null;
  let suppressEditorChange = false;
  let dragSourceIndex = null;
  let rulesValidationTimer = null;

  // DOM elements
  let urlInput,
    loadJsonBtn,
    urlErrorEl,
    jsonErrorEl,
    formatBtn,
    downloadBtn,
    themeToggleBtn,
    addObjectBtn,
    objectsListEl,
    objectsEmptyStateEl,
    rulesValidationEl;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheDom();
    setupAceEditor();
    attachHandlers();
    initTheme();
    hydrateInitialUrl();
    loadJsonFromUrl();
  }

  function cacheDom() {
    urlInput = document.getElementById("json-url-input");
    loadJsonBtn = document.getElementById("load-json-btn");
    urlErrorEl = document.getElementById("url-error");

    jsonErrorEl = document.getElementById("json-error");
    formatBtn = document.getElementById("format-json-btn");
    downloadBtn = document.getElementById("download-json-btn");
    themeToggleBtn = document.getElementById("theme-toggle-btn");

    addObjectBtn = document.getElementById("add-object-btn");
    objectsListEl = document.getElementById("objects-list");
    objectsEmptyStateEl = document.getElementById("objects-empty-state");
    rulesValidationEl = document.getElementById("rules-validation");
  }

  function hydrateInitialUrl() {
    if (urlInput && !urlInput.value) {
      urlInput.value = DEFAULT_URL;
    }
  }

  function setupAceEditor() {
    editor = ace.edit("json-editor");
    editor.session.setMode("ace/mode/json");
    editor.setTheme("ace/theme/textmate");
    editor.setOptions({
      enableBasicAutocompletion: true,
      enableLiveAutocompletion: false,
      enableSnippets: false,
      showPrintMargin: false,
    });
    const session = editor.getSession();
    session.setUseSoftTabs(true);
    session.setTabSize(2);
    session.setUseWrapMode(true);
    session.setFoldStyle("markbegin");

    session.on("change", handleEditorChange);
  }

  function attachHandlers() {
    if (loadJsonBtn) {
      loadJsonBtn.addEventListener("click", function () {
        loadJsonFromUrl();
      });
    }

    if (formatBtn) {
      formatBtn.addEventListener("click", function () {
        formatJson();
      });
    }

    if (downloadBtn) {
      downloadBtn.addEventListener("click", function () {
        downloadCurrentJson();
      });
    }

    if (addObjectBtn) {
      addObjectBtn.addEventListener("click", function () {
        handleAddObject();
      });
    }

    if (themeToggleBtn) {
      themeToggleBtn.addEventListener("click", function () {
        cycleThemePreference();
      });
    }
  }

  // ---------------- Theme ----------------

  function initTheme() {
    const saved = getThemePreference();
    const initial =
      saved === "light" || saved === "dark" ? saved : getSystemThemePreference();
    applyThemePreference(initial);
  }

  function getThemePreference() {
    try {
      return localStorage.getItem("theme-preference");
    } catch (e) {
      return "";
    }
  }

  function setThemePreference(value) {
    try {
      localStorage.setItem("theme-preference", value);
    } catch (e) {
      // ignore storage errors
    }
  }

  function cycleThemePreference() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    setThemePreference(next);
    applyThemePreference(next);
  }

  function applyThemePreference(preference) {
    const root = document.documentElement;
    root.setAttribute("data-theme", preference);
    applyEditorTheme(preference);
    if (!themeToggleBtn) return;
    const isDark = preference === "dark";
    const iconEl = themeToggleBtn.querySelector(".theme-toggle-btn-icon");
    const textEl = themeToggleBtn.querySelector(".theme-toggle-btn-text");
    if (iconEl) {
      iconEl.textContent = isDark ? "🌙" : "☀️";
    }
    if (textEl) {
      textEl.textContent = isDark ? "Тёмная тема" : "Светлая тема";
    } else {
      themeToggleBtn.textContent = (isDark ? "🌙 " : "☀️ ") + (isDark ? "Тёмная тема" : "Светлая тема");
    }
    themeToggleBtn.dataset.theme = isDark ? "dark" : "light";
    themeToggleBtn.title = "Переключить тему";
    themeToggleBtn.setAttribute(
      "aria-label",
      isDark ? "Активна тёмная тема. Переключить на светлую." : "Активна светлая тема. Переключить на тёмную."
    );
  }

  function getSystemThemePreference() {
    if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return "dark";
    }
    return "light";
  }

  function applyEditorTheme(preference) {
    if (!editor) return;
    editor.setTheme(
      preference === "dark" ? "ace/theme/tomorrow_night" : "ace/theme/textmate"
    );
  }

  // ---------------- JSON loading & parsing ----------------

  async function loadJsonFromUrl() {
    clearUrlError();

    const url = (urlInput && urlInput.value.trim()) || "";
    if (!url) {
      setUrlError("URL не должен быть пустым.");
      return;
    }

    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error("HTTP " + response.status);
      }
      const text = await response.text();

      let parsed;
      try {
        parsed = text.trim() ? JSON.parse(text) : {};
      } catch (e) {
        setUrlError("Ошибка парсинга загруженного JSON: " + e.message);
        setEditorText("");
        state.entries = [];
        state.lastValidJsonObj = null;
        state.lastValidJsonText = "";
        renderVisualEditor();
        return;
      }

      clearJsonError();
      state.lastValidJsonObj = parsed;
      state.entries = buildEntriesFromObject(parsed);

      const pretty = JSON.stringify(parsed, null, 2);
      state.lastValidJsonText = pretty;
      setEditorText(pretty);
      renderVisualEditor();
    } catch (e) {
      setUrlError("Не удалось загрузить JSON: " + e.message);
      if (!state.lastValidJsonObj) {
        setEditorText("");
        state.entries = [];
        renderVisualEditor();
      }
    }
  }

  function buildEntriesFromObject(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
      return [];
    }
    const entries = [];
    Object.keys(obj).forEach(function (key) {
      entries.push({
        key: key,
        data: obj[key],
      });
    });
    return entries;
  }

  function rebuildObjectFromEntries() {
    const result = {};
    state.entries.forEach(function (entry) {
      result[entry.key] = entry.data;
    });
    return result;
  }

  function setEditorText(text) {
    if (!editor) return;
    suppressEditorChange = true;
    editor.setValue(text || "", -1);
    suppressEditorChange = false;
  }

  function handleEditorChange() {
    if (suppressEditorChange || !editor) {
      return;
    }

    const text = editor.getValue();
    if (!text.trim()) {
      clearJsonError();
      state.lastValidJsonObj = {};
      state.lastValidJsonText = "";
      state.entries = [];
      renderVisualEditor();
      return;
    }

    try {
      const parsed = JSON.parse(text);
      clearJsonError();

      state.lastValidJsonObj = parsed;
      state.lastValidJsonText = text;
      state.entries = buildEntriesFromObject(parsed);
      renderVisualEditor();
    } catch (e) {
      setJsonError("Ошибка парсинга JSON: " + e.message);
    }
  }

  function formatJson() {
    if (!editor) return;
    const text = editor.getValue();
    if (!text.trim()) {
      return;
    }
    try {
      const parsed = JSON.parse(text);
      const pretty = JSON.stringify(parsed, null, 2);
      state.lastValidJsonObj = parsed;
      state.lastValidJsonText = pretty;
      clearJsonError();
      setEditorText(pretty);
    } catch (e) {
      setJsonError("Невозможно отформатировать: JSON невалидный (" + e.message + ")");
    }
  }

  function downloadCurrentJson() {
    if (!editor) return;
    const text = editor.getValue();
    try {
      if (text.trim()) {
        JSON.parse(text);
      }
      clearJsonError();
    } catch (e) {
      setJsonError("Скачивание отменено: JSON невалидный (" + e.message + ")");
      return;
    }
    const blob = new Blob([text], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "background-config.json";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function clearUrlError() {
    if (urlErrorEl) urlErrorEl.textContent = "";
  }

  function setUrlError(message) {
    if (urlErrorEl) urlErrorEl.textContent = message;
  }

  function clearJsonError() {
    if (jsonErrorEl) jsonErrorEl.textContent = "";
  }

  function setJsonError(message) {
    if (jsonErrorEl) jsonErrorEl.textContent = message;
  }

  // ---------------- Visual editor ----------------

  function renderVisualEditor() {
    if (!objectsListEl || !objectsEmptyStateEl) return;

    objectsListEl.innerHTML = "";

    if (!state.entries.length) {
      objectsEmptyStateEl.hidden = false;
      renderRulesValidation([]);
      return;
    }

    objectsEmptyStateEl.hidden = true;

    state.entries.forEach(function (entry, index) {
      const detailsEl = document.createElement("details");
      detailsEl.className = "object-card";
      detailsEl.dataset.index = String(index);
      detailsEl.dataset.key = entry.key;
      detailsEl.addEventListener("dragover", handleCardDragOver);
      detailsEl.addEventListener("dragleave", handleCardDragLeave);
      detailsEl.addEventListener("drop", handleCardDrop);

      const summaryEl = document.createElement("summary");
      const summaryInner = createSummaryContent(entry, index, detailsEl);
      summaryEl.appendChild(summaryInner);
      detailsEl.appendChild(summaryEl);

      const body = document.createElement("div");
      body.className = "object-body";
      buildObjectFormBody(body, entry, index);

      detailsEl.appendChild(body);
      objectsListEl.appendChild(detailsEl);
    });

    scheduleRulesValidation();
  }

  function createSummaryContent(entry, index, detailsEl) {
    const wrapper = document.createElement("div");
    wrapper.className = "object-summary";

    const main = document.createElement("div");
    main.className = "object-summary-main";

    const line1 = document.createElement("div");
    line1.className = "object-summary-line";

    const keySpan = document.createElement("span");
    keySpan.className = "object-summary-key";
    keySpan.textContent = entry.key || "(без ключа)";

    const rawDesc = entry.data && entry.data.description;
    const desc = typeof rawDesc === "string" ? rawDesc.trim() : "";

    line1.appendChild(keySpan);
    if (desc) {
      const descSpan = document.createElement("span");
      descSpan.className = "object-summary-desc";
      descSpan.textContent = desc;
      line1.appendChild(descSpan);
    }

    const line2 = document.createElement("div");
    line2.className = "object-summary-dates";
    const options = (entry.data && entry.data.options) || {};
    line2.textContent = getRuleSummaryText(options);

    main.appendChild(line1);
    main.appendChild(line2);

    const actions = document.createElement("div");
    actions.className = "object-summary-actions";

    const status = getEntryStatus(entry);
    const statusChip = document.createElement("span");
    statusChip.className = "object-status object-status-" + status;
    statusChip.textContent = status === "ok" ? "OK" : status === "warn" ? "!" : "ERR";
    statusChip.title =
      status === "ok"
        ? "Ошибок нет"
        : status === "warn"
        ? "Есть предупреждения"
        : "Есть ошибки";

    const dragHandle = document.createElement("button");
    dragHandle.type = "button";
    dragHandle.className = "object-drag-handle";
    dragHandle.textContent = "⋮⋮";
    dragHandle.title = "Перетащить";
    dragHandle.dataset.index = String(index);
    dragHandle.draggable = !detailsEl.open;
    dragHandle.addEventListener("mousedown", stopSummaryToggleFromHandleMouseDown);
    dragHandle.addEventListener("click", stopSummaryToggleFromHandleClick);
    dragHandle.addEventListener("dragstart", handleCardDragStart);
    dragHandle.addEventListener("dragend", handleCardDragEnd);

    const toggle = document.createElement("span");
    toggle.className = "object-summary-toggle";
    toggle.textContent = ">";

    actions.appendChild(statusChip);
    actions.appendChild(dragHandle);
    actions.appendChild(toggle);

    detailsEl.addEventListener("toggle", function () {
      dragHandle.draggable = !detailsEl.open;
      dragHandle.classList.toggle("object-drag-handle-disabled", detailsEl.open);
    });

    wrapper.appendChild(main);
    wrapper.appendChild(actions);

    return wrapper;
  }

  function stopSummaryToggleFromHandleMouseDown(event) {
    event.stopPropagation();
  }

  function stopSummaryToggleFromHandleClick(event) {
    event.preventDefault();
    event.stopPropagation();
  }

  function buildObjectFormBody(container, entry, index) {
    const data = ensureObjectShape(entry.data);
    entry.data = data;

    const codeErrorEl = document.createElement("div");
    codeErrorEl.className = "field-error-card";
    codeErrorEl.style.display = "none";
    container.appendChild(codeErrorEl);

    const mainSegment = document.createElement("div");
    mainSegment.className = "object-segment";

    const codeField = createLabeledInput("Код заставки", entry.key);
    codeField.input.maxLength = 25;

    const descField = createLabeledInput(
      "Подпись к заставке",
      data.description || ""
    );
    descField.input.maxLength = 50;

    const ruleTypeField = createLabeledSelect(
      "Тип правила",
      [
        { value: DATE_RULE_TYPES.DEFAULT, label: "По умолчанию" },
        { value: DATE_RULE_TYPES.RANGE, label: "Диапазон дат (DD.MM)" },
        { value: DATE_RULE_TYPES.DAY_OF_YEAR, label: "Номер дня года" },
        { value: DATE_RULE_TYPES.WEEKDAY_IN_MONTH, label: "День недели в месяце" },
      ],
      detectDateRuleType(data.options)
    );

    const ruleFields = document.createElement("div");
    ruleFields.className = "rule-fields";

    const rangeRow = document.createElement("div");
    rangeRow.className = "field-row-inline";
    const startField = createLabeledInput(
      "Дата начала (DD.MM)",
      jsonRangeDateToUiDate(data.options.start)
    );
    const endField = createLabeledInput(
      "Дата конца (DD.MM)",
      jsonRangeDateToUiDate(data.options.end)
    );
    rangeRow.appendChild(startField.wrapper);
    rangeRow.appendChild(endField.wrapper);

    const calendarControl = document.createElement("div");
    calendarControl.className = "calendar-inline";
    const openCalendarBtn = document.createElement("button");
    openCalendarBtn.type = "button";
    openCalendarBtn.className = "btn btn-outline btn-calendar";
    openCalendarBtn.textContent = "📅 Выбрать диапазон";
    openCalendarBtn.setAttribute("aria-label", "Открыть календарь");
    calendarControl.appendChild(openCalendarBtn);

    const rangePopup = createRangePickerPopup({
      getStart: function () {
        return startField.input.value;
      },
      getEnd: function () {
        return endField.input.value;
      },
      previewRange: function (startUi, endUi) {
        startField.input.value = startUi;
        endField.input.value = endUi;
      },
      setRange: function (startUi, endUi) {
        startField.input.value = startUi;
        endField.input.value = endUi;
        data.options.start = normalizeRangeDateForJson(startUi);
        data.options.end = normalizeRangeDateForJson(endUi);
        syncJsonFromEntries();
        scheduleRulesValidation();
      },
      clearRange: function () {
        startField.input.value = "";
        endField.input.value = "";
        data.options.start = "";
        data.options.end = "";
        syncJsonFromEntries();
        scheduleRulesValidation();
      },
    });
    calendarControl.appendChild(rangePopup.wrapper);
    openCalendarBtn.addEventListener("click", function () {
      rangePopup.open();
    });
    rangeRow.appendChild(calendarControl);

    const dayOfYearRow = document.createElement("div");
    dayOfYearRow.className = "field-row-inline";
    const startDayField = createLabeledInput(
      "День года: с",
      getStringValue(data.options.startDayOfYear)
    );
    const endDayField = createLabeledInput(
      "День года: по",
      getStringValue(data.options.endDayOfYear)
    );
    dayOfYearRow.appendChild(startDayField.wrapper);
    dayOfYearRow.appendChild(endDayField.wrapper);

    const weekRow = document.createElement("div");
    weekRow.className = "field-row-inline";
    const xDayField = createLabeledSelect(
      "День недели",
      [
        { value: "", label: "Выберите" },
        { value: "1", label: "Понедельник" },
        { value: "2", label: "Вторник" },
        { value: "3", label: "Среда" },
        { value: "4", label: "Четверг" },
        { value: "5", label: "Пятница" },
        { value: "6", label: "Суббота" },
        { value: "7", label: "Воскресенье" },
      ],
      getStringValue(data.options.xDayOfWeek)
    );
    const yWeekField = createLabeledInput(
      "Номер недели",
      getStringValue(data.options.yWeek)
    );
    const monthField = createLabeledSelect(
      "Месяц",
      [
        { value: "", label: "Выберите" },
        { value: "1", label: "Январь" },
        { value: "2", label: "Февраль" },
        { value: "3", label: "Март" },
        { value: "4", label: "Апрель" },
        { value: "5", label: "Май" },
        { value: "6", label: "Июнь" },
        { value: "7", label: "Июль" },
        { value: "8", label: "Август" },
        { value: "9", label: "Сентябрь" },
        { value: "10", label: "Октябрь" },
        { value: "11", label: "Ноябрь" },
        { value: "12", label: "Декабрь" },
      ],
      getStringValue(data.options.zMonth)
    );
    weekRow.appendChild(xDayField.wrapper);
    weekRow.appendChild(yWeekField.wrapper);
    weekRow.appendChild(monthField.wrapper);

    const defaultInfo = document.createElement("div");
    defaultInfo.className = "rule-default-hint";
    defaultInfo.textContent =
      "Заставка без даты. В конфиге может быть только одна такая запись.";

    ruleFields.appendChild(defaultInfo);
    ruleFields.appendChild(rangeRow);
    ruleFields.appendChild(dayOfYearRow);
    ruleFields.appendChild(weekRow);

    mainSegment.appendChild(codeField.wrapper);
    mainSegment.appendChild(descField.wrapper);
    mainSegment.appendChild(ruleTypeField.wrapper);
    mainSegment.appendChild(ruleFields);

    const desktopSegment = document.createElement("div");
    desktopSegment.className = "object-segment";

    const desktopHeader = document.createElement("div");
    desktopHeader.className = "object-segment-header";
    const desktopTitle = document.createElement("span");
    desktopTitle.className = "object-segment-title";
    desktopTitle.textContent = "Desktop";
    desktopHeader.appendChild(desktopTitle);

    const desktopRow = document.createElement("div");
    desktopRow.className = "field-row-inline";
    const aspectField = createLabeledInput(
      "Соотношение сторон",
      data.options.aspectRatio || ""
    );
    const gradientField = createLabeledInput(
      "Градиент (базовый)",
      typeof data.options.gradient === "string" ? data.options.gradient : ""
    );
    desktopRow.appendChild(aspectField.wrapper);
    desktopRow.appendChild(gradientField.wrapper);

    const desktopTime = createTimeOfDayEditor("Desktop", data.options, function () {
      updateTimeModeUI();
      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    desktopSegment.appendChild(desktopHeader);
    desktopSegment.appendChild(desktopRow);
    desktopSegment.appendChild(desktopTime.wrapper);

    const mobileSegment = document.createElement("div");
    mobileSegment.className = "object-segment";

    const mobileHeader = document.createElement("div");
    mobileHeader.className = "object-segment-header";
    const mobileTitle = document.createElement("span");
    mobileTitle.className = "object-segment-title";
    mobileTitle.textContent = "Mobile";
    mobileHeader.appendChild(mobileTitle);

    const mobileRow = document.createElement("div");
    mobileRow.className = "field-row-inline";
    const portAspectField = createLabeledInput(
      "Соотношение сторон",
      data["options-portrait"].aspectRatio || ""
    );
    const portGradientField = createLabeledInput(
      "Градиент (базовый)",
      typeof data["options-portrait"].gradient === "string"
        ? data["options-portrait"].gradient
        : ""
    );
    mobileRow.appendChild(portAspectField.wrapper);
    mobileRow.appendChild(portGradientField.wrapper);

    const mobileTime = createTimeOfDayEditor("Mobile", data["options-portrait"], function () {
      updateTimeModeUI();
      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    mobileSegment.appendChild(mobileHeader);
    mobileSegment.appendChild(mobileRow);
    mobileSegment.appendChild(mobileTime.wrapper);

    const filesPreview = createFileNamesPreview(data);

    const footer = document.createElement("div");
    footer.className = "object-card-footer";

    const cloneBtn = document.createElement("button");
    cloneBtn.type = "button";
    cloneBtn.className = "btn btn-secondary";
    cloneBtn.textContent = "Дублировать";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn-danger";
    deleteBtn.textContent = "Удалить";

    footer.appendChild(cloneBtn);
    footer.appendChild(deleteBtn);

    container.appendChild(mainSegment);
    container.appendChild(desktopSegment);
    container.appendChild(mobileSegment);
    container.appendChild(filesPreview.wrapper);
    container.appendChild(footer);

    function updateRuleFieldsVisibility(type) {
      defaultInfo.style.display = type === DATE_RULE_TYPES.DEFAULT ? "block" : "none";
      rangeRow.style.display = type === DATE_RULE_TYPES.RANGE ? "flex" : "none";
      dayOfYearRow.style.display = type === DATE_RULE_TYPES.DAY_OF_YEAR ? "flex" : "none";
      weekRow.style.display = type === DATE_RULE_TYPES.WEEKDAY_IN_MONTH ? "flex" : "none";
    }

    updateRuleFieldsVisibility(ruleTypeField.select.value);

    codeField.input.addEventListener("input", function () {
      const cleanedCode = sanitizeCode(codeField.input.value);
      if (cleanedCode !== codeField.input.value) {
        codeField.input.value = cleanedCode;
      }
      if (!cleanedCode) {
        codeErrorEl.style.display = "block";
        codeErrorEl.textContent = "Укажите код заставки.";
        return;
      }
      const exists = state.entries.some(function (e, i) {
        return i !== index && e.key === cleanedCode;
      });
      if (exists) {
        codeErrorEl.style.display = "block";
        codeErrorEl.textContent =
          'Код "' + cleanedCode + '" уже используется.';
        return;
      }
      codeErrorEl.style.display = "none";
      codeErrorEl.textContent = "";
      applyCodeToEntry(entry, data, cleanedCode);
      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    codeField.input.addEventListener("change", function () {
      if (!entry.key) {
        codeField.input.value = "";
        return;
      }
      codeField.input.value = entry.key;
      codeErrorEl.style.display = "none";
      codeErrorEl.textContent = "";
    });

    descField.input.addEventListener("input", function () {
      data.description = descField.input.value.slice(0, 50);
      if (data.description !== descField.input.value) {
        descField.input.value = data.description;
      }
      syncJsonFromEntries();
      scheduleRulesValidation();
    });

    ruleTypeField.select.addEventListener("change", function () {
      const nextType = ruleTypeField.select.value;
      applyRuleTypeToOptions(data.options, nextType);
      updateRuleFieldsVisibility(nextType);

      startField.input.value = jsonRangeDateToUiDate(data.options.start);
      endField.input.value = jsonRangeDateToUiDate(data.options.end);
      startDayField.input.value = getStringValue(data.options.startDayOfYear);
      endDayField.input.value = getStringValue(data.options.endDayOfYear);
      xDayField.select.value = getStringValue(data.options.xDayOfWeek);
      yWeekField.input.value = getStringValue(data.options.yWeek);
      monthField.select.value = getStringValue(data.options.zMonth);

      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    startField.input.addEventListener("input", function () {
      data.options.start = normalizeRangeDateForJson(startField.input.value);
      startField.input.value = jsonRangeDateToUiDate(data.options.start);
      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    endField.input.addEventListener("input", function () {
      data.options.end = normalizeRangeDateForJson(endField.input.value);
      endField.input.value = jsonRangeDateToUiDate(data.options.end);
      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    startDayField.input.addEventListener("input", function () {
      data.options.startDayOfYear = startDayField.input.value.trim();
      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    endDayField.input.addEventListener("input", function () {
      data.options.endDayOfYear = endDayField.input.value.trim();
      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    xDayField.select.addEventListener("change", function () {
      data.options.xDayOfWeek = xDayField.select.value;
      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    yWeekField.input.addEventListener("input", function () {
      data.options.yWeek = yWeekField.input.value.trim();
      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    monthField.select.addEventListener("change", function () {
      data.options.zMonth = monthField.select.value;
      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    aspectField.input.addEventListener("input", function () {
      data.options.aspectRatio = aspectField.input.value;
      syncJsonFromEntries();
    });

    gradientField.input.addEventListener("input", function () {
      if (isTimeOfDayEnabled(data.options)) {
        ensureGradientObjectForTime(data.options);
        const used = getUsedTimeSuffixes(data.options);
        used.forEach(function (suffix) {
          data.options.gradient[suffix] = gradientField.input.value;
        });
        desktopTime.refresh();
      } else {
        data.options.gradient = gradientField.input.value;
      }
      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    portAspectField.input.addEventListener("input", function () {
      data["options-portrait"].aspectRatio = portAspectField.input.value;
      syncJsonFromEntries();
    });

    portGradientField.input.addEventListener("input", function () {
      if (isTimeOfDayEnabled(data["options-portrait"])) {
        ensureGradientObjectForTime(data["options-portrait"]);
        const used = getUsedTimeSuffixes(data["options-portrait"]);
        used.forEach(function (suffix) {
          data["options-portrait"].gradient[suffix] = portGradientField.input.value;
        });
        mobileTime.refresh();
      } else {
        data["options-portrait"].gradient = portGradientField.input.value;
      }
      syncJsonFromEntries();
      scheduleRulesValidation();
      updateFileNames();
    });

    cloneBtn.addEventListener("click", function (event) {
      event.preventDefault();
      handleCloneObject(index);
    });

    deleteBtn.addEventListener("click", function (event) {
      event.preventDefault();
      handleDeleteObject(index);
    });

    desktopTime.refresh();
    mobileTime.refresh();
    updateTimeModeUI();
    updateFileNames();

    function updateFileNames() {
      filesPreview.update();
    }

    function updateTimeModeUI() {
      gradientField.wrapper.style.display = isTimeOfDayEnabled(data.options)
        ? "none"
        : "";
      if (!isTimeOfDayEnabled(data.options)) {
        gradientField.input.value = getStringValue(data.options.gradient);
      }
      portGradientField.wrapper.style.display = isTimeOfDayEnabled(
        data["options-portrait"]
      )
        ? "none"
        : "";
      if (!isTimeOfDayEnabled(data["options-portrait"])) {
        portGradientField.input.value = getStringValue(
          data["options-portrait"].gradient
        );
      }
    }
  }

  function createLabeledInput(labelText, value) {
    const wrapper = document.createElement("label");
    wrapper.className = "field";

    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = labelText;

    const input = document.createElement("input");
    input.className = "field-input";
    input.type = "text";
    input.value = value || "";

    wrapper.appendChild(label);
    wrapper.appendChild(input);

    return { wrapper, input };
  }

  function createLabeledSelect(labelText, options, selectedValue) {
    const wrapper = document.createElement("label");
    wrapper.className = "field";

    const label = document.createElement("span");
    label.className = "field-label";
    label.textContent = labelText;

    const select = document.createElement("select");
    select.className = "field-input";

    options.forEach(function (optionData) {
      const option = document.createElement("option");
      option.value = optionData.value;
      option.textContent = optionData.label;
      select.appendChild(option);
    });

    select.value = selectedValue;

    wrapper.appendChild(label);
    wrapper.appendChild(select);

    return { wrapper, select };
  }

  function createTimeOfDayEditor(title, options, onChange) {
    const wrapper = document.createElement("div");
    wrapper.className = "timeofday";

    const topRow = document.createElement("div");
    topRow.className = "timeofday-top";

    const toggleLabel = document.createElement("label");
    toggleLabel.className = "timeofday-toggle";

    const toggle = document.createElement("input");
    toggle.type = "checkbox";

    const toggleText = document.createElement("span");
    toggleText.textContent = "Время суток";

    toggleLabel.appendChild(toggle);
    toggleLabel.appendChild(toggleText);
    topRow.appendChild(toggleLabel);
    wrapper.appendChild(topRow);

    const help = document.createElement("div");
    help.className = "timeofday-help";
    help.textContent =
      "При включении используются суффиксы времени суток и отдельные градиенты.";
    wrapper.appendChild(help);

    const mappings = document.createElement("div");
    mappings.className = "timeofday-mappings";
    const selects = {};

    TIME_OF_DAY_KEYS.forEach(function (period) {
      const row = document.createElement("label");
      row.className = "timeofday-row";

      const label = document.createElement("span");
      label.className = "field-label";
      label.textContent = TIME_OF_DAY_LABELS[period];

      const select = document.createElement("select");
      select.className = "field-input";
      [
        { value: "morning", label: "Утро (morning)" },
        { value: "day", label: "День (day)" },
        { value: "evening", label: "Вечер (evening)" },
        { value: "night", label: "Ночь (night)" },
      ].forEach(function (item) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.label;
        select.appendChild(option);
      });

      row.appendChild(label);
      row.appendChild(select);
      mappings.appendChild(row);
      selects[period] = select;

      select.addEventListener("change", function () {
        options[period] = select.value;
        ensureGradientObjectForTime(options);
        renderGradientInputs();
        onChange();
      });
    });
    wrapper.appendChild(mappings);

    const gradientWrap = document.createElement("div");
    gradientWrap.className = "timeofday-gradients";
    wrapper.appendChild(gradientWrap);

    function renderGradientInputs() {
      gradientWrap.innerHTML = "";
      const suffixes = getUsedTimeSuffixes(options);
      if (!suffixes.length) {
        const hint = document.createElement("div");
        hint.className = "rule-default-hint";
        hint.textContent = title + ": выберите значения времени суток.";
        gradientWrap.appendChild(hint);
        return;
      }

      ensureGradientObjectForTime(options);
      suffixes.forEach(function (suffix) {
        const field = createLabeledInput(
          "Градиент " + suffix,
          getGradientValue(options, suffix)
        );
        field.input.addEventListener("input", function () {
          options.gradient[suffix] = field.input.value;
          onChange();
        });
        gradientWrap.appendChild(field.wrapper);
      });
    }

    function refresh() {
      const enabled = isTimeOfDayEnabled(options);
      toggle.checked = enabled;
      mappings.style.display = enabled ? "grid" : "none";
      gradientWrap.style.display = enabled ? "grid" : "none";

      if (enabled) {
        TIME_OF_DAY_KEYS.forEach(function (period) {
          const value = getStringValue(options[period]).trim();
          selects[period].value =
            TIME_OF_DAY_KEYS.indexOf(value) !== -1
              ? value
              : TIME_OF_DAY_DEFAULT_MAP[period];
        });
        renderGradientInputs();
      }
    }

    toggle.addEventListener("change", function () {
      if (toggle.checked) {
        enableTimeOfDay(options);
      } else {
        disableTimeOfDay(options);
      }
      refresh();
      onChange();
    });

    return { wrapper: wrapper, refresh: refresh };
  }

  function createFileNamesPreview(data) {
    const wrapper = document.createElement("details");
    wrapper.className = "file-preview";

    const summary = document.createElement("summary");
    summary.textContent = "Имена файлов";
    wrapper.appendChild(summary);

    const body = document.createElement("div");
    body.className = "file-preview-body";

    const source = document.createElement("div");
    source.className = "file-preview-source";
    source.textContent = "Формируется из \"Код заставки\" и маппинга времени суток.";
    body.appendChild(source);

    const desktopTitle = document.createElement("div");
    desktopTitle.className = "file-preview-title";
    desktopTitle.textContent = "Desktop";
    const desktopList = document.createElement("ul");
    desktopList.className = "file-preview-list";

    const mobileTitle = document.createElement("div");
    mobileTitle.className = "file-preview-title";
    mobileTitle.textContent = "Mobile";
    const mobileList = document.createElement("ul");
    mobileList.className = "file-preview-list";

    body.appendChild(desktopTitle);
    body.appendChild(desktopList);
    body.appendChild(mobileTitle);
    body.appendChild(mobileList);
    wrapper.appendChild(body);

    function updateList(listEl, names) {
      listEl.innerHTML = "";
      names.forEach(function (name) {
        const li = document.createElement("li");
        li.textContent = name;
        listEl.appendChild(li);
      });
    }

    function update() {
      updateList(desktopList, buildExpectedFileNames(data.value, data.options));
      updateList(
        mobileList,
        buildExpectedFileNames(data["value-portrait"], data["options-portrait"])
      );
    }

    return { wrapper: wrapper, update: update };
  }

  function createRangePickerPopup(params) {
    const wrapper = document.createElement("div");
    wrapper.className = "range-popup-wrap";
    wrapper.hidden = true;

    const popup = document.createElement("div");
    popup.className = "range-popup";
    wrapper.appendChild(popup);

    const header = document.createElement("div");
    header.className = "range-popup-header";

    const title = document.createElement("span");
    title.className = "range-popup-title";
    title.textContent = "Выберите период";

    const nav = document.createElement("div");
    nav.className = "range-popup-nav";

    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.className = "btn btn-outline btn-popup-nav";
    prevBtn.textContent = "‹";

    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.className = "btn btn-outline btn-popup-nav";
    nextBtn.textContent = "›";

    nav.appendChild(prevBtn);
    nav.appendChild(nextBtn);

    header.appendChild(title);
    header.appendChild(nav);
    popup.appendChild(header);

    const monthsWrap = document.createElement("div");
    monthsWrap.className = "range-popup-months";
    popup.appendChild(monthsWrap);

    const actions = document.createElement("div");
    actions.className = "range-popup-actions";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "btn btn-outline";
    clearBtn.textContent = "Очистить";
    const cancelBtn = document.createElement("button");
    cancelBtn.type = "button";
    cancelBtn.className = "btn btn-secondary";
    cancelBtn.textContent = "Отмена";
    const applyBtn = document.createElement("button");
    applyBtn.type = "button";
    applyBtn.className = "btn btn-primary";
    applyBtn.textContent = "Применить";

    actions.appendChild(clearBtn);
    actions.appendChild(cancelBtn);
    actions.appendChild(applyBtn);
    popup.appendChild(actions);

    let leftMonth = 1;
    let tempStart = null;
    let tempEnd = null;
    let initialStartUi = "";
    let initialEndUi = "";
    let activeCard = null;

    function setInitialFromFields() {
      const startParsed = parseDayMonth(getStringValue(params.getStart()).trim());
      const endParsed = parseDayMonth(getStringValue(params.getEnd()).trim());
      tempStart = startParsed ? startParsed.dayOfYear : null;
      tempEnd = endParsed ? endParsed.dayOfYear : null;
      leftMonth = startParsed ? startParsed.month : 1;
    }

    function open() {
      initialStartUi = getStringValue(params.getStart()).trim();
      initialEndUi = getStringValue(params.getEnd()).trim();
      setInitialFromFields();
      activeCard = wrapper.closest("details.object-card");
      if (activeCard) {
        activeCard.classList.add("object-card-calendar-active");
      }
      wrapper.hidden = false;
      renderMonths();
      document.addEventListener("mousedown", handleOutsideClick);
      document.addEventListener("keydown", handleEscape);
    }

    function close(shouldRevert) {
      if (shouldRevert && params.previewRange) {
        params.previewRange(initialStartUi, initialEndUi);
      }
      wrapper.hidden = true;
      if (activeCard) {
        activeCard.classList.remove("object-card-calendar-active");
      }
      activeCard = null;
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    }

    function handleOutsideClick(event) {
      if (!wrapper.contains(event.target) && !event.target.closest(".btn-calendar")) {
        close(true);
      }
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        close(true);
      }
    }

    function renderMonths() {
      monthsWrap.innerHTML = "";
      const secondMonth = leftMonth === 12 ? 1 : leftMonth + 1;
      monthsWrap.appendChild(renderMonth(leftMonth));
      monthsWrap.appendChild(renderMonth(secondMonth));
    }

    function renderMonth(month) {
      const monthEl = document.createElement("div");
      monthEl.className = "range-month";

      const monthTitle = document.createElement("div");
      monthTitle.className = "range-month-title";
      monthTitle.textContent = getMonthName(month);
      monthEl.appendChild(monthTitle);

      const weekdays = document.createElement("div");
      weekdays.className = "range-weekdays";
      ["пн", "вт", "ср", "чт", "пт", "сб", "вс"].forEach(function (wd) {
        const wdEl = document.createElement("div");
        wdEl.className = "range-weekday";
        wdEl.textContent = wd;
        weekdays.appendChild(wdEl);
      });
      monthEl.appendChild(weekdays);

      const daysGrid = document.createElement("div");
      daysGrid.className = "range-days-grid";

      const firstWeekday = jsWeekdayToMondayBased(new Date(2025, month - 1, 1).getDay());
      for (let i = 1; i < firstWeekday; i += 1) {
        const emptyCell = document.createElement("div");
        emptyCell.className = "range-day-empty";
        daysGrid.appendChild(emptyCell);
      }

      for (let day = 1; day <= DAYS_IN_MONTH[month - 1]; day += 1) {
        const dayBtn = document.createElement("button");
        dayBtn.type = "button";
        dayBtn.className = "range-day";
        dayBtn.textContent = String(day);
        const dayOfYear = getDayOfYear(month, day);
        dayBtn.dataset.dayOfYear = String(dayOfYear);

        if (tempStart != null && dayOfYear === tempStart) {
          dayBtn.classList.add("is-start");
        }
        if (tempEnd != null && dayOfYear === tempEnd) {
          dayBtn.classList.add("is-end");
        }
        if (tempStart != null && tempEnd != null && dayOfYear >= tempStart && dayOfYear <= tempEnd) {
          dayBtn.classList.add("is-in-range");
        }

        dayBtn.addEventListener("click", function () {
          const selected = Number(dayBtn.dataset.dayOfYear);
          if (tempStart == null || (tempStart != null && tempEnd != null)) {
            tempStart = selected;
            tempEnd = null;
          } else {
            tempEnd = selected;
            if (tempEnd < tempStart) {
              const hold = tempStart;
              tempStart = tempEnd;
              tempEnd = hold;
            }
          }
          if (params.previewRange) {
            const startUiPreview =
              tempStart == null
                ? ""
                : pad2(dayOfYearToDayMonth(tempStart).day) +
                  "." +
                  pad2(dayOfYearToDayMonth(tempStart).month);
            const endUiPreview =
              tempEnd == null
                ? ""
                : pad2(dayOfYearToDayMonth(tempEnd).day) +
                  "." +
                  pad2(dayOfYearToDayMonth(tempEnd).month);
            params.previewRange(startUiPreview, endUiPreview);
          }
          renderMonths();
        });

        daysGrid.appendChild(dayBtn);
      }

      monthEl.appendChild(daysGrid);
      return monthEl;
    }

    prevBtn.addEventListener("click", function () {
      leftMonth = leftMonth === 1 ? 12 : leftMonth - 1;
      renderMonths();
    });

    nextBtn.addEventListener("click", function () {
      leftMonth = leftMonth === 12 ? 1 : leftMonth + 1;
      renderMonths();
    });

    clearBtn.addEventListener("click", function () {
      tempStart = null;
      tempEnd = null;
      if (params.previewRange) {
        params.previewRange("", "");
      }
      renderMonths();
    });

    cancelBtn.addEventListener("click", function () {
      close(true);
    });

    applyBtn.addEventListener("click", function () {
      if (tempStart == null && tempEnd == null) {
        params.clearRange();
        close(false);
        return;
      }
      if (tempStart != null && tempEnd == null) {
        tempEnd = tempStart;
      }
      const start = dayOfYearToDayMonth(tempStart);
      const end = dayOfYearToDayMonth(tempEnd);
      const startUi = pad2(start.day) + "." + pad2(start.month);
      const endUi = pad2(end.day) + "." + pad2(end.month);
      params.setRange(startUi, endUi);
      close(false);
    });

    return {
      wrapper: wrapper,
      open: open,
      close: close,
    };
  }

  function ensureObjectShape(data) {
    const base = data && typeof data === "object" ? data : {};
    if (!base.options || typeof base.options !== "object") {
      base.options = {};
    }
    if (!base["options-portrait"] || typeof base["options-portrait"] !== "object") {
      base["options-portrait"] = {};
    }

    if (base.value == null) base.value = "";
    if (base.description == null) base.description = "";

    if (base.options.aspectRatio == null) base.options.aspectRatio = "xMaxYMid";
    if (base.options.gradient == null) base.options.gradient = "";
    if (isTimeOfDayEnabled(base.options)) {
      enableTimeOfDay(base.options);
    }

    if (base["options-portrait"].aspectRatio == null) {
      base["options-portrait"].aspectRatio = "xMaxYMid";
    }
    if (base["options-portrait"].gradient == null) {
      base["options-portrait"].gradient = "";
    }
    if (isTimeOfDayEnabled(base["options-portrait"])) {
      enableTimeOfDay(base["options-portrait"]);
    }

    updatePortraitValue(base);
    return base;
  }

  function sanitizeCode(value) {
    return String(value || "")
      .replace(/[^A-Za-z0-9_]/g, "")
      .slice(0, 25);
  }

  function applyCodeToEntry(entry, data, code) {
    entry.key = code;
    data.value = code;
    updatePortraitValue(data);
  }

  function isTimeOfDayEnabled(options) {
    if (!options || typeof options !== "object") return false;
    const hasMappings = TIME_OF_DAY_KEYS.some(function (key) {
      return key in options || hasValue(options[key]);
    });
    const hasGradientMap =
      options.gradient &&
      typeof options.gradient === "object" &&
      !Array.isArray(options.gradient);
    return hasMappings || hasGradientMap;
  }

  function enableTimeOfDay(options) {
    if (!options || typeof options !== "object") return;
    TIME_OF_DAY_KEYS.forEach(function (key) {
      if (!hasValue(options[key])) {
        options[key] = TIME_OF_DAY_DEFAULT_MAP[key];
      }
    });
    ensureGradientObjectForTime(options);
  }

  function disableTimeOfDay(options) {
    if (!options || typeof options !== "object") return;
    const gradient = collapseGradientToString(options.gradient);
    TIME_OF_DAY_KEYS.forEach(function (key) {
      delete options[key];
    });
    options.gradient = gradient;
  }

  function ensureGradientObjectForTime(options) {
    if (!options || typeof options !== "object") return;
    if (options.gradient && typeof options.gradient === "object" && !Array.isArray(options.gradient)) {
      return;
    }
    const baseGradient = typeof options.gradient === "string" ? options.gradient : "";
    const gradientObj = {};
    const used = getUsedTimeSuffixes(options);
    used.forEach(function (suffix) {
      gradientObj[suffix] = baseGradient;
    });
    options.gradient = gradientObj;
  }

  function collapseGradientToString(gradient) {
    if (typeof gradient === "string") return gradient;
    if (!gradient || typeof gradient !== "object" || Array.isArray(gradient)) return "";
    const preferred = ["day", "morning", "evening", "night"];
    for (let i = 0; i < preferred.length; i += 1) {
      const val = getStringValue(gradient[preferred[i]]).trim();
      if (val) return val;
    }
    const keys = Object.keys(gradient);
    for (let i = 0; i < keys.length; i += 1) {
      const val = getStringValue(gradient[keys[i]]).trim();
      if (val) return val;
    }
    return "";
  }

  function getUsedTimeSuffixes(options) {
    if (!options || typeof options !== "object") return [];
    const used = [];
    TIME_OF_DAY_KEYS.forEach(function (period) {
      const value = getStringValue(options[period]).trim();
      if (!value) return;
      if (TIME_OF_DAY_KEYS.indexOf(value) === -1) return;
      if (used.indexOf(value) === -1) {
        used.push(value);
      }
    });
    return used;
  }

  function getGradientValue(options, suffix) {
    if (!options || typeof options !== "object") return "";
    if (
      !options.gradient ||
      typeof options.gradient !== "object" ||
      Array.isArray(options.gradient)
    ) {
      return "";
    }
    return getStringValue(options.gradient[suffix]);
  }

  function buildExpectedFileNames(baseValue, options) {
    const base = getStringValue(baseValue).trim();
    if (!base) return [];

    if (!isTimeOfDayEnabled(options)) {
      return [base + ".jpeg"];
    }

    const suffixes = getUsedTimeSuffixes(options);
    if (!suffixes.length) {
      return [base + ".jpeg"];
    }

    return suffixes.map(function (suffix) {
      return base + "-" + suffix + ".jpeg";
    });
  }

  function getTimeOfDayIssues(options, prefix) {
    const issues = [];
    if (!isTimeOfDayEnabled(options)) return issues;

    TIME_OF_DAY_KEYS.forEach(function (period) {
      const value = getStringValue(options[period]).trim();
      if (!value) {
        issues.push({
          level: "warn",
          text: prefix + ": не задано значение для \"" + TIME_OF_DAY_LABELS[period] + "\".",
        });
        return;
      }
      if (TIME_OF_DAY_KEYS.indexOf(value) === -1) {
        issues.push({
          level: "error",
          text: prefix + ": недопустимое значение \"" + value + "\" в \"" + TIME_OF_DAY_LABELS[period] + "\".",
        });
      }
    });

    const used = getUsedTimeSuffixes(options);
    const gradientMap =
      options.gradient &&
      typeof options.gradient === "object" &&
      !Array.isArray(options.gradient)
        ? options.gradient
        : null;

    if (!gradientMap) {
      issues.push({
        level: "error",
        text: prefix + ": для времени суток нужен объект градиентов.",
      });
      return issues;
    }

    used.forEach(function (suffix) {
      if (!hasValue(gradientMap[suffix])) {
        issues.push({
          level: "error",
          text: prefix + ": отсутствует градиент для \"" + suffix + "\".",
        });
      }
    });

    return issues;
  }

  // ---------------- Date rules ----------------

  function getStringValue(value) {
    return value == null ? "" : String(value);
  }

  function jsonRangeDateToUiDate(value) {
    const parsed = parseDayMonth(getStringValue(value).trim());
    if (!parsed) return getStringValue(value).trim();
    return pad2(parsed.day) + "." + pad2(parsed.month);
  }

  function normalizeRangeDateForJson(value) {
    const raw = getStringValue(value).trim();
    if (!raw) return "";
    const parsed = parseDayMonth(raw);
    if (!parsed) return raw;
    return pad2(parsed.day) + "." + pad2(parsed.month) + ".****";
  }

  function getMonthName(month) {
    const names = [
      "Январь",
      "Февраль",
      "Март",
      "Апрель",
      "Май",
      "Июнь",
      "Июль",
      "Август",
      "Сентябрь",
      "Октябрь",
      "Ноябрь",
      "Декабрь",
    ];
    return names[month - 1] || "";
  }

  function hasValue(value) {
    return getStringValue(value).trim() !== "";
  }

  function detectDateRuleType(options) {
    const groups = getPresentRuleGroups(options);
    if (!groups.length) return DATE_RULE_TYPES.DEFAULT;
    return groups[0];
  }

  function getPresentRuleGroups(options) {
    const result = [];
    if (hasValue(options.start) || hasValue(options.end) || "start" in options || "end" in options) {
      result.push(DATE_RULE_TYPES.RANGE);
    }
    if (
      hasValue(options.startDayOfYear) ||
      hasValue(options.endDayOfYear) ||
      "startDayOfYear" in options ||
      "endDayOfYear" in options
    ) {
      result.push(DATE_RULE_TYPES.DAY_OF_YEAR);
    }
    if (
      hasValue(options.xDayOfWeek) ||
      hasValue(options.yWeek) ||
      hasValue(options.zMonth) ||
      "xDayOfWeek" in options ||
      "yWeek" in options ||
      "zMonth" in options
    ) {
      result.push(DATE_RULE_TYPES.WEEKDAY_IN_MONTH);
    }
    return result;
  }

  function clearDateRuleOptions(options) {
    DATE_RULE_KEYS.range
      .concat(DATE_RULE_KEYS.dayOfYear)
      .concat(DATE_RULE_KEYS.weekdayInMonth)
      .forEach(function (key) {
        delete options[key];
      });
  }

  function applyRuleTypeToOptions(options, type) {
    clearDateRuleOptions(options);
    if (type === DATE_RULE_TYPES.RANGE) {
      options.start = "";
      options.end = "";
      return;
    }
    if (type === DATE_RULE_TYPES.DAY_OF_YEAR) {
      options.startDayOfYear = "";
      options.endDayOfYear = "";
      return;
    }
    if (type === DATE_RULE_TYPES.WEEKDAY_IN_MONTH) {
      options.xDayOfWeek = "";
      options.yWeek = "";
      options.zMonth = "";
    }
  }

  function getRuleSummaryText(options) {
    const analyzed = analyzeDateRule(options);
    if (analyzed.type === DATE_RULE_TYPES.DEFAULT) {
      return "По-умолчанию";
    }
    if (analyzed.status === "incomplete") {
      return "Правило не заполнено";
    }
    if (analyzed.status === "invalid") {
      return "Ошибка в правиле";
    }
    return analyzed.summary || "Правило";
  }

  function analyzeDateRule(options) {
    const groups = getPresentRuleGroups(options);
    if (!groups.length) {
      return {
        type: DATE_RULE_TYPES.DEFAULT,
        status: "ok",
        summary: "По-умолчанию",
        days: null,
        issues: [],
      };
    }

    const type = groups[0];
    const issues = [];
    if (groups.length > 1) {
      issues.push({
        level: "warn",
        text: "В объекте смешано несколько типов дат. Используется первый найденный тип.",
      });
    }

    if (type === DATE_RULE_TYPES.RANGE) {
      const startRaw = getStringValue(options.start).trim();
      const endRaw = getStringValue(options.end).trim();
      if (!startRaw || !endRaw) {
        issues.push({ level: "warn", text: "Диапазон дат заполнен не полностью." });
        return { type: type, status: "incomplete", days: null, issues: issues };
      }

      const start = parseDayMonth(startRaw);
      const end = parseDayMonth(endRaw);
      if (!start || !end) {
        issues.push({ level: "warn", text: "Неверный формат даты. Используйте DD.MM." });
        return { type: type, status: "invalid", days: null, issues: issues };
      }

      return {
        type: type,
        status: "ok",
        days: buildDayRange(start.dayOfYear, end.dayOfYear),
        summary: pad2(start.day) + "." + pad2(start.month) + " - " + pad2(end.day) + "." + pad2(end.month),
        issues: issues,
      };
    }

    if (type === DATE_RULE_TYPES.DAY_OF_YEAR) {
      const startRaw = getStringValue(options.startDayOfYear).trim();
      const endRaw = getStringValue(options.endDayOfYear).trim();
      if (!startRaw || !endRaw) {
        issues.push({ level: "warn", text: "Диапазон дней года заполнен не полностью." });
        return { type: type, status: "incomplete", days: null, issues: issues };
      }

      const start = parseIntegerInRange(startRaw, 1, 365);
      const end = parseIntegerInRange(endRaw, 1, 365);
      if (start == null || end == null) {
        issues.push({ level: "warn", text: "День года должен быть числом от 1 до 365." });
        return { type: type, status: "invalid", days: null, issues: issues };
      }

      return {
        type: type,
        status: "ok",
        days: buildDayRange(start, end),
        summary: "День года " + start + "–" + end,
        issues: issues,
      };
    }

    const xRaw = getStringValue(options.xDayOfWeek).trim();
    const yRaw = getStringValue(options.yWeek).trim();
    const zRaw = getStringValue(options.zMonth).trim();

    if (!xRaw || !yRaw || !zRaw) {
      issues.push({ level: "warn", text: "Правило дня недели в месяце заполнено не полностью." });
      return { type: type, status: "incomplete", days: null, issues: issues };
    }

    const xDay = parseIntegerInRange(xRaw, 1, 7);
    const yWeek = parseIntegerInRange(yRaw, -5, 5);
    const zMonth = parseIntegerInRange(zRaw, 1, 12);
    if (xDay == null || yWeek == null || zMonth == null || yWeek === 0) {
      issues.push({
        level: "warn",
        text: "Проверьте день недели (1..7), неделю (-5..-1, 1..5) и месяц (1..12).",
      });
      return { type: type, status: "invalid", days: null, issues: issues };
    }

    const monthDay = getNthWeekdayOfMonth(2025, zMonth, xDay, yWeek);
    if (monthDay == null) {
      issues.push({ level: "warn", text: "Для указанных параметров нет даты в месяце." });
      return { type: type, status: "invalid", days: null, issues: issues };
    }

    const dayOfYear = getDayOfYear(zMonth, monthDay);
    return {
      type: type,
      status: "ok",
      days: new Set([dayOfYear]),
      summary: formatWeekdaySummary(xDay, yWeek, zMonth),
      issues: issues,
    };
  }

  function formatWeekdaySummary(xDay, yWeek, zMonth) {
    const weekday = WEEKDAY_SHORT[xDay] || "день";
    const month = MONTH_SHORT[zMonth - 1] || "мес";
    if (yWeek > 0) {
      return yWeek + "-я неделя, " + weekday + ", " + month;
    }
    return Math.abs(yWeek) + "-я с конца, " + weekday + ", " + month;
  }

  function parseDayMonth(value) {
    const match = /^(\d{2})\.(\d{2})(?:\.(\d{4}|\*{4}))?$/.exec(value);
    if (!match) return null;

    const day = Number(match[1]);
    const month = Number(match[2]);
    if (month < 1 || month > 12) return null;
    if (day < 1 || day > DAYS_IN_MONTH[month - 1]) return null;

    return {
      day: day,
      month: month,
      dayOfYear: getDayOfYear(month, day),
    };
  }

  function getDayOfYear(month, day) {
    let total = day;
    for (let m = 1; m < month; m += 1) {
      total += DAYS_IN_MONTH[m - 1];
    }
    return total;
  }

  function dayOfYearToDayMonth(dayOfYear) {
    let remaining = dayOfYear;
    for (let month = 1; month <= 12; month += 1) {
      const daysInMonth = DAYS_IN_MONTH[month - 1];
      if (remaining <= daysInMonth) {
        return { month: month, day: remaining };
      }
      remaining -= daysInMonth;
    }
    return { month: 12, day: 31 };
  }

  function parseIntegerInRange(value, min, max) {
    if (!/^-?\d+$/.test(value)) return null;
    const parsed = Number(value);
    if (parsed < min || parsed > max) return null;
    return parsed;
  }

  function buildDayRange(start, end) {
    const days = new Set();
    if (start <= end) {
      for (let d = start; d <= end; d += 1) {
        days.add(d);
      }
      return days;
    }

    for (let d = start; d <= 365; d += 1) {
      days.add(d);
    }
    for (let d = 1; d <= end; d += 1) {
      days.add(d);
    }
    return days;
  }

  function getNthWeekdayOfMonth(year, month, xDayOfWeek, yWeek) {
    const daysInMonth = DAYS_IN_MONTH[month - 1];

    if (yWeek > 0) {
      const firstWeekday = jsWeekdayToMondayBased(new Date(year, month - 1, 1).getDay());
      const firstOccurrence = 1 + ((xDayOfWeek - firstWeekday + 7) % 7);
      const day = firstOccurrence + (yWeek - 1) * 7;
      return day <= daysInMonth ? day : null;
    }

    const lastWeekday = jsWeekdayToMondayBased(new Date(year, month - 1, daysInMonth).getDay());
    const lastOccurrence = daysInMonth - ((lastWeekday - xDayOfWeek + 7) % 7);
    const dayFromEndIndex = Math.abs(yWeek) - 1;
    const day = lastOccurrence - dayFromEndIndex * 7;
    return day >= 1 ? day : null;
  }

  function jsWeekdayToMondayBased(jsDay) {
    return jsDay === 0 ? 7 : jsDay;
  }

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function renderRulesValidation(entries) {
    if (!rulesValidationEl) return;
    const issues = validateRules(entries || []);

    if (!issues.length) {
      rulesValidationEl.hidden = true;
      rulesValidationEl.innerHTML = "";
      return;
    }

    rulesValidationEl.hidden = false;
    rulesValidationEl.innerHTML = "";
    const hasErrors = issues.some(function (issue) {
      return issue.level === "error";
    });

    rulesValidationEl.className = "rules-validation " + (hasErrors ? "has-errors" : "has-warns");

    const title = document.createElement("div");
    title.className = "rules-validation-title";
    title.textContent = "Проверка правил: найдено " + issues.length;
    rulesValidationEl.appendChild(title);

    const list = document.createElement("ul");
    list.className = "rules-validation-list";

    issues.forEach(function (issue) {
      const item = document.createElement("li");
      item.className = "rules-validation-item " + (issue.level === "error" ? "level-error" : "level-warn");

      const text = document.createElement("span");
      text.textContent = issue.text;
      item.appendChild(text);

      if (issue.keys && issue.keys.length) {
        const linksWrap = document.createElement("span");
        linksWrap.className = "rules-validation-links";
        issue.keys.forEach(function (key) {
          const keyBtn = document.createElement("button");
          keyBtn.type = "button";
          keyBtn.className = "rules-validation-link";
          keyBtn.textContent = key;
          keyBtn.addEventListener("click", function () {
            focusObjectByKey(key);
          });
          linksWrap.appendChild(keyBtn);
        });
        item.appendChild(linksWrap);
      }

      list.appendChild(item);
    });

    rulesValidationEl.appendChild(list);
  }

  function scheduleRulesValidation() {
    if (rulesValidationTimer) {
      clearTimeout(rulesValidationTimer);
    }
    rulesValidationTimer = window.setTimeout(function () {
      renderRulesValidation(state.entries);
      rulesValidationTimer = null;
    }, 300);
  }

  function validateRules(entries) {
    if (!entries.length) return [];

    const issues = [];
    const analyzedByEntry = entries.map(function (entry) {
      return getEntryValidation(entry);
    });

    analyzedByEntry.forEach(function (item) {
      item.analyzed.issues.forEach(function (issue) {
        issues.push({
          level: issue.level,
          text: item.key + ": " + issue.text,
          keys: [item.key],
        });
      });
      item.timeIssues.forEach(function (issue) {
        issues.push({
          level: issue.level,
          text: item.key + ": " + issue.text,
          keys: [item.key],
        });
      });
    });

    const defaultKeys = analyzedByEntry
      .filter(function (item) {
        return item.analyzed.type === DATE_RULE_TYPES.DEFAULT;
      })
      .map(function (item) {
        return item.key;
      });

    if (defaultKeys.length > 1) {
      issues.push({
        level: "error",
        text: "Найдено несколько объектов без даты. По умолчанию может быть только один.",
        keys: defaultKeys,
      });
    }

    const dayToKeys = new Map();
    analyzedByEntry.forEach(function (item) {
      if (!item.analyzed.days || item.analyzed.status !== "ok") return;
      item.analyzed.days.forEach(function (day) {
        if (!dayToKeys.has(day)) {
          dayToKeys.set(day, []);
        }
        dayToKeys.get(day).push(item.key);
      });
    });

    const pairConflictDays = new Map();
    dayToKeys.forEach(function (keys) {
      if (keys.length < 2) return;
      for (let i = 0; i < keys.length; i += 1) {
        for (let j = i + 1; j < keys.length; j += 1) {
          const a = keys[i];
          const b = keys[j];
          const pair = a < b ? a + "|" + b : b + "|" + a;
          pairConflictDays.set(pair, (pairConflictDays.get(pair) || 0) + 1);
        }
      }
    });

    pairConflictDays.forEach(function (count, pair) {
      const parts = pair.split("|");
      issues.push({
        level: "error",
        text:
          'Есть пересечение дат у объектов "' +
          parts[0] +
          '" и "' +
          parts[1] +
          '" (' +
          count +
          " дн.).",
        keys: parts,
      });
    });

    return issues;
  }

  function getEntryValidation(entry) {
    const data = ensureObjectShape(entry.data);
    entry.data = data;
    const analyzed = analyzeDateRule(data.options || {});
    const timeIssues = []
      .concat(getTimeOfDayIssues(data.options || {}, "Desktop"))
      .concat(getTimeOfDayIssues(data["options-portrait"] || {}, "Mobile"));
    return {
      key: entry.key,
      analyzed: analyzed,
      timeIssues: timeIssues,
    };
  }

  function getEntryStatus(entry) {
    const item = getEntryValidation(entry);
    const hasError =
      item.analyzed.issues.some(function (issue) {
        return issue.level === "error";
      }) ||
      item.timeIssues.some(function (issue) {
        return issue.level === "error";
      });
    if (hasError) return "error";

    const hasWarn =
      item.analyzed.issues.some(function (issue) {
        return issue.level === "warn";
      }) ||
      item.timeIssues.some(function (issue) {
        return issue.level === "warn";
      });
    return hasWarn ? "warn" : "ok";
  }

  function focusObjectByKey(key) {
    if (!objectsListEl) return;
    const cards = objectsListEl.querySelectorAll("details.object-card");
    for (let i = 0; i < cards.length; i += 1) {
      const card = cards[i];
      if (card.dataset.key !== key) continue;
      card.open = true;
      card.classList.add("object-card-attention");
      card.scrollIntoView({ behavior: "smooth", block: "center" });
      window.setTimeout(function () {
        card.classList.remove("object-card-attention");
      }, 1100);
      return;
    }

    const fallbackIndex = state.entries.findIndex(function (entry) {
      return entry.key === key;
    });
    if (fallbackIndex === -1) return;

    const fallbackCard = objectsListEl.querySelector(
      'details.object-card[data-index="' + fallbackIndex + '"]'
    );
    if (!fallbackCard) return;
    fallbackCard.open = true;
    fallbackCard.classList.add("object-card-attention");
    fallbackCard.scrollIntoView({ behavior: "smooth", block: "center" });
    window.setTimeout(function () {
      fallbackCard.classList.remove("object-card-attention");
    }, 1100);
  }

  // ---------------- Drag and drop ----------------

  function handleCardDragStart(event) {
    const index = Number(event.currentTarget.dataset.index);
    if (Number.isNaN(index)) return;

    const card = event.currentTarget.closest("details.object-card");
    if (!card || card.open) {
      event.preventDefault();
      return;
    }

    dragSourceIndex = index;
    card.classList.add("object-card-dragging");

    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(index));
    }
  }

  function handleCardDragOver(event) {
    if (dragSourceIndex === null) return;
    event.preventDefault();

    const target = event.currentTarget;
    const targetIndex = Number(target.dataset.index);
    if (Number.isNaN(targetIndex) || targetIndex === dragSourceIndex) return;

    const midY = target.getBoundingClientRect().top + target.offsetHeight / 2;
    const isBefore = event.clientY < midY;

    target.classList.toggle("drag-over-before", isBefore);
    target.classList.toggle("drag-over-after", !isBefore);
  }

  function handleCardDragLeave(event) {
    const target = event.currentTarget;
    target.classList.remove("drag-over-before");
    target.classList.remove("drag-over-after");
  }

  function handleCardDrop(event) {
    event.preventDefault();
    if (dragSourceIndex === null) return;

    const target = event.currentTarget;
    const fromIndex = dragSourceIndex;
    const toIndex = Number(target.dataset.index);

    if (Number.isNaN(toIndex) || fromIndex === toIndex) {
      clearDragState();
      return;
    }

    const midY = target.getBoundingClientRect().top + target.offsetHeight / 2;
    const isBefore = event.clientY < midY;
    let insertIndex = isBefore ? toIndex : toIndex + 1;

    if (fromIndex < insertIndex) {
      insertIndex -= 1;
    }
    if (insertIndex === fromIndex) {
      clearDragState();
      return;
    }

    const moved = state.entries.splice(fromIndex, 1)[0];
    state.entries.splice(insertIndex, 0, moved);

    syncJsonFromEntries();
    renderVisualEditor();
  }

  function handleCardDragEnd() {
    clearDragState();
  }

  function clearDragState() {
    dragSourceIndex = null;
    if (!objectsListEl) return;
    const cards = objectsListEl.querySelectorAll(".object-card");
    cards.forEach(function (card) {
      card.classList.remove("drag-over-before");
      card.classList.remove("drag-over-after");
      card.classList.remove("object-card-dragging");
    });
  }

  function updatePortraitValue(data) {
    const value = data.value || "";
    data["value-portrait"] = value ? value + "-portrait" : "";
  }

  function syncJsonFromEntries() {
    const obj = rebuildObjectFromEntries();
    const text = JSON.stringify(obj, null, 2);
    state.lastValidJsonObj = obj;
    state.lastValidJsonText = text;
    clearJsonError();
    setEditorText(text);
  }

  // ---------------- Object operations ----------------

  function handleAddObject() {
    const baseKey = "new_object";
    const key = generateUniqueKey(baseKey);
    const value = key;

    const newData = {
      value: value,
      description: "",
      options: {
        aspectRatio: "xMaxYMid",
        gradient: "",
      },
      "value-portrait": value + "-portrait",
      "options-portrait": {
        aspectRatio: "xMaxYMid",
        gradient: "",
      },
    };

    state.entries.push({
      key: key,
      data: newData,
    });

    syncJsonFromEntries();
    renderVisualEditor();
  }

  function handleCloneObject(index) {
    const original = state.entries[index];
    if (!original) return;

    const baseKey = original.key;
    const newKey = generateUniqueKey(baseKey);

    const clonedData = JSON.parse(JSON.stringify(original.data || {}));
    clonedData.value = newKey;
    updatePortraitValue(clonedData);

    const newEntry = {
      key: newKey,
      data: clonedData,
    };

    state.entries.splice(index + 1, 0, newEntry);
    syncJsonFromEntries();
    renderVisualEditor();
  }

  function handleDeleteObject(index) {
    const entry = state.entries[index];
    if (!entry) return;
    const confirmed = window.confirm(
      'Удалить объект "' + entry.key + '" из JSON?'
    );
    if (!confirmed) return;

    state.entries.splice(index, 1);
    syncJsonFromEntries();
    renderVisualEditor();
  }

  function generateUniqueKey(baseKey) {
    const existingKeys = state.entries.map(function (e) {
      return e.key;
    });
    if (existingKeys.indexOf(baseKey) === -1) {
      return baseKey;
    }
    let i = 2;
    let candidate = baseKey + "_" + i;
    while (existingKeys.indexOf(candidate) !== -1) {
      i += 1;
      candidate = baseKey + "_" + i;
    }
    return candidate;
  }
})();
