// ============================================================
// Gamma 衣物系統
// ============================================================

const EQUIPMENT_TYPES = [
  "外套", "洋裝", "上衣", "裙子",
  "褲子", "褲襪", "胸罩", "內褲"
];

const DEFAULT_EQUIPMENT = [
  "上衣", "裙子", "胸罩", "內褲"
];

const EQUIPMENT_BLOCKERS = {
  洋裝: ["外套"],
  上衣: ["外套"],
  胸罩: ["外套", "上衣", "洋裝"],
  內褲: ["褲子", "褲襪"]
};

let roundBusy = false;
let currentEquipmentDiscards = [];

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function cleanEquipment(items) {
  return EQUIPMENT_TYPES.filter(
    item => Array.isArray(items) && items.includes(item)
  );
}

function ensureEquipment(participant) {
  if (!Array.isArray(participant.initialEquipment)) {
    participant.initialEquipment =
      Array.isArray(participant.equipment)
        ? cleanEquipment(participant.equipment)
        : [...DEFAULT_EQUIPMENT];
  }

  participant.initialEquipment =
    cleanEquipment(participant.initialEquipment);

  participant.equipment =
    Array.isArray(participant.equipment)
      ? cleanEquipment(participant.equipment)
      : [...participant.initialEquipment];

  if (!Array.isArray(participant.equipmentHistory)) {
    participant.equipmentHistory = [];
  }

  participant.pendingEquipmentLoss =
    !!participant.pendingEquipmentLoss &&
    participant.equipment.length > 0;

  participant.pendingEquipmentDiscards =
    Math.max(
      0,
      Number(participant.pendingEquipmentDiscards) || 0
    );

  if (!participant.pendingEquipmentLoss) {
    participant.pendingEquipmentDiscards = 0;
  }
}

function hasPendingEquipment() {
  return participants.some(
    participant => participant.pendingEquipmentLoss
  );
}

function blockPendingEquipment() {
  if (!hasPendingEquipment() && !roundBusy) {
    return false;
  }

  alert("請先完成本回合的衣物拋棄，再進行此操作。");
  return true;
}

function legalEquipment(participant) {
  ensureEquipment(participant);

  return participant.equipment.filter(item => {
    const blockers = EQUIPMENT_BLOCKERS[item] || [];

    return !blockers.some(
      blocker => participant.equipment.includes(blocker)
    );
  });
}

function discardEquipment(participant, item) {
  if (
    !participant.pendingEquipmentLoss ||
    !legalEquipment(participant).includes(item)
  ) {
    return null;
  }

  participant.equipment =
    participant.equipment.filter(value => value !== item);

  participant.pendingEquipmentDiscards++;

  if (
    gameConfig.equipmentRule !== "unlimited" ||
    participant.equipment.length === 0
  ) {
    participant.pendingEquipmentLoss = false;
    participant.pendingEquipmentDiscards = 0;
  }

  const record = {
    participantId: participant.id,
    participantKey: participant.participantKey,
    participantName: participant.name,
    equipment: item,
    round: roundNumber,
    timestamp: new Date().toISOString()
  };

  participant.equipmentHistory.push(record);
  return record;
}

function handleEquipmentLoss(participant) {
  ensureEquipment(participant);

  if (participant.equipment.length === 0) {
    return;
  }

  participant.pendingEquipmentLoss = true;
  participant.pendingEquipmentDiscards = 0;

  if (gameConfig.equipmentDiscardMode === "computer") {
    do {
      const options = legalEquipment(participant);

      if (options.length === 0) break;

      const item =
        options[Math.floor(Math.random() * options.length)];

      const record = discardEquipment(participant, item);

      if (record) {
        currentEquipmentDiscards.push(record);
      }
    } while (
      gameConfig.equipmentRule === "unlimited" &&
      participant.pendingEquipmentLoss
    );

    if (
      gameConfig.equipmentRule === "unlimited" &&
      participant.pendingEquipmentLoss &&
      participant.equipment.length === 0
    ) {
      participant.pendingEquipmentLoss = false;
      participant.pendingEquipmentDiscards = 0;
    }
  }
}

function renderEquipmentSettings(participant, card) {
  ensureEquipment(participant);

  const box = element("div", undefined, "inherit-box");
  box.style.marginTop = "12px";

  box.appendChild(element("strong", "個別衣物設定"));

  box.appendChild(
    element(
      "div",
      roundNumber > 0
        ? "本回合已開始，起始衣物已鎖定。"
        : "各參賽者可獨立勾選",
      "small"
    )
  );

  const options = element("div");

  options.style.cssText =
    "display:flex;flex-wrap:wrap;gap:12px;margin-top:8px";

  EQUIPMENT_TYPES.forEach(item => {
    const label =
      element("label", undefined, "checkbox-setting");

    const input = element("input");
    input.type = "checkbox";
    input.value = item;

    input.checked =
      participant.initialEquipment.includes(item);

    input.disabled =
      roundNumber > 0 ||
      roundBusy ||
      hasPendingEquipment();

    input.addEventListener("change", () => {
      const selected =
        participant.initialEquipment.filter(
          value => value !== item
        );

      if (input.checked) {
        selected.push(item);
      }

      participant.initialEquipment =
        cleanEquipment(selected);

      participant.equipment =
        [...participant.initialEquipment];

      participant.equipmentHistory = [];

      renderParticipantSettings();
      renderStats();
      saveCurrentTournamentRoundSnapshot();
      void saveGameState();
    });

    label.append(
      input,
      document.createTextNode(" " + item)
    );

    options.appendChild(label);
  });

  box.appendChild(options);

  box.appendChild(
    element(
      "div",
      `剩餘衣物 ${participant.equipment.length}/${participant.initialEquipment.length}：${participant.equipment.join("、") || "無"}`,
      "small"
    )
  );

  card.appendChild(box);
}

function initializeEquipmentControls() {
  const apply =
    document.getElementById("applyEquipmentToAllBtn");

  if (apply) {
    apply.addEventListener("click", () => {
      if (!participants.length) {
        alert("請先建立遊戲。");
        return;
      }

      if (blockPendingEquipment()) {
        return;
      }

      if (roundNumber > 0) {
        alert("起始衣物只能在本回合開始前設定。");
        return;
      }

      const selected = cleanEquipment(
        Array.from(
          document.querySelectorAll(
            ".global-equipment-checkbox:checked"
          ),
          input => input.value
        )
      );

      participants.forEach(participant => {
        participant.initialEquipment = [...selected];
        participant.equipment = [...selected];
        participant.equipmentHistory = [];
        participant.pendingEquipmentLoss = false;
      });

      renderParticipantSettings();
      renderStats();
      saveCurrentTournamentRoundSnapshot();
      void saveGameState();
    });
  }

  document
    .querySelectorAll('input[name="equipmentDiscardMode"]')
    .forEach(input => {
      input.addEventListener("change", () => {
        if (input.checked) {
          gameConfig.equipmentDiscardMode =
            input.value === "computer"
              ? "computer"
              : "manual";

          saveCurrentTournamentRoundSnapshot();
          void saveGameState();
        }
      });
    });
}

function renderEquipmentDiscardPanel() {
  document
    .getElementById("equipmentDiscardPanel")
    ?.remove();

  const pending = participants.filter(
    participant => participant.pendingEquipmentLoss
  );

  const start =
    document.getElementById("startRoundBtn");

  if (start) {
    start.disabled =
      roundBusy || pending.length > 0;
  }

  if (!pending.length) {
    return;
  }

  const panel = element("div", undefined, "inherit-box");
  panel.id = "equipmentDiscardPanel";

  panel.style.cssText =
    "padding:16px;margin-top:16px;border:2px solid #b33;border-radius:10px";

  panel.appendChild(
    element(
      "h3",
      gameConfig.equipmentRule === "unlimited"
        ? "落敗者請至少拋棄一件衣物，可繼續逐件拋棄"
        : "請選擇落敗者需脫掉的衣物"
    )
  );

  panel.appendChild(
    element(
      "div",
      gameConfig.equipmentRule === "unlimited"
        ? "每次拋棄後可依目前順序繼續選擇；至少拋棄一件後，按「完成拋棄」才能開始下一把。"
        : "全部落敗者完成選擇後，才能開始下一把。",
      "small"
    )
  );

  pending.forEach(participant => {
    const box = element("div");
    box.style.marginTop = "14px";
    box.appendChild(element("strong", participant.name));

    if (gameConfig.equipmentRule === "unlimited") {
      box.appendChild(
        element(
          "div",
          `已拋棄 ${participant.pendingEquipmentDiscards || 0} 件；尚有 ${participant.equipment.length} 件衣物。`,
          "small"
        )
      );
    }

    const choices = element("div");

    choices.style.cssText =
      "display:flex;flex-wrap:wrap;gap:12px;margin:10px 0";

    const legal = legalEquipment(participant);

    participant.equipment.forEach(item => {
      const label = element("label");
      const input = element("input");

      input.type = "radio";
      input.name = "discard-" + participant.id;
      input.value = item;
      input.disabled = !legal.includes(item);

      if (input.disabled) {
        label.style.opacity = "0.45";

        label.title =
          "必須先拋棄：" +
          (EQUIPMENT_BLOCKERS[item] || [])
            .filter(
              value => participant.equipment.includes(value)
            )
            .join("、");
      }

      label.append(
        input,
        document.createTextNode(" " + item)
      );

      choices.appendChild(label);
    });

    box.appendChild(choices);

    const confirm = element("button", "請脫");
    confirm.type = "button";
    confirm.disabled = roundBusy;

    confirm.addEventListener("click", async () => {
      const selected =
        choices.querySelector("input:checked");

      if (!selected) {
        alert("請選擇一件目前可合法拋棄的衣物。");
        return;
      }

      const record =
        discardEquipment(participant, selected.value);

      if (!record) {
        alert("這件衣物目前不能拋棄。");
        return;
      }

      const history = roundHistory.findLast
        ? roundHistory.findLast(
            item => item.round === roundNumber
          )
        : [...roundHistory]
            .reverse()
            .find(item => item.round === roundNumber);

      if (history) {
        if (!Array.isArray(history.equipmentDiscards)) {
          history.equipmentDiscards = [];
        }

        history.equipmentDiscards.push(record);
      }

      appendEquipmentDiscardMessage(record);

      renderParticipantSettings();
      renderOperationPanel();
      renderStats();
      renderEquipmentDiscardPanel();

      saveCurrentTournamentRoundSnapshot();
      await saveGameState();
    });

    box.appendChild(confirm);

    if (gameConfig.equipmentRule === "unlimited") {
      const finish = element("button", "完成拋棄");
      finish.type = "button";
      finish.style.marginLeft = "8px";
      finish.disabled =
        roundBusy ||
        (participant.pendingEquipmentDiscards || 0) < 1;

      finish.addEventListener("click", async () => {
        if ((participant.pendingEquipmentDiscards || 0) < 1) {
          alert("無限規則至少要拋棄一件衣物，才能完成。");
          return;
        }

        participant.pendingEquipmentLoss = false;
        participant.pendingEquipmentDiscards = 0;

        renderParticipantSettings();
        renderOperationPanel();
        renderStats();
        renderEquipmentDiscardPanel();

        saveCurrentTournamentRoundSnapshot();
        await saveGameState();
      });

      box.appendChild(finish);
    }

    panel.appendChild(box);
  });

  // 衣物選擇與出拳結果放在同一區。
  resultPanel.classList.remove("hidden");
  resultList.appendChild(panel);
}

