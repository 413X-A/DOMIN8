"use strict";

/* =========================================================
   FILLER: COLOR FILL — CAMPAIGN GAME
   210 Level + Spezialfelder
   ========================================================= */

const TOTAL_CAMPAIGN_LEVELS = 210;
const MAX_STARS_PER_LEVEL = 3;
const MAX_BOARD_SIZE = 18;
const MAX_CAMPAIGN_COLORS = 8;
const GAME_MODE = "campaign";

const CAMPAIGN_COLORS = [
    "#ef476f", "#ffd166", "#06d6a0", "#118ab2",
    "#9b5de5", "#f15bb5", "#ff7b00", "#80ed99",
    "#00b4d8", "#f72585", "#8ac926", "#6c757d"
];

const CAMPAIGN_COLOR_NAMES = [
    "Pink", "Gelb", "Türkis", "Blau",
    "Violett", "Rosa", "Orange", "Hellgrün",
    "Cyan", "Magenta", "Grün", "Grau"
];

const SPECIAL_TILES = new Set([
    "#", ".", "+", "=", "@", "*", "~",
    "^", "v", "<", ">"
]);

const ARROW_DIRECTIONS = {
    "^": { row: -1, col: 0 },
    "v": { row: 1, col: 0 },
    "<": { row: 0, col: -1 },
    ">": { row: 0, col: 1 }
};

const SPECIAL_TILE_COLORS = {
    "#": "#171923",
    ".": "#e5e7eb",
    "+": "#9ca3af",
    "=": "#facc15",
    "@": "#8b5cf6",
    "*": "#ec4899",
    "~": "#4b5563",
    "^": "#06b6d4",
    "v": "#06b6d4",
    "<": "#06b6d4",
    ">": "#06b6d4"
};

const SPECIAL_TILE_GLYPHS = {
    "#": "■",
    ".": "·",
    "+": "╋",
    "=": "⚡",
    "@": "◎",
    "*": "✦",
    "~": "🔒",
    "^": "↑",
    "v": "↓",
    "<": "←",
    ">": "→"
};


/* =========================================================
   SPIELZUSTAND
   ========================================================= */

let LEVEL = null;

let board = [];
let ownedCells = new Set();

let movesUsed = 0;
let isGameOver = false;
let isSavingResult = false;
let isInitialized = false;
let isRecordingStart = false;

let currentUser = null;
let selectedColor = null;
let showFilledPercent = false;

let switchActivated = false;
let teleportTargets = new Map();

let gameBoardElement = null;
let colorPickerElement = null;
let movesCounterElement = null;
let moveLimitElement = null;
let filledCounterElement = null;
let levelTitleElement = null;
let resultOverlayElement = null;


/* =========================================================
   SUPABASE / HILFSFUNKTIONEN
   ========================================================= */

function getSupabaseClient() {
    if (
        typeof supabaseClient !== "undefined" &&
        supabaseClient &&
        typeof supabaseClient.from === "function"
    ) {
        return supabaseClient;
    }

    if (
        window.supabaseClient &&
        typeof window.supabaseClient.from === "function"
    ) {
        return window.supabaseClient;
    }

    return null;
}

function getElement(id) {
    return document.getElementById(id);
}

function getErrorMessage(error) {
    return error?.message || String(error || "Unbekannter Fehler");
}

function showMessage(message) {
    console.info("[Campaign]", message);

    const element = getElement("result-message");

    if (element) {
        element.textContent = message;
    }
}

function setResultText(id, value) {
    const element = getElement(id);

    if (element) {
        element.textContent = String(value ?? "");
    }
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}


/* =========================================================
   LEVEL-ID
   ========================================================= */

function getLevelIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const rawValue = params.get("level");

    if (rawValue === null || rawValue.trim() === "") {
        return 1;
    }

    const level = Number(rawValue);

    if (
        !Number.isInteger(level) ||
        level < 1 ||
        level > TOTAL_CAMPAIGN_LEVELS
    ) {
        console.warn(
            `[Campaign] Ungültige Levelnummer "${rawValue}".`
        );

        return 1;
    }

    return level;
}


/* =========================================================
   FARBEN / KOORDINATEN
   ========================================================= */

function getColorHex(index) {
    if (
        Number.isInteger(index) &&
        index >= 0 &&
        index < CAMPAIGN_COLORS.length
    ) {
        return CAMPAIGN_COLORS[index];
    }

    return "#6c757d";
}

function getColorName(index) {
    if (
        Number.isInteger(index) &&
        index >= 0 &&
        index < CAMPAIGN_COLOR_NAMES.length
    ) {
        return CAMPAIGN_COLOR_NAMES[index];
    }

    return `Farbe ${index + 1}`;
}

function getCellKey(row, col) {
    return `${row},${col}`;
}

function parseCellKey(key) {
    const [row, col] = key.split(",").map(Number);
    return { row, col };
}

function isInsideBoard(row, col) {
    return Boolean(
        LEVEL &&
        row >= 0 &&
        col >= 0 &&
        row < LEVEL.size &&
        col < LEVEL.size
    );
}

function getNeighbors(row, col) {
    return [
        { row: row - 1, col },
        { row: row + 1, col },
        { row, col: col - 1 },
        { row, col: col + 1 }
    ].filter(
        cell => isInsideBoard(cell.row, cell.col)
    );
}


/* =========================================================
   TERRAIN / FÜLLZIEL
   ========================================================= */

function getTerrain(row, col) {
    if (!LEVEL || !LEVEL.map[row]) {
        return null;
    }

    return LEVEL.map[row][col];
}

function isWall(row, col) {
    return getTerrain(row, col) === "#";
}

function isArrowTile(tile) {
    return Object.prototype.hasOwnProperty.call(
        ARROW_DIRECTIONS,
        tile
    );
}

function isNeutralTile(tile) {
    return (
        tile === "." ||
        tile === "+" ||
        tile === "=" ||
        tile === "@" ||
        tile === "*"
    );
}

function isGateOpen() {
    return switchActivated;
}

