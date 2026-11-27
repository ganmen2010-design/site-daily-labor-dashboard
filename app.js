// 工地出工日報系統 - 前端核心邏輯
const API_URL = "https://script.google.com/macros/s/AKfycbwARRX7SCGYUPCxon2PHoOSxxnQYeHuymx-Urj_QMgO80ft1ZbCYrYdn6yB358C1ak/exec";

let allRecords = [];
let filterMode = "daily"; // "daily" 或 "period"
let subChartInstance = null;
let itemChartInstance = null;

// 預設常用選單項目 (作為無雲端連線時的本機備援與初始化使用)
const DEFAULT_LOCATIONS = ["台北工區", "新北工區", "桃園工區", "新竹工區", "台中工區", "台南工區", "高雄工區", "基隆工區", "宜蘭工區", "花蓮工區", "台東工區"];
const DEFAULT_SUBCONTRACTORS = ["大順營造", "立發水電", "信利泥作", "金昌鋼筋", "宏都模板", "億展混凝土", "中興起重"];
const DEFAULT_WORKITEMS = ["鋼筋綁紮", "模板組立", "混凝土澆置", "水電管線配置", "泥作打底粉刷", "基礎土方開挖", "結構缺陷修補", "工地整理整頓"];
const DEFAULT_EQUIPMENTS = ["無", "挖土機", "吊車", "混凝土攪拌車", "壓路機", "發電機", "水車"];
const DEFAULT_REPORTERS = ["張工程師", "林工程師", "陳工程師", "黃工程師"];

// 廠商名稱對應預設施工工項對照庫 (依使用者規定建立)
const SUBCONTRACTOR_WORKITEM_MAP = {
  "茗廬": "輕隔間+天花板",
  "郅樺": "系統櫃",
  "新格": "帷幕",
  "鴻佑": "地磚",
  "員和": "epoxy",
  "雍信": "鐵件",
  "捷雅": "庫版",
  "啟惶": "地磚",
  "奧德美": "廁所搗擺",
  "緯虹石材": "石材",
  "暢鴻": "拆架",
  "互國": "景觀",
  "圻濬": "景觀",
  "正恆": "景觀",
  "移工": "組工",
  "易鼎": "泥作收尾",
  "興東加": "油漆",
  "新諳": "景觀",
  "榮冠": "植栽",
  "明鴻": "木門",
  "智利達": "防水",
  "美利達": "洗孔",
  "來來": "木地板",
  "祈睿": "景觀",
  "崵傑": "地坪研磨"
};

// 作業位置、部位、內容說明之「作業關鍵字」匹配規則 (若無對應則由說明推導工項)
const WORKITEM_KEYWORD_RULES = [
  { regex: /天花板|輕隔間/i, workItem: "輕隔間+天花板" },
  { regex: /系統櫃|櫃體|門板/i, workItem: "系統櫃" },
  { regex: /帷幕|風除室|骨料|玻璃/i, workItem: "帷幕" },
  { regex: /地磚|磁磚|水溝磁磚/i, workItem: "地磚" },
  { regex: /epoxy|面漆/i, workItem: "epoxy" },
  { regex: /鐵件|欄杆|樓梯欄杆/i, workItem: "鐵件" },
  { regex: /庫版|庫板/i, workItem: "庫版" },
  { regex: /泥作收尾|泥作修補|泥作|泥做|花台打底|PC打底|修補/i, workItem: "泥作收尾" },
  { regex: /搗擺|廁所/i, workItem: "廁所搗擺" },
  { regex: /石材|大廳石材|立柱石材/i, workItem: "石材" },
  { regex: /拆架|鷹架|組模|拆模/i, workItem: "拆架" },
  { regex: /景觀|植栽槽|花台|整地|水溝|箱涵|擋土牆|鋼筋綁紮/i, workItem: "景觀" },
  { regex: /壓送|澆置|灌漿/i, workItem: "壓送" },
  { regex: /植栽|覆土/i, workItem: "植栽" },
  { regex: /油漆|批土|敦座油漆/i, workItem: "油漆" },
  { regex: /木門|門扇|五金/i, workItem: "木門" },
  { regex: /防水|止漏/i, workItem: "防水" },
  { regex: /洗孔/i, workItem: "洗孔" },
  { regex: /木地板|塑木/i, workItem: "木地板" },
  { regex: /地坪研磨|研磨/i, workItem: "地坪研磨" },
  { regex: /移工|環境整理|安衛改善|臨時管/i, workItem: "組工" }
];

// 智慧工項推導函式：依廠商名稱與作業說明自動生成施工工項，若無對應者顯示「無」
function detectWorkItem(subcontractor, notesText = "") {
  const sub = (subcontractor || "").trim();
  const note = (notesText || "").trim();
  
  // 1. 先由廠商名稱自動對照
  if (sub && SUBCONTRACTOR_WORKITEM_MAP[sub]) {
    // 特殊多工項細緻識別 (如：啟惶之泥做/地磚、暢鴻之拆架/鷹架、正恆之景觀/壓送)
    if (sub === "啟惶" && /泥做|泥作|打底|修補/i.test(note)) {
      return "泥做";
    }
    if (sub === "暢鴻" && /鷹架/i.test(note)) {
      return "鷹架";
    }
    if (sub === "正恆" && /壓送|澆置|灌漿/i.test(note)) {
      return "壓送";
    }
    return SUBCONTRACTOR_WORKITEM_MAP[sub];
  }
  
  // 2. 若廠商無對應者，由作業位置、部位、作業內容說明中的相關作業關鍵字比對
  if (note) {
    for (const rule of WORKITEM_KEYWORD_RULES) {
      if (rule.regex.test(note)) {
        return rule.workItem;
      }
    }
  }
  
  // 3. 仍無對應者顯示「無」
  return "無";
}

let activeTab = "subcontractors"; // modal 當前選單分頁
let selectedEquipments = ["無"]; // 當前選核的複選機具陣列

// DOM 元素
const statusDot = document.getElementById("status-dot");
const statusText = document.getElementById("status-text");
const reportForm = document.getElementById("report-form");
const submitBtn = document.getElementById("submit-btn");
const submitSpinner = submitBtn.querySelector(".spinner");
const submitText = submitBtn.querySelector(".btn-text");

// 統計數值
const statTotalAm = document.getElementById("stat-total-am");
const statTotalPm = document.getElementById("stat-total-pm");
const statTotalFullDay = document.getElementById("stat-total-fullday");
const statReportCount = document.getElementById("stat-report-count");

// 篩選欄位
const btnModeDaily = document.getElementById("btn-mode-daily");
const btnModePeriod = document.getElementById("btn-mode-period");
const filterDailyGroup = document.getElementById("filter-daily-group");
const filterPeriodGroup = document.getElementById("filter-period-group");
const filterDate = document.getElementById("filter-date");
const filterStartDate = document.getElementById("filter-start-date");
const filterEndDate = document.getElementById("filter-end-date");
const filterSearch = document.getElementById("filter-search");

// 天氣看板
const weatherWidget = document.getElementById("weather-summary-widget");
const weatherSummaryHeading = document.getElementById("weather-summary-heading");
const weatherAmTitle = document.getElementById("weather-am-title");
const weatherPmTitle = document.getElementById("weather-pm-title");
const weatherAmVal = document.getElementById("weather-am-val");
const weatherPmVal = document.getElementById("weather-pm-val");
const weatherBox3 = document.getElementById("weather-box-3");
const weatherBox3Title = document.getElementById("weather-box3-title");
const weatherBox3Val = document.getElementById("weather-box3-val");

// 工程進度與工期管理元素
const inputProjectEndDate = document.getElementById("input-project-enddate");
const valRemainingDays = document.getElementById("val-remaining-days");
const inputPlanProgress = document.getElementById("input-plan-progress");
const inputActualProgress = document.getElementById("input-actual-progress");
const valProgressDiff = document.getElementById("val-progress-diff");
const badgeProgressStatus = document.getElementById("badge-progress-status");

// 施工照片管理元素
const btnOpenPhotosModal = document.getElementById("btn-open-photos-modal");
const badgePhotoCount = document.getElementById("badge-photo-count");
const photosModal = document.getElementById("photos-modal");
const modalPhotosCloseBtn = document.getElementById("modal-photos-close-btn");
const photoDropzone = document.getElementById("photo-dropzone");
const inputPhotoFile = document.getElementById("input-photo-file");
const btnSelectPhotos = document.getElementById("btn-select-photos");
const modalPhotoCount = document.getElementById("modal-photo-count");
const btnClearPhotos = document.getElementById("btn-clear-photos");
const photosPreviewGrid = document.getElementById("photos-preview-grid");

// 表格
const tableBody = document.getElementById("table-body");

// Modal 相關元素
const optionsModal = document.getElementById("options-modal");
const btnManageOptions = document.getElementById("btn-manage-options");
const modalCloseBtn = document.getElementById("modal-close-btn");
const modalAddInput = document.getElementById("modal-add-input");
const modalAddBtn = document.getElementById("modal-add-btn");
const modalItemsList = document.getElementById("modal-items-list");
const tabButtons = document.querySelectorAll(".tab-btn");

// 初始化設定
document.addEventListener("DOMContentLoaded", () => {
  // 設定預設日期
  const todayStr = getTodayString();
  document.getElementById("input-date").value = todayStr;
  filterDate.value = todayStr;
  
  // 期間預設：近 7 天
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  filterStartDate.value = formatDateString(sevenDaysAgo);
  filterEndDate.value = todayStr;

  // 載入與初始化常用選單
  initDatalists();
  setupModalListeners();
  
  // 初始化自定義 Autocomplete 下拉選單 (排除行動端與桌面瀏覽器原生 datalist 的巨型反白區)
  makeAutocomplete(document.getElementById("input-location"), "locations");
  makeAutocomplete(document.getElementById("input-subcontractor"), "subcontractors");
  makeAutocomplete(document.getElementById("input-workitem"), "workitems");
  makeAutocomplete(document.getElementById("input-reporter"), "reporters");
  
  // 渲染並設定機具複選下拉框
  renderEquipmentCheckboxes();
  setupTriggerClick();

  // 註冊事件監聽
  setupEventListeners();

  // 初始化智慧批次寫入模組
  initBatchSubmission();

  // 初始化工程進度與工期管理
  initScheduleAndProgress();

  // 初始化施工照片檢附模組
  initPhotosModule();

  // 初始化雙向側邊欄收合功能 (左側表單收合 / 右側戰情收合)
  initPaneCollapse();

  // 載入資料
  fetchRecords();
});

// 輔助函式：取得今日日期字串 (yyyy-MM-dd)
function getTodayString() {
  return formatDateString(new Date());
}

function formatDateString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// === 雙向側邊欄收合控制邏輯 (左側表單收合 / 右側戰情收合) ===
let isLeftCollapsed = false;
let isRightCollapsed = false;