function appendEquipmentDiscardMessage(record) {
  resultPanel.classList.remove("hidden");

  resultList.appendChild(
    element(
      "div",
      `${record.participantName} 拋棄：${record.equipment}`,
      "small"
    )
  );
}

// ============================================================
// 共用統計表
// ============================================================

function renderStatsTable(
  items,
  isParticipant,
  withTeam = false
) {
  const table = element("table");
  const head = element("thead");

  const headings = [
    isParticipant ? "參賽者" : "隊伍"
  ];

  if (withTeam) headings.push("隊伍");

  headings.push("勝", "敗", "平", "實際勝率");

  if (isParticipant) {
    headings.push("衣物數量", "剩餘衣物");
  }

  headings.push("結果");

  const header = element("tr");

  headings.forEach(value => {
    header.appendChild(element("th", value));
  });

  head.appendChild(header);

  const body = element("tbody");

  items.forEach(item => {
    if (isParticipant) {
      ensureEquipment(item);
    }

    const row = element("tr");

    if (item.eliminated) {
      row.style.color = "red";
    }

    const cells = [item.name];

    if (withTeam) {
      cells.push(
        teams.find(team => team.id === item.teamId)?.name ||
        ""
      );
    }

    cells.push(
      item.wins,
      item.losses,
      item.ties,
      calculateActualWinRate(item)
    );

    if (isParticipant) {
      cells.push(
        `${item.equipment.length}/${item.initialEquipment.length}`,
        item.equipment.join("、") || "無"
      );
    }

    let status = getEliminationStatusText(item);

    if (isParticipant &&
      !item.equipment.length
    ) {
      status += "；全裸";
    } else if (
      isParticipant && item.pendingEquipmentLoss) {
      status += "；待拋棄衣物";
    }

    cells.push(status);

    cells.forEach(value => {
      row.appendChild(
        element("td", String(value ?? ""))
      );
    });

    body.appendChild(row);
  });

  table.append(head, body);
  statsList.appendChild(table);
}

// ============================================================
// 共用交叉推算：沿用 Final Beta 計算方式
// ============================================================

function generateCrossThrows(items, manual) {
  const throws = {};

  items
    .filter(item => item.controlled)
    .forEach(item => {
      throws[item.id] = manual[item.id];
    });

  const computers =
    items.filter(item => !item.controlled);

  if (!computers.length) {
    return throws;
  }

  if (items.length === 2) {
    const [first, second] = items;

    if (first.controlled) {
      throws[second.id] = computerFistAgainst(
        throws[first.id],
        second.winRate,
        50
      );
    } else if (second.controlled) {
      throws[first.id] = computerFistAgainst(
        throws[second.id],
        first.winRate,
        50
      );
    } else {
      throws[first.id] = randomFist();

      throws[second.id] = computerFistAgainst(
        throws[first.id],
        second.winRate,
        first.winRate
      );
    }

    return throws;
  }

  const reference =
    items.find(item => item.controlled) || items[0];

  if (!reference.controlled) {
    throws[reference.id] = randomFist();
  }

  const referenceRate = reference.controlled
    ? 50
    : normalizeConfiguredWinRate(reference.winRate);

  computers.forEach(item => {
    if (item.id !== reference.id) {
      throws[item.id] = computerFistAgainst(
        throws[reference.id],
        item.winRate,
        referenceRate
      );
    }
  });

  return throws;
}

// ============================================================
// 全域資料
// ============================================================

let participants = [];
let teams = [];

let gameConfig = {
  theme: "",
  saveResults: false,
  teamMode: false,
  teamEquipmentSolidarity: true,
  equipmentRule: "normal",
  eliminationMode: "none",
  lossLimit: 1,
  eliminationPenalty: ""
};

let playerThrows = {};
let teamRepresentatives = {};
let roundNumber = 0;
let roundHistory = [];
let saveDirectoryHandle = null;
let saveFileName = "";
let tournamentRoundNumber = 1;
let tournamentRounds = [];

// ============================================================
// HTML 元件
// ============================================================

const gameThemeInput =
  document.getElementById("gameTheme");

const saveResultsInput =
  document.getElementById("saveResults");

const playerCountInput =
  document.getElementById("playerCount");

const teamModeInput =
  document.getElementById("teamMode");

const teamSettings =
  document.getElementById("teamSettings");

const teamCountInput =
  document.getElementById("teamCount");

const teamEquipmentSolidarityInput =
  document.getElementById("teamEquipmentSolidarity");

const equipmentRuleInput =
  document.getElementById("equipmentRule");

const eliminationModeInput =
  document.getElementById("eliminationMode");

const lossLimitBox =
  document.getElementById("lossLimitBox");

const lossLimitInput =
  document.getElementById("lossLimit");

const penaltyBox =
  document.getElementById("penaltyBox");

const eliminationPenaltyInput =
  document.getElementById("eliminationPenalty");

const createGameBtn =
  document.getElementById("createGameBtn");

const participantSettingsPanel =
  document.getElementById("participantSettingsPanel");

const participantList =
  document.getElementById("participantList");

const teamControlPanel =
  document.getElementById("teamControlPanel");

const teamControlList =
  document.getElementById("teamControlList");

const operationPanel =
  document.getElementById("operationPanel");

const operationList =
  document.getElementById("operationList");

const resultPanel =
  document.getElementById("resultPanel");

const resultList =
  document.getElementById("resultList");

const statsPanel =
  document.getElementById("statsPanel");

const statsList =
  document.getElementById("statsList");

const roundManagementPanel =
  document.getElementById("roundManagementPanel");

const createNextRoundBtn =
  document.getElementById("createNextRoundBtn");

const roundTabs =
  document.getElementById("roundTabs");

const nextRoundSettingsPanel =
  document.getElementById("nextRoundSettingsPanel");

const nextRoundNameInput =
  document.getElementById("nextRoundName");

const newParticipantSettings =
  document.getElementById("newParticipantSettings");

const inheritParticipantSettings =
  document.getElementById("inheritParticipantSettings");

const sourceRoundList =
  document.getElementById("sourceRoundList");

const addSourceRoundBtn =
  document.getElementById("addSourceRoundBtn");

const inheritStatsInput =
  document.getElementById("inheritStats");

const nextPlayerCountInput =
  document.getElementById("nextPlayerCount");

const nextTeamModeInput =
  document.getElementById("nextTeamMode");

const nextTeamSettings =
  document.getElementById("nextTeamSettings");

const nextTeamCountInput =
  document.getElementById("nextTeamCount");

const nextTeamEquipmentSolidarityInput =
  document.getElementById("nextTeamEquipmentSolidarity");

const nextEquipmentRuleInput =
  document.getElementById("nextEquipmentRule");

const nextEliminationModeInput =
  document.getElementById("nextEliminationMode");

const nextLossLimitBox =
  document.getElementById("nextLossLimitBox");

const nextLossLimitInput =
  document.getElementById("nextLossLimit");

const nextPenaltyBox =
  document.getElementById("nextPenaltyBox");

const nextEliminationPenaltyInput =
  document.getElementById("nextEliminationPenalty");

const confirmNextRoundBtn =
  document.getElementById("confirmNextRoundBtn");

let storageControlPanel = null;
let storageStatus = null;
let chooseFolderBtn = null;
let importJsonBtn = null;
let importJsonInput = null;

// ============================================================
// 初始事件
// ============================================================

updateEliminationSettingsVisibility();
createStorageControls();

teamModeInput.addEventListener("change", function () {
  teamSettings.classList.toggle(
    "hidden",
    !teamModeInput.checked
  );

  if (participants.length > 0) {
    gameConfig.teamMode = teamModeInput.checked;

    renderParticipantSettings();
    renderTeamControls();
    renderOperationPanel();
    renderStats();
    saveCurrentTournamentRoundSnapshot();
    void saveGameState();
  }
});

eliminationModeInput.addEventListener(
  "change",
  updateEliminationSettingsVisibility
);

createGameBtn.addEventListener("click", function () {
  createGame();
});

if (createNextRoundBtn) {
  createNextRoundBtn.addEventListener(
    "click",
    openNextTournamentRoundSettings
  );
}

if (confirmNextRoundBtn) {
  confirmNextRoundBtn.addEventListener(
    "click",
    createNextTournamentRound
  );
}

if (addSourceRoundBtn) {
  addSourceRoundBtn.addEventListener("click", function () {
    addSourceRoundSelector();
  });
}

if (nextTeamModeInput) {
  nextTeamModeInput.addEventListener(
    "change",
    updateNextTeamSettingsVisibility
  );
}

if (teamEquipmentSolidarityInput) {
  teamEquipmentSolidarityInput.addEventListener(
    "change",
    function () {
      if (blockPendingEquipment()) {
        teamEquipmentSolidarityInput.checked =
          gameConfig.teamEquipmentSolidarity !== false;
        return;
      }

      gameConfig.teamEquipmentSolidarity =
        teamEquipmentSolidarityInput.checked;

      saveCurrentTournamentRoundSnapshot();
      void saveGameState();
    }
  );
}

if (equipmentRuleInput) {
  equipmentRuleInput.addEventListener(
    "change",
    function () {
      if (blockPendingEquipment()) {
        equipmentRuleInput.value =
          gameConfig.equipmentRule || "normal";
        return;
      }

      gameConfig.equipmentRule =
        equipmentRuleInput.value === "unlimited"
          ? "unlimited"
          : "normal";

      saveCurrentTournamentRoundSnapshot();
      void saveGameState();
    }
  );
}

if (nextEliminationModeInput) {
  nextEliminationModeInput.addEventListener(
    "change",
    updateNextEliminationSettingsVisibility
  );
}

document
  .querySelectorAll('input[name="participantSourceMode"]')
  .forEach(function (radio) {
    radio.addEventListener(
      "change",
      updateParticipantSourceMode
    );
  });

function updateEliminationSettingsVisibility() {
  const enabled =
    eliminationModeInput.value === "loss";

  if (lossLimitBox) {
    lossLimitBox.classList.toggle("hidden", !enabled);
  }

  if (penaltyBox) {
    penaltyBox.classList.toggle("hidden", !enabled);
  }
}

// ============================================================
// JSON 儲存與匯入控制
// ============================================================

function createStorageControls() {
  if (!saveResultsInput) return;

  storageControlPanel = document.createElement("div");
  storageControlPanel.style.marginTop = "10px";
  storageControlPanel.style.padding = "12px";
  storageControlPanel.style.border = "1px solid #ddd";
  storageControlPanel.style.borderRadius = "10px";

  chooseFolderBtn = document.createElement("button");
  chooseFolderBtn.type = "button";
  chooseFolderBtn.textContent = "選擇遊戲紀錄資料夾";

  chooseFolderBtn.addEventListener("click", function () {
    chooseSaveDirectory();
  });

  importJsonBtn = document.createElement("button");
  importJsonBtn.type = "button";
  importJsonBtn.textContent = "匯入 JSON 紀錄";
  importJsonBtn.style.marginLeft = "8px";

  importJsonInput = document.createElement("input");
  importJsonInput.type = "file";
  importJsonInput.accept = ".json,application/json";
  importJsonInput.style.display = "none";

  importJsonBtn.addEventListener("click", function () {
    importJsonInput.click();
  });

  importJsonInput.addEventListener("change", function (event) {
    importGameData(event);
  });

  storageStatus = document.createElement("div");
  storageStatus.className = "small";
  storageStatus.style.marginTop = "8px";
  storageStatus.textContent =
    "尚未選擇遊戲紀錄資料夾。";

  storageControlPanel.appendChild(chooseFolderBtn);
  storageControlPanel.appendChild(importJsonBtn);
  storageControlPanel.appendChild(importJsonInput);
  storageControlPanel.appendChild(storageStatus);

  const parent =
    saveResultsInput.closest(".setting-item");

  if (parent) {
    parent.appendChild(storageControlPanel);
  }
}