function getTotalCells() {
    if (!LEVEL || !LEVEL.map.length) {
        return 0;
    }

    let total = 0;

    for (let row = 0; row < LEVEL.size; row++) {
        for (let col = 0; col < LEVEL.size; col++) {
            if (getTerrain(row, col) !== "#") {
                total++;
            }
        }
    }

    return total;
}

function getFilledCellCount() {
    return ownedCells.size;
}

function calculateFilledPercent(
    filledCells,
    totalCells = getTotalCells()
) {
    if (
        !Number.isFinite(totalCells) ||
        totalCells <= 0
    ) {
        return 0;
    }

    const safeFilled = clamp(
        Number(filledCells) || 0,
        0,
        totalCells
    );

    return (safeFilled / totalCells) * 100;
}

/*
 * STERNLOGIK:
 * 100 % = 3 Sterne
 * 75 %   = 2 Sterne
 * 50 %   = 1 Stern
 * < 50 % = 0 Sterne
 */
function calculateStars(filledCells, totalCells) {
    const filled = Math.max(
        0,
        Number(filledCells) || 0
    );

    const total = Math.max(
        1,
        Number(totalCells) || 1
    );

    const percent = (filled / total) * 100;

    if (percent >= 100) return 3;
    if (percent >= 75) return 2;
    if (percent >= 50) return 1;

    return 0;
}

function isBoardFull() {
    const total = getTotalCells();

    return total > 0 && ownedCells.size >= total;
}


/* =========================================================
   MAP PARSEN
   ========================================================= */

function parseTileValue(value, colorCount) {
    if (
        typeof value === "number" &&
        Number.isInteger(value)
    ) {
        if (value < 0 || value >= colorCount) {
            throw new Error(
                `Ungültiger Farbwert: ${value}.`
            );
        }

        return value;
    }

    if (typeof value !== "string") {
        throw new Error(
            `Ungültiger Karteneintrag: ${String(value)}`
        );
    }

    if (/^[0-9]$/.test(value)) {
        const color = Number(value);

        if (color < 0 || color >= colorCount) {
            throw new Error(
                `Farbe ${color} liegt außerhalb der erlaubten Farben.`
            );
        }

        return color;
    }

    if (SPECIAL_TILES.has(value)) {
        return value;
    }

    throw new Error(
        `Unbekanntes Kartenzeichen: "${value}".`
    );
}

function parseMapData(mapData, size, colorCount) {
    let parsed = mapData;

    if (typeof parsed === "string") {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            throw new Error(
                "Die Level-Karte enthält ungültige JSON-Daten."
            );
        }
    }

    if (!Array.isArray(parsed) || parsed.length !== size) {
        throw new Error(
            `Die Kartenhöhe passt nicht zur Boardgröße ${size}.`
        );
    }

    const result = parsed.map((row, rowIndex) => {
        let values;

        if (typeof row === "string") {
            values = Array.from(row);
        } else if (Array.isArray(row)) {
            values = row;
        } else {
            throw new Error(
                `Kartenzeile ${rowIndex + 1} ist ungültig.`
            );
        }

        if (values.length !== size) {
            throw new Error(
                `Kartenzeile ${rowIndex + 1} hat ${values.length} Felder statt ${size}.`
            );
        }

        return values.map(value =>
            parseTileValue(value, colorCount)
        );
    });

    validateSpecialMap(result, size);

    return result;
}


/* =========================================================
   SPEZIALFELDER VALIDIEREN
   ========================================================= */

function validateSpecialMap(map, size) {
    if (typeof map[0][0] !== "number") {
        throw new Error(
            "Das Startfeld oben links muss ein Farbfeld sein."
        );
    }

    let entranceCount = 0;
    let exitCount = 0;
    let switchCount = 0;
    let gateCount = 0;

    for (let row = 0; row < size; row++) {
        for (let col = 0; col < size; col++) {
            const tile = map[row][col];

            if (tile === "@") entranceCount++;
            if (tile === "*") exitCount++;
            if (tile === "=") switchCount++;
            if (tile === "~") gateCount++;
        }
    }

    if (entranceCount !== exitCount) {
        throw new Error(
            `Teleporter fehlerhaft: ${entranceCount} Eingänge (@), ` +
            `aber ${exitCount} Ausgänge (*).`
        );
    }

    if (gateCount > 0 && switchCount === 0) {
        throw new Error(
            "Verriegelte Felder (~) vorhanden, aber kein Schalter (=)."
        );
    }
}


/* =========================================================
   TELEPORTER
   ========================================================= */

function buildTeleportTargets() {
    const entrances = [];
    const exits = [];

    if (!LEVEL) {
        return new Map();
    }

    for (let row = 0; row < LEVEL.size; row++) {
        for (let col = 0; col < LEVEL.size; col++) {
            const tile = getTerrain(row, col);
            const key = getCellKey(row, col);

            if (tile === "@") {
                entrances.push(key);
            } else if (tile === "*") {
                exits.push(key);
            }
        }
    }

    if (entrances.length !== exits.length) {
        throw new Error(
            "Die Teleporter-Eingänge und -Ausgänge passen nicht zusammen."
        );
    }

    const targets = new Map();

    for (let i = 0; i < entrances.length; i++) {
        targets.set(entrances[i], exits[i]);
    }

    return targets;
}


/* =========================================================
   LEVEL AUS SUPABASE
   ========================================================= */