function initPaneCollapse() {
  const mainGrid = document.querySelector(".main-grid");
  const btnToggleLeft = document.getElementById("btn-toggle-left");
  const btnToggleRight = document.getElementById("btn-toggle-right");
  const textToggleLeft = document.getElementById("text-toggle-left");
  const textToggleRight = document.getElementById("text-toggle-right");
  
  const btnCardCollapseLeft = document.getElementById("btn-card-collapse-left");
  const btnCardCollapseRight = document.getElementById("btn-card-collapse-right");
  
  const stripExpandLeft = document.getElementById("strip-expand-left");
  const stripExpandRight = document.getElementById("strip-expand-right");

  function resizeCharts() {
    setTimeout(() => {
      if (subChartInstance) subChartInstance.resize();
      if (itemChartInstance) itemChartInstance.resize();
      window.dispatchEvent(new Event("resize"));
    }, 320);
  }

  function saveState() {
    try {
      localStorage.setItem("dailyReport_pane_state", JSON.stringify({
        left: isLeftCollapsed,
        right: isRightCollapsed
      }));
    } catch(e) {}
  }

  function setLeftCollapsed(collapsed, autoSave = true) {
    if (!mainGrid) return;
    isLeftCollapsed = collapsed;
    if (isLeftCollapsed) {
      mainGrid.classList.add("left-collapsed");
      if (btnToggleLeft) {
        btnToggleLeft.classList.add("active-collapsed");
        if (textToggleLeft) textToggleLeft.textContent = "展開左側";
        const icon = btnToggleLeft.querySelector("i");
        if (icon) icon.className = "fa-solid fa-angles-right";
      }
      // 若右邊也處於收合狀態，則自動展開右邊，保證視野不為空
      if (isRightCollapsed) {
        setRightCollapsed(false, false);
      }
    } else {
      mainGrid.classList.remove("left-collapsed");
      if (btnToggleLeft) {
        btnToggleLeft.classList.remove("active-collapsed");
        if (textToggleLeft) textToggleLeft.textContent = "收合左側";
        const icon = btnToggleLeft.querySelector("i");
        if (icon) icon.className = "fa-solid fa-angles-left";
      }
    }
    if (autoSave) saveState();
    resizeCharts();
  }

  function setRightCollapsed(collapsed, autoSave = true) {
    if (!mainGrid) return;
    isRightCollapsed = collapsed;
    if (isRightCollapsed) {
      mainGrid.classList.add("right-collapsed");
      if (btnToggleRight) {
        btnToggleRight.classList.add("active-collapsed");
        if (textToggleRight) textToggleRight.textContent = "展開右側";
        const icon = btnToggleRight.querySelector("i");
        if (icon) icon.className = "fa-solid fa-angles-left";
      }
      // 若左邊也處於收合狀態，則自動展開左邊，保證視野不為空
      if (isLeftCollapsed) {
        setLeftCollapsed(false, false);
      }
    } else {
      mainGrid.classList.remove("right-collapsed");
      if (btnToggleRight) {
        btnToggleRight.classList.remove("active-collapsed");
        if (textToggleRight) textToggleRight.textContent = "收合右側";
        const icon = btnToggleRight.querySelector("i");
        if (icon) icon.className = "fa-solid fa-angles-right";
      }
    }
    if (autoSave) saveState();
    resizeCharts();
  }

  if (btnToggleLeft) {
    btnToggleLeft.addEventListener("click", () => setLeftCollapsed(!isLeftCollapsed));
  }
  if (btnToggleRight) {
    btnToggleRight.addEventListener("click", () => setRightCollapsed(!isRightCollapsed));
  }
  if (btnCardCollapseLeft) {
    btnCardCollapseLeft.addEventListener("click", () => setLeftCollapsed(true));
  }
  if (btnCardCollapseRight) {
    btnCardCollapseRight.addEventListener("click", () => setRightCollapsed(true));
  }
  if (stripExpandLeft) {
    stripExpandLeft.addEventListener("click", () => setLeftCollapsed(false));
  }
  if (stripExpandRight) {
    stripExpandRight.addEventListener("click", () => setRightCollapsed(false));
  }

  // 讀取先前儲存之狀態 (預設兩邊均展開)
  try {
    const savedState = JSON.parse(localStorage.getItem("dailyReport_pane_state") || "{}");
    if (savedState.left) setLeftCollapsed(true, false);
    else if (savedState.right) setRightCollapsed(true, false);
  } catch(e) {}
}

// 讀取與設定常用選單至 LocalStorage
function initDatalists() {
  if (!localStorage.getItem("report_locations")) {
    localStorage.setItem("report_locations", JSON.stringify(DEFAULT_LOCATIONS));
  }
  if (!localStorage.getItem("report_subcontractors")) {
    localStorage.setItem("report_subcontractors", JSON.stringify(DEFAULT_SUBCONTRACTORS));
  }
  if (!localStorage.getItem("report_workitems")) {
    localStorage.setItem("report_workitems", JSON.stringify(DEFAULT_WORKITEMS));
  }
  if (!localStorage.getItem("report_equipments")) {
    localStorage.setItem("report_equipments", JSON.stringify(DEFAULT_EQUIPMENTS));
  }
  if (!localStorage.getItem("report_reporters")) {
    localStorage.setItem("report_reporters", JSON.stringify(DEFAULT_REPORTERS));
  }
  renderDatalists();
}

function getListFromStorage(type) {
  return JSON.parse(localStorage.getItem(`report_${type}`)) || [];
}

function saveListToStorage(type, list) {
  localStorage.setItem(`report_${type}`, JSON.stringify(list));
}

function renderDatalists() {
  populateDatalist("locations-list", getListFromStorage("locations"));
  populateDatalist("subcontractors-list", getListFromStorage("subcontractors"));
  populateDatalist("workitems-list", getListFromStorage("workitems"));
  populateDatalist("reporters-list", getListFromStorage("reporters"));
}

function populateDatalist(elementId, items) {
  const datalist = document.getElementById(elementId);
  if (!datalist) return;
  datalist.innerHTML = items.map(item => `<option value="${item}">`).join("");
}

// 同步所有自訂選單到雲端 Google Sheets
async function syncOptionsToCloud() {
  const payload = {
    action: "updateOptions",
    locations: getListFromStorage("locations"),
    subcontractors: getListFromStorage("subcontractors"),
    workitems: getListFromStorage("workitems"),
    equipments: getListFromStorage("equipments"),
    reporters: getListFromStorage("reporters")
  };
  
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.status === "success") {
      console.log("常用選單已同步至雲端資料庫！");
    } else {
      console.warn("選單同步失敗：", result.message);
    }
  } catch (err) {
    console.error("選單同步網路錯誤：", err);
  }
}

// 自動增長常用下拉選單選項
function learnNewInputs(sub, work, equipString, loc, rep) {
  let updated = false;
  if (sub) {
    const list = getListFromStorage("subcontractors");
    if (!list.includes(sub)) {
      list.push(sub);
      saveListToStorage("subcontractors", list);
      updated = true;
    }
  }
  if (work) {
    const list = getListFromStorage("workitems");
    if (!list.includes(work)) {
      list.push(work);
      saveListToStorage("workitems", list);
      updated = true;
    }
  }
  if (loc) {
    const list = getListFromStorage("locations");
    if (!list.includes(loc)) {
      list.push(loc);
      saveListToStorage("locations", list);
      updated = true;
    }
  }
  if (rep) {
    const list = getListFromStorage("reporters");
    if (!list.includes(rep)) {
      list.push(rep);
      saveListToStorage("reporters", list);
      updated = true;
    }
  }
  if (equipString) {
    const list = getListFromStorage("equipments");
    let arr = equipString.split(",").map(s => s.trim()).filter(Boolean);
    arr.forEach(item => {
      if (!list.includes(item) && item !== "無") {
        list.push(item);
        saveListToStorage("equipments", list);
        updated = true;
      }
    });
  }
  if (updated) {
    renderDatalists();
    renderEquipmentCheckboxes();
    // 自動學入後同步到雲端
    syncOptionsToCloud();
  }
}

// 渲染機具複選清單與事件綁定
function renderEquipmentCheckboxes() {
  const list = getListFromStorage("equipments");
  const dropdown = document.getElementById("multi-select-dropdown");
  if (!dropdown) return;
  
  let html = `
    <div class="dropdown-add-row">
      <input type="text" id="dropdown-new-equipment" placeholder="新增其他機具…">
      <button type="button" id="btn-dropdown-add-equip"><i class="fa-solid fa-plus"></i></button>
    </div>
  `;
  
  html += list.map(equip => {
    const checked = selectedEquipments.includes(equip) ? "checked" : "";
    return `
      <div class="dropdown-item">
        <label>
          <input type="checkbox" class="equip-checkbox" value="${equip}" ${checked}>
          ${equip}
        </label>
      </div>
    `;
  }).join("");
  
  dropdown.innerHTML = html;
  setupDropdownEventHandlers();
}

function setupDropdownEventHandlers() {
  const checkboxes = document.querySelectorAll(".equip-checkbox");
  const triggerText = document.getElementById("selected-equipments-text");
  
  checkboxes.forEach(cb => {
    cb.addEventListener("change", () => {
      const val = cb.value;
      if (cb.checked) {
        if (val === "無") {
          checkboxes.forEach(c => { if (c.value !== "無") c.checked = false; });
          selectedEquipments = ["無"];
        } else {
          checkboxes.forEach(c => { if (c.value === "無") c.checked = false; });
          selectedEquipments = selectedEquipments.filter(v => v !== "無");
          if (!selectedEquipments.includes(val)) {
            selectedEquipments.push(val);
          }
        }
      } else {
        selectedEquipments = selectedEquipments.filter(v => v !== val);
      }
      
      if (selectedEquipments.length === 0) {
        checkboxes.forEach(c => { if (c.value === "無") c.checked = true; });
        selectedEquipments = ["無"];
      }
      
      triggerText.textContent = selectedEquipments.join(", ");
    });
  });

  const addBtn = document.getElementById("btn-dropdown-add-equip");
  const addInput = document.getElementById("dropdown-new-equipment");
  
  if (addBtn && addInput) {
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const val = addInput.value.trim();
      if (!val) return;
      const list = getListFromStorage("equipments");
      if (!list.includes(val)) {
        list.push(val);
        saveListToStorage("equipments", list);
        selectedEquipments = selectedEquipments.filter(v => v !== "無");
        if (!selectedEquipments.includes(val)) {
          selectedEquipments.push(val);
        }
        renderDatalists();
        renderEquipmentCheckboxes();
        triggerText.textContent = selectedEquipments.join(", ");
        // 同步至雲端
        syncOptionsToCloud();
      }
      addInput.value = "";
    });

    addInput.addEventListener("click", (e) => e.stopPropagation());
    addInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        addBtn.click();
      }
    });
  }
}

function setupTriggerClick() {
  const trigger = document.getElementById("multi-select-trigger");
  const dropdown = document.getElementById("multi-select-dropdown");
  
  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = dropdown.classList.contains("hidden");
    if (isHidden) {
      dropdown.classList.remove("hidden");
      dropdown.style.display = "flex";
    } else {
      dropdown.classList.add("hidden");
      dropdown.style.display = "none";
    }
  });

  document.addEventListener("click", () => {
    dropdown.classList.add("hidden");
    dropdown.style.display = "none";
  });
  
  dropdown.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