async function chooseSaveDirectory() {
  if (!window.showDirectoryPicker) {
    alert(
      "目前瀏覽器不支援直接將 JSON 儲存到指定資料夾。\n\n" +
      "請使用最新版 Google Chrome 或 Microsoft Edge。"
    );

    return false;
  }

  try {
    const handle = await window.showDirectoryPicker({
      mode: "readwrite"
    });

    saveDirectoryHandle = handle;

    if (storageStatus) {
      storageStatus.textContent =
        `目前儲存位置：${handle.name}`;

      storageStatus.style.color = "green";
    }

    if (gameConfig.saveResults) {
      await saveGameState();
    }

    return true;
  } catch (error) {
    if (error.name !== "AbortError") {
      console.error("選擇資料夾失敗：", error);
      alert("無法選擇資料夾。");
    }

    return false;
  }
}

// ============================================================
// 建立遊戲
// ============================================================

async function createGame() {
  if (blockPendingEquipment()) return;

  const playerCount =
    parseInt(playerCountInput.value, 10);

  if (
    Number.isNaN(playerCount) ||
    playerCount < 2 ||
    playerCount > 64
  ) {
    alert("參賽人數必須為 2～64 人。");
    return;
  }

  const useTeamMode = teamModeInput.checked;
  let teamCount = 0;

  if (useTeamMode) {
    teamCount = parseInt(teamCountInput.value, 10);

    if (
      Number.isNaN(teamCount) ||
      teamCount < 2 ||
      teamCount > 32
    ) {
      alert("隊伍數必須為 2～32 隊。");
      return;
    }

    if (teamCount > playerCount) {
      alert("隊伍數不能大於參賽人數。");
      return;
    }
  }

  let lossLimit =
    parseInt(lossLimitInput.value, 10);

  if (Number.isNaN(lossLimit) || lossLimit < 1) {
    lossLimit = 1;
  }

  gameConfig = {
    equipmentDiscardMode:
      document.querySelector(
        'input[name="equipmentDiscardMode"]:checked'
      )?.value || "manual",

    theme: gameThemeInput.value.trim(),
    saveResults: saveResultsInput.checked,
    teamMode: useTeamMode,
    teamEquipmentSolidarity:
      teamEquipmentSolidarityInput?.checked !== false,
    equipmentRule:
      equipmentRuleInput?.value === "unlimited"
        ? "unlimited"
        : "normal",
    eliminationMode: eliminationModeInput.value,
    lossLimit: lossLimit,
    eliminationPenalty:
      eliminationPenaltyInput.value.trim()
  };

  participants = [];

  for (let i = 0; i < playerCount; i++) {
    participants.push({
      id: i + 1,
      participantKey: createParticipantKey(),
      name: `參賽者 ${i + 1}`,
      avatar: "",
      teamId: null,
      controlled: false,
      winRate: 33,
      wins: 0,
      losses: 0,
      ties: 0,
      eliminated: false
    });
  }

  teams = [];

  if (useTeamMode) {
    for (let i = 0; i < teamCount; i++) {
      teams.push({
        id: i + 1,
        name: `第 ${i + 1} 隊`,
        controlled: false,
        wins: 0,
        losses: 0,
        ties: 0,
        eliminated: false
      });
    }

    participants.forEach(function (participant) {
      participant.teamId = teams[0].id;
    });
  }

  playerThrows = {};
  teamRepresentatives = {};
  roundNumber = 0;
  roundHistory = [];
  tournamentRoundNumber = 1;
  tournamentRounds = [];
  saveFileName = createJsonFileName();

  participantSettingsPanel.classList.remove("hidden");
  operationPanel.classList.remove("hidden");
  resultPanel.classList.add("hidden");
  statsPanel.classList.remove("hidden");

  if (useTeamMode) {
    teamControlPanel.classList.remove("hidden");
  } else {
    teamControlPanel.classList.add("hidden");
  }

  renderParticipantSettings();
  renderTeamControls();
  renderOperationPanel();
  renderStats();

  saveCurrentTournamentRoundSnapshot();
  renderTournamentRoundTabs();

  if (roundManagementPanel) {
    roundManagementPanel.classList.remove("hidden");
  }

  if (nextRoundSettingsPanel) {
    nextRoundSettingsPanel.classList.add("hidden");
  }

  resultList.innerHTML = "";

  if (gameConfig.saveResults) {
    if (!saveDirectoryHandle) {
      const selected = await chooseSaveDirectory();

      if (!selected) {
        alert(
          "未選擇遊戲紀錄資料夾，因此本次遊戲不會自動儲存 JSON。"
        );
      }
    } else {
      await saveGameState();
    }
  }

  alert("遊戲建立完成。");
}

// ============================================================
// 個別參賽者設定
// ============================================================

function renderParticipantSettings() {
  participantList.innerHTML = "";

  gameConfig.equipmentDiscardMode =
    gameConfig.equipmentDiscardMode === "computer"
      ? "computer"
      : "manual";

  document
    .querySelectorAll('input[name="equipmentDiscardMode"]')
    .forEach(input => {
      input.checked =
        input.value === gameConfig.equipmentDiscardMode;
    });

  const apply =
    document.getElementById("applyEquipmentToAllBtn");

  if (apply) {
    apply.disabled =
      roundNumber > 0 || hasPendingEquipment();
  }

  participants.forEach(participant => {
    ensureEquipment(participant);

    const card = element(
      "div",
      undefined,
      "participant-card" +
      (participant.eliminated ? " eliminated" : "")
    );

    const top =
      element("div", undefined, "participant-top");

    const avatar =
      element("img", undefined, "avatar");

    avatar.src =
      participant.avatar ||
      createDefaultAvatar(participant.name);

    avatar.alt = participant.name;

    const info =
      element("div", undefined, "participant-info");

    info.appendChild(
      element("div", participant.name, "participant-name")
    );

    info.appendChild(
      element(
        "div",
        participant.eliminated
          ? getEliminationStatusText(participant)
          : `勝 ${participant.wins}／敗 ${participant.losses}／平 ${participant.ties}`,
        "small"
      )
    );

    top.append(avatar, info);
    card.appendChild(top);

    const controls =
      element("div", undefined, "participant-controls");

    function field(title, input) {
      const label = element("label");

      label.append(
        document.createTextNode(title),
        element("br"),
        input
      );

      controls.appendChild(label);
    }

    const name = element("input");
    name.type = "text";
    name.value = participant.name;

    name.addEventListener("input", () => {
      participant.name = name.value;
    });

    name.addEventListener("change", () => {
      participant.name = name.value;

      renderParticipantSettings();
      renderOperationPanel();
      renderTeamControls();
      renderStats();
    });

    field("姓名", name);

    const controlled = element("input");
    controlled.type = "checkbox";
    controlled.checked = participant.controlled;

    controlled.addEventListener("change", () => {
      participant.controlled = controlled.checked;

      renderParticipantSettings();
      renderOperationPanel();
    });

    field("玩家控制", controlled);

    const rate = element("input");
    rate.type = "number";
    rate.min = "0";
    rate.max = "100";
    rate.step = "1";
    rate.value = participant.winRate;
    rate.disabled = participant.controlled;

    rate.addEventListener("change", () => {
      participant.winRate =
        normalizeConfiguredWinRate(rate.value);

      rate.value = participant.winRate;
    });

    field("電腦勝率（%）", rate);

    if (gameConfig.teamMode) {
      const select = element("select");

      teams.forEach(team => {
        const option = element("option", team.name);
        option.value = team.id;
        select.appendChild(option);
      });

      select.value = participant.teamId;

      select.addEventListener("change", () => {
        participant.teamId = Number(select.value);

        renderTeamControls();
        renderOperationPanel();
        renderStats();
      });

      field("隊伍", select);
    }

    const file = element("input");
    file.type = "file";
    file.accept = "image/*";

    file.addEventListener("change", () => {
      if (!file.files[0]) return;

      const reader = new FileReader();

      reader.onload = event => {
        participant.avatar = event.target.result;

        renderParticipantSettings();
        renderOperationPanel();
      };

      reader.readAsDataURL(file.files[0]);
    });

    field("頭像", file);

    card.appendChild(controls);
    renderEquipmentSettings(participant, card);
    participantList.appendChild(card);
  });
}

// ============================================================
// 分隊設定
// ============================================================

function renderTeamControls() {
  teamControlList.innerHTML = "";

  if (!gameConfig.teamMode) return;

  teams.forEach(function (team) {
    const card = document.createElement("div");
    card.className = "team-control";

    const header = document.createElement("div");
    header.className = "team-control-header";

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = team.name;

    nameInput.addEventListener("input", function () {
      team.name = nameInput.value;
    });

    nameInput.addEventListener("change", function () {
      team.name = nameInput.value;

      renderParticipantSettings();
      renderOperationPanel();
      renderStats();
    });

    header.appendChild(nameInput);

    const controlLabel =
      document.createElement("label");

    const checkbox =
      document.createElement("input");

    checkbox.type = "checkbox";
    checkbox.checked = team.controlled;

    checkbox.addEventListener("change", function () {
      team.controlled = checkbox.checked;

      renderTeamControls();
      renderOperationPanel();
    });

    controlLabel.appendChild(checkbox);

    controlLabel.appendChild(
      document.createTextNode(" 玩家控制")
    );

    header.appendChild(controlLabel);
    card.appendChild(header);

    const members = participants.filter(
      function (participant) {
        return participant.teamId === team.id;
      }
    );

    const memberList =
      document.createElement("div");

    memberList.className = "team-member-list";

    if (members.length === 0) {
      memberList.textContent = "尚無成員";
    } else {
      memberList.textContent =
        "成員：" +
        members.map(function (participant) {
          return participant.name;
        }).join("、");
    }

    card.appendChild(memberList);
    teamControlList.appendChild(card);
  });
}

// ============================================================
// 同一畫面：出拳操作、出拳結果、衣物選擇
// ============================================================

function renderOperationPanel() {
  participants.forEach(ensureEquipment);

  // 將原本的結果區嵌入操作區。
  if (resultPanel.parentElement !== operationPanel) {
    operationPanel.appendChild(resultPanel);
  }

  operationList.innerHTML = "";

  if (gameConfig.teamMode) {
    renderTeamOperation();
  } else {
    renderNormalOperation();
  }

  renderEquipmentDiscardPanel();
}