async function loadCampaignLevel(levelId) {
    const client = getSupabaseClient();

    if (!client) {
        throw new Error("Supabase ist nicht initialisiert.");
    }

    const { data, error } = await client
        .from("campaign_levels")
        .select(
            "level_number, name, section, board_size, color_count, " +
            "move_limit, xp_reward, difficulty, map_data, is_active"
        )
        .eq("level_number", levelId)
        .eq("is_active", true)
        .maybeSingle();

    if (error) {
        console.error(
            "[Campaign] Level-Ladefehler:",
            error
        );

        throw new Error(
            "Das Level konnte nicht aus Supabase geladen werden."
        );
    }

    if (!data) {
        throw new Error(
            `Level ${levelId} existiert nicht oder ist inaktiv.`
        );
    }

    const size = Number(data.board_size);
    const colors = Number(data.color_count);
    const moveLimit = Number(data.move_limit);
    const xpReward = Number(data.xp_reward);
    const levelNumber = Number(data.level_number);

    if (
        !Number.isInteger(levelNumber) ||
        levelNumber < 1 ||
        levelNumber > TOTAL_CAMPAIGN_LEVELS
    ) {
        throw new Error(
            `Ungültige Levelnummer ${data.level_number}.`
        );
    }

    if (
        !Number.isInteger(size) ||
        size < 2 ||
        size > MAX_BOARD_SIZE
    ) {
        throw new Error(`Ungültige Board-Größe: ${size}.`);
    }

    if (
        !Number.isInteger(colors) ||
        colors < 2 ||
        colors > MAX_CAMPAIGN_COLORS ||
        colors > CAMPAIGN_COLORS.length
    ) {
        throw new Error(`Ungültige Farbanzahl: ${colors}.`);
    }

    if (
        !Number.isInteger(moveLimit) ||
        moveLimit < 1 ||
        moveLimit > 100
    ) {
        throw new Error(`Ungültiges Zuglimit: ${moveLimit}.`);
    }

    const map = parseMapData(
        data.map_data,
        size,
        colors
    );

    return {
        id: levelNumber,
        name: data.name || `Level ${levelNumber}`,
        section: data.section || "Kampagne",
        size,
        colors,
        moveLimit,
        xp: Number.isFinite(xpReward)
            ? Math.max(0, Math.trunc(xpReward))
            : 0,
        difficulty: Number(data.difficulty) || levelNumber,
        map
    };
}


/* =========================================================
   BENUTZER
   ========================================================= */

async function getAuthenticatedUser() {
    const client = getSupabaseClient();

    if (!client?.auth) {
        return null;
    }

    const { data, error } = await client.auth.getUser();

    if (error) {
        console.error(
            "[Campaign] Auth-Fehler:",
            error
        );

        return null;
    }

    return data?.user || null;
}

async function recordCampaignStart() {
    const client = getSupabaseClient();

    if (
        !client ||
        !currentUser ||
        !LEVEL ||
        isRecordingStart
    ) {
        return false;
    }

    isRecordingStart = true;

    try {
        // Spielstart allgemein speichern
        const { error: sessionError } =
            await client.rpc(
                "start_play_session",
                {
                    p_game_mode: GAME_MODE
                }
            );

        if (sessionError) {
            console.error(
                "[Campaign] Spielstart konnte nicht gespeichert werden:",
                sessionError
            );
        }

        // Kampagnen-Versuch erhöhen
        const { data: attempts, error: attemptError } =
            await client.rpc(
                "increment_campaign_attempt",
                {
                    p_level_id: LEVEL.id
                }
            );

        if (attemptError) {
            console.error(
                "[Campaign] Versuch konnte nicht gespeichert werden:",
                attemptError
            );

            return false;
        }

        console.log(
            "[Campaign] Versuch gespeichert:",
            {
                levelId: LEVEL.id,
                attempts
            }
        );

        return true;

    } catch (error) {
        console.error(
            "[Campaign] Fehler beim Speichern des Spielstarts:",
            error
        );

        return false;

    } finally {
        isRecordingStart = false;
    }
}

async function recordTotalMove() {
    const client = getSupabaseClient();

    if (!client || !currentUser) {
        return false;
    }

    try {
        const { error } = await client.rpc(
            "record_total_move"
        );

        if (error) {
            console.error(
                "[Campaign] Gesamtzug konnte nicht gespeichert werden:",
                error
            );

            return false;
        }

        return true;
    } catch (error) {
        console.error(
            "[Campaign] Fehler beim Speichern des Gesamtzugs:",
            error
        );

        return false;
    }
}


/* =========================================================
   BOARD INITIALISIEREN
   ========================================================= */

function initializeBoard() {
    if (!LEVEL) return;

    board = LEVEL.map.map(row => [...row]);

    ownedCells = new Set([
        getCellKey(0, 0)
    ]);

    switchActivated = false;
    movesUsed = 0;
    selectedColor = board[0][0];

    teleportTargets = buildTeleportTargets();

    renderBoard();
    renderColorPicker();
    updateStats();
}


/* =========================================================
   SPEZIALFELDER
   ========================================================= */

function getSpecialTileDescription(tile) {
    switch (tile) {
        case "#": return "Wand";
        case ".": return "Neutrales Feld";
        case "+": return "Brücke";
        case "=":
            return switchActivated
                ? "Aktivierter Schalter"
                : "Schalter";
        case "@": return "Teleporter-Eingang";
        case "*": return "Teleporter-Ausgang";
        case "~":
            return switchActivated
                ? "Geöffnetes Verriegelungsfeld"
                : "Verriegeltes Feld";
        case "^": return "Einbahnfeld nach oben";
        case "v": return "Einbahnfeld nach unten";
        case "<": return "Einbahnfeld nach links";
        case ">": return "Einbahnfeld nach rechts";
        default: return "Farbfeld";
    }
}


/* =========================================================
   BOARD RENDERN
   ========================================================= */