// Modal 控制監聽
function setupModalListeners() {
  btnManageOptions.addEventListener("click", (e) => {
    e.preventDefault();
    optionsModal.style.display = "flex";
    optionsModal.classList.remove("hidden");
    renderModalItems();
  });

  modalCloseBtn.addEventListener("click", (e) => {
    e.preventDefault();
    optionsModal.style.display = "none";
    optionsModal.classList.add("hidden");
  });

  optionsModal.addEventListener("click", (e) => {
    if (e.target === optionsModal) {
      optionsModal.style.display = "none";
      optionsModal.classList.add("hidden");
    }
  });

  tabButtons.forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      tabButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.getAttribute("data-tab");
      modalAddInput.value = "";
      renderModalItems();
    });
  });

  modalAddBtn.addEventListener("click", (e) => {
    e.preventDefault();
    const newVal = modalAddInput.value.trim();
    if (!newVal) return;
    const currentList = getListFromStorage(activeTab);
    if (!currentList.includes(newVal)) {
      currentList.push(newVal);
      saveListToStorage(activeTab, currentList);
      renderDatalists();
      if (activeTab === "equipments") {
        renderEquipmentCheckboxes();
      }
      renderModalItems();
      // 同步更新至雲端
      syncOptionsToCloud();
    }
    modalAddInput.value = "";
  });

  modalAddInput.addEventListener("keypress", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      modalAddBtn.click();
    }
  });
}

// 渲染 Modal 列表與刪除圖示
function renderModalItems() {
  const items = getListFromStorage(activeTab);
  modalItemsList.innerHTML = items.map((item, idx) => `
    <div class="item-row">
      <span>${item}</span>
      <button class="delete-item-btn" onclick="deleteOption('${activeTab}', ${idx})">
        <i class="fa-solid fa-trash-can"></i>
      </button>
    </div>
  `).join("") || `<div style="text-align:center; color:#8892b0; padding:12px;">尚無自訂項目</div>`;
}

// 全域選項刪除
window.deleteOption = function(tab, index) {
  const currentList = getListFromStorage(tab);
  const deletedVal = currentList[index];
  currentList.splice(index, 1);
  saveListToStorage(tab, currentList);
  
  if (tab === "equipments") {
    selectedEquipments = selectedEquipments.filter(v => v !== deletedVal);
    if (selectedEquipments.length === 0) selectedEquipments = ["無"];
    document.getElementById("selected-equipments-text").textContent = selectedEquipments.join(", ");
    renderEquipmentCheckboxes();
  }
  
  renderDatalists();
  renderModalItems();
  // 同步刪除至雲端
  syncOptionsToCloud();
};

// 註冊事件監聽
function setupEventListeners() {
  reportForm.addEventListener("submit", handleFormSubmit);

  btnModeDaily.addEventListener("click", () => {
    filterMode = "daily";
    btnModeDaily.classList.add("active");
    btnModePeriod.classList.remove("active");
    filterDailyGroup.classList.remove("hidden");
    filterPeriodGroup.classList.add("hidden");
    weatherWidget.classList.remove("hidden");
    updateDashboard();
  });

  btnModePeriod.addEventListener("click", () => {
    filterMode = "period";
    btnModeDaily.classList.remove("active");
    btnModePeriod.classList.add("active");
    filterDailyGroup.classList.add("hidden");
    filterPeriodGroup.classList.remove("hidden");
    weatherWidget.classList.add("hidden");
    updateDashboard();
  });

  // 廠商名稱與作業說明聯動施工工項自動生成
  const inputSub = document.getElementById("input-subcontractor");
  const inputWork = document.getElementById("input-workitem");
  const inputNotes = document.getElementById("input-notes");

  function triggerAutoWorkItem() {
    if (!inputSub || !inputWork) return;
    const autoItem = detectWorkItem(inputSub.value, inputNotes ? inputNotes.value : "");
    if (autoItem && autoItem !== "無") {
      inputWork.value = autoItem;
    } else if (!inputWork.value || inputWork.value === "無") {
      inputWork.value = "無";
    }
  }

  if (inputSub) {
    inputSub.addEventListener("input", triggerAutoWorkItem);
    inputSub.addEventListener("change", triggerAutoWorkItem);
  }

  if (inputNotes) {
    inputNotes.addEventListener("input", () => {
      if (!inputWork.value || inputWork.value === "無") {
        const autoItem = detectWorkItem(inputSub ? inputSub.value : "", inputNotes.value);
        if (autoItem && autoItem !== "無") {
          inputWork.value = autoItem;
        }
      }
    });
  }

  filterDate.addEventListener("change", () => {
    updateDashboard();
    updateProgressCalculations();
  });
  filterStartDate.addEventListener("change", updateDashboard);
  filterEndDate.addEventListener("change", updateDashboard);
  filterSearch.addEventListener("input", updateDashboard);

  const btnPrintPdf = document.getElementById("btn-print-pdf");
  if (btnPrintPdf) {
    btnPrintPdf.addEventListener("click", handlePrintPdf);
  }
}

// 連線 GAS 獲取資料
async function fetchRecords() {
  updateStatus(false, "正在連線至雲端試算表...");
  try {
    const res = await fetch(API_URL);
    const result = await res.json();
    if (result.status === "success") {
      allRecords = result.data;

      // 智慧跨裝置選單同步：如果雲端回傳選單選項，優先拉取覆蓋本機 localStorage
      if (result.options) {
        if (result.options.locations && result.options.locations.length > 0) {
          saveListToStorage("locations", result.options.locations);
        }
        if (result.options.subcontractors && result.options.subcontractors.length > 0) {
          saveListToStorage("subcontractors", result.options.subcontractors);
        }
        if (result.options.workitems && result.options.workitems.length > 0) {
          saveListToStorage("workitems", result.options.workitems);
        }
        if (result.options.equipments && result.options.equipments.length > 0) {
          saveListToStorage("equipments", result.options.equipments);
        }
        if (result.options.reporters && result.options.reporters.length > 0) {
          saveListToStorage("reporters", result.options.reporters);
        }
        renderDatalists();
        renderEquipmentCheckboxes();
      }

      // 動態置入 Google 試算表修改按鈕
      const editDbBtn = document.getElementById("btn-edit-database");
      if (editDbBtn && result.spreadsheetUrl) {
        editDbBtn.href = result.spreadsheetUrl;
        editDbBtn.classList.remove("hidden");
      }

      if (result.photos) {
        allCloudPhotos = result.photos;
      }

      // 雲端工程進度同步 (跨裝置同步)
      if (result.schedule) {
        if (result.schedule.finishDate && inputProjectEndDate) {
          inputProjectEndDate.value = result.schedule.finishDate;
          localStorage.setItem("daily_report_schedule_enddate", result.schedule.finishDate);
        }
        if (result.schedule.planPercent !== undefined && inputPlanProgress) {
          inputPlanProgress.value = parseFloat(result.schedule.planPercent).toFixed(4);
          localStorage.setItem("daily_report_plan_progress", result.schedule.planPercent);
        }
        if (result.schedule.actualPercent !== undefined && inputActualProgress) {
          inputActualProgress.value = parseFloat(result.schedule.actualPercent).toFixed(4);
          localStorage.setItem("daily_report_actual_progress", result.schedule.actualPercent);
        }
        updateProgressCalculations();
      }

      updateStatus(true, "連線成功，資料已同步");
      updateDashboard();
    } else {
      throw new Error(result.message);
    }
  } catch (err) {
    console.error("連線錯誤：", err);
    updateStatus(false, "連線失敗，請檢查網路或 API 設定");
  }
}

// 更新連線狀態顯示
function updateStatus(isOnline, text) {
  if (isOnline) {
    statusDot.className = "status-dot online";
    statusText.textContent = text;
  } else {
    statusDot.className = "status-dot offline";
    statusText.textContent = text;
  }
}

// 處理日報提交
async function handleFormSubmit(e) {
  e.preventDefault();
  
  submitBtn.disabled = true;
  submitSpinner.classList.remove("hidden");
  submitText.classList.add("hidden");

  const payload = {
    date: document.getElementById("input-date").value,
    location: document.getElementById("input-location").value.trim(),
    subcontractor: document.getElementById("input-subcontractor").value.trim(),
    workItem: document.getElementById("input-workitem").value.trim(),
    equipment: selectedEquipments.join(", "),
    amCount: parseInt(document.getElementById("input-amcount").value) || 0,
    pmCount: parseInt(document.getElementById("input-pmcount").value) || 0,
    reporter: document.getElementById("input-reporter").value.trim(),
    notes: document.getElementById("input-notes").value.trim(),
    checkItems: document.getElementById("input-checkitems").value.trim() || "無"
  };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify(payload)
    });
    
    const result = await res.json();
    if (result.status === "success") {
      alert("日報回報成功！");
      
      learnNewInputs(payload.subcontractor, payload.workItem, payload.equipment, payload.location, payload.reporter);

      reportForm.reset();
      document.getElementById("input-date").value = getTodayString();
      document.getElementById("input-amcount").value = 0;
      document.getElementById("input-pmcount").value = 0;
      document.getElementById("input-checkitems").value = "";
      
      // 重設複選機具
      selectedEquipments = ["無"];
      document.getElementById("selected-equipments-text").textContent = "無";
      renderEquipmentCheckboxes();
      
      await fetchRecords();
    } else {
      throw new Error(result.message);
    }
  } catch (err) {
    alert("回報失敗，原因：" + err.message);
  } finally {
    submitBtn.disabled = false;
    submitSpinner.classList.add("hidden");
    submitText.classList.remove("hidden");
  }
}

// 計算期間模式氣象統計：
// 全日沒雨(上、下午沒下雨計)：合計幾天
// 全日雨天(只要早上有雨就計)：合計幾天
// 半日雨天(下午有雨就計)：合計幾天
function calculatePeriodWeatherStats(records) {
  const dateMap = new Map();
  records.forEach(r => {
    if (r.date && !dateMap.has(r.date)) {
      dateMap.set(r.date, {
        am: r.amWeather || "",
        pm: r.pmWeather || ""
      });
    }
  });

  let dryDays = 0;      // 全日沒雨(上、下午沒下雨計)
  let fullRainDays = 0; // 全日雨天(只要早上有雨就計)
  let halfRainDays = 0; // 半日雨天(下午有雨就計)

  dateMap.forEach(({ am, pm }) => {
    const amRain = am.includes("雨");
    const pmRain = pm.includes("雨");

    if (amRain) {
      // 只要早上有雨就計
      fullRainDays++;
    } else if (pmRain) {
      // 下午有雨就計
      halfRainDays++;
    } else {
      // 上、下午沒下雨計
      dryDays++;
    }
  });

  return {
    dryDays,
    fullRainDays,
    halfRainDays,
    text: `全日沒雨(上、下午沒下雨計)：合計 ${dryDays} 天、全日雨天(只要早上有雨就計)：合計 ${fullRainDays} 天、半日雨天(下午有雨就計)：合計 ${halfRainDays} 天`
  };
}