function renderNormalOperation() {
  const activeParticipants =
    participants.filter(function (participant) {
      return !participant.eliminated;
    });

  activeParticipants.forEach(function (participant) {
    const card = document.createElement("div");
    card.className = "operation-card";

    const header = document.createElement("div");
    header.className = "operation-header";

    const avatar = document.createElement("img");
    avatar.className = "operation-avatar";

    avatar.src =
      participant.avatar ||
      createDefaultAvatar(participant.name);

    avatar.alt = participant.name;

    const title = document.createElement("strong");
    title.textContent = participant.name;

    header.appendChild(avatar);
    header.appendChild(title);
    card.appendChild(header);

    if (participant.controlled) {
      const buttons = document.createElement("div");
      buttons.className = "throw-buttons";

      ["rock", "paper", "scissors"].forEach(
        function (fist) {
          const button = createThrowButton(
            fist,
            function () {
              playerThrows[participant.id] = fist;
              renderOperationPanel();
            }
          );

          if (playerThrows[participant.id] === fist) {
            button.style.outline = "3px solid #222";
          }

          buttons.appendChild(button);
        }
      );

      card.appendChild(buttons);
    } else {
      const computerText =
        document.createElement("div");

      computerText.className = "small";

      computerText.textContent =
        `電腦將依照勝率 ${participant.winRate}% 自動出拳`;

      card.appendChild(computerText);
    }

    operationList.appendChild(card);
  });

  addStartButton();
}

function renderTeamOperation() {
  const activeTeams = teams.filter(function (team) {
    return (
      !team.eliminated &&
      participants.some(function (participant) {
        return (
          participant.teamId === team.id &&
          !participant.eliminated
        );
      })
    );
  });

  activeTeams.forEach(function (team) {
    const card = document.createElement("div");
    card.className = "operation-card";

    const title = document.createElement("h3");
    title.textContent = team.name;
    card.appendChild(title);

    const members = participants.filter(
      function (participant) {
        return (
          participant.teamId === team.id &&
          !participant.eliminated
        );
      }
    );

    if (members.length === 0) {
      const text = document.createElement("div");
      text.className = "small";
      text.textContent = "此隊沒有可參賽成員。";

      card.appendChild(text);
      operationList.appendChild(card);
      return;
    }

    const representativeBox =
      document.createElement("div");

    representativeBox.className =
      "representative-select";

    const label = document.createElement("label");
    label.textContent = "本回合代表：";

    const select = document.createElement("select");

    members.forEach(function (member) {
      const option = document.createElement("option");
      option.value = member.id;
      option.textContent = member.name;
      select.appendChild(option);
    });

    let currentRepresentative =
      teamRepresentatives[`team-${team.id}`];

    if (
      !members.some(function (member) {
        return member.id === currentRepresentative;
      })
    ) {
      currentRepresentative = members[0].id;

      teamRepresentatives[`team-${team.id}`] =
        currentRepresentative;
    }

    select.value = currentRepresentative;

    select.addEventListener("change", function () {
      teamRepresentatives[`team-${team.id}`] =
        parseInt(select.value, 10);
    });

    label.appendChild(select);
    representativeBox.appendChild(label);
    card.appendChild(representativeBox);

    if (team.controlled) {
      const buttons = document.createElement("div");
      buttons.className = "throw-buttons";

      ["rock", "paper", "scissors"].forEach(
        function (fist) {
          const button = createThrowButton(
            fist,
            function () {
              playerThrows[`team-${team.id}`] = fist;
              renderOperationPanel();
            }
          );

          if (
            playerThrows[`team-${team.id}`] === fist
          ) {
            button.style.outline = "3px solid #222";
          }

          buttons.appendChild(button);
        }
      );

      card.appendChild(buttons);
    } else {
      const text = document.createElement("div");
      text.className = "small";

      text.textContent =
        "電腦將自動依照隊伍成員平均勝率出拳";

      card.appendChild(text);
    }

    operationList.appendChild(card);
  });

  addStartButton();
}

// ============================================================
// 開始出拳
// ============================================================

async function startRound() {
  if (roundBusy || hasPendingEquipment()) {
    alert("請先完成本回合的衣物拋棄。");
    return;
  }

  roundBusy = true;
  currentEquipmentDiscards = [];

  const button =
    document.getElementById("startRoundBtn");

  if (button) {
    button.disabled = true;
  }

  const reset =
    document.getElementById("resetCurrentRoundBtn");

  if (reset) {
    reset.disabled = true;
  }

  try {
    if (gameConfig.teamMode) {
      await startTeamRound();
    } else {
      await startNormalRound();
    }
  } finally {
    roundBusy = false;
    renderEquipmentDiscardPanel();

    const start =
      document.getElementById("startRoundBtn");

    if (start) {
      start.disabled = hasPendingEquipment();
    }

    const reset =
      document.getElementById("resetCurrentRoundBtn");

    if (reset) {
      reset.disabled = false;
    }
  }
}

async function startNormalRound() {
  const activeParticipants =
    participants.filter(function (participant) {
      return !participant.eliminated;
    });

  if (activeParticipants.length < 2) {
    alert("剩餘參賽者不足 2 人。");
    return;
  }

  for (const participant of activeParticipants) {
    if (
      participant.controlled &&
      !playerThrows[participant.id]
    ) {
      alert(`${participant.name} 尚未選擇出拳。`);
      return;
    }
  }

  roundNumber++;

  const throws =
    generateNormalThrows(activeParticipants);

  const results = calculateNormalResults(
    activeParticipants,
    throws
  );

  const newlyEliminated =
    applyNormalResults(results);

  renderNormalResults(
    activeParticipants,
    throws,
    results,
    newlyEliminated
  );

  playerThrows = {};

  renderParticipantSettings();
  renderOperationPanel();
  renderStats();

  await saveRoundToHistory({
    mode: "normal",
    round: roundNumber,
    throws: copyObject(throws),
    results: copyObject(results),

    eliminated: newlyEliminated.map(
      function (participant) {
        return participant.id;
      }
    )
  });

  currentEquipmentDiscards.forEach(
    appendEquipmentDiscardMessage
  );

  checkGameEnd();
}

function generateNormalThrows(activeParticipants) {
  return generateCrossThrows(
    activeParticipants,
    playerThrows
  );
}

function generateTwoPlayerThrows(
  activeParticipants,
  throws
) {
  Object.assign(
    throws,
    generateCrossThrows(activeParticipants, playerThrows)
  );
}

function computerFistAgainst(
  opponentFist,
  selfRate,
  opponentRate = 50
) {
  const outcome = getCrossDesiredOutcome(
    selfRate,
    opponentRate
  );

  return fistForOutcome(opponentFist, outcome);
}

function fistForOutcome(opponentFist, outcome) {
  if (outcome === "tie") {
    return opponentFist;
  }

  if (outcome === "win") {
    if (opponentFist === "rock") return "paper";
    if (opponentFist === "paper") return "scissors";
    return "rock";
  }

  if (opponentFist === "rock") return "scissors";
  if (opponentFist === "paper") return "rock";

  return "paper";
}

// ============================================================
// 個人勝負判定
// ============================================================

function calculateNormalResults(
  activeParticipants,
  throws
) {
  const fistTypes = new Set(
    activeParticipants.map(function (participant) {
      return throws[participant.id];
    })
  );

  const results = {};

  if (
    fistTypes.size === 1 ||
    fistTypes.size === 3
  ) {
    activeParticipants.forEach(function (participant) {
      results[participant.id] = "tie";
    });

    return results;
  }

  const fists = Array.from(fistTypes);
  let winningFist = "";

  if (
    fists.includes("rock") &&
    fists.includes("scissors")
  ) {
    winningFist = "rock";
  } else if (
    fists.includes("scissors") &&
    fists.includes("paper")
  ) {
    winningFist = "scissors";
  } else {
    winningFist = "paper";
  }

  activeParticipants.forEach(function (participant) {
    results[participant.id] =
      throws[participant.id] === winningFist
        ? "win"
        : "loss";
  });

  return results;
}

function applyNormalResults(results) {
  const newlyEliminated = [];

  participants.forEach(function (participant) {
    if (participant.eliminated) return;

    const result = results[participant.id];

    if (!result) return;

    if (result === "win") {
      participant.wins++;
    } else if (result === "loss") {
      participant.losses++;
      handleEquipmentLoss(participant);
    } else {
      participant.ties++;
    }

    if (
      !gameConfig.teamMode &&
      gameConfig.eliminationMode === "loss" &&
      !participant.eliminated &&
      participant.losses >= gameConfig.lossLimit
    ) {
      participant.eliminated = true;
      newlyEliminated.push(participant);
    }
  });

  return newlyEliminated;
}

function renderNormalResults(
  activeParticipants,
  throws,
  results,
  newlyEliminated
) {
  resultPanel.classList.remove("hidden");
  resultList.innerHTML = "";

  const roundTitle = document.createElement("h3");
  roundTitle.textContent = `第 ${roundNumber} 次出拳`;
  resultList.appendChild(roundTitle);

  activeParticipants.forEach(function (participant) {
    const result = results[participant.id];

    const card = document.createElement("div");

    card.className =
      "result-card " +
      (
        result === "win"
          ? "result-win"
          : result === "loss"
            ? "result-loss"
            : "result-tie"
      );

    const avatar = document.createElement("img");
    avatar.className = "operation-avatar";

    avatar.src =
      participant.avatar ||
      createDefaultAvatar(participant.name);

    avatar.alt = participant.name;

    const fist = document.createElement("div");
    fist.className = "result-fist";
    fist.textContent = fistEmoji(throws[participant.id]);

    const info = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = participant.name;

    const status = document.createElement("div");

    status.className =
      result === "win"
        ? "status-win"
        : result === "loss"
          ? "status-loss"
          : "status-tie";

    status.textContent =
      result === "win"
        ? "勝"
        : result === "loss"
          ? "敗"
          : "平手";

    info.appendChild(name);
    info.appendChild(status);

    card.appendChild(avatar);
    card.appendChild(fist);
    card.appendChild(info);

    resultList.appendChild(card);
  });

  if (newlyEliminated.length > 0) {
    const eliminatedBox =
      document.createElement("div");

    eliminatedBox.className = "danger";
    eliminatedBox.style.marginTop = "15px";

    eliminatedBox.textContent =
      "本次淘汰：" +
      newlyEliminated.map(function (participant) {
        return participant.name;
      }).join("、");

    resultList.appendChild(eliminatedBox);

    if (gameConfig.eliminationPenalty) {
      const penalty = document.createElement("div");
      penalty.style.marginTop = "8px";

      penalty.textContent =
        `加碼處罰：${gameConfig.eliminationPenalty}`;

      resultList.appendChild(penalty);
    }
  }
}

// ============================================================
// 隊伍出拳與勝負判定
// ============================================================