function renderBoard() {
    if (!gameBoardElement || !LEVEL) return;

    gameBoardElement.innerHTML = "";
    gameBoardElement.style.display = "grid";

    gameBoardElement.style.setProperty(
        "--board-size",
        String(LEVEL.size)
    );

    gameBoardElement.style.gridTemplateColumns =
        `repeat(${LEVEL.size}, minmax(0, 1fr))`;

    gameBoardElement.style.gridTemplateRows =
        `repeat(${LEVEL.size}, minmax(0, 1fr))`;

    const fragment = document.createDocumentFragment();

    for (let row = 0; row < LEVEL.size; row++) {
        for (let col = 0; col < LEVEL.size; col++) {
            const cell = document.createElement("div");

            const key = getCellKey(row, col);
            const terrain = getTerrain(row, col);
            const isOwned = ownedCells.has(key);
            const value = board[row][col];

            cell.className = "game-cell";
            cell.style.boxSizing = "border-box";
            cell.style.position = "relative";

            cell.dataset.row = String(row);
            cell.dataset.col = String(col);

            if (isOwned && typeof value === "number") {
                cell.style.backgroundColor = getColorHex(value);
            } else if (typeof terrain === "number") {
                cell.style.backgroundColor = getColorHex(terrain);
            } else {
                cell.style.backgroundColor =
                    SPECIAL_TILE_COLORS[terrain] || "#6c757d";
            }

            if (isOwned) {
                cell.classList.add("owned");
            }

            if (typeof terrain === "string") {
                cell.classList.add(
                    "special-cell",
                    `special-${terrain}`
                );

                cell.textContent =
                    SPECIAL_TILE_GLYPHS[terrain] || terrain;

                cell.style.display = "flex";
                cell.style.alignItems = "center";
                cell.style.justifyContent = "center";
                cell.style.fontWeight = "700";
                cell.style.fontSize =
                    LEVEL.size >= 16
                        ? "0.65rem"
                        : "0.85rem";

                cell.style.color =
                    isOwned ? "#ffffff" : "#111827";

                if (terrain === "#") {
                    cell.style.color = "#f9fafb";
                    cell.style.backgroundColor =
                        SPECIAL_TILE_COLORS["#"];
                }

                if (terrain === "~" && switchActivated) {
                    cell.style.backgroundColor =
                        isOwned
                            ? getColorHex(value)
                            : "#a7f3d0";

                    cell.style.color = "#064e3b";
                }

                if (terrain === "=" && switchActivated) {
                    cell.style.backgroundColor =
                        isOwned
                            ? getColorHex(value)
                            : "#fde68a";
                }

                cell.title =
                    getSpecialTileDescription(terrain);
            } else {
                cell.title = getColorName(value);
            }

            if (row === 0 && col === 0) {
                cell.classList.add("start-cell");
            }

            const description =
                typeof terrain === "number"
                    ? getColorName(terrain)
                    : getSpecialTileDescription(terrain);

            cell.setAttribute(
                "aria-label",
                `Zeile ${row + 1}, Spalte ${col + 1}, ${description}` +
                (isOwned ? ", übernommen" : "")
            );

            fragment.appendChild(cell);
        }
    }

    gameBoardElement.appendChild(fragment);
}


/* =========================================================
   FARBWAHL
   ========================================================= */

function renderColorPicker() {
    if (!colorPickerElement || !LEVEL) return;

    colorPickerElement.innerHTML = "";

    for (let color = 0; color < LEVEL.colors; color++) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "color-option";
        button.style.backgroundColor =
            getColorHex(color);

        button.dataset.color = String(color);
        button.title = getColorName(color);

        button.setAttribute(
            "aria-label",
            `Farbe ${getColorName(color)}`
        );

        button.addEventListener("click", () => {
            selectColor(color);
        });

        colorPickerElement.appendChild(button);
    }

    updateColorPickerSelection();
}

function updateColorPickerSelection() {
    if (
        !colorPickerElement ||
        !LEVEL ||
        !board.length ||
        !board[0]
    ) {
        return;
    }

    colorPickerElement
        .querySelectorAll(".color-option")
        .forEach(button => {
            const color = Number(button.dataset.color);
            const isCurrent = color === board[0][0];

            button.classList.toggle(
                "selected",
                isCurrent
            );

            button.setAttribute(
                "aria-pressed",
                String(isCurrent)
            );

            button.disabled =
                isGameOver || isSavingResult;
        });
}


/* =========================================================
   RICHTUNG / BETRETEN
   ========================================================= */

function canMoveOutOfTile(
    row,
    col,
    deltaRow,
    deltaCol
) {
    const sourceTile = getTerrain(row, col);

    if (!isArrowTile(sourceTile)) {
        return true;
    }

    const direction =
        ARROW_DIRECTIONS[sourceTile];

    return (
        deltaRow === direction.row &&
        deltaCol === direction.col
    );
}

function canEnterArrowTile(
    tile,
    deltaRow,
    deltaCol
) {
    if (!isArrowTile(tile)) {
        return true;
    }

    const direction =
        ARROW_DIRECTIONS[tile];

    return (
        deltaRow === direction.row &&
        deltaCol === direction.col
    );
}

function canEnterTile(
    row,
    col,
    deltaRow,
    deltaCol
) {
    const tile = getTerrain(row, col);

    if (tile === "#") {
        return false;
    }

    if (tile === "~" && !isGateOpen()) {
        return false;
    }

    if (
        !canEnterArrowTile(
            tile,
            deltaRow,
            deltaCol
        )
    ) {
        return false;
    }

    return true;
}

function canCaptureTile(
    row,
    col,
    newColor
) {
    const key = getCellKey(row, col);

    if (ownedCells.has(key)) {
        return false;
    }

    const tile = getTerrain(row, col);

    if (tile === "#") {
        return false;
    }

    if (tile === "~" && !isGateOpen()) {
        return false;
    }

    if (isNeutralTile(tile)) {
        return true;
    }

    if (tile === "~" && isGateOpen()) {
        return true;
    }

    if (isArrowTile(tile)) {
        return true;
    }

    return (
        typeof board[row][col] === "number" &&
        board[row][col] === newColor
    );
}


/* =========================================================
   FELD ÜBERNEHMEN
   ========================================================= */

function claimCell(
    row,
    col,
    newColor,
    queue
) {
    const key = getCellKey(row, col);

    if (ownedCells.has(key)) {
        return false;
    }

    const tile = getTerrain(row, col);

    if (
        tile === "#" ||
        (tile === "~" && !isGateOpen())
    ) {
        return false;
    }

    ownedCells.add(key);
    board[row][col] = newColor;

    queue.push({ row, col });

    if (tile === "=" && !switchActivated) {
        switchActivated = true;

        for (const ownedKey of ownedCells) {
            queue.push(parseCellKey(ownedKey));
        }
    }

    if (tile === "@") {
        const exitKey = teleportTargets.get(key);

        if (exitKey && !ownedCells.has(exitKey)) {
            const exit = parseCellKey(exitKey);
            const exitTerrain =
                getTerrain(exit.row, exit.col);

            if (exitTerrain === "*") {
                ownedCells.add(exitKey);
                board[exit.row][exit.col] = newColor;

                queue.push({
                    row: exit.row,
                    col: exit.col
                });
            }
        }
    }

    return true;
}