// 主要邏輯：更新儀表板 (統計卡、天氣、圖表、明細表)
function updateDashboard() {
  const filtered = getFilteredRecords();
  
  let totalAm = 0;
  let totalPm = 0;
  filtered.forEach(r => {
    totalAm += r.amCount;
    totalPm += r.pmCount;
  });
  const amHalf = totalAm;
  const pmHalf = totalPm;
  const totalHalf = amHalf + pmHalf;
  const totalFullDay = totalHalf / 2;

  statTotalAm.textContent = amHalf.toFixed(1);
  statTotalPm.textContent = pmHalf.toFixed(1);
  if (statTotalFullDay) {
    statTotalFullDay.textContent = totalFullDay.toFixed(1);
  }
  statReportCount.textContent = filtered.length;

  if (filterMode === "daily") {
    if (weatherBox3) weatherBox3.classList.add("hidden");
    if (weatherSummaryHeading) {
      weatherSummaryHeading.innerHTML = '<i class="fa-solid fa-cloud-sun"></i> 今日氣象概要 (自動查詢)';
    }
    if (weatherAmTitle) {
      weatherAmTitle.innerHTML = '<i class="fa-solid fa-sun text-yellow"></i> 上午天氣';
    }
    if (weatherPmTitle) {
      weatherPmTitle.innerHTML = '<i class="fa-solid fa-moon text-blue"></i> 下午天氣';
    }
    if (filtered.length > 0) {
      const record = filtered[0];
      weatherAmVal.textContent = record.amWeather || "無氣象資料";
      weatherPmVal.textContent = record.pmWeather || "無氣象資料";
    } else {
      weatherAmVal.textContent = "無出工回報";
      weatherPmVal.textContent = "無出工回報";
    }
  } else {
    // 期間統計模式：全日沒雨、全日雨天、半日雨天
    const weatherStats = calculatePeriodWeatherStats(filtered);
    if (weatherBox3) weatherBox3.classList.remove("hidden");
    if (weatherSummaryHeading) {
      weatherSummaryHeading.innerHTML = '<i class="fa-solid fa-cloud-sun-rain"></i> 期間氣象統計';
    }
    if (weatherAmTitle) {
      weatherAmTitle.innerHTML = '<i class="fa-solid fa-sun text-yellow"></i> 全日沒雨 (上、下午沒下雨計)';
    }
    weatherAmVal.textContent = `合計 ${weatherStats.dryDays} 天`;

    if (weatherPmTitle) {
      weatherPmTitle.innerHTML = '<i class="fa-solid fa-cloud-showers-heavy text-blue"></i> 全日雨天 (只要早上有雨就計)';
    }
    weatherPmVal.textContent = `合計 ${weatherStats.fullRainDays} 天`;

    if (weatherBox3Title) {
      weatherBox3Title.innerHTML = '<i class="fa-solid fa-cloud-sun-rain text-cyan"></i> 半日雨天 (下午有雨就計)';
    }
    if (weatherBox3Val) {
      weatherBox3Val.textContent = `合計 ${weatherStats.halfRainDays} 天`;
    }
  }

  renderTable(filtered);
  renderCharts(filtered);
  syncPhotosForCurrentDate();
}

// 根據目前條件過濾日報資料
function getFilteredRecords() {
  const searchVal = filterSearch.value.trim().toLowerCase();
  
  return allRecords.filter(r => {
    if (filterMode === "daily") {
      if (r.date !== filterDate.value) return false;
    } else {
      const recDate = new Date(r.date);
      const startDate = filterStartDate.value ? new Date(filterStartDate.value) : null;
      const endDate = filterEndDate.value ? new Date(filterEndDate.value) : null;
      if (startDate && recDate < startDate) return false;
      if (endDate && recDate > endDate) return false;
    }

    if (searchVal) {
      const matchSub = r.subcontractor.toLowerCase().includes(searchVal);
      const matchWork = r.workItem.toLowerCase().includes(searchVal);
      const matchEquip = (r.equipment || "").toLowerCase().includes(searchVal);
      const matchRep = r.reporter.toLowerCase().includes(searchVal);
      const matchNotes = r.notes.toLowerCase().includes(searchVal);
      const matchLoc = r.location.toLowerCase().includes(searchVal);
      const matchCheck = (r.checkItems || "").toLowerCase().includes(searchVal);
      if (!matchSub && !matchWork && !matchEquip && !matchRep && !matchNotes && !matchLoc && !matchCheck) return false;
    }

    return true;
  });
}

// 渲染明細表
function renderTable(records) {
  tableBody.innerHTML = "";
  if (records.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="12" class="text-center">查無符合條件的出工記錄</td></tr>`;
    return;
  }

  records.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.date}</td>
      <td><span class="badge">${r.location}</span></td>
      <td><strong>${r.subcontractor}</strong></td>
      <td>${r.workItem}</td>
      <td><span class="text-cyan font-bold">${r.equipment || "無"}</span></td>
      <td class="text-center font-bold text-cyan">${Number(r.amCount).toFixed(1)}</td>
      <td class="text-center font-bold text-orange">${Number(r.pmCount).toFixed(1)}</td>
      <td><i class="fa-solid fa-cloud-sun text-yellow"></i> ${r.amWeather || "無"}</td>
      <td><i class="fa-solid fa-cloud-moon text-blue"></i> ${r.pmWeather || "無"}</td>
      <td>${r.reporter}</td>
      <td><div class="notes-cell" title="${r.notes}">${r.notes || "-"}</div></td>
      <td><div class="check-cell" title="${r.checkItems || '無'}">${(r.checkItems || "無").replace(/[；;]+/g, "<br>")}</div></td>
    `;
    tableBody.appendChild(tr);
  });
}

// 繪製/更新圖表
function renderCharts(records) {
  const subData = {};
  records.forEach(r => {
    if (!subData[r.subcontractor]) {
      subData[r.subcontractor] = { am: 0, pm: 0 };
    }
    subData[r.subcontractor].am += r.amCount;
    subData[r.subcontractor].pm += r.pmCount;
  });

  const subLabels = Object.keys(subData);
  const subAmValues = subLabels.map(l => subData[l].am);
  const subPmValues = subLabels.map(l => subData[l].pm);

  if (subChartInstance) subChartInstance.destroy();
  
  const ctxSub = document.getElementById("chart-subcontractors").getContext("2d");
  subChartInstance = new Chart(ctxSub, {
    type: "bar",
    data: {
      labels: subLabels,
      datasets: [
        {
          label: "上午出工數 (工)",
          data: subAmValues,
          backgroundColor: "rgba(79, 195, 247, 0.6)",
          borderColor: "#4fc3f7",
          borderWidth: 1
        },
        {
          label: "下午出工數 (工)",
          data: subPmValues,
          backgroundColor: "rgba(232, 100, 58, 0.6)",
          borderColor: "#e8643a",
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        x: { stacked: true, grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { color: "#8892b0" } },
        y: { stacked: true, grid: { color: "rgba(255, 255, 255, 0.05)" }, ticks: { color: "#8892b0" } }
      },
      plugins: {
        legend: { labels: { color: "#f0f3f6" } },
        title: { display: true, text: "各廠商出工統計 (工)", color: "#f0f3f6" }
      }
    }
  });

  const itemData = {};
  records.forEach(r => {
    const total = r.amCount + r.pmCount;
    if (total > 0) {
      itemData[r.workItem] = (itemData[r.workItem] || 0) + total;
    }
  });

  const itemLabels = Object.keys(itemData);
  const itemValues = itemLabels.map(l => itemData[l]);

  if (itemChartInstance) itemChartInstance.destroy();

  const ctxItem = document.getElementById("chart-workitems").getContext("2d");
  itemChartInstance = new Chart(ctxItem, {
    type: "doughnut",
    data: {
      labels: itemLabels,
      datasets: [{
        data: itemValues,
        backgroundColor: [
          "rgba(79, 195, 247, 0.6)",
          "rgba(232, 100, 58, 0.6)",
          "rgba(129, 199, 132, 0.6)",
          "rgba(255, 183, 77, 0.6)",
          "rgba(206, 147, 216, 0.6)",
          "rgba(128, 222, 234, 0.6)",
          "rgba(244, 143, 177, 0.6)"
        ],
        borderColor: "rgba(255, 255, 255, 0.1)",
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { 
          position: "bottom", 
          labels: { color: "#f0f3f6", boxWidth: 10, font: { size: 10 } } 
        },
        title: { display: true, text: "工項出工比例分佈 (工)", color: "#f0f3f6" }
      }
    }
  });
}

// 格式化國曆與星期
function formatGregorianWithDayOfWeek(dateStr) {
  if (!dateStr) return "";
  const days = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  const dateObj = new Date(dateStr);
  if (isNaN(dateObj.getTime())) return dateStr;
  
  const yyyy = dateObj.getFullYear();
  const mm = dateObj.getMonth() + 1;
  const dd = dateObj.getDate();
  const dayName = days[dateObj.getDay()];
  
  return `${yyyy}年${mm}月${dd}日 (${dayName})`;
}

// 清除天氣字串中的溫度資訊，僅保留天氣狀態描述
function cleanWeatherText(weatherStr) {
  if (!weatherStr) return "無";
  return weatherStr.replace(/\s*\(.*?\)/g, "").trim();
}

// === 工程進度與工期管理模組 ===
function initScheduleAndProgress() {
  const savedEndDate = localStorage.getItem("daily_report_schedule_enddate") || "";
  const savedPlanProgress = localStorage.getItem("daily_report_plan_progress") || "";
  const savedActualProgress = localStorage.getItem("daily_report_actual_progress") || "";

  if (inputProjectEndDate) inputProjectEndDate.value = savedEndDate;
  if (inputPlanProgress) inputPlanProgress.value = savedPlanProgress;
  if (inputActualProgress) inputActualProgress.value = savedActualProgress;

  updateProgressCalculations();

  // 監聽並自動同步至雲端與本地快取
  let syncScheduleTimer = null;
  function triggerCloudScheduleSync() {
    clearTimeout(syncScheduleTimer);
    syncScheduleTimer = setTimeout(async () => {
      const finishDate = inputProjectEndDate ? inputProjectEndDate.value : "";
      const planPercent = inputPlanProgress && inputPlanProgress.value !== "" ? parseFloat(inputPlanProgress.value) : 0;
      const actualPercent = inputActualProgress && inputActualProgress.value !== "" ? parseFloat(inputActualProgress.value) : 0;

      localStorage.setItem("daily_report_schedule_enddate", finishDate);
      localStorage.setItem("daily_report_plan_progress", planPercent);
      localStorage.setItem("daily_report_actual_progress", actualPercent);

      try {
        fetch(API_URL, {
          method: "POST",
          mode: "cors",
          headers: { "Content-Type": "text/plain" },
          body: JSON.stringify({
            action: "updateSchedule",
            finishDate: finishDate,
            planPercent: planPercent,
            actualPercent: actualPercent
          })
        });
      } catch (e) {
        console.warn("Schedule cloud sync error:", e);
      }
    }, 600);
  }

  if (inputProjectEndDate) {
    inputProjectEndDate.addEventListener("change", () => {
      updateProgressCalculations();
      triggerCloudScheduleSync();
    });
  }
  if (inputPlanProgress) {
    inputPlanProgress.addEventListener("input", () => {
      updateProgressCalculations();
      triggerCloudScheduleSync();
    });
  }
  if (inputActualProgress) {
    inputActualProgress.addEventListener("input", () => {
      updateProgressCalculations();
      triggerCloudScheduleSync();
    });
  }
}

function updateProgressCalculations() {
  if (!valRemainingDays || !valProgressDiff || !badgeProgressStatus) return;

  // 1. 剩餘工期計算
  const refDateStr = filterDate.value || getTodayString();
  const refDate = new Date(refDateStr);
  const endDateStr = inputProjectEndDate ? inputProjectEndDate.value : "";

  if (endDateStr) {
    const endDate = new Date(endDateStr);
    const diffTime = endDate.getTime() - refDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays > 0) {
      valRemainingDays.textContent = `剩餘 ${diffDays} 天`;
      valRemainingDays.className = "progress-calc-val text-cyan";
    } else if (diffDays === 0) {
      valRemainingDays.textContent = "今日完工";
      valRemainingDays.className = "progress-calc-val text-yellow";
    } else {
      valRemainingDays.textContent = `已逾期 ${Math.abs(diffDays)} 天`;
      valRemainingDays.className = "progress-calc-val text-orange";
    }
  } else {
    valRemainingDays.textContent = "未設定完工日";
    valRemainingDays.className = "progress-calc-val";
  }

  // 2. 超前或落後 % 計算 (精確至小數點 4 位)
  const planVal = inputPlanProgress && inputPlanProgress.value !== "" ? parseFloat(inputPlanProgress.value) : null;
  const actualVal = inputActualProgress && inputActualProgress.value !== "" ? parseFloat(inputActualProgress.value) : null;

  if (planVal !== null && actualVal !== null && !isNaN(planVal) && !isNaN(actualVal)) {
    const diff = actualVal - planVal;
    if (diff >= 0) {
      // 若值為正者只顯示超前
      const aheadStr = `超前 ${diff.toFixed(4)}%`;
      valProgressDiff.textContent = aheadStr;
      valProgressDiff.style.color = "#2ecc71";
      badgeProgressStatus.textContent = aheadStr;
      badgeProgressStatus.className = "progress-status-badge status-ahead";
    } else {
      // 若值為負者只顯示落後
      const behindStr = `落後 ${Math.abs(diff).toFixed(4)}%`;
      valProgressDiff.textContent = behindStr;
      valProgressDiff.style.color = "#ff5252";
      badgeProgressStatus.textContent = behindStr;
      badgeProgressStatus.className = "progress-status-badge status-behind";
    }
  } else {
    valProgressDiff.textContent = "0.0000%";
    valProgressDiff.style.color = "#fff";
    badgeProgressStatus.textContent = "尚未設定進度";
    badgeProgressStatus.className = "progress-status-badge";
  }
}

// === 施工照片管理模組 (支援 Google Drive 跨裝置雙向同步) ===
let constructionPhotos = [];
let allCloudPhotos = [];

function initPhotosModule() {
  // 本地快取讀取
  try {
    const saved = sessionStorage.getItem("daily_report_photos");
    if (saved) {
      constructionPhotos = JSON.parse(saved);
      updatePhotoBadges();
      renderPhotosPreview();
    }
  } catch (e) {
    console.error("Failed to load saved photos:", e);
  }

  if (btnOpenPhotosModal) {
    btnOpenPhotosModal.addEventListener("click", () => {
      photosModal.classList.remove("hidden");
      syncPhotosForCurrentDate();
    });
  }

  if (modalPhotosCloseBtn) {
    modalPhotosCloseBtn.addEventListener("click", () => {
      photosModal.classList.add("hidden");
    });
  }

  if (photosModal) {
    photosModal.addEventListener("click", (e) => {
      if (e.target === photosModal) {
        photosModal.classList.add("hidden");
      }
    });
  }

  if (btnSelectPhotos && inputPhotoFile) {
    btnSelectPhotos.addEventListener("click", () => {
      inputPhotoFile.click();
    });
  }

  if (inputPhotoFile) {
    inputPhotoFile.addEventListener("change", (e) => {
      handlePhotoFiles(e.target.files);
      inputPhotoFile.value = "";
    });
  }

  if (photoDropzone) {
    photoDropzone.addEventListener("dragover", (e) => {
      e.preventDefault();
      photoDropzone.classList.add("dragover");
    });
    photoDropzone.addEventListener("dragleave", () => {
      photoDropzone.classList.remove("dragover");
    });
    photoDropzone.addEventListener("drop", (e) => {
      e.preventDefault();
      photoDropzone.classList.remove("dragover");
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handlePhotoFiles(e.dataTransfer.files);
      }
    });
  }

  if (btnClearPhotos) {
    btnClearPhotos.addEventListener("click", async () => {
      if (constructionPhotos.length > 0 && confirm("確定要清空當前日期的所有施工照片嗎？（雲端檔案亦將一併刪除）")) {
        const toDelete = [...constructionPhotos];
        constructionPhotos = [];
        savePhotosState();
        updatePhotoBadges();
        renderPhotosPreview();

        for (const p of toDelete) {
          if (p.id && !p.id.startsWith("temp_")) {
            allCloudPhotos = allCloudPhotos.filter(cp => cp.id !== p.id);
            fetch(API_URL, {
              method: "POST",
              mode: "cors",
              headers: { "Content-Type": "text/plain" },
              body: JSON.stringify({ action: "deletePhoto", photoId: p.id })
            }).catch(e => console.warn(e));
          }
        }
      }
    });
  }
}