async function startTeamRound() {
  const activeTeams = teams.filter(team => {
    return (
      !team.eliminated &&
      participants.some(participant => {
        return (
          participant.teamId === team.id &&
          !participant.eliminated
        );
      })
    );
  });

  if (activeTeams.length < 2) {
    alert("剩餘隊伍不足 2 隊。");
    return;
  }

  const manual = {};

  for (const team of activeTeams) {
    const representative =
      teamRepresentatives[`team-${team.id}`];

    if (
      !participants.some(participant => {
        return (
          participant.id === representative &&
          participant.teamId === team.id &&
          !participant.eliminated
        );
      })
    ) {
      alert(`${team.name} 尚未選擇本回合代表。`);
      return;
    }

    manual[team.id] =
      playerThrows[`team-${team.id}`];

    if (team.controlled && !manual[team.id]) {
      alert(`${team.name} 尚未選擇出拳。`);
      return;
    }
  }

  roundNumber++;

  const throws = generateCrossThrows(
    activeTeams.map(team => ({
      ...team,
      winRate: getTeamAverageWinRate(team)
    })),
    manual
  );

  const results =
    calculateTeamResults(activeTeams, throws);

  const eliminationResult =
    applyTeamResults(activeTeams, results);

  renderTeamResults(
    activeTeams,
    throws,
    results,
    eliminationResult
  );

  playerThrows = {};

  renderParticipantSettings();
  renderTeamControls();
  renderOperationPanel();
  renderStats();

  await saveRoundToHistory({
    mode: "team",
    round: roundNumber,
    throws: copyObject(throws),
    results: copyObject(results),

    representatives:
      copyObject(teamRepresentatives),

    eliminatedTeams:
      eliminationResult.eliminatedTeams.map(
        team => team.id
      ),

    eliminatedParticipants:
      eliminationResult.eliminatedParticipants.map(
        participant => participant.id
      )
  });

  currentEquipmentDiscards.forEach(
    appendEquipmentDiscardMessage
  );

  checkGameEnd();
}

function calculateTeamResults(activeTeams, throws) {
  const fistTypes = new Set(
    activeTeams.map(function (team) {
      return throws[team.id];
    })
  );

  const results = {};

  if (
    fistTypes.size === 1 ||
    fistTypes.size === 3
  ) {
    activeTeams.forEach(function (team) {
      results[team.id] = "tie";
    });

    return results;
  }

  const fists = Array.from(fistTypes);
  let winningFist = "";

  if (
    fists.includes("rock") &&
    fists.includes("scissors")
  ) {
    winningFist = "rock";
  } else if (
    fists.includes("scissors") &&
    fists.includes("paper")
  ) {
    winningFist = "scissors";
  } else {
    winningFist = "paper";
  }

  activeTeams.forEach(function (team) {
    results[team.id] =
      throws[team.id] === winningFist
        ? "win"
        : "loss";
  });

  return results;
}

function applyTeamResults(activeTeams, results) {
  const eliminatedTeams = [];
  const eliminatedParticipants = [];

  activeTeams.forEach(function (team) {
    const result = results[team.id];

    if (result === "win") {
      team.wins++;
    } else if (result === "loss") {
      team.losses++;
    } else {
      team.ties++;
    }

    const representativeId =
      teamRepresentatives[`team-${team.id}`];

    const representative = participants.find(
      function (participant) {
        return participant.id === representativeId;
      }
    );

    if (
      representative &&
      !representative.eliminated
    ) {
      if (result === "win") {
        representative.wins++;
      } else if (result === "loss") {
        representative.losses++;

        if (gameConfig.teamEquipmentSolidarity !== false) {
          participants
            .filter(participant => participant.teamId === team.id)
            .forEach(handleEquipmentLoss);
        } else {
          handleEquipmentLoss(representative);
        }
      } else {
        representative.ties++;
      }
    }

    if (
      gameConfig.teamMode &&
      gameConfig.eliminationMode === "loss" &&
      !team.eliminated &&
      team.losses >= gameConfig.lossLimit
    ) {
      team.eliminated = true;
      eliminatedTeams.push(team);

      participants.forEach(function (participant) {
        if (
          participant.teamId === team.id &&
          !participant.eliminated
        ) {
          participant.eliminated = true;
          eliminatedParticipants.push(participant);
        }
      });
    }
  });

  return {
    eliminatedTeams: eliminatedTeams,
    eliminatedParticipants: eliminatedParticipants
  };
}

function renderTeamResults(
  activeTeams,
  throws,
  results,
  eliminationResult
) {
  resultPanel.classList.remove("hidden");
  resultList.innerHTML = "";

  const roundTitle = document.createElement("h3");
  roundTitle.textContent = `第 ${roundNumber} 次出拳`;
  resultList.appendChild(roundTitle);

  activeTeams.forEach(function (team) {
    const result = results[team.id];

    const representativeId =
      teamRepresentatives[`team-${team.id}`];

    const representative = participants.find(
      function (participant) {
        return participant.id === representativeId;
      }
    );

    const card = document.createElement("div");

    card.className =
      "result-card " +
      (
        result === "win"
          ? "result-win"
          : result === "loss"
            ? "result-loss"
            : "result-tie"
      );

    const fist = document.createElement("div");
    fist.className = "result-fist";
    fist.textContent = fistEmoji(throws[team.id]);

    const info = document.createElement("div");
    const title = document.createElement("strong");

    title.textContent = representative
      ? `${team.name}｜${representative.name}`
      : team.name;

    const status = document.createElement("div");

    status.className =
      result === "win"
        ? "status-win"
        : result === "loss"
          ? "status-loss"
          : "status-tie";

    status.textContent =
      result === "win"
        ? "勝"
        : result === "loss"
          ? "敗"
          : "平手";

    info.appendChild(title);
    info.appendChild(status);

    card.appendChild(fist);
    card.appendChild(info);
    resultList.appendChild(card);
  });

  if (eliminationResult.eliminatedTeams.length > 0) {
    const eliminatedBox =
      document.createElement("div");

    eliminatedBox.className = "danger";
    eliminatedBox.style.marginTop = "15px";

    eliminatedBox.textContent =
      "本次淘汰隊伍：" +
      eliminationResult.eliminatedTeams.map(
        function (team) {
          return team.name;
        }
      ).join("、");

    resultList.appendChild(eliminatedBox);

    if (gameConfig.eliminationPenalty) {
      const penalty = document.createElement("div");
      penalty.style.marginTop = "8px";

      penalty.textContent =
        `加碼處罰：${gameConfig.eliminationPenalty}`;

      resultList.appendChild(penalty);
    }
  }
}

// ============================================================
// 統計
// ============================================================

function renderStats() {
  statsList.innerHTML = "";

  if (gameConfig.teamMode) {
    renderTeamStats();
  } else {
    renderParticipantStats();
  }
}

function renderParticipantStats() {
  renderStatsTable(participants, true);
}

function renderTeamStats() {
  renderStatsTable(teams, false);

  const title = element("h3", "個人統計");
  title.style.marginTop = "25px";

  statsList.appendChild(title);
  renderStatsTable(participants, true, true);
}

function calculateActualWinRate(item) {
  const wins = Number(item.wins || 0);
  const losses = Number(item.losses || 0);
  const total = wins + losses;

  if (total === 0) {
    return "0.0%";
  }

  return (wins / total * 100).toFixed(1) + "%";
}

// ============================================================
// 儲存 JSON
// ============================================================

async function saveGameState() {
  if (!gameConfig.saveResults) return;
  if (!saveDirectoryHandle) return;

  try {
    saveCurrentTournamentRoundSnapshot();

    const data = {
      version: "gamma",
      savedAt: new Date().toISOString(),
      gameConfig: copyObject(gameConfig),
      participants: copyObject(participants),
      teams: copyObject(teams),
      roundNumber: roundNumber,
      roundHistory: copyObject(roundHistory),
      tournamentRoundNumber: tournamentRoundNumber,
      tournamentRounds: copyObject(tournamentRounds)
    };

    if (!saveFileName) {
      saveFileName = createJsonFileName();
    }

    const filename = saveFileName;

    const fileHandle =
      await saveDirectoryHandle.getFileHandle(
        filename,
        { create: true }
      );

    const writable =
      await fileHandle.createWritable();

    await writable.write(
      JSON.stringify(data, null, 2)
    );

    await writable.close();

    if (storageStatus) {
      storageStatus.textContent =
        `已儲存：${filename}`;

      storageStatus.style.color = "green";
    }
  } catch (error) {
    console.error("儲存 JSON 失敗：", error);

    if (storageStatus) {
      storageStatus.textContent = "JSON 儲存失敗。";
      storageStatus.style.color = "red";
    }
  }
}

async function saveRoundToHistory(roundData) {
  const eliminatedIds = [];

  if (Array.isArray(roundData.eliminated)) {
    eliminatedIds.push(...roundData.eliminated);
  }

  if (Array.isArray(roundData.eliminatedTeams)) {
    eliminatedIds.push(...roundData.eliminatedTeams);
  }

  if (Array.isArray(roundData.eliminatedParticipants)) {
    eliminatedIds.push(...roundData.eliminatedParticipants);
  }

  roundHistory.push({
    ...roundData,

    equipmentDiscards:
      copyObject(currentEquipmentDiscards),

    timestamp: new Date().toISOString(),

    penalty:
      eliminatedIds.length > 0
        ? gameConfig.eliminationPenalty
        : "",

    eliminationPenalty:
      gameConfig.eliminationPenalty
  });

  saveCurrentTournamentRoundSnapshot();
  await saveGameState();
}

function createJsonFileName() {
  const now = new Date();
  const year = now.getFullYear();

  const month =
    String(now.getMonth() + 1).padStart(2, "0");

  const day =
    String(now.getDate()).padStart(2, "0");

  const hours =
    String(now.getHours()).padStart(2, "0");

  const minutes =
    String(now.getMinutes()).padStart(2, "0");

  const seconds =
    String(now.getSeconds()).padStart(2, "0");

  const milliseconds =
    String(now.getMilliseconds()).padStart(3, "0");

  return (
    `rps_${year}-${month}-${day}_` +
    `${hours}-${minutes}-${seconds}-` +
    `${milliseconds}.json`
  );
}

// ============================================================
// 匯入 JSON：兼容 Beta 舊紀錄
// ============================================================