/* =========================================================
   FLOOD FILL
   ========================================================= */

function floodFillTerritory(newColor) {
    if (!LEVEL || !board.length) {
        return;
    }

    const queue = [];

    for (const key of ownedCells) {
        const { row, col } =
            parseCellKey(key);

        board[row][col] = newColor;

        queue.push({
            row,
            col
        });
    }

    let queueIndex = 0;

    while (queueIndex < queue.length) {
        const current =
            queue[queueIndex++];

        for (const neighbor of getNeighbors(
            current.row,
            current.col
        )) {
            const deltaRow =
                neighbor.row - current.row;

            const deltaCol =
                neighbor.col - current.col;

            if (
                !canMoveOutOfTile(
                    current.row,
                    current.col,
                    deltaRow,
                    deltaCol
                )
            ) {
                continue;
            }

            if (
                !canEnterTile(
                    neighbor.row,
                    neighbor.col,
                    deltaRow,
                    deltaCol
                )
            ) {
                continue;
            }

            if (
                !canCaptureTile(
                    neighbor.row,
                    neighbor.col,
                    newColor
                )
            ) {
                continue;
            }

            claimCell(
                neighbor.row,
                neighbor.col,
                newColor,
                queue
            );
        }
    }

    for (const key of ownedCells) {
        const { row, col } =
            parseCellKey(key);

        board[row][col] = newColor;
    }
}


/* =========================================================
   ZUG
   ========================================================= */

function selectColor(newColor) {
    if (
        isGameOver ||
        isSavingResult ||
        !LEVEL
    ) {
        return;
    }

    if (
        !Number.isInteger(newColor) ||
        newColor < 0 ||
        newColor >= LEVEL.colors
    ) {
        return;
    }

    if (
        newColor === board[0][0] &&
        movesUsed > 0
    ) {
        return;
    }

    movesUsed++;
    selectedColor = newColor;

    void recordTotalMove();

    floodFillTerritory(newColor);

    renderBoard();
    updateStats();
    updateColorPickerSelection();

    const boardFull = isBoardFull();

    const moveLimitReached =
        movesUsed >= LEVEL.moveLimit;

    if (boardFull || moveLimitReached) {
        void finishGame();
    }
}


/* =========================================================
   STATISTIK
   ========================================================= */

function toggleFilledDisplay() {
    showFilledPercent = !showFilledPercent;
    updateStats();
}

function updateStats() {
    if (!LEVEL) return;

    const filled = getFilledCellCount();
    const total = getTotalCells();

    const percent =
        calculateFilledPercent(
            filled,
            total
        );

    if (movesCounterElement) {
        movesCounterElement.textContent =
            String(movesUsed);
    }

    if (moveLimitElement) {
        moveLimitElement.textContent =
            String(LEVEL.moveLimit);
    }

    if (filledCounterElement) {
        filledCounterElement.textContent =
            showFilledPercent
                ? `${percent.toLocaleString("de-DE", {
                    maximumFractionDigits: 1
                })} %`
                : `${filled} / ${total}`;

        filledCounterElement.style.cursor =
            "pointer";

        filledCounterElement.style.userSelect =
            "none";

        filledCounterElement.title =
            "Antippen, um zwischen Feldern und Prozent zu wechseln";

        filledCounterElement.setAttribute(
            "role",
            "button"
        );

        filledCounterElement.setAttribute(
            "tabindex",
            "0"
        );
    }

    if (levelTitleElement) {
        levelTitleElement.textContent =
            LEVEL.name;
    }

    const progressBar = getElement(
        "campaign-game-progress-bar"
    );

    if (progressBar) {
        progressBar.style.width =
            `${percent}%`;

        progressBar.setAttribute(
            "aria-valuenow",
            String(Math.round(percent))
        );

        progressBar.setAttribute(
            "aria-valuemin",
            "0"
        );

        progressBar.setAttribute(
            "aria-valuemax",
            "100"
        );

        progressBar.setAttribute(
            "role",
            "progressbar"
        );
    }

    const switchStatus =
        getElement("campaign-switch-status");

    if (switchStatus) {
        const hasSwitch =
            LEVEL.map.some(row =>
                row.includes("=")
            );

        switchStatus.textContent =
            !hasSwitch
                ? ""
                : switchActivated
                    ? "Schalter aktiviert – Verriegelungen geöffnet"
                    : "Schalter noch nicht aktiviert";
    }
}


/* =========================================================
   ERGEBNIS
   ========================================================= */

function renderResultStars(stars) {
    const safeStars = clamp(
        Math.trunc(Number(stars) || 0),
        0,
        MAX_STARS_PER_LEVEL
    );

    for (
        let i = 1;
        i <= MAX_STARS_PER_LEVEL;
        i++
    ) {
        const element =
            getElement(`result-star-${i}`);

        if (!element) continue;

        const active = i <= safeStars;

        element.classList.toggle(
            "star-active",
            active
        );

        element.classList.toggle(
            "star-inactive",
            !active
        );

        element.textContent =
            active ? "★" : "☆";
    }
}

function showResultOverlay() {
    if (!resultOverlayElement) {
        return;
    }

    resultOverlayElement.hidden = false;

    resultOverlayElement.classList.remove(
        "hidden"
    );

    resultOverlayElement.classList.add(
        "active",
        "show"
    );

    resultOverlayElement.setAttribute(
        "aria-hidden",
        "false"
    );

    resultOverlayElement.style.display =
        "grid";

    resultOverlayElement.style.visibility =
        "visible";

    resultOverlayElement.style.opacity =
        "1";
}

function hideResultOverlay() {
    if (!resultOverlayElement) {
        return;
    }

    resultOverlayElement.classList.remove(
        "active",
        "show"
    );

    resultOverlayElement.classList.add(
        "hidden"
    );

    resultOverlayElement.setAttribute(
        "aria-hidden",
        "true"
    );

    resultOverlayElement.style.display =
        "none";

    resultOverlayElement.style.visibility =
        "hidden";

    resultOverlayElement.style.opacity =
        "0";

    resultOverlayElement.hidden = true;
}