// 根據當前選擇之日期，過濾並同步展示雲端照片
function syncPhotosForCurrentDate() {
  if (allCloudPhotos.length === 0) return;
  if (filterMode === "daily") {
    const curDate = filterDate ? filterDate.value : getTodayString();
    constructionPhotos = allCloudPhotos.filter(p => p.date === curDate);
  } else {
    const sDate = filterStartDate ? filterStartDate.value : "";
    const eDate = filterEndDate ? filterEndDate.value : "";
    constructionPhotos = allCloudPhotos.filter(p => {
      if (sDate && p.date < sDate) return false;
      if (eDate && p.date > eDate) return false;
      return true;
    });
  }
  savePhotosState();
  updatePhotoBadges();
  renderPhotosPreview();
}

function readFileAsDataUrl(file) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.readAsDataURL(file);
  });
}

function compressImage(dataUrl, maxDim = 1200, quality = 0.85) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.src = dataUrl;
  });
}

async function handlePhotoFiles(fileList) {
  if (!fileList || fileList.length === 0) return;
  const files = Array.from(fileList);
  const targetDate = (filterDate && filterDate.value) ? filterDate.value : getTodayString();

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;

    const dataUrl = await readFileAsDataUrl(file);
    const compressedDataUrl = await compressImage(dataUrl, 1200, 0.85);
    const defaultCaption = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");

    const tempId = "temp_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    const tempItem = {
      id: tempId,
      date: targetDate,
      dataUrl: compressedDataUrl,
      viewUrl: compressedDataUrl,
      caption: defaultCaption,
      isUploading: true
    };

    constructionPhotos.push(tempItem);
    savePhotosState();
    updatePhotoBadges();
    renderPhotosPreview();

    // 背景上傳至 Google Drive
    try {
      const res = await fetch(API_URL, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify({
          action: "uploadPhoto",
          date: targetDate,
          caption: defaultCaption,
          fileName: file.name,
          imageBase64: compressedDataUrl,
          mimeType: "image/jpeg"
        })
      });

      const result = await res.json();
      if (result.status === "success" && result.photo) {
        tempItem.id = result.photo.id;
        tempItem.fileId = result.photo.fileId;
        tempItem.driveUrl = result.photo.driveUrl;
        tempItem.viewUrl = result.photo.viewUrl;
        tempItem.isUploading = false;

        const existingIdx = allCloudPhotos.findIndex(p => p.id === tempItem.id);
        if (existingIdx === -1) {
          allCloudPhotos.push(result.photo);
        } else {
          allCloudPhotos[existingIdx] = result.photo;
        }
      } else {
        tempItem.isUploading = false;
        if (result.message && (result.message.includes("DriveApp") || result.message.includes("權限"))) {
          alert("⚠️ Google Drive 雲端照片存取權限尚未授權：\n照片已暫存於本機，可在 GAS 編輯器選取 authDrive 函式執行授權以啟用跨裝置同步。");
        }
      }
    } catch (uploadErr) {
      console.warn("Upload error:", uploadErr);
      tempItem.isUploading = false;
    }

    savePhotosState();
    updatePhotoBadges();
    renderPhotosPreview();
  }
}

function savePhotosState() {
  try {
    sessionStorage.setItem("daily_report_photos", JSON.stringify(constructionPhotos));
  } catch (e) {
    console.warn("Storage quota exceeded for photos:", e);
  }
}

function updatePhotoBadges() {
  const count = constructionPhotos.length;
  if (badgePhotoCount) badgePhotoCount.textContent = count;
  if (modalPhotoCount) modalPhotoCount.textContent = count;
}

function renderPhotosPreview() {
  if (!photosPreviewGrid) return;
  photosPreviewGrid.innerHTML = "";

  if (constructionPhotos.length === 0) {
    const curDate = filterDate ? filterDate.value : '今日';
    photosPreviewGrid.innerHTML = `
      <div class="photos-empty-tip" id="photos-empty-tip">
        <i class="fa-regular fa-image"></i> 目前（${curDate}）尚無雲端施工照片。點擊上方「選擇施工照片」或拖曳照片上傳。
      </div>
    `;
    return;
  }

  constructionPhotos.forEach((photo, idx) => {
    const card = document.createElement("div");
    card.className = "photo-item-card";
    
    const statusBadge = photo.isUploading 
      ? `<div class="photo-uploading-badge"><i class="fa-solid fa-spinner fa-spin"></i> 雲端同步中...</div>`
      : (photo.fileId ? `<div class="photo-cloud-badge"><i class="fa-brands fa-google-drive"></i> 已同步雲端</div>` : '');

    card.innerHTML = `
      <img src="${photo.dataUrl || photo.viewUrl}" class="photo-item-thumb" alt="照片 ${idx + 1}" onerror="this.src='${photo.dataUrl || ''}'">
      ${statusBadge}
      <input type="text" class="photo-item-caption" value="${photo.caption || ''}" placeholder="輸入照片圖說說明...">
      <button type="button" class="photo-item-del-btn" title="刪除照片">&times;</button>
    `;

    const captionInput = card.querySelector(".photo-item-caption");
    captionInput.addEventListener("change", async (e) => {
      const newCap = e.target.value.trim();
      photo.caption = newCap;
      savePhotosState();

      if (photo.fileId || (photo.id && !photo.id.startsWith("temp_"))) {
        try {
          fetch(API_URL, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
              action: "updatePhotoCaption",
              photoId: photo.id,
              caption: newCap
            })
          });
        } catch (err) {
          console.warn("Caption update error:", err);
        }
      }
    });

    const delBtn = card.querySelector(".photo-item-del-btn");
    delBtn.addEventListener("click", async () => {
      if (!confirm("確定要刪除這張施工照片嗎？（雲端檔案亦將一併移除）")) return;

      const pId = photo.id;
      constructionPhotos = constructionPhotos.filter(p => p.id !== pId);
      allCloudPhotos = allCloudPhotos.filter(p => p.id !== pId);
      savePhotosState();
      updatePhotoBadges();
      renderPhotosPreview();

      if (pId && !pId.startsWith("temp_")) {
        try {
          await fetch(API_URL, {
            method: "POST",
            mode: "cors",
            headers: { "Content-Type": "text/plain" },
            body: JSON.stringify({
              action: "deletePhoto",
              photoId: pId
            })
          });
        } catch (err) {
          console.warn("Delete error:", err);
        }
      }
    });

    photosPreviewGrid.appendChild(card);
  });
}