function importGameData(event) {
  if (blockPendingEquipment()) {
    event.target.value = "";
    return;
  }

  const file = event.target.files[0];

  if (!file) return;

  const reader = new FileReader();

  reader.onload = function (e) {
    try {
      const data = JSON.parse(e.target.result);

      if (
        !data.gameConfig ||
        !Array.isArray(data.participants)
      ) {
        alert("這不是有效的剪刀石頭布遊戲紀錄。");
        return;
      }

      saveFileName =
        file.name && file.name.toLowerCase().endsWith(".json")
          ? file.name.replace(/[\\/:*?"<>|]/g, "_")
          : createJsonFileName();

      gameConfig = data.gameConfig;

      gameConfig.teamEquipmentSolidarity =
        gameConfig.teamEquipmentSolidarity !== false;

      gameConfig.equipmentRule =
        gameConfig.equipmentRule === "unlimited"
          ? "unlimited"
          : "normal";

      if (
        gameConfig.eliminationMode === "participant" ||
        gameConfig.eliminationMode === "team"
      ) {
        gameConfig.eliminationMode = "loss";
      }

      if (gameConfig.eliminationMode !== "loss") {
        gameConfig.eliminationMode = "none";
      }

      let importedLossLimit =
        parseInt(gameConfig.lossLimit, 10);

      if (
        Number.isNaN(importedLossLimit) ||
        importedLossLimit < 1
      ) {
        importedLossLimit = 1;
      }

      gameConfig.lossLimit = importedLossLimit;

      if (
        typeof gameConfig.eliminationPenalty !== "string"
      ) {
        gameConfig.eliminationPenalty = "";
      }

      participants = data.participants;

      teams = Array.isArray(data.teams)
        ? data.teams
        : [];

      roundNumber = Number(data.roundNumber) || 0;

      roundHistory = Array.isArray(data.roundHistory)
        ? data.roundHistory
        : [];

      participants.forEach(function (participant, index) {
        if (participant.id == null) {
          participant.id = index + 1;
        }

        if (!participant.participantKey) {
          participant.participantKey =
            createParticipantKey();
        }

        if (typeof participant.name !== "string") {
          participant.name = `參賽者 ${index + 1}`;
        }

        if (typeof participant.avatar !== "string") {
          participant.avatar = "";
        }

        participant.controlled =
          !!participant.controlled;

        let winRate =
          parseInt(participant.winRate, 10);

        if (Number.isNaN(winRate)) {
          winRate = 33;
        }

        participant.winRate =
          Math.max(0, Math.min(100, winRate));

        participant.wins =
          Number(participant.wins) || 0;

        participant.losses =
          Number(participant.losses) || 0;

        participant.ties =
          Number(participant.ties) || 0;

        participant.eliminated =
          !!participant.eliminated;

        if (participant.teamId == null) {
          participant.teamId = null;
        }
      });

      teams.forEach(function (team, index) {
        if (team.id == null) {
          team.id = index + 1;
        }

        if (typeof team.name !== "string") {
          team.name = `第 ${index + 1} 隊`;
        }

        team.controlled = !!team.controlled;
        team.wins = Number(team.wins) || 0;
        team.losses = Number(team.losses) || 0;
        team.ties = Number(team.ties) || 0;
        team.eliminated = !!team.eliminated;
      });

      playerThrows = {};
      teamRepresentatives = {};

      if (
        Array.isArray(data.tournamentRounds) &&
        data.tournamentRounds.length > 0
      ) {
        tournamentRounds =
          copyObject(data.tournamentRounds);

        tournamentRoundNumber =
          Number(data.tournamentRoundNumber) || 1;

        tournamentRounds.forEach(function (roundItem) {
          if (
            typeof roundItem.tournamentRoundName !== "string"
          ) {
            roundItem.tournamentRoundName = "";
          }

          if (!Array.isArray(roundItem.participants)) {
            roundItem.participants = [];
          }

          roundItem.participants.forEach(
            function (participant, index) {
              if (participant.id == null) {
                participant.id = index + 1;
              }

              if (!participant.participantKey) {
                const currentMatch = participants.find(
                  function (currentParticipant) {
                    return (
                      Number(currentParticipant.id) ===
                      Number(participant.id) &&
                      currentParticipant.name ===
                      participant.name
                    );
                  }
                );

                participant.participantKey =
                  currentMatch && currentMatch.participantKey
                    ? currentMatch.participantKey
                    : createParticipantKey();
              }
            }
          );
        });
      } else {
        tournamentRoundNumber = 1;
        tournamentRounds = [];
        saveCurrentTournamentRoundSnapshot();
      }

      gameThemeInput.value =
        gameConfig.theme || "";

      saveResultsInput.checked =
        !!gameConfig.saveResults;

      if (teamEquipmentSolidarityInput) {
        teamEquipmentSolidarityInput.checked =
          gameConfig.teamEquipmentSolidarity;
      }

      if (equipmentRuleInput) {
        equipmentRuleInput.value =
          gameConfig.equipmentRule;
      }

      playerCountInput.value =
        participants.length;

      teamModeInput.checked =
        !!gameConfig.teamMode;

      teamSettings.classList.toggle(
        "hidden",
        !gameConfig.teamMode
      );

      if (gameConfig.teamMode && teams.length > 0) {
        teamCountInput.value = teams.length;
      }

      eliminationModeInput.value =
        gameConfig.eliminationMode;

      lossLimitInput.value =
        gameConfig.lossLimit;

      eliminationPenaltyInput.value =
        gameConfig.eliminationPenalty;

      updateEliminationSettingsVisibility();

      participantSettingsPanel.classList.remove("hidden");
      operationPanel.classList.remove("hidden");
      statsPanel.classList.remove("hidden");

      if (gameConfig.teamMode) {
        teamControlPanel.classList.remove("hidden");
      } else {
        teamControlPanel.classList.add("hidden");
      }

      resultPanel.classList.add("hidden");
      resultList.innerHTML = "";

      if (roundManagementPanel) {
        roundManagementPanel.classList.remove("hidden");
      }

      if (nextRoundSettingsPanel) {
        nextRoundSettingsPanel.classList.add("hidden");
      }

      renderParticipantSettings();
      renderTeamControls();
      renderOperationPanel();
      renderStats();
      renderTournamentRoundTabs();

      alert("遊戲紀錄匯入完成。");
    } catch (error) {
      console.error("匯入 JSON 失敗：", error);
      alert("JSON 檔案格式錯誤，無法匯入。");
    } finally {
      event.target.value = "";
    }
  };

  reader.readAsText(file);
}

// ============================================================
// 賽事回合設定
// ============================================================

const currentRoundNameInput =
  document.getElementById("currentRoundName");

const saveCurrentRoundNameBtn =
  document.getElementById("saveCurrentRoundNameBtn");

if (saveCurrentRoundNameBtn) {
  saveCurrentRoundNameBtn.addEventListener(
    "click",
    function () {
      saveCurrentTournamentRoundName();
    }
  );
}

function createParticipantKey() {
  if (
    window.crypto &&
    typeof window.crypto.randomUUID === "function"
  ) {
    return window.crypto.randomUUID();
  }

  return (
    "participant-" +
    Date.now().toString(36) + "-" +
    Math.random().toString(36).slice(2) + "-" +
    Math.random().toString(36).slice(2)
  );
}

function ensureParticipantKeys(participantArray) {
  if (!Array.isArray(participantArray)) return;

  participantArray.forEach(function (participant) {
    if (!participant.participantKey) {
      participant.participantKey =
        createParticipantKey();
    }
  });
}

function getCurrentTournamentRound() {
  return tournamentRounds.find(function (item) {
    return (
      item.tournamentRoundNumber ===
      tournamentRoundNumber
    );
  });
}

function getTournamentRoundDisplayName(item) {
  if (!item) return "";

  const name =
    typeof item.tournamentRoundName === "string"
      ? item.tournamentRoundName.trim()
      : "";

  if (name) return name;

  const number =
    Number(item.tournamentRoundNumber) || 1;

  return `回合 ${number}`;
}

function updateCurrentRoundNameInput() {
  if (!currentRoundNameInput) return;

  const currentRound =
    getCurrentTournamentRound();

  if (!currentRound) {
    currentRoundNameInput.value = "";
    return;
  }

  currentRoundNameInput.value =
    typeof currentRound.tournamentRoundName === "string"
      ? currentRound.tournamentRoundName
      : "";
}

async function saveCurrentTournamentRoundName() {
  const currentRound =
    getCurrentTournamentRound();

  if (!currentRound) {
    alert("目前沒有可命名的回合。");
    return;
  }

  const newName = currentRoundNameInput
    ? currentRoundNameInput.value.trim()
    : "";

  currentRound.tournamentRoundName = newName;

  saveCurrentTournamentRoundSnapshot();
  renderTournamentRoundTabs();
  updateCurrentRoundNameInput();

  if (gameConfig.saveResults) {
    await saveGameState();
  }

  if (newName) {
    alert(`回合名稱已改為「${newName}」。`);
  } else {
    alert(
      "已清除自訂名稱，將暫時顯示系統回合名稱。"
    );
  }
}

function saveCurrentTournamentRoundSnapshot() {
  if (participants.length === 0) return;

  ensureParticipantKeys(participants);

  const oldSnapshot =
    getCurrentTournamentRound();

  const currentRoundName =
    oldSnapshot &&
    typeof oldSnapshot.tournamentRoundName === "string"
      ? oldSnapshot.tournamentRoundName
      : "";

  const snapshot = {
    tournamentRoundNumber: tournamentRoundNumber,
    tournamentRoundName: currentRoundName,
    gameConfig: copyObject(gameConfig),
    participants: copyObject(participants),
    teams: copyObject(teams),
    roundNumber: roundNumber,
    roundHistory: copyObject(roundHistory)
  };

  const index = tournamentRounds.findIndex(
    function (item) {
      return (
        item.tournamentRoundNumber ===
        tournamentRoundNumber
      );
    }
  );

  if (index >= 0) {
    tournamentRounds[index] = snapshot;
  } else {
    tournamentRounds.push(snapshot);

    tournamentRounds.sort(function (a, b) {
      return (
        a.tournamentRoundNumber -
        b.tournamentRoundNumber
      );
    });
  }

  updateCurrentRoundNameInput();
}

function renderTournamentRoundTabs() {
  if (!roundTabs) return;

  roundTabs.innerHTML = "";

  tournamentRounds.forEach(function (item) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "round-tab";

    if (
      item.tournamentRoundNumber ===
      tournamentRoundNumber
    ) {
      button.classList.add("active");
    }

    button.textContent =
      getTournamentRoundDisplayName(item);

    button.addEventListener("click", function () {
      switchTournamentRound(
        item.tournamentRoundNumber
      );
    });

    roundTabs.appendChild(button);
  });

  updateCurrentRoundNameInput();
}

function switchTournamentRound(targetRoundNumber) {
  if (blockPendingEquipment()) return;

  if (targetRoundNumber === tournamentRoundNumber) {
    updateCurrentRoundNameInput();
    return;
  }

  saveCurrentTournamentRoundSnapshot();

  const target = tournamentRounds.find(
    function (item) {
      return (
        item.tournamentRoundNumber ===
        targetRoundNumber
      );
    }
  );

  if (!target) return;

  tournamentRoundNumber =
    target.tournamentRoundNumber;

  gameConfig = copyObject(target.gameConfig);

  gameConfig.teamEquipmentSolidarity =
    gameConfig.teamEquipmentSolidarity !== false;

  gameConfig.equipmentRule =
    gameConfig.equipmentRule === "unlimited"
      ? "unlimited"
      : "normal";

  participants = copyObject(target.participants);

  ensureParticipantKeys(participants);

  teams = copyObject(target.teams);
  roundNumber = Number(target.roundNumber) || 0;

  roundHistory =
    Array.isArray(target.roundHistory)
      ? copyObject(target.roundHistory)
      : [];

  playerThrows = {};
  teamRepresentatives = {};

  syncTournamentRoundToInterface();

  resultPanel.classList.add("hidden");
  resultList.innerHTML = "";

  renderParticipantSettings();
  renderTeamControls();
  renderOperationPanel();
  renderStats();
  renderTournamentRoundTabs();
  updateCurrentRoundNameInput();

  if (nextRoundSettingsPanel) {
    nextRoundSettingsPanel.classList.add("hidden");
  }
}

function syncTournamentRoundToInterface() {
  gameThemeInput.value =
    gameConfig.theme || "";

  saveResultsInput.checked =
    !!gameConfig.saveResults;

  if (teamEquipmentSolidarityInput) {
    teamEquipmentSolidarityInput.checked =
      gameConfig.teamEquipmentSolidarity !== false;
  }

  if (equipmentRuleInput) {
    equipmentRuleInput.value =
      gameConfig.equipmentRule === "unlimited"
        ? "unlimited"
        : "normal";
  }

  playerCountInput.value =
    participants.length;

  teamModeInput.checked =
    !!gameConfig.teamMode;

  teamSettings.classList.toggle(
    "hidden",
    !gameConfig.teamMode
  );

  if (gameConfig.teamMode && teams.length > 0) {
    teamCountInput.value = teams.length;
  }

  eliminationModeInput.value =
    gameConfig.eliminationMode || "none";

  lossLimitInput.value =
    gameConfig.lossLimit || 1;

  eliminationPenaltyInput.value =
    gameConfig.eliminationPenalty || "";

  updateEliminationSettingsVisibility();

  participantSettingsPanel.classList.remove("hidden");
  operationPanel.classList.remove("hidden");
  statsPanel.classList.remove("hidden");

  if (gameConfig.teamMode) {
    teamControlPanel.classList.remove("hidden");
  } else {
    teamControlPanel.classList.add("hidden");
  }

  updateCurrentRoundNameInput();
}

// ============================================================
// 新回合參賽者來源設定
// ============================================================

function updateParticipantSourceMode() {
  const selected = document.querySelector(
    'input[name="participantSourceMode"]:checked'
  );

  const mode = selected ? selected.value : "new";

  if (newParticipantSettings) {
    newParticipantSettings.classList.toggle(
      "hidden",
      mode !== "new"
    );
  }

  if (inheritParticipantSettings) {
    inheritParticipantSettings.classList.toggle(
      "hidden",
      mode !== "inherit"
    );
  }
}

function addSourceRoundSelector(
  defaultRoundNumber = null
) {
  if (!sourceRoundList) return;

  const row = document.createElement("div");
  row.className = "source-round-row";
  row.style.marginBottom = "16px";
  row.style.padding = "12px";
  row.style.border = "1px solid #ddd";
  row.style.borderRadius = "8px";

  const top = document.createElement("div");

  const label = document.createElement("span");
  label.textContent = "來源回合：";
  label.style.marginRight = "8px";

  const select = document.createElement("select");
  select.className = "source-round-select";

  tournamentRounds.forEach(function (item) {
    const option = document.createElement("option");

    option.value =
      item.tournamentRoundNumber;

    option.textContent =
      getTournamentRoundDisplayName(item);

    select.appendChild(option);
  });

  if (
    defaultRoundNumber !== null &&
    tournamentRounds.some(function (item) {
      return (
        item.tournamentRoundNumber ===
        Number(defaultRoundNumber)
      );
    })
  ) {
    select.value = String(defaultRoundNumber);
  }

  const removeButton =
    document.createElement("button");

  removeButton.type = "button";
  removeButton.textContent = "移除此來源";
  removeButton.style.marginLeft = "8px";

  removeButton.addEventListener("click", function () {
    row.remove();
  });

  top.appendChild(label);
  top.appendChild(select);
  top.appendChild(removeButton);
  row.appendChild(top);

  const participantBox =
    document.createElement("div");

  participantBox.className =
    "source-participant-list";

  participantBox.style.marginTop = "10px";

  row.appendChild(participantBox);

  function renderSourceParticipants() {
    participantBox.innerHTML = "";

    const sourceRoundNumber =
      Number(select.value);

    const sourceRound = tournamentRounds.find(
      function (item) {
        return (
          item.tournamentRoundNumber ===
          sourceRoundNumber
        );
      }
    );

    if (!sourceRound) {
      participantBox.textContent =
        "找不到此回合資料.";
      return;
    }

    if (
      !Array.isArray(sourceRound.participants) ||
      sourceRound.participants.length === 0
    ) {
      participantBox.textContent =
        "此回合沒有參賽者。";
      return;
    }

    ensureParticipantKeys(sourceRound.participants);

    sourceRound.participants.forEach(
      function (participant) {
        const participantLabel =
          document.createElement("label");

        participantLabel.style.display = "block";
        participantLabel.style.marginBottom = "5px";

        const checkbox =
          document.createElement("input");

        checkbox.type = "checkbox";
        checkbox.className =
          "source-participant-checkbox";

        checkbox.dataset.round =
          sourceRoundNumber;

        checkbox.dataset.participantId =
          participant.id;

        checkbox.dataset.participantKey =
          participant.participantKey;

        checkbox.checked =
          !participant.eliminated;

        participantLabel.appendChild(checkbox);

        let text = ` ${participant.name}`;

        if (participant.eliminated) {
          text += "（淘汰！）";
        }

        participantLabel.appendChild(
          document.createTextNode(text)
        );

        participantBox.appendChild(participantLabel);
      }
    );
  }

  select.addEventListener(
    "change",
    renderSourceParticipants
  );

  sourceRoundList.appendChild(row);
  renderSourceParticipants();
}

function openNextTournamentRoundSettings() {
  if (participants.length === 0) {
    alert("請先建立目前的遊戲。");
    return;
  }

  saveCurrentTournamentRoundSnapshot();

  if (!nextRoundSettingsPanel) return;

  nextRoundSettingsPanel.classList.remove("hidden");

  if (nextRoundNameInput) {
    nextRoundNameInput.value = "";
  }

  const newModeRadio = document.querySelector(
    'input[name="participantSourceMode"][value="new"]'
  );

  if (newModeRadio) {
    newModeRadio.checked = true;
  }

  if (nextPlayerCountInput) {
    nextPlayerCountInput.value =
      Math.max(2, Math.min(64, participants.length));
  }

  if (sourceRoundList) {
    sourceRoundList.innerHTML = "";
    addSourceRoundSelector(tournamentRoundNumber);
  }

  if (inheritStatsInput) {
    inheritStatsInput.checked = false;
  }

  if (nextTeamModeInput) {
    nextTeamModeInput.checked =
      !!gameConfig.teamMode;
  }

  if (nextTeamCountInput) {
    nextTeamCountInput.value =
      gameConfig.teamMode
        ? Math.max(2, teams.length)
        : 2;
  }

  if (nextTeamEquipmentSolidarityInput) {
    nextTeamEquipmentSolidarityInput.checked =
      gameConfig.teamEquipmentSolidarity !== false;
  }

  if (nextEquipmentRuleInput) {
    nextEquipmentRuleInput.value =
      gameConfig.equipmentRule === "unlimited"
        ? "unlimited"
        : "normal";
  }

  if (nextEliminationModeInput) {
    nextEliminationModeInput.value =
      gameConfig.eliminationMode || "none";
  }

  if (nextLossLimitInput) {
    nextLossLimitInput.value =
      gameConfig.lossLimit || 1;
  }

  if (nextEliminationPenaltyInput) {
    nextEliminationPenaltyInput.value =
      gameConfig.eliminationPenalty || "";
  }

  updateParticipantSourceMode();
  updateNextTeamSettingsVisibility();
  updateNextEliminationSettingsVisibility();

  nextRoundSettingsPanel.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

function updateNextTeamSettingsVisibility() {
  if (!nextTeamModeInput || !nextTeamSettings) return;

  nextTeamSettings.classList.toggle(
    "hidden",
    !nextTeamModeInput.checked
  );
}

function updateNextEliminationSettingsVisibility() {
  if (!nextEliminationModeInput) return;

  const enabled =
    nextEliminationModeInput.value === "loss";

  if (nextLossLimitBox) {
    nextLossLimitBox.classList.toggle(
      "hidden",
      !enabled
    );
  }

  if (nextPenaltyBox) {
    nextPenaltyBox.classList.toggle(
      "hidden",
      !enabled
    );
  }
}

// ============================================================
// 建立下一個賽事回合
// ============================================================

async function createNextTournamentRound() {
  if (blockPendingEquipment()) return;

  if (participants.length === 0) {
    alert("目前沒有可延續的遊戲。");
    return;
  }

  const selectedModeRadio = document.querySelector(
    'input[name="participantSourceMode"]:checked'
  );

  const participantSourceMode =
    selectedModeRadio
      ? selectedModeRadio.value
      : "new";

  const maxRoundNumber = tournamentRounds.reduce(
    function (max, item) {
      return Math.max(
        max,
        Number(item.tournamentRoundNumber) || 0
      );
    },
    0
  );

  const newTournamentRoundNumber =
    maxRoundNumber + 1;

  const newTournamentRoundName =
    nextRoundNameInput
      ? nextRoundNameInput.value.trim()
      : "";

  let newParticipants = [];

  if (participantSourceMode === "new") {
    let nextPlayerCount = parseInt(
      nextPlayerCountInput
        ? nextPlayerCountInput.value
        : 2,
      10
    );

    if (
      Number.isNaN(nextPlayerCount) ||
      nextPlayerCount < 2 ||
      nextPlayerCount > 64
    ) {
      alert("新回合參賽人數必須為 2～64 人。");
      return;
    }

    for (let i = 0; i < nextPlayerCount; i++) {
      newParticipants.push({
        id: i + 1,
        participantKey: createParticipantKey(),
        name: `參賽者 ${i + 1}`,
        avatar: "",
        teamId: null,
        controlled: false,
        winRate: 33,
        wins: 0,
        losses: 0,
        ties: 0,
        eliminated: false
      });
    }
  } else if (participantSourceMode === "inherit") {
    const selectedCheckboxes = Array.from(
      document.querySelectorAll(
        ".source-participant-checkbox:checked"
      )
    );

    if (selectedCheckboxes.length === 0) {
      alert("請至少選擇一名參賽者。");
      return;
    }

    const inheritStats =
      inheritStatsInput
        ? !!inheritStatsInput.checked
        : false;

    const participantMap = new Map();

    selectedCheckboxes.forEach(function (checkbox) {
      const sourceRoundNumber =
        Number(checkbox.dataset.round);

      const sourceParticipantKey =
        checkbox.dataset.participantKey;

      const sourceParticipantId =
        Number(checkbox.dataset.participantId);

      const sourceRound = tournamentRounds.find(
        function (item) {
          return (
            item.tournamentRoundNumber ===
            sourceRoundNumber
          );
        }
      );

      if (!sourceRound) return;

      ensureParticipantKeys(
        sourceRound.participants
      );

      let sourceParticipant = null;

      if (sourceParticipantKey) {
        sourceParticipant =
          sourceRound.participants.find(
            function (participant) {
              return (
                participant.participantKey ===
                sourceParticipantKey
              );
            }
          );
      }

      if (!sourceParticipant) {
        sourceParticipant =
          sourceRound.participants.find(
            function (participant) {
              return (
                Number(participant.id) ===
                sourceParticipantId
              );
            }
          );
      }

      if (!sourceParticipant) return;

      if (!sourceParticipant.participantKey) {
        sourceParticipant.participantKey =
          createParticipantKey();
      }

      const permanentKey =
        sourceParticipant.participantKey;

      let target =
        participantMap.get(permanentKey);

      if (!target) {
        target = {
          participantKey: permanentKey,
          name: sourceParticipant.name,
          avatar: sourceParticipant.avatar || "",
          teamId: null,
          controlled: !!sourceParticipant.controlled,

          winRate:
            Number.isFinite(
              Number(sourceParticipant.winRate)
            )
              ? Math.max(
                  0,
                  Math.min(
                    100,
                    Number(sourceParticipant.winRate)
                  )
                )
              : 33,

          wins: 0,
          losses: 0,
          ties: 0,
          eliminated: false,
          _latestSourceRound: sourceRoundNumber,
          _statsSourceRound: null
        };

        participantMap.set(permanentKey, target);
      }

      if (
        target._latestSourceRound == null ||
        sourceRoundNumber >= target._latestSourceRound
      ) {
        ensureEquipment(sourceParticipant);

        target.initialEquipment =
          [...sourceParticipant.initialEquipment];

        target.equipment =
          [...target.initialEquipment];

        target.equipmentHistory = [];
        target.pendingEquipmentLoss = false;

        target.name =
          sourceParticipant.name;

        target.avatar =
          sourceParticipant.avatar || "";

        target.controlled =
          !!sourceParticipant.controlled;

        target.winRate =
          Number.isFinite(
            Number(sourceParticipant.winRate)
          )
            ? Math.max(
                0,
                Math.min(
                  100,
                  Number(sourceParticipant.winRate)
                )
              )
            : 33;

        target._latestSourceRound =
          sourceRoundNumber;
      }

      if (inheritStats) {
        if (
          target._statsSourceRound == null ||
          sourceRoundNumber > target._statsSourceRound
        ) {
          target.wins =
            Number(sourceParticipant.wins) || 0;

          target.losses =
            Number(sourceParticipant.losses) || 0;

          target.ties =
            Number(sourceParticipant.ties) || 0;

          target._statsSourceRound =
            sourceRoundNumber;
        }
      }
    });

    newParticipants =
      Array.from(participantMap.values());

    if (newParticipants.length < 2) {
      alert("新回合至少需要 2 名不同參賽者。");
      return;
    }

    if (newParticipants.length > 64) {
      alert("新回合參賽人數不能超過 64 人。");
      return;
    }

    newParticipants.forEach(
      function (participant, index) {
        participant.id = index + 1;
        participant.teamId = null;
        participant.eliminated = false;

        delete participant._latestSourceRound;
        delete participant._statsSourceRound;
      }
    );
  } else {
    alert("無法判斷新回合的參賽者建立方式。");
    return;
  }

  const useTeamMode =
    nextTeamModeInput
      ? !!nextTeamModeInput.checked
      : false;

  const nextTeamEquipmentSolidarity =
    nextTeamEquipmentSolidarityInput?.checked !== false;

  const nextEquipmentRule =
    nextEquipmentRuleInput?.value === "unlimited"
      ? "unlimited"
      : "normal";

  let nextTeamCount = 0;

  if (useTeamMode) {
    nextTeamCount = parseInt(
      nextTeamCountInput
        ? nextTeamCountInput.value
        : 2,
      10
    );

    if (
      Number.isNaN(nextTeamCount) ||
      nextTeamCount < 2 ||
      nextTeamCount > 32
    ) {
      alert("隊伍數必須為 2～32 隊。");
      return;
    }

    if (nextTeamCount > newParticipants.length) {
      alert("隊伍數不能大於新回合參賽人數。");
      return;
    }
  }

  let nextLossLimit = parseInt(
    nextLossLimitInput
      ? nextLossLimitInput.value
      : 1,
    10
  );

  if (
    Number.isNaN(nextLossLimit) ||
    nextLossLimit < 1
  ) {
    nextLossLimit = 1;
  }

  const nextEliminationMode =
    nextEliminationModeInput &&
    nextEliminationModeInput.value === "loss"
      ? "loss"
      : "none";

  const nextPenalty =
    nextEliminationPenaltyInput
      ? nextEliminationPenaltyInput.value.trim()
      : "";

  saveCurrentTournamentRoundSnapshot();

  participants = newParticipants;
  ensureParticipantKeys(participants);

  gameConfig = {
    ...gameConfig,
    teamMode: useTeamMode,
    teamEquipmentSolidarity: nextTeamEquipmentSolidarity,
    equipmentRule: nextEquipmentRule,
    eliminationMode: nextEliminationMode,
    lossLimit: nextLossLimit,
    eliminationPenalty: nextPenalty
  };

  teams = [];

  if (useTeamMode) {
    for (let i = 0; i < nextTeamCount; i++) {
      teams.push({
        id: i + 1,
        name: `第 ${i + 1} 隊`,
        controlled: false,
        wins: 0,
        losses: 0,
        ties: 0,
        eliminated: false
      });
    }

    participants.forEach(function (participant) {
      participant.teamId = teams[0].id;
    });
  } else {
    participants.forEach(function (participant) {
      participant.teamId = null;
    });
  }

  tournamentRoundNumber =
    newTournamentRoundNumber;

  roundNumber = 0;
  roundHistory = [];
  playerThrows = {};
  teamRepresentatives = {};

  const newSnapshot = {
    tournamentRoundNumber: tournamentRoundNumber,
    tournamentRoundName: newTournamentRoundName,
    gameConfig: copyObject(gameConfig),
    participants: copyObject(participants),
    teams: copyObject(teams),
    roundNumber: roundNumber,
    roundHistory: copyObject(roundHistory)
  };

  tournamentRounds.push(newSnapshot);

  tournamentRounds.sort(function (a, b) {
    return (
      a.tournamentRoundNumber -
      b.tournamentRoundNumber
    );
  });

  syncTournamentRoundToInterface();

  resultPanel.classList.add("hidden");
  resultList.innerHTML = "";

  renderParticipantSettings();
  renderTeamControls();
  renderOperationPanel();
  renderStats();
  renderTournamentRoundTabs();
  updateCurrentRoundNameInput();

  if (nextRoundSettingsPanel) {
    nextRoundSettingsPanel.classList.add("hidden");
  }

  if (gameConfig.saveResults) {
    await saveGameState();
  }
}

// ============================================================
// 遊戲結束判定
// ============================================================

function checkGameEnd() {
  if (gameConfig.eliminationMode !== "loss") return;

  if (gameConfig.teamMode) {
    const activeTeams = teams.filter(
      function (team) {
        return !team.eliminated;
      }
    );

    if (activeTeams.length === 1) {
      const winner = activeTeams[0];

      const message = document.createElement("div");
      message.style.marginTop = "20px";
      message.style.padding = "15px";
      message.style.border = "2px solid #222";
      message.style.borderRadius = "10px";

      const strong = document.createElement("strong");

      strong.textContent =
        `本回合勝隊：${winner.name}`;

      message.appendChild(strong);
      resultList.appendChild(message);
    }

    return;
  }

  const activeParticipants =
    participants.filter(function (participant) {
      return !participant.eliminated;
    });

  if (activeParticipants.length === 1) {
    const winner = activeParticipants[0];

    const message = document.createElement("div");
    message.style.marginTop = "20px";
    message.style.padding = "15px";
    message.style.border = "2px solid #222";
    message.style.borderRadius = "10px";

    const strong = document.createElement("strong");

    strong.textContent =
      `本回合勝者：${winner.name}`;

    message.appendChild(strong);
    resultList.appendChild(message);
  }
}

// ============================================================
// 開始與重設按鍵
// ============================================================

function addStartButton() {
  document.getElementById("startRoundBtn")?.remove();

  document
    .getElementById("resetCurrentRoundBtn")
    ?.remove();

  const start = element("button", "START！");
  start.type = "button";
  start.id = "startRoundBtn";

  start.disabled =
    roundBusy || hasPendingEquipment();

  start.addEventListener("click", startRound);

  const reset = element("button", "重設本回合");
  reset.type = "button";
  reset.id = "resetCurrentRoundBtn";
  reset.disabled = roundBusy;
  reset.style.marginLeft = "8px";

  reset.addEventListener("click", resetCurrentRound);

  operationPanel.append(start, reset);
}

async function resetCurrentRound() {
  if (roundBusy || !participants.length) return;

  if (
    !window.confirm(
      "確定重設本回合？\n\n" +
      "將清除本回合勝負、出拳及拋棄紀錄，恢復各人的起始衣物；其他回合不受影響。"
    )
  ) {
    return;
  }

  roundBusy = true;

  try {
    participants.forEach(participant => {
      ensureEquipment(participant);

      participant.wins = 0;
      participant.losses = 0;
      participant.ties = 0;
      participant.eliminated = false;

      participant.equipment =
        [...participant.initialEquipment];

      participant.equipmentHistory = [];
      participant.pendingEquipmentLoss = false;
    });

    teams.forEach(team => {
      team.wins = 0;
      team.losses = 0;
      team.ties = 0;
      team.eliminated = false;
    });

    roundNumber = 0;
    roundHistory = [];
    playerThrows = {};
    teamRepresentatives = {};
    currentEquipmentDiscards = [];

    resultList.innerHTML = "";
    resultPanel.classList.add("hidden");

    saveCurrentTournamentRoundSnapshot();
    await saveGameState();
  } finally {
    roundBusy = false;

    renderParticipantSettings();
    renderTeamControls();
    renderOperationPanel();
    renderStats();
    renderTournamentRoundTabs();
  }
}

// ============================================================
// 共用工具
// ============================================================

function createThrowButton(fist, callback) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "throw-btn";
  button.textContent = fistEmoji(fist);
  button.title = fistName(fist);
  button.addEventListener("click", callback);

  return button;
}

function randomFist() {
  const fists = ["rock", "paper", "scissors"];

  return fists[
    Math.floor(Math.random() * fists.length)
  ];
}

function getTeamAverageWinRate(team) {
  const members = participants.filter(
    function (participant) {
      return (
        participant.teamId === team.id &&
        !participant.eliminated
      );
    }
  );

  if (members.length === 0) {
    return 33;
  }

  const total = members.reduce(
    function (sum, member) {
      return sum + Number(member.winRate || 0);
    },
    0
  );

  return total / members.length;
}

function fistEmoji(fist) {
  if (fist === "rock") return "✊";
  if (fist === "paper") return "✋";
  if (fist === "scissors") return "✌️";
  return "";
}

function fistName(fist) {
  if (fist === "rock") return "石頭";
  if (fist === "paper") return "布";
  if (fist === "scissors") return "剪刀";
  return fist;
}

function createDefaultAvatar(name) {
  const text = (name || "?").charAt(0);

  const svg = `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="100"
      height="100"
      viewBox="0 0 100 100"
    >
      <rect
        width="100"
        height="100"
        rx="50"
        fill="#eeeeee"
      />
      <text
        x="50"
        y="58"
        text-anchor="middle"
        font-size="42"
        font-family="Arial"
        fill="#555555"
      >${escapeHtml(text)}</text>
    </svg>
  `;

  return (
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(svg)
  );
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function copyObject(object) {
  return JSON.parse(JSON.stringify(object));
}

// ============================================================
// Beta 交叉勝率與和局機率
// ============================================================

function normalizeConfiguredWinRate(value) {
  let rate = parseFloat(value);

  if (Number.isNaN(rate)) {
    rate = 50;
  }

  return Math.max(0, Math.min(100, rate));
}

function calculateCrossWinProbability(
  selfRate,
  opponentRate
) {
  const self =
    normalizeConfiguredWinRate(selfRate);

  const opponent =
    normalizeConfiguredWinRate(opponentRate);

  const total = self + opponent;

  if (total <= 0) {
    return 0.5;
  }

  return self / total;
}

function getCrossDesiredOutcome(
  selfRate,
  opponentRate
) {
  const tieProbability = 1 / 3;
  const random = Math.random();

  if (random < tieProbability) {
    return "tie";
  }

  const winProbability =
    calculateCrossWinProbability(
      selfRate,
      opponentRate
    );

  const winLossRandom = Math.random();

  if (winLossRandom < winProbability) {
    return "win";
  }

  return "loss";
}

function getEliminationStatusText(item) {
  if (!item.eliminated) {
    return " ";
  }

  const penalty =
    typeof gameConfig.eliminationPenalty === "string"
      ? gameConfig.eliminationPenalty.trim()
      : "";

  if (penalty) {
    return `淘汰！處罰：${penalty}`;
  }

  return "淘汰！";
}

// ============================================================
// 啟用 Gamma 衣物設定
// ============================================================

initializeEquipmentControls();