function showGameResult({
    completed,
    stars,
    moves,
    filledCells,
    totalCells,
    percent,
    xp = 0,
    saveError = null
}) {
    const safeStars = clamp(
        Math.trunc(Number(stars) || 0),
        0,
        MAX_STARS_PER_LEVEL
    );

    const safeMoves = Math.max(
        0,
        Math.trunc(Number(moves) || 0)
    );

    const safeFilled = Math.max(
        0,
        Math.trunc(Number(filledCells) || 0)
    );

    const safeTotal = Math.max(
        1,
        Math.trunc(Number(totalCells) || 1)
    );

    const safePercent = clamp(
        Number(percent) || 0,
        0,
        100
    );

    setResultText(
        "result-title",
        completed
            ? "Level geschafft!"
            : "Level beendet"
    );

    setResultText(
        "result-message",
        completed
            ? "Du hast das Level vollständig gefüllt."
            : "Das Level wurde beendet, bevor alle Felder gefüllt waren."
    );

    renderResultStars(safeStars);

    setResultText(
        "result-moves",
        safeMoves
    );

    setResultText(
        "result-filled",
        `${safeFilled} / ${safeTotal}`
    );

    setResultText(
        "result-percent",
        `${safePercent.toLocaleString("de-DE", {
            maximumFractionDigits: 1
        })} %`
    );

    setResultText(
    "result-xp",
    Math.max(
        0,
        Math.trunc(Number(xp) || 0)
    )
);

    if (saveError) {
        console.warn(
            "[Campaign] Ergebnis konnte nicht vollständig gespeichert werden:",
            saveError
        );

        setResultText(
            "result-save-error",
            "Das Ergebnis konnte möglicherweise nicht gespeichert werden."
        );
    }

    const nextLevelButton =
        getElement("next-level-button");

    if (nextLevelButton) {
        const hasNextLevel =
            LEVEL &&
            LEVEL.id < TOTAL_CAMPAIGN_LEVELS;

        nextLevelButton.hidden =
            !completed || !hasNextLevel;

        nextLevelButton.disabled =
            !completed || !hasNextLevel;
    }

    showResultOverlay();
}


/* =========================================================
   KAMPAGNENFORTSCHRITT SPEICHERN
   ========================================================= */

async function saveCampaignResult(
    moves,
    filledCells,
    totalCells
) {
    const client = getSupabaseClient();

    if (!client) {
        const error = new Error(
            "Supabase-Client nicht verfügbar."
        );

        console.error(
            "[Campaign] Kein Supabase-Client:",
            error
        );

        return {
            saved: false,
            completed: false,
            stars: 0,
            bestStars: 0,
            bestMoves: null,
            error: error.message
        };
    }

    if (!currentUser) {
        const error = new Error(
            "Kein angemeldeter Benutzer."
        );

        console.error(
            "[Campaign] Kein Benutzer:",
            error
        );

        return {
            saved: false,
            completed: false,
            stars: 0,
            bestStars: 0,
            bestMoves: null,
            error: error.message
        };
    }

    if (!LEVEL) {
        const error = new Error(
            "Kein Kampagnenlevel geladen."
        );

        console.error(
            "[Campaign] Kein LEVEL:",
            error
        );

        return {
            saved: false,
            completed: false,
            stars: 0,
            bestStars: 0,
            bestMoves: null,
            error: error.message
        };
    }

    const safeMoves = Math.max(
        1,
        Math.trunc(Number(moves) || 1)
    );

    const safeFilledCells = Math.max(
        0,
        Math.trunc(Number(filledCells) || 0)
    );

    const safeTotalCells = Math.max(
        1,
        Math.trunc(Number(totalCells) || 1)
    );

    const localStars = calculateStars(
        safeFilledCells,
        safeTotalCells
    );

    console.log(
        "[Campaign] SPEICHERN:",
        {
            userId: currentUser.id,
            levelId: LEVEL.id,
            moves: safeMoves,
            filledCells: safeFilledCells,
            totalCells: safeTotalCells,
            percent: calculateFilledPercent(
                safeFilledCells,
                safeTotalCells
            ),
            stars: localStars
        }
    );

    try {
        const { data, error } = await client.rpc(
            "complete_campaign_level_with_stars",
            {
                p_level_id: Number(LEVEL.id),
                p_moves: safeMoves,
                p_filled_cells: safeFilledCells,
                p_total_cells: safeTotalCells
            }
        );

        if (error) {
            console.error(
                "[Campaign] RPC FEHLER:",
                error
            );

            console.error(
                "[Campaign] RPC Details:",
                {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code
                }
            );

            return {
                saved: false,
                completed: false,
                stars: localStars,
                bestStars: localStars,
                bestMoves: safeMoves,
                filledCells: safeFilledCells,
                totalCells: safeTotalCells,
                error:
                    error.message ||
                    "Speichern fehlgeschlagen."
            };
        }

        console.log(
            "[Campaign] RPC ANTWORT:",
            data
        );

        const result =
            Array.isArray(data)
                ? (data[0] || {})
                : (data || {});

        const savedStars = clamp(
            Math.trunc(
                Number(
                    result.best_stars ??
                    result.bestStars ??
                    localStars
                ) || 0
            ),
            0,
            MAX_STARS_PER_LEVEL
        );

        const savedMoves =
            result.best_moves != null
                ? Math.max(
                    1,
                    Math.trunc(
                        Number(result.best_moves) ||
                        safeMoves
                    )
                )
                : safeMoves;

        const savedCompleted =
            result.completed === true;

        const saved =
            result.saved !== false;

        console.log(
            "[Campaign] ERGEBNIS GESPEICHERT:",
            {
                saved,
                levelId: LEVEL.id,
                stars: savedStars,
                bestStars: savedStars,
                bestMoves: savedMoves,
                completed: savedCompleted
            }
        );

        return {
            saved,
            completed: savedCompleted,
            stars: savedStars,
            bestStars: savedStars,
            bestMoves: savedMoves,
            filledCells: safeFilledCells,
            totalCells: safeTotalCells,
            error: null
        };

    } catch (error) {
        console.error(
            "[Campaign] Unerwarteter Speicherfehler:",
            error
        );

        return {
            saved: false,
            completed: false,
            stars: localStars,
            bestStars: localStars,
            bestMoves: safeMoves,
            filledCells: safeFilledCells,
            totalCells: safeTotalCells,
            error: getErrorMessage(error)
        };
    }
}