// 處理 PDF 報表列印與匯出
function handlePrintPdf() {
  const filtered = getFilteredRecords();
  if (filtered.length === 0) {
    alert("目前無資料可供匯出，請調整篩選條件！");
    return;
  }
  
  // 1. 取得日期字串 (如果是單日模式顯示「2026年8月29日 (星期六)」，期間模式則顯示範圍)
  let dateText = "";
  if (filterMode === "daily") {
    dateText = formatGregorianWithDayOfWeek(filterDate.value);
  } else {
    dateText = `${formatGregorianWithDayOfWeek(filterStartDate.value)} 至 ${formatGregorianWithDayOfWeek(filterEndDate.value)}`;
  }
  
  // 2. 取得天氣資訊 (單日模式顯示氣象概況，期間模式顯示晴雨天統計)
  let weatherText = "";
  if (filterMode === "daily") {
    if (filtered.length > 0) {
      const r = filtered[0];
      const am = cleanWeatherText(r.amWeather);
      const pm = cleanWeatherText(r.pmWeather);
      weatherText = `上午：${am} / 下午：${pm}`;
    } else {
      weatherText = "無出工回報";
    }
  } else {
    // 期間統計模式下：晴天(上下午沒下雨計)：合計幾天、雨天(只要早上有雨就計)：合計幾天
    const weatherStats = calculatePeriodWeatherStats(filtered);
    weatherText = weatherStats.text;
  }
  
  // 3. 彙總自檢及查驗事項 (合併去重，支援多項拆解)
  const checkItemsSet = new Set();
  filtered.forEach(r => {
    if (r.checkItems && r.checkItems !== "無") {
      const items = r.checkItems.split(/[；;]+/);
      items.forEach(it => {
        const cleaned = it.replace(/^\d+[\.、\s]*/, "").trim();
        if (cleaned) checkItemsSet.add(cleaned);
      });
    }
  });
  const checkItemsArr = Array.from(checkItemsSet);
  
  // 4. 建立列印專用表格內容 (依單日或期間模式、及是否為單一廠商動態產生)
  let tableRowsHtml = "";
  let grandTotalWorkers = 0;

  // 判斷是否為單一廠商
  const uniqueSubs = new Set(filtered.map(r => (r.subcontractor || "").trim()).filter(Boolean));
  const isSingleSubcontractor = uniqueSubs.size <= 1;

  // 僅當「期間模式」且「存在多家廠商」時，才進行廠商出工加總與備註去重；
  // 若為「單一廠商」或「單日模式」，匯出 PDF 時每筆顯示不必合併！
  if (filterMode === "period" && !isSingleSubcontractor) {
    // 期間統計模式 (多家廠商)：依廠商名稱自行加總出工數，並合併備註、重複部分篩除
    const subMap = new Map(); // subName -> { totalWorkers: 0, notesSet: Set }

    filtered.forEach(r => {
      const sub = (r.subcontractor || "未填寫廠商").trim();
      const totalWorkers = Number(r.amCount) + Number(r.pmCount);
      grandTotalWorkers += totalWorkers;

      if (!subMap.has(sub)) {
        subMap.set(sub, {
          totalWorkers: 0,
          notesSet: new Set()
        });
      }

      const entry = subMap.get(sub);
      entry.totalWorkers += totalWorkers;

      // 備註清洗與去重
      let note = (r.notes || "").trim();
      if (!note || note === "-") {
        note = (r.workItem || "").trim();
      }

      if (note && note !== "-") {
        // 拆分子項目 (若有換行、分號或頓號)
        const parts = note.split(/[；;\r\n]+/);
        parts.forEach(p => {
          let cleaned = p.trim();
          // 移除前導序號 (如 1. 2. 0移工：)
          cleaned = cleaned.replace(/^\d+[\.、\s]*/, "").replace(/^0?[^\.、：:]*[:：]/, (m) => {
            if (m.includes(sub) || m.includes("移工") || m.includes("工項")) return "";
            return m;
          });
          // 移除括號內的廠商名稱 (如 (郅樺), （緯虹石材）)
          if (sub) {
            cleaned = cleaned.replace(new RegExp(`[（\\(]${sub}[）\\)]`, "g"), "");
          }
          // 移除尾部出工人數標記 (如 : 5人, *4人, : 14人)
          cleaned = cleaned.replace(/[:：*]?\s*\d+(?:\.\d+)?\s*(?:人|工).*$/, "");
          // 移除前後殘留符號
          cleaned = cleaned.replace(/^[、，；;：:\s]+|[、，；;：:\s]+$/g, "").trim();

          if (cleaned) {
            entry.notesSet.add(cleaned);
          }
        });
      }
    });

    // 依總出工數由大到小排序
    const sortedEntries = Array.from(subMap.entries()).sort((a, b) => b[1].totalWorkers - a[1].totalWorkers);

    sortedEntries.forEach(([sub, data]) => {
      const notesArr = Array.from(data.notesSet);
      let notesDisplay = "-";
      if (notesArr.length === 1) {
        notesDisplay = notesArr[0];
      } else if (notesArr.length > 1) {
        notesDisplay = notesArr.map((n, idx) => `${idx + 1}. ${n}`).join("<br>");
      }

      const halfW = data.totalWorkers;
      const fullW = halfW / 2;
      tableRowsHtml += `
        <tr>
          <td><strong>${sub}</strong></td>
          <td style="text-align: center; vertical-align: middle;">
            <div style="font-weight: bold; font-size: 13.5px; color: #1e293b;">${halfW.toFixed(1)} 工 <span style="font-size: 11px; font-weight: normal; color: #64748b;">(半天)</span></div>
            <div style="font-size: 11.5px; color: #0284c7; font-weight: 700; margin-top: 3px; background: #e0f2fe; padding: 2px 4px; border-radius: 4px; display: inline-block;">折合 ${fullW.toFixed(1)} 整天</div>
          </td>
          <td><div style="line-height: 1.45;">${notesDisplay}</div></td>
        </tr>
      `;
    });
  } else {
    // 單日模式 或 單一廠商時：每筆明細獨立顯示，不必合併！
    filtered.forEach(r => {
      const totalWorkers = Number(r.amCount) + Number(r.pmCount);
      grandTotalWorkers += totalWorkers;

      // 若為期間模式下的單一廠商，廠商欄位標註日期以便區分
      const subDisplay = (filterMode === "period") ? `${r.date} ${r.subcontractor}` : r.subcontractor;
      let noteDisplay = "-";
      if (r.notes && r.notes !== "-" && r.notes !== r.workItem) {
        noteDisplay = `${r.workItem} (${r.notes})`;
      } else {
        noteDisplay = r.workItem || r.notes || "-";
      }

      const halfW = totalWorkers;
      const fullW = halfW / 2;
      tableRowsHtml += `
        <tr>
          <td><strong>${subDisplay}</strong></td>
          <td style="text-align: center; vertical-align: middle;">
            <div style="font-weight: bold; font-size: 13.5px; color: #1e293b;">${halfW.toFixed(1)} 工 <span style="font-size: 11px; font-weight: normal; color: #64748b;">(半天)</span></div>
            <div style="font-size: 11.5px; color: #0284c7; font-weight: 700; margin-top: 3px; background: #e0f2fe; padding: 2px 4px; border-radius: 4px; display: inline-block;">折合 ${fullW.toFixed(1)} 整天</div>
          </td>
          <td>${noteDisplay}</td>
        </tr>
      `;
    });
  }
  
  // 5. 組合自檢及查驗事項區塊
  let checkContainerHtml = "";
  if (checkItemsArr.length > 0) {
    checkContainerHtml = `
      <div class="print-check-container">
        <div class="print-check-title"><i class="fa-solid fa-list-check"></i> 今日自檢及查驗事項</div>
        ${checkItemsArr.map((item, idx) => `<div class="print-check-item">${idx + 1}. ${item}</div>`).join("")}
      </div>
    `;
  }
  
  // 6. 填入列印隱藏區塊
  const reportTitle = filterMode === "period" 
    ? "食藥大樓興建工程 - 出工統計日報表 (期間彙總)" 
    : "食藥大樓興建工程 - 施工日報表";
  const reportType = filterMode === "period" ? "PDF 期間出工彙總表" : "PDF 格式日報";

  const reportContent = `
    <div class="print-header">
      <h1>${reportTitle}</h1>
    </div>
    <div class="print-meta-grid">
      <div class="print-meta-item"><strong>標案名稱：</strong>食藥大樓興建工程</div>
      <div class="print-meta-item"><strong>申報日期：</strong>${dateText}</div>
      <div class="print-meta-item"><strong>今日天氣：</strong>${weatherText}</div>
      <div class="print-meta-item"><strong>報表輸出：</strong>${reportType}</div>
      <div class="print-meta-item"><strong>出工加總：</strong><strong>${grandTotalWorkers.toFixed(1)} 工 (半天計)</strong></div>
      <div class="print-meta-item" style="color: #0284c7;"><strong>實際總工數：</strong><strong>${(grandTotalWorkers / 2).toFixed(1)} 工 (整天計，除以 2)</strong></div>
      <div class="print-meta-item"><strong>預定完工日：</strong>${inputProjectEndDate && inputProjectEndDate.value ? inputProjectEndDate.value : "未設定"}</div>
      <div class="print-meta-item"><strong>剩餘工期：</strong>${valRemainingDays ? valRemainingDays.textContent : "-"}</div>
      <div class="print-meta-item"><strong>預定進度：</strong>${inputPlanProgress && inputPlanProgress.value !== "" ? parseFloat(inputPlanProgress.value).toFixed(4) + "%" : "-"}</div>
      <div class="print-meta-item"><strong>實際進度：</strong>${inputActualProgress && inputActualProgress.value !== "" ? parseFloat(inputActualProgress.value).toFixed(4) + "%" : "-"} (${badgeProgressStatus ? badgeProgressStatus.textContent : "-"})</div>
    </div>
    
    ${checkContainerHtml}
    
    <table class="print-table">
      <thead>
        <tr>
          <th style="width: 25%;">${(filterMode === "period" && isSingleSubcontractor) ? "日期 / 廠商名稱" : "廠商名稱"}</th>
          <th style="width: 20%; text-align: center;">出工數<br><span style="font-size: 11px; font-weight: normal; color: #475569;">(半天累計 / 折合整天)</span></th>
          <th style="width: 55%;">${(filterMode === "period" && !isSingleSubcontractor) ? "作業位置、部位、作業內容說明 (彙整)" : "作業位置、部位、作業內容說明"}</th>
        </tr>
      </thead>
      <tbody>
        ${tableRowsHtml}
      </tbody>
      <tfoot>
        <tr style="background: #f8fafc; font-weight: bold; border-top: 2px solid #cbd5e1;">
          <td style="color: #334155;">出工總計 (半天計)</td>
          <td style="text-align: center; font-size: 14px; color: #1e293b;">${grandTotalWorkers.toFixed(1)} 工 (半天)</td>
          <td style="color: #64748b; font-size: 12.5px;">${filterMode === "period" ? (isSingleSubcontractor ? "期間單一廠商各工項半天出工累計" : "期間內各廠商半天出工加總") : "當日半天出工加總"}</td>
        </tr>
        <tr style="background: #f0f9ff; font-weight: bold; border-top: 1.5px solid #0284c7;">
          <td style="color: #0369a1; font-size: 13.5px;"><i class="fa-solid fa-calculator"></i> 實際總工數 (整天計)</td>
          <td style="text-align: center; font-size: 15px; font-weight: 800; color: #0284c7;">${(grandTotalWorkers / 2).toFixed(1)} 工 (整天)</td>
          <td style="color: #0369a1; font-size: 12.5px;"><strong>※ 依工程實務計算：若以整天（全日工）計算，須除以 2 才是實際總工數</strong>（${grandTotalWorkers.toFixed(1)} ÷ 2 = ${(grandTotalWorkers / 2).toFixed(1)} 工）</td>
        </tr>
      </tfoot>
    </table>
    
    ${constructionPhotos && constructionPhotos.length > 0 ? `
      <div class="print-photos-section">
        <div class="print-photos-title"><i class="fa-solid fa-camera"></i> 施工照片紀錄 (檢附 ${constructionPhotos.length} 張)</div>
        <div class="print-photos-grid">
          ${constructionPhotos.map((p, idx) => `
            <div class="print-photo-card">
              <img src="${p.dataUrl || p.viewUrl}" class="print-photo-img" alt="照片 ${idx + 1}" crossorigin="anonymous">
              <div class="print-photo-caption">圖 ${idx + 1}：${p.caption || "現場施工照片"}</div>
            </div>
          `).join("")}
        </div>
      </div>
    ` : ""}
  `;

  // 1. 同步寫入系統列印專用隱藏容器 (供桌面快捷列印)
  const printArea = document.getElementById("print-area");
  if (printArea) {
    printArea.innerHTML = reportContent;
  }

  // 2. 開啟預覽彈窗 (支援手機、PAD 與桌面即時預覽與直接下載 PDF)
  const previewModal = document.getElementById("report-preview-modal");
  const previewBody = document.getElementById("report-preview-body");
  if (previewModal && previewBody) {
    previewBody.innerHTML = `
      <div class="report-paper" id="report-paper-container">
        ${reportContent}
      </div>
    `;
    previewModal.classList.remove("hidden");

    // 綁定「📥 直接下載 PDF 檔案」按鈕
    const btnDownloadPdf = document.getElementById("btn-download-pdf");
    if (btnDownloadPdf) {
      btnDownloadPdf.onclick = async () => {
        const element = document.getElementById("report-paper-container");
        if (!element || typeof html2pdf === "undefined") {
          window.print();
          return;
        }

        const originalText = btnDownloadPdf.innerHTML;
        btnDownloadPdf.disabled = true;
        btnDownloadPdf.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> 正在生成 PDF...`;

        const filename = `${filterMode === "daily" ? filterDate.value : (filterStartDate.value + "_" + filterEndDate.value)}_工地出工日報.pdf`;
        const opt = {
          margin: [8, 8, 8, 8],
          filename: filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { 
            scale: 2, 
            useCORS: true, 
            logging: false,
            backgroundColor: "#ffffff"
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
        };

        try {
          await html2pdf().set(opt).from(element).save();
        } catch (e) {
          console.warn("html2pdf error, fallback to print:", e);
          window.print();
        } finally {
          btnDownloadPdf.disabled = false;
          btnDownloadPdf.innerHTML = originalText;
        }
      };
    }

    // 綁定「🖨️ 系統列印」按鈕
    const btnSystemPrint = document.getElementById("btn-system-print");
    if (btnSystemPrint) {
      btnSystemPrint.onclick = () => {
        window.print();
      };
    }

    // 綁定關閉按鈕
    const closeBtn = document.getElementById("modal-report-close-btn");
    if (closeBtn) {
      closeBtn.onclick = () => {
        previewModal.classList.add("hidden");
      };
    }
    previewModal.onclick = (e) => {
      if (e.target === previewModal) {
        previewModal.classList.add("hidden");
      }
    };
  } else {
    // 若無彈窗容器則回退原廠列印
    window.print();
  }
}

// 初始化自定義 Autocomplete 下拉選單 (取代原生 datalist，使樣式完全可控、防行動端版面擠壓)
function makeAutocomplete(inputEl, storageKey) {
  if (!inputEl) return;
  
  // 移除原生 list 屬性，防止觸發瀏覽器原生巨大下拉框
  inputEl.removeAttribute("list");
  inputEl.setAttribute("autocomplete", "off");
  
  // 動態建立 wrapper 包裹 inputEl，使其可相對於此 wrapper 進行絕對定位
  const wrapper = document.createElement("div");
  wrapper.className = "autocomplete-wrapper";
  inputEl.parentNode.insertBefore(wrapper, inputEl);
  wrapper.appendChild(inputEl);
  
  // 建立下拉清單容器
  const dropdown = document.createElement("div");
  dropdown.className = "autocomplete-dropdown hidden";
  wrapper.appendChild(dropdown);
  
  // 渲染下拉清單
  function renderDropdown(query = "") {
    const items = getListFromStorage(storageKey);
    const filtered = items.filter(item => 
      item.toLowerCase().includes(query.toLowerCase())
    );
    
    if (filtered.length === 0) {
      dropdown.innerHTML = `<div class="autocomplete-no-result">無相符項目</div>`;
      return;
    }
    
    dropdown.innerHTML = filtered.map(item => `
      <div class="autocomplete-item" data-value="${item}">${item}</div>
    `).join("");
    
    // 綁定項目點擊事件
    dropdown.querySelectorAll(".autocomplete-item").forEach(itemEl => {
      itemEl.addEventListener("mousedown", (e) => {
        // 使用 mousedown 避免 blur 先觸發導致選不到項目
        e.preventDefault();
        const selectedVal = itemEl.getAttribute("data-value");
        inputEl.value = selectedVal;
        
        // 觸發 input 與 change 事件以利其他程式邏輯監聽
        inputEl.dispatchEvent(new Event("input"));
        inputEl.dispatchEvent(new Event("change"));
        closeDropdown();
      });
    });
  }
  
  function showDropdown() {
    dropdown.classList.remove("hidden");
    renderDropdown(inputEl.value);
  }
  
  function closeDropdown() {
    dropdown.classList.add("hidden");
  }
  
  // 監聽焦點
  inputEl.addEventListener("focus", () => {
    showDropdown();
  });
  
  // 監聽輸入過濾
  inputEl.addEventListener("input", () => {
    showDropdown();
  });
  
  // 監聽失去焦點 (延遲關閉，好讓 mousedown 點擊先執行)
  inputEl.addEventListener("blur", () => {
    setTimeout(closeDropdown, 250);
  });
  
  // 監聽鍵盤 Esc
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeDropdown();
    }
  });
}

// === 智慧批次寫入模組 (Smart Batch Submission) ===
function initBatchSubmission() {
  const btnTabSingle = document.getElementById("btn-tab-single");
  const btnTabBatch = document.getElementById("btn-tab-batch");
  const singleForm = document.getElementById("report-form");
  const batchContainer = document.getElementById("batch-form-container");

  const batchDate = document.getElementById("batch-input-date");
  const batchLocation = document.getElementById("batch-input-location");
  const batchReporter = document.getElementById("batch-input-reporter");
  const batchCheckitems = document.getElementById("batch-input-checkitems");
  const batchTextarea = document.getElementById("batch-paste-textarea");

  const btnParse = document.getElementById("btn-batch-parse");
  const btnAddRow = document.getElementById("btn-batch-add-row");
  const btnClear = document.getElementById("btn-batch-clear");
  const btnSubmit = document.getElementById("btn-batch-submit");
  const batchSpinner = document.getElementById("batch-spinner");
  const batchStatusMsg = document.getElementById("batch-status-msg");

  const batchTableBody = document.getElementById("batch-table-body");
  const batchPreviewCount = document.getElementById("batch-preview-count");
  const batchSubmitCount = document.getElementById("batch-submit-count");
  const batchEmptyTip = document.getElementById("batch-empty-tip");

  if (!btnTabSingle || !btnTabBatch) return;

  // 1. 預設日期與 Autocomplete
  batchDate.value = getTodayString();
  makeAutocomplete(batchLocation, "locations");
  makeAutocomplete(batchReporter, "reporters");

  // 2. 頁籤切換
  btnTabSingle.addEventListener("click", () => {
    btnTabSingle.classList.add("active");
    btnTabBatch.classList.remove("active");
    singleForm.classList.remove("hidden");
    batchContainer.classList.add("hidden");
  });

  btnTabBatch.addEventListener("click", () => {
    btnTabBatch.classList.add("active");
    btnTabSingle.classList.remove("active");
    batchContainer.classList.remove("hidden");
    singleForm.classList.add("hidden");
  });

  // 更新列數計數器與按鈕狀態
  function updateBatchTableState() {
    const rows = batchTableBody.querySelectorAll("tr");
    const count = rows.length;
    batchPreviewCount.textContent = count;
    batchSubmitCount.textContent = count;
    
    if (count > 0) {
      batchEmptyTip.classList.add("hidden");
      btnSubmit.disabled = false;
    } else {
      batchEmptyTip.classList.remove("hidden");
      btnSubmit.disabled = true;
    }
  }

  // 3. 建立表格列
  function createBatchRow(item = {}) {
    const tr = document.createElement("tr");
    const sub = item.subcontractor || "";
    const work = item.workItem || "";
    const count = item.count !== undefined ? item.count : 1;
    const notes = item.notes || "";
    const isVehicle = !!item.isVehicle;

    tr.innerHTML = `
      <td><input type="text" class="batch-col-sub" value="${sub}" placeholder="廠商名稱" required></td>
      <td><input type="text" class="batch-col-work" value="${work}" placeholder="施作工項" required></td>
      <td><input type="number" class="batch-col-count" value="${count}" min="0" step="0.5" style="text-align: center;" required></td>
      <td><input type="text" class="batch-col-notes" value="${notes}" placeholder="作業位置、部位、內容說明"></td>
      <td style="text-align: center;">
        <button type="button" class="btn-batch-del-row" title="刪除此列"><i class="fa-solid fa-trash-can"></i></button>
      </td>
    `;

    if (isVehicle) {
      tr.dataset.isVehicle = "true";
    }

    const subInput = tr.querySelector(".batch-col-sub");
    const workInput = tr.querySelector(".batch-col-work");
    const notesInput = tr.querySelector(".batch-col-notes");

    subInput.addEventListener("input", () => {
      const autoItem = detectWorkItem(subInput.value, notesInput.value);
      if (autoItem && autoItem !== "無") {
        workInput.value = autoItem;
      } else if (!workInput.value || workInput.value === "無") {
        workInput.value = "無";
      }
    });

    notesInput.addEventListener("input", () => {
      if (!workInput.value || workInput.value === "無") {
        const autoItem = detectWorkItem(subInput.value, notesInput.value);
        if (autoItem && autoItem !== "無") {
          workInput.value = autoItem;
        }
      }
    });

    // 刪除列監聽
    tr.querySelector(".btn-batch-del-row").addEventListener("click", () => {
      tr.remove();
      updateBatchTableState();
    });

    batchTableBody.appendChild(tr);
    updateBatchTableState();
  }

  // 4. 新增空列按鈕
  btnAddRow.addEventListener("click", () => {
    createBatchRow({
      subcontractor: "",
      workItem: "",
      count: 1,
      notes: ""
    });
    const lastSubInput = batchTableBody.querySelector("tr:last-child .batch-col-sub");
    if (lastSubInput) lastSubInput.focus();
  });

  // 5. 清空按鈕
  btnClear.addEventListener("click", () => {
    if (batchTableBody.children.length > 0 && !confirm("確定要清空目前預覽清單中的所有項目嗎？")) {
      return;
    }
    batchTableBody.innerHTML = "";
    updateBatchTableState();
    batchStatusMsg.classList.add("hidden");
  });

  // 6. 智慧文字解析核心演算法 (Smart Text Parser)
  btnParse.addEventListener("click", () => {
    const rawText = batchTextarea.value.trim();
    if (!rawText) {
      alert("請先貼上工項通報文字！");
      return;
    }

    // A. 嘗試解析日期 (例如 8/26, 08/26, 8-26, 2026/8/26 等)
    const dateMatch = rawText.match(/(?:(\d{4})[年\/-])?(\d{1,2})[月\/-](\d{1,2})/);
    if (dateMatch) {
      const year = dateMatch[1] || new Date().getFullYear();
      const month = String(dateMatch[2]).padStart(2, "0");
      const day = String(dateMatch[3]).padStart(2, "0");
      batchDate.value = `${year}-${month}-${day}`;
    }

    // B. 嘗試解析自檢及查驗事項 (支援多行多項 1. 2. 抓取，且先重設為「無」，徹底杜絕上一日殘留)
    batchCheckitems.value = "無";
    const checkIdx = rawText.search(/自檢(?:及查驗)?(?:事項)?[:：]/);
    if (checkIdx !== -1) {
      const afterCheckText = rawText.slice(checkIdx).replace(/^自檢(?:及查驗)?(?:事項)?[:：]?/, "").trim();
      const checkLines = afterCheckText.split(/[\r\n]+/);
      const collectedItems = [];

      for (let cLine of checkLines) {
        cLine = cLine.trim();
        if (!cLine) continue;
        // 若遇到其他段落標題則停止抓取
        if (cLine.includes("明日") || cLine.includes("車輛") || cLine.includes("工項") || cLine.startsWith("景觀")) {
          break;
        }
        collectedItems.push(cLine);
      }

      if (collectedItems.length > 0) {
        batchCheckitems.value = collectedItems.join("；");
      }
    }

    // C. 逐行解析工項清單
    const lines = rawText.split(/[\r\n]+/);
    const parsedItems = [];
    let currentSection = "normal"; // normal, landscape (景觀), vehicle (明日車輛), check (自檢)

    for (let rawLine of lines) {
      let line = rawLine.trim();
      if (!line) continue;

      // 檢查章節標題
      if (line.includes("明日車輛") || line.includes("車輛：") || line.includes("車輛:")) {
        currentSection = "vehicle";
        const afterColon = line.split(/[:：]/)[1];
        if (afterColon && afterColon.trim()) {
          line = afterColon.trim();
        } else {
          continue;
        }
      } else if (line.includes("自檢及查驗") || line.includes("自檢：") || line.includes("自檢:")) {
        currentSection = "check";
        continue;
      } else if (line.startsWith("景觀") || line.includes("景觀工項")) {
        currentSection = "landscape";
        continue;
      } else if (line.includes("明日工項")) {
        currentSection = "normal";
        continue;
      }

      if (currentSection === "check") continue;

      // 解析車輛
      if (currentSection === "vehicle" || line.includes("吊卡車") || line.includes("壓送車") || line.includes("吊車") || line.includes("貨車") || line.includes("堆高機")) {
        const subMatch = line.match(/[（\(]([^\)）]+)[）\)]/);
        const subName = subMatch ? subMatch[1].trim() : "暢鴻";
        
        parsedItems.push({
          subcontractor: subName,
          workItem: "使用車輛與機具",
          count: 1, // 算 0.5 工
          notes: line,
          isVehicle: true
        });
        continue;
      }

      // 解析標準出工行
      // 萃取工數 (例如 : 14人, :2工, *4人, :7人)
      const countMatch = line.match(/[:：*]\s*(\d+(?:\.\d+)?)\s*(?:人|工)/) || line.match(/(\d+(?:\.\d+)?)\s*(?:人|工)/);
      let count = 0;
      if (countMatch) {
        count = parseFloat(countMatch[1]);
      }

      // 萃取廠商 (括號中的名稱)
      let subName = "";
      const subMatch = line.match(/[（\(]([^\)）]+)[）\)]/);
      if (subMatch) {
        subName = subMatch[1].trim();
      } else if (line.startsWith("0移工") || line.includes("移工")) {
        subName = "移工";
      }

      // 萃取工項內容
      let workItem = line;
      // 移除開頭的編號 (如 1. 2. 0移工： 10.)
      workItem = workItem.replace(/^\d+[\.、\s]*/, "").replace(/^0移工[:：]?/, "");
      // 移除尾部的人數
      workItem = workItem.replace(/[:：*]?\s*\d+(?:\.\d+)?\s*(?:人|工).*$/, "");
      // 移除括號內的廠商
      workItem = workItem.replace(/[（\(][^\)）]+[）\)]/g, "").trim();
      // 移除冒號等標點
      workItem = workItem.replace(/^[:：]+|[:：]+$/g, "").trim();

      if (!workItem && currentSection === "landscape") {
        workItem = "景觀施作";
      }

      if (subName || workItem) {
        // 依廠商名稱及作業說明自動生成工項，若無對應者顯示「無」
        const autoWork = detectWorkItem(subName, line);
        parsedItems.push({
          subcontractor: subName || "其他廠商",
          workItem: autoWork !== "無" ? autoWork : (detectWorkItem("", workItem) !== "無" ? detectWorkItem("", workItem) : "無"),
          count: count || 1,
          notes: line,
          isVehicle: false
        });
      }
    }

    if (parsedItems.length === 0) {
      alert("未能從貼上的文字中辨識出工項，請確認格式或使用「+ 加一列」手動新增！");
      return;
    }

    // 渲染至預覽表格
    batchTableBody.innerHTML = "";
    parsedItems.forEach(item => createBatchRow(item));

    batchStatusMsg.className = "batch-status-msg success";
    batchStatusMsg.textContent = `✨ 智慧解析完成！成功辨識 ${parsedItems.length} 筆工項資料，請確認下方表格。`;
    batchStatusMsg.classList.remove("hidden");
  });

  // 7. 確認批次送出至雲端
  btnSubmit.addEventListener("click", async () => {
    const rows = batchTableBody.querySelectorAll("tr");
    if (rows.length === 0) {
      alert("目前沒有任何可提交的資料！");
      return;
    }

    const defaultDate = batchDate.value;
    const defaultLocation = batchLocation.value.trim() || "食藥署";
    const defaultReporter = batchReporter.value.trim() || "黃珺騰";
    const defaultCheckItems = batchCheckitems.value.trim() || "無";

    if (!defaultDate) {
      alert("請選擇預設日期！");
      batchDate.focus();
      return;
    }

    // 收集所有列數據
    const records = [];
    for (let tr of rows) {
      const sub = tr.querySelector(".batch-col-sub").value.trim();
      const work = tr.querySelector(".batch-col-work").value.trim();
      const count = parseFloat(tr.querySelector(".batch-col-count").value) || 0;
      const notes = tr.querySelector(".batch-col-notes").value.trim();
      const isVehicle = tr.dataset.isVehicle === "true";

      if (!sub || !work) {
        alert("請確認所有列的「廠商名稱」與「工項內容」皆已填寫！");
        return;
      }

      records.push({
        date: defaultDate,
        location: defaultLocation,
        subcontractor: sub,
        workItem: work,
        equipment: isVehicle ? (notes.split(/[*車]/)[0] || "車輛") : "無",
        amCount: count,
        pmCount: isVehicle ? 0 : count,
        reporter: defaultReporter,
        notes: notes || work,
        checkItems: defaultCheckItems
      });
    }

    if (!confirm(`即將批次提交 ${records.length} 筆出工紀錄至 ${defaultDate}，確定要送出嗎？`)) {
      return;
    }

    // 送出狀態指示
    btnSubmit.disabled = true;
    batchSpinner.classList.remove("hidden");
    batchStatusMsg.className = "batch-status-msg";
    batchStatusMsg.textContent = `🚀 正在批次寫入 ${records.length} 筆資料至雲端試算表...`;
    batchStatusMsg.classList.remove("hidden");

    try {
      const payload = {
        action: "batchSubmit",
        records: records
      };

      const res = await fetch(API_URL, {
        method: "POST",
        mode: "cors",
        headers: { "Content-Type": "text/plain" },
        body: JSON.stringify(payload)
      });

      const result = await res.json();
      if (result.status === "success") {
        batchStatusMsg.className = "batch-status-msg success";
        batchStatusMsg.textContent = `🎉 ${result.message || '批次回報成功！'}`;

        // 自動學習新輸入項目
        records.forEach(r => {
          learnNewInputs(r.subcontractor, r.workItem, r.equipment, r.location, r.reporter);
        });

        // 清空輸入
        batchTextarea.value = "";
        batchTableBody.innerHTML = "";
        updateBatchTableState();

        // 重新整理儀表板數據
        await fetchRecords();

        // 自動切換儀表板日期至該天以利檢視
        filterDate.value = defaultDate;
        filterMode = "daily";
        btnModeDaily.classList.add("active");
        btnModePeriod.classList.remove("active");
        filterDailyGroup.classList.remove("hidden");
        filterPeriodGroup.classList.add("hidden");
        updateDashboard();

        alert(`批次寫入成功！共新增 ${records.length} 筆紀錄。\n儀表板已自動切換至 ${defaultDate}！`);
      } else {
        throw new Error(result.message || "未知錯誤");
      }
    } catch (err) {
      batchStatusMsg.className = "batch-status-msg error";
      batchStatusMsg.textContent = `❌ 批次寫入失敗：${err.message}`;
      alert("批次寫入失敗：" + err.message);
    } finally {
      btnSubmit.disabled = false;
      batchSpinner.classList.add("hidden");
      updateBatchTableState();
    }
  });
}