/* =========================================================
   LEVEL FREISCHALTEN
   ========================================================= */

async function unlockCampaignLevels(
    completedLevelId
) {
    const client = getSupabaseClient();

    if (!client || !currentUser) {
        throw new Error(
            "Kein angemeldeter Benutzer."
        );
    }

    const levelId =
        Number(completedLevelId);

    if (
        !Number.isInteger(levelId) ||
        levelId < 1 ||
        levelId > TOTAL_CAMPAIGN_LEVELS
    ) {
        throw new Error(
            "Ungültige Kampagnenlevel-ID."
        );
    }

    const { data, error } =
        await client.rpc(
            "unlock_campaign_levels",
            {
                p_completed_level: levelId
            }
        );

    if (error) {
        console.error(
            "[Campaign] Level-Freischaltung fehlgeschlagen:",
            error
        );

        throw error;
    }

    return data;
}


/* =========================================================
   XP
   ========================================================= */

async function awardCampaignLevelXP(levelId) {
    const client = getSupabaseClient();

    if (!client || !currentUser) {
        throw new Error(
            "Kein angemeldeter Benutzer."
        );
    }

    const parsedLevelId = Number(levelId);

    if (
        !Number.isInteger(parsedLevelId) ||
        parsedLevelId < 1 ||
        parsedLevelId > TOTAL_CAMPAIGN_LEVELS
    ) {
        throw new Error(
            "Ungültige Kampagnenlevel-ID."
        );
    }

    const { data, error } = await client.rpc(
        "award_campaign_level_xp",
        {
            p_level_id: parsedLevelId
        }
    );

    if (error) {
        console.error(
            "[Campaign] XP-Vergabe fehlgeschlagen:",
            error
        );

        throw error;
    }

    const xpAwarded = Math.max(
        0,
        Math.trunc(
            Number(data?.xp_awarded ?? 0)
        )
    );

    const awarded =
        data?.awarded === true;

    console.log(
        "[Campaign] XP-Antwort:",
        {
            levelId: parsedLevelId,
            awarded,
            xpAwarded,
            data
        }
    );

    return {
        awarded,
        xpAwarded,
        levelId: parsedLevelId,
        message: data?.message ?? null
    };
}


/* =========================================================
   MODUS-STATISTIK
   ========================================================= */

async function saveCampaignModeStats({
    moves,
    filledCells,
    totalCells,
    percent,
    stars,
    completed
}) {
    const client = getSupabaseClient();

    if (!client) {
        return false;
    }

    const safeMoves = Math.max(
        1,
        Math.trunc(Number(moves) || 1)
    );

    const safeFilledCells = Math.max(
        0,
        Math.trunc(Number(filledCells) || 0)
    );

    const safeTotalCells = Math.max(
        1,
        Math.trunc(Number(totalCells) || 1)
    );

    const safePercent = clamp(
        Number.isFinite(Number(percent))
            ? Number(percent)
            : calculateFilledPercent(
                safeFilledCells,
                safeTotalCells
            ),
        0,
        100
    );

    const safeStars = clamp(
        Math.trunc(Number(stars) || 0),
        0,
        MAX_STARS_PER_LEVEL
    );

    const safeCompleted =
        completed === true;

    try {
        const { error } =
            await client.rpc(
                "save_play_result_by_mode",
                {
                    p_game_mode: GAME_MODE,
                    p_moves: safeMoves,
                    p_filled_percent: safePercent,
                    p_won: safeCompleted,
                    p_xp: 0,
                    p_stars: safeStars
                }
            );

        if (error) {
            console.error(
                "[Campaign] Statistikfehler:",
                error
            );

            return false;
        }

        return true;

    } catch (error) {
        console.error(
            "[Campaign] Fehler bei saveCampaignModeStats():",
            error
        );

        return false;
    }
}


/* =========================================================
   SPIEL BEENDEN
   ========================================================= */

async function finishGame() {
    if (
        isGameOver ||
        isSavingResult ||
        !LEVEL
    ) {
        return;
    }

    isSavingResult = true;
    isGameOver = true;

    const filledCells =
        getFilledCellCount();

    const totalCells =
        getTotalCells();

    const percent =
        calculateFilledPercent(
            filledCells,
            totalCells
        );

    const localStars =
        calculateStars(
            filledCells,
            totalCells
        );

    updateColorPickerSelection();

    try {
        /*
         * 1. Kampagnenlevel speichern.
         *
         * Die RPC-Funktion berechnet best_stars
         * serverseitig und speichert den Bestwert.
         */
        const result =
            await saveCampaignResult(
                movesUsed,
                filledCells,
                totalCells
            );

        /*
         * 2. Statistik speichern.
         *
         * Wichtig: Hier ebenfalls die tatsächlich
         * gespeicherten bestStars verwenden.
         */
        await saveCampaignModeStats({
            moves: movesUsed,
            filledCells,
            totalCells,
            percent,
            stars:
                result.bestStars ??
                localStars,
            completed:
                result.completed === true
        });

                /*
         * 3. Nur bei vollständigem Level:
         *    Nächste Level freischalten + XP vergeben.
         */
        let levelXP = 0;

        if (result.completed === true) {

            // Nächste Kampagnenlevel freischalten
            try {
                const unlockResult =
                    await unlockCampaignLevels(
                        LEVEL.id
                    );

                console.log(
                    "[Campaign] Level freigeschaltet:",
                    {
                        completedLevel: LEVEL.id,
                        unlockResult
                    }
                );

            } catch (error) {
                console.error(
                    "[Campaign] Level-Freischaltung fehlgeschlagen:",
                    error
                );
            }

            // XP vergeben
            try {
                const xpResult =
                    await awardCampaignLevelXP(
                        LEVEL.id
                    );

                levelXP = Math.max(
                    0,
                    Math.trunc(
                        Number(
                            xpResult?.xpAwarded ?? 0
                        )
                    )
                );

                console.log(
                    "[Campaign] Angezeigte Level-XP:",
                    levelXP
                );

            } catch (error) {
                console.error(
                    "[Campaign] XP-Vergabe fehlgeschlagen:",
                    error
                );

                levelXP = 0;
            }
        }

        /*
         * 4. Ergebnis anzeigen.
         */
        showGameResult({
    completed:
        result.completed === true,

    stars:
        result.bestStars ??
        localStars,

    moves:
        result.bestMoves ??
        movesUsed,

    filledCells,
    totalCells,
    percent,

    xp: levelXP
});

    } catch (error) {
        console.error(
            "[Campaign] Fehler beim Beenden des Spiels:",
            error
        );

        showGameResult({
            completed: false,
            stars: localStars,
            moves: movesUsed,
            filledCells,
            totalCells,
            percent,
            saveError:
                getErrorMessage(error)
        });

    } finally {
        /*
         * Das Spiel bleibt beendet.
         * Nur der Speichervorgang wird wieder freigegeben.
         */
        isSavingResult = false;

        updateColorPickerSelection();
    }
}


/* =========================================================
   RESET / NAVIGATION
   ========================================================= */

async function resetLevel() {
    if (!LEVEL || isSavingResult) {
        return;
    }

    isGameOver = false;
    isSavingResult = false;

    movesUsed = 0;
    selectedColor = null;
    switchActivated = false;

    hideResultOverlay();

    initializeBoard();

    await recordCampaignStart();
}

function navigateToMenu() {
    window.location.href =
        "campaign.html";
}

function navigateToNextLevel() {
    if (
        !LEVEL ||
        LEVEL.id >= TOTAL_CAMPAIGN_LEVELS ||
        !isGameOver
    ) {
        return;
    }

    window.location.href =
        `campaign_game.html?level=${LEVEL.id + 1}`;
}

function bindButton(id, callback) {
    const element = getElement(id);

    if (element) {
        element.addEventListener(
            "click",
            callback
        );
    }
}


/* =========================================================
   INITIALISIERUNG
   ========================================================= */

async function initializeCampaignGame() {
    if (isInitialized) {
        return;
    }

    isInitialized = true;

    gameBoardElement =
        getElement("game-board");

    colorPickerElement =
        getElement("color-picker");

    movesCounterElement =
        getElement("moves-counter");

    moveLimitElement =
        getElement("move-limit");

    filledCounterElement =
        getElement("filled-counter");

    levelTitleElement =
        getElement("level-title");

    resultOverlayElement =
        getElement("game-result");

    bindButton(
        "back-button",
        navigateToMenu
    );

    bindButton(
        "result-menu-button",
        navigateToMenu
    );

    bindButton(
        "reset-button",
        resetLevel
    );

    bindButton(
        "restart-button",
        resetLevel
    );

    bindButton(
        "restart-result-button",
        resetLevel
    );

    bindButton(
        "next-level-button",
        navigateToNextLevel
    );

    if (filledCounterElement) {
        filledCounterElement.addEventListener(
            "click",
            toggleFilledDisplay
        );

        filledCounterElement.addEventListener(
            "keydown",
            event => {
                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {
                    event.preventDefault();
                    toggleFilledDisplay();
                }
            }
        );
    }

    if (
        !gameBoardElement ||
        !colorPickerElement
    ) {
        console.error(
            "[Campaign] Spielfeld oder Farbauswahl fehlt."
        );

        showMessage(
            "Das Spielfeld oder die Farbauswahl fehlt im HTML."
        );

        return;
    }

    const client =
        getSupabaseClient();

    if (!client || !client.auth) {
        showMessage(
            "Supabase ist nicht initialisiert."
        );

        return;
    }

    try {
        currentUser =
            await getAuthenticatedUser();

        if (!currentUser) {
            showMessage(
                "Bitte melde dich an, um die Kampagne zu spielen."
            );

            window.location.href =
                "login.html";

            return;
        }

        const levelId =
            getLevelIdFromUrl();

        LEVEL =
            await loadCampaignLevel(
                levelId
            );

        teleportTargets =
            buildTeleportTargets();

        document.title =
            `${LEVEL.name} – Filler: Color Fill`;

        isGameOver = false;
        isSavingResult = false;
        switchActivated = false;

        hideResultOverlay();
        initializeBoard();

        await recordCampaignStart();

        console.info(
            `[Campaign] Level ${LEVEL.id} geladen.`,
            {
                name: LEVEL.name,
                size: LEVEL.size,
                colors: LEVEL.colors,
                moveLimit: LEVEL.moveLimit,
                fillableCells:
                    getTotalCells(),
                specialFields:
                    countSpecialFields()
            }
        );

    } catch (error) {
        console.error(
            "[Campaign] Initialisierung fehlgeschlagen:",
            error
        );

        if (levelTitleElement) {
            levelTitleElement.textContent =
                "Level konnte nicht geladen werden";
        }

        showMessage(
            getErrorMessage(error) ||
            "Fehler beim Laden des Levels."
        );
    }
}


/* =========================================================
   SPEZIALFELDER ZÄHLEN
   ========================================================= */

function countSpecialFields() {
    if (!LEVEL) {
        return {};
    }

    const counts = {};

    for (const row of LEVEL.map) {
        for (const tile of row) {
            if (typeof tile === "string") {
                counts[tile] =
                    (counts[tile] || 0) + 1;
            }
        }
    }

    return counts;
}


/* =========================================================
   START
   ========================================================= */

if (
    document.readyState === "loading"
) {
    document.addEventListener(
        "DOMContentLoaded",
        initializeCampaignGame,
        { once: true }
    );
} else {
    void initializeCampaignGame();
}