"use strict";

/* =========================================================
   FILLER: COLOR FILL — CAMPAIGN GAME
   Version: 210 Level + Spezialfelder

   Kampagnenfortschritt:
   - campaign_progress
   - complete_campaign_level_with_stars
   - award_campaign_level_xp
   - save_play_result_by_mode
   - unlock_campaign_levels
   - start_play_session
   - record_total_move

   WICHTIG:
   - Kampagnen-XP werden ausschließlich serverseitig vergeben.
   - save_play_result_by_mode erhält immer p_xp = 0.
   - Die tatsächliche Levelkonfiguration stammt aus Supabase.
   - LEVEL.map bleibt unverändert und speichert das Terrain.
   - board speichert die aktuell dargestellten Farben.
   ========================================================= */


/* =========================================================
   1. KONSTANTEN
   ========================================================= */

const TOTAL_CAMPAIGN_LEVELS = 210;
const MAX_STARS_PER_LEVEL = 3;
const MAX_BOARD_SIZE = 18;
const MAX_CAMPAIGN_COLORS = 8;

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

const GAME_MODE = "campaign";

/*
 * Alle erlaubten Spezialzeichen.
 */
const SPECIAL_TILES = new Set([
    "#", ".", "+", "=", "@", "*", "~",
    "^", "v", "<", ">"
]);

/*
 * Pfeilbewegungen:
 * Ein Pfeil kann nur in seiner Richtung betreten werden.
 * Von einem besetzten Pfeilfeld breitet sich die Füllung
 * ausschließlich in Pfeilrichtung weiter aus.
 */
const ARROW_DIRECTIONS = {
    "^": { row: -1, col: 0, name: "oben" },
    "v": { row: 1, col: 0, name: "unten" },
    "<": { row: 0, col: -1, name: "links" },
    ">": { row: 0, col: 1, name: "rechts" }
};

/*
 * Farben für noch nicht beanspruchte Spezialfelder.
 */
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

/*
 * Symbole, die auf den Spezialfeldern erscheinen.
 */
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
   2. SPIELZUSTAND
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

/*
 * Spezialfeld-Zustand.
 */
let switchActivated = false;

/*
 * Map: Schlüssel des Teleportereingangs -> Schlüssel
 * des dazugehörigen Teleporterausgangs.
 */
let teleportTargets = new Map();

/*
 * HTML-Elemente.
 */
let gameBoardElement = null;
let colorPickerElement = null;
let movesCounterElement = null;
let moveLimitElement = null;
let filledCounterElement = null;
let levelTitleElement = null;
let resultOverlayElement = null;


/* =========================================================
   3. SUPABASE UND HILFSFUNKTIONEN
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

function showMessage(message) {
    console.info("[Campaign]", message);

    const element = getElement("result-message");

    if (element) {
        element.textContent = message;
    }
}

function getErrorMessage(error) {
    return error?.message || String(error || "Unbekannter Fehler");
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}


/* =========================================================
   4. LEVELNUMMER AUS URL
   ========================================================= */

function getLevelIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const rawValue = params.get("level");

    /*
     * Ohne Levelparameter mit Level 1 starten.
     */
    if (rawValue === null || rawValue.trim() === "") {
        return 1;
    }

    const rawLevel = Number(rawValue);

    if (
        !Number.isInteger(rawLevel) ||
        rawLevel < 1 ||
        rawLevel > TOTAL_CAMPAIGN_LEVELS
    ) {
        console.warn(
            `[Campaign] Ungültige Levelnummer "${rawValue}".`
        );

        return 1;
    }

    return rawLevel;
}


/* =========================================================
   5. FARBEN UND KOORDINATEN
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
    const neighbors = [
        { row: row - 1, col },
        { row: row + 1, col },
        { row, col: col - 1 },
        { row, col: col + 1 }
    ];

    return neighbors.filter(
        cell => isInsideBoard(cell.row, cell.col)
    );
}


/* =========================================================
   6. TERRAIN UND FÜLLZIEL
   ========================================================= */

/*
 * LEVEL.map ist das unveränderliche Originalterrain.
 * Hier lesen wir immer den ursprünglichen Feldtyp ab,
 * selbst wenn board bereits die aktuelle Füllfarbe enthält.
 */
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

/*
 * Wände # gehören nicht zum Füllziel.
 * Alle anderen Felder müssen am Ende übernommen sein.
 *
 * Verriegelte Felder ~ zählen zum Füllziel, werden aber
 * erst durch einen Schalter zugänglich.
 */
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

function calculateStars(
    filledCells,
    totalCells = getTotalCells()
) {
    const percent = calculateFilledPercent(
        filledCells,
        totalCells
    );

    if (percent >= 99.999) return 3;
    if (percent >= 75) return 2;
    if (percent >= 50) return 1;

    return 0;
}

function isBoardFull() {
    const total = getTotalCells();

    return total > 0 && ownedCells.size >= total;
}


/* =========================================================
   7. KARTENFELDER PARSEN
   ========================================================= */

/*
 * Unterstützt:
 *
 * ["0123", "1230", "2301"]
 *
 * sowie:
 *
 * [
 *   [0, 1, 2, 3],
 *   [1, 2, 3, 0]
 * ]
 *
 * und Karten mit Spezialzeichen:
 *
 * ["01#234", "1.@*23", "12=~34"]
 */
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

    /*
     * Ein einzelnes Ziffernzeichen bedeutet ein Farbfeld.
     */
    if (/^[0-9]$/.test(value)) {
        const color = Number(value);

        if (color < 0 || color >= colorCount) {
            throw new Error(
                `Farbe ${color} liegt außerhalb der ` +
                `${colorCount} erlaubten Farben.`
            );
        }

        return color;
    }

    /*
     * Andernfalls muss es ein bekanntes Spezialzeichen sein.
     */
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
                `Kartenzeile ${rowIndex + 1} hat ${values.length} ` +
                `Felder statt ${size}.`
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
   8. KARTEN UND SONDERFELDER VALIDIEREN
   ========================================================= */

function validateSpecialMap(map, size) {
    /*
     * Das Startfeld links oben muss eine Farbe sein.
     */
    if (typeof map[0][0] !== "number") {
        throw new Error(
            "Das Startfeld oben links muss ein Farbfeld sein. " +
            "Dort sind keine Spezialfelder erlaubt."
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
            `aber ${exitCount} Ausgänge (*). ` +
            "Jeder Eingang benötigt einen Ausgang."
        );
    }

    if (gateCount > 0 && switchCount === 0) {
        throw new Error(
            "Die Karte enthält verriegelte Felder (~), " +
            "aber keinen Schalter (=), der sie öffnen kann."
        );
    }
}


/* =========================================================
   9. TELEPORTER-PAARE ERZEUGEN
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

    for (let index = 0; index < entrances.length; index++) {
        targets.set(
            entrances[index],
            exits[index]
        );
    }

    return targets;
}


/* =========================================================
   10. LEVEL AUS SUPABASE LADEN
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
        throw new Error(
            `Ungültige Board-Größe: ${size}. ` +
            `Erlaubt sind maximal ${MAX_BOARD_SIZE} × ${MAX_BOARD_SIZE}.`
        );
    }

    if (
        !Number.isInteger(colors) ||
        colors < 2 ||
        colors > MAX_CAMPAIGN_COLORS ||
        colors > CAMPAIGN_COLORS.length
    ) {
        throw new Error(
            `Ungültige Farbanzahl: ${colors}. ` +
            `Erlaubt sind maximal ${MAX_CAMPAIGN_COLORS} Farben.`
        );
    }

    if (
        !Number.isInteger(moveLimit) ||
        moveLimit < 1 ||
        moveLimit > 100
    ) {
        throw new Error(
            `Ungültiges Zuglimit: ${moveLimit}.`
        );
    }

    const map = parseMapData(
        data.map_data,
        size,
        colors
    );

    const level = {
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

    return level;
}


/* =========================================================
   11. BENUTZER UND SPIELSTART
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

    if (!client || !currentUser || isRecordingStart) {
        return false;
    }

    isRecordingStart = true;

    try {
        const { error } = await client.rpc(
            "start_play_session",
            {
                p_game_mode: GAME_MODE
            }
        );

        if (error) {
            console.error(
                "[Campaign] Spielstart nicht gespeichert:",
                error
            );

            return false;
        }

        return true;
    } catch (error) {
        console.error(
            "[Campaign] Fehler beim Spielstart:",
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
        console.error(
            "[Campaign] Zug konnte nicht gespeichert werden."
        );

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
   12. SPIELBRETT INITIALISIEREN
   ========================================================= */

function initializeBoard() {
    if (!LEVEL) return;

    /*
     * Die sichtbare Farbmatrix wird aus dem unveränderlichen
     * Originalterrain kopiert.
     */
    board = LEVEL.map.map(row => [...row]);

    ownedCells = new Set([
        getCellKey(0, 0)
    ]);

    switchActivated = false;
    movesUsed = 0;
    selectedColor = board[0][0];

    /*
     * Beim Reset werden die Teleporterpaare erneut gesetzt.
     */
    teleportTargets = buildTeleportTargets();

    renderBoard();
    renderColorPicker();
    updateStats();
}


/* =========================================================
   13. DARSTELLUNG DER SPEZIALFELDER
   ========================================================= */

function getSpecialTileDescription(tile) {
    switch (tile) {
        case "#":
            return "Wand";

        case ".":
            return "Neutrales Feld";

        case "+":
            return "Brücke";

        case "=":
            return switchActivated
                ? "Aktivierter Schalter"
                : "Schalter";

        case "@":
            return "Teleporter-Eingang";

        case "*":
            return "Teleporter-Ausgang";

        case "~":
            return switchActivated
                ? "Geöffnetes Verriegelungsfeld"
                : "Verriegeltes Feld";

        case "^":
            return "Einbahnfeld nach oben";

        case "v":
            return "Einbahnfeld nach unten";

        case "<":
            return "Einbahnfeld nach links";

        case ">":
            return "Einbahnfeld nach rechts";

        default:
            return "Farbfeld";
    }
}

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

            /*
             * Besetzte Felder werden in der aktuellen
             * Füllfarbe dargestellt.
             *
             * Nicht besetzte Spezialfelder haben jeweils
             * eine eigene visuelle Farbe.
             */
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

                const glyph =
                    SPECIAL_TILE_GLYPHS[terrain] || terrain;

                cell.textContent = glyph;

                cell.style.display = "flex";
                cell.style.alignItems = "center";
                cell.style.justifyContent = "center";
                cell.style.fontWeight = "700";
                cell.style.fontSize =
                    LEVEL.size >= 16 ? "0.65rem" : "0.85rem";

                cell.style.color =
                    isOwned ? "#ffffff" : "#111827";

                /*
                 * Wände sind deutlich dunkler und zeigen,
                 * dass sie niemals beansprucht werden können.
                 */
                if (terrain === "#") {
                    cell.style.color = "#f9fafb";
                    cell.style.backgroundColor =
                        SPECIAL_TILE_COLORS["#"];
                }

                /*
                 * Verriegelte Felder werden nach Aktivierung
                 * heller dargestellt.
                 */
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

                cell.title = getSpecialTileDescription(terrain);
            } else {
                cell.title = getColorName(value);
            }

            if (row === 0 && col === 0) {
                cell.classList.add("start-cell");
            }

            const description = typeof terrain === "number"
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
   14. FARBWAHL
   ========================================================= */

function renderColorPicker() {
    if (!colorPickerElement || !LEVEL) return;

    colorPickerElement.innerHTML = "";

    for (let color = 0; color < LEVEL.colors; color++) {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "color-option";
        button.style.backgroundColor = getColorHex(color);
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

            button.classList.toggle("selected", isCurrent);

            button.setAttribute(
                "aria-pressed",
                String(isCurrent)
            );

            button.disabled =
                isGameOver ||
                isSavingResult ||
                isCurrent;
        });
}


/* =========================================================
   15. BEWEGUNGSRICHTUNG PRÜFEN
   ========================================================= */

/*
 * Ein besetztes Pfeilfeld kann nur in seine Pfeilrichtung
 * ausbreiten.
 */
function canMoveOutOfTile(row, col, deltaRow, deltaCol) {
    const sourceTile = getTerrain(row, col);

    if (!isArrowTile(sourceTile)) {
        return true;
    }

    const direction = ARROW_DIRECTIONS[sourceTile];

    return (
        deltaRow === direction.row &&
        deltaCol === direction.col
    );
}

/*
 * Ein Pfeilfeld kann nur betreten werden, wenn die
 * Bewegung auf dem Pfeil in dessen Richtung erfolgt.
 *
 * Beispiel:
 * Ein ^-Feld kann von unten nach oben betreten werden.
 */
function canEnterArrowTile(
    tile,
    deltaRow,
    deltaCol
) {
    if (!isArrowTile(tile)) {
        return true;
    }

    const direction = ARROW_DIRECTIONS[tile];

    return (
        deltaRow === direction.row &&
        deltaCol === direction.col
    );
}


/* =========================================================
   16. KANN EIN FELD BETRETEN WERDEN?
   ========================================================= */

function canEnterTile(
    row,
    col,
    deltaRow,
    deltaCol
) {
    const tile = getTerrain(row, col);

    /*
     * Wände blockieren immer.
     */
    if (tile === "#") {
        return false;
    }

    /*
     * Verriegelte Felder blockieren bis zum Schalter.
     */
    if (tile === "~" && !isGateOpen()) {
        return false;
    }

    /*
     * Pfeile müssen in Bewegungsrichtung betreten werden.
     */
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


/* =========================================================
   17. DARF EIN ERREICHTES FELD ÜBERNOMMEN WERDEN?
   ========================================================= */

function canCaptureTile(row, col, newColor) {
    const key = getCellKey(row, col);

    if (ownedCells.has(key)) {
        return false;
    }

    const tile = getTerrain(row, col);

    /*
     * Permanente Wand.
     */
    if (tile === "#") {
        return false;
    }

    /*
     * Verriegeltes Feld ohne aktivierten Schalter.
     */
    if (tile === "~" && !isGateOpen()) {
        return false;
    }

    /*
     * Neutrale Spezialfelder können unabhängig von ihrer
     * Farbe übernommen werden.
     */
    if (isNeutralTile(tile)) {
        return true;
    }

    /*
     * Geöffnete verriegelte Felder werden neutral.
     */
    if (tile === "~" && isGateOpen()) {
        return true;
    }

    /*
     * Pfeile können nur betreten werden, wenn die
     * Richtungsprüfung vorher erfolgreich war.
     */
    if (isArrowTile(tile)) {
        return true;
    }

    /*
     * Normales Farbfeld:
     * Es wird nur bei passender ausgewählter Farbe übernommen.
     */
    return (
        typeof board[row][col] === "number" &&
        board[row][col] === newColor
    );
}


/* =========================================================
   18. FELD ÜBERNEHMEN
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

    /*
     * Direkter Sicherheitscheck.
     */
    if (
        tile === "#" ||
        (tile === "~" && !isGateOpen())
    ) {
        return false;
    }

    ownedCells.add(key);
    board[row][col] = newColor;

    queue.push({ row, col });

    /*
     * SCHALTER:
     * Einmal aktiviert, öffnen sich alle Verriegelungen.
     */
    if (tile === "=" && !switchActivated) {
        switchActivated = true;

        console.info(
            "[Campaign] Schalter aktiviert: " +
            "Alle verriegelten Felder sind jetzt offen."
        );

        /*
         * Alle bisherigen eigenen Felder erneut untersuchen,
         * damit neu geöffnete Felder auch von bereits
         * vorhandenen Bereichen erreicht werden können.
         */
        for (const ownedKey of ownedCells) {
            queue.push(parseCellKey(ownedKey));
        }
    }

    /*
     * TELEPORTER:
     * Das Betreten von @ übernimmt automatisch den gepaarten
     * *-Ausgang und setzt dort die Flood-Fill-Ausbreitung fort.
     */
    if (tile === "@") {
        const exitKey = teleportTargets.get(key);

        if (exitKey) {
            const exitAlreadyOwned = ownedCells.has(exitKey);

            if (!exitAlreadyOwned) {
                const exit = parseCellKey(exitKey);
                const exitTerrain = getTerrain(
                    exit.row,
                    exit.col
                );

                if (exitTerrain === "*") {
                    ownedCells.add(exitKey);
                    board[exit.row][exit.col] = newColor;

                    queue.push({
                        row: exit.row,
                        col: exit.col
                    });

                    console.info(
                        "[Campaign] Teleporter aktiviert:",
                        key,
                        "->",
                        exitKey
                    );
                }
            }
        }
    }

    return true;
}


/* =========================================================
   19. FLOOD-FILL MIT SONDERFELDERN
   ========================================================= */

function floodFillTerritory(newColor) {
    if (!LEVEL || !board.length) return;

    const queue = [];

    /*
     * Bestehendes Territorium färbt sich komplett um.
     */
    for (const key of ownedCells) {
        const { row, col } = parseCellKey(key);

        board[row][col] = newColor;
        queue.push({ row, col });
    }

    let queueIndex = 0;

    while (queueIndex < queue.length) {
        const current = queue[queueIndex++];

        /*
         * Pfeile begrenzen die Ausbreitung von einem
         * bereits besetzten Pfeilfeld.
         */
        for (const neighbor of getNeighbors(
            current.row,
            current.col
        )) {
            const deltaRow = neighbor.row - current.row;
            const deltaCol = neighbor.col - current.col;

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

    /*
     * Alle eigenen Felder auf die aktuelle Farbe setzen.
     * Das Originalterrain in LEVEL.map bleibt unverändert.
     */
    for (const key of ownedCells) {
        const { row, col } = parseCellKey(key);
        board[row][col] = newColor;
    }
}


/* =========================================================
   20. FARBWAHL UND ZUGVERARBEITUNG
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

    /*
     * Keine Züge mit der bereits aktiven Farbe verbrauchen.
     */
    if (newColor === board[0][0]) {
        return;
    }

    movesUsed++;
    selectedColor = newColor;

    /*
     * Gesamtzugstatistik unabhängig vom Kampagnenabschluss.
     */
    void recordTotalMove();

    floodFillTerritory(newColor);

    renderBoard();
    updateStats();
    updateColorPickerSelection();

    if (
        isBoardFull() ||
        movesUsed >= LEVEL.moveLimit
    ) {
        void finishGame();
    }
}


/* =========================================================
   21. FÜLLSTAND UND SPIELSTATISTIK
   ========================================================= */

function toggleFilledDisplay() {
    showFilledPercent = !showFilledPercent;
    updateStats();
}

function updateStats() {
    if (!LEVEL) return;

    const filled = getFilledCellCount();
    const total = getTotalCells();

    const percent = calculateFilledPercent(
        filled,
        total
    );

    if (movesCounterElement) {
        movesCounterElement.textContent = String(movesUsed);
    }

    if (moveLimitElement) {
        moveLimitElement.textContent = String(LEVEL.moveLimit);
    }

    if (filledCounterElement) {
        filledCounterElement.textContent = showFilledPercent
            ? `${percent.toLocaleString("de-DE", {
                maximumFractionDigits: 1
            })} %`
            : `${filled} / ${total}`;

        filledCounterElement.style.cursor = "pointer";
        filledCounterElement.style.userSelect = "none";

        filledCounterElement.title =
            "Antippen, um zwischen Feldern und Prozent zu wechseln";

        filledCounterElement.setAttribute("role", "button");
        filledCounterElement.setAttribute("tabindex", "0");

        filledCounterElement.setAttribute(
            "aria-label",
            showFilledPercent
                ? "Füllstand in Prozent. Antippen für Feldanzahl."
                : "Füllstand als Feldanzahl. Antippen für Prozent."
        );
    }

    if (levelTitleElement) {
        levelTitleElement.textContent = LEVEL.name;
    }

    const progressBar = getElement(
        "campaign-game-progress-bar"
    );

    if (progressBar) {
        progressBar.style.width = `${percent}%`;

        progressBar.setAttribute(
            "aria-valuenow",
            String(Math.round(percent))
        );

        progressBar.setAttribute("aria-valuemin", "0");
        progressBar.setAttribute("aria-valuemax", "100");
        progressBar.setAttribute("role", "progressbar");
    }

    /*
     * Optionaler Hinweis für Karten mit Schalter.
     * Falls du ein HTML-Element mit dieser ID anlegst,
     * wird dort der Status angezeigt.
     */
    const switchStatus = getElement("campaign-switch-status");

    if (switchStatus) {
        const hasSwitch = LEVEL.map.some(row =>
            row.includes("=")
        );

        switchStatus.textContent = !hasSwitch
            ? ""
            : switchActivated
                ? "Schalter aktiviert – Verriegelungen geöffnet"
                : "Schalter noch nicht aktiviert";
    }
}


/* =========================================================
   22. ERGEBNISANZEIGE
   ========================================================= */

function renderResultStars(stars) {
    const safeStars = clamp(
        Math.trunc(Number(stars) || 0),
        0,
        MAX_STARS_PER_LEVEL
    );

    for (let i = 1; i <= MAX_STARS_PER_LEVEL; i++) {
        const element = getElement(`result-star-${i}`);

        if (!element) continue;

        const active = i <= safeStars;

        element.classList.toggle("star-active", active);
        element.classList.toggle("star-inactive", !active);

        element.textContent = active ? "★" : "☆";
    }
}

function setResultText(id, value) {
    const element = getElement(id);

    if (element) {
        element.textContent = String(value ?? "");
    }
}

function showResultOverlay() {
    if (!resultOverlayElement) return;

    resultOverlayElement.hidden = false;

    resultOverlayElement.classList.remove("hidden");
    resultOverlayElement.classList.add("active", "show");

    resultOverlayElement.setAttribute("aria-hidden", "false");
    resultOverlayElement.style.display = "grid";
    resultOverlayElement.style.visibility = "visible";
    resultOverlayElement.style.opacity = "1";
}

function hideResultOverlay() {
    if (!resultOverlayElement) return;

    resultOverlayElement.classList.remove("active", "show");
    resultOverlayElement.classList.add("hidden");

    resultOverlayElement.setAttribute("aria-hidden", "true");
    resultOverlayElement.style.display = "none";
    resultOverlayElement.style.visibility = "hidden";
    resultOverlayElement.style.opacity = "0";
    resultOverlayElement.hidden = true;
}


/* =========================================================
   23. KAMPAGNENERGEBNIS SPEICHERN
   ========================================================= */

async function saveCampaignResult(
    moves,
    filledCells
) {
    const client = getSupabaseClient();

    const totalCells = getTotalCells();

    const percent = calculateFilledPercent(
        filledCells,
        totalCells
    );

    const localStars = calculateStars(
        filledCells,
        totalCells
    );

    if (!client || !currentUser || !LEVEL) {
        return {
            saved: false,
            percent,
            stars: localStars,
            completed: false,
            error: "Du bist nicht angemeldet."
        };
    }

    try {
        /*
         * HINWEIS FÜR DIE DATENBANK:
         * Die RPC muss bei Sonderfeldern # als Wand erkennen
         * und diese beim Füllziel ausschließen.
         *
         * p_filled_cells = tatsächlich übernommene Felder,
         * ohne massive Wände.
         */
        const { data, error } = await client.rpc(
            "complete_campaign_level_with_stars",
            {
                p_level_id: LEVEL.id,
                p_moves: moves,
                p_filled_cells: filledCells
            }
        );

        if (error) {
            throw error;
        }

        const returnedStars = Number(data?.stars);

        const stars = Number.isFinite(returnedStars)
            ? clamp(
                Math.floor(returnedStars),
                0,
                MAX_STARS_PER_LEVEL
            )
            : localStars;

        return {
            saved: true,
            percent: Number.isFinite(
                Number(data?.filled_percent)
            )
                ? Number(data.filled_percent)
                : percent,
            stars,
            completed: data?.completed === true,
            data,
            error: null
        };
    } catch (error) {
        console.error(
            "[Campaign] Kampagnenspeicherung fehlgeschlagen:",
            error
        );

        return {
            saved: false,
            percent,
            stars: localStars,
            completed: false,
            error: getErrorMessage(error)
        };
    }
}


/* =========================================================
   24. NÄCHSTE LEVEL FREISCHALTEN
   ========================================================= */

async function unlockCampaignLevels(completedLevelId) {
    const client = getSupabaseClient();

    if (!client || !currentUser) {
        throw new Error("Kein angemeldeter Benutzer.");
    }

    const levelId = Number(completedLevelId);

    if (
        !Number.isInteger(levelId) ||
        levelId < 1 ||
        levelId > TOTAL_CAMPAIGN_LEVELS
    ) {
        throw new Error("Ungültige Kampagnenlevel-ID.");
    }

    /*
     * Die SQL-Funktion unlock_campaign_levels muss
     * ebenfalls Level bis einschließlich 210 erlauben.
     */
    const { data, error } = await client.rpc(
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

    console.info(
        "[Campaign] Freischaltungen gespeichert:",
        data
    );

    return data;
}


/* =========================================================
   25. EINMALIGE KAMPAGNEN-XP
   ========================================================= */

async function awardCampaignLevelXP(levelId) {
    const client = getSupabaseClient();

    if (!client || !currentUser) {
        throw new Error("Kein angemeldeter Benutzer.");
    }

    const parsedLevelId = Number(levelId);

    if (
        !Number.isInteger(parsedLevelId) ||
        parsedLevelId < 1 ||
        parsedLevelId > TOTAL_CAMPAIGN_LEVELS
    ) {
        throw new Error("Ungültige Kampagnenlevel-ID.");
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

    const reward = {
        awarded: data?.awarded === true,
        xpAwarded: Number(data?.xp_awarded ?? 0),
        levelId: parsedLevelId,
        message: data?.message ?? null
    };

    console.info(
        "[Campaign] Ergebnis der einmaligen XP-Vergabe:",
        reward
    );

    return reward;
}


/* =========================================================
   26. PROFILSTATISTIK SPEICHERN — OHNE XP
   ========================================================= */

async function saveCampaignModeStats(
    moves,
    filledCells,
    result
) {
    const client = getSupabaseClient();

    if (!client || !currentUser || !result?.saved) {
        return {
            saved: false,
            xp: 0,
            error: "Kampagnenfortschritt wurde nicht gespeichert."
        };
    }

    const percent = calculateFilledPercent(
        filledCells,
        getTotalCells()
    );

    try {
        const { error } = await client.rpc(
            "save_play_result_by_mode",
            {
                p_game_mode: GAME_MODE,
                p_moves: Math.max(
                    0,
                    Math.trunc(Number(moves) || 0)
                ),
                p_filled_percent: Number(percent.toFixed(2)),
                p_won: result.completed === true,

                /*
                 * Kampagnen-XP werden ausschließlich
                 * über award_campaign_level_xp vergeben.
                 */
                p_xp: 0,

                p_stars: clamp(
                    Math.trunc(Number(result.stars) || 0),
                    0,
                    MAX_STARS_PER_LEVEL
                )
            }
        );

        if (error) {
            throw error;
        }

        return {
            saved: true,
            xp: 0,
            error: null
        };
    } catch (error) {
        console.error(
            "[Campaign] Profilstatistik fehlgeschlagen:",
            error
        );

        return {
            saved: false,
            xp: 0,
            error: getErrorMessage(error)
        };
    }
}


/* =========================================================
   27. SPIEL ABSCHLIESSEN
   ========================================================= */

async function finishGame() {
    if (
        isGameOver ||
        isSavingResult ||
        !LEVEL
    ) {
        return;
    }

    isGameOver = true;
    isSavingResult = true;

    updateColorPickerSelection();

    const filledCells = getFilledCellCount();
    const totalCells = getTotalCells();

    const percent = calculateFilledPercent(
        filledCells,
        totalCells
    );

    const localStars = calculateStars(
        filledCells,
        totalCells
    );

    let result = {
        saved: false,
        percent,
        stars: localStars,
        completed: false,
        error: null
    };

    let statsResult = {
        saved: false,
        xp: 0,
        error: null
    };

    let unlockResult = {
        saved: false,
        error: null
    };

    let rewardResult = {
        awarded: false,
        xpAwarded: 0,
        error: null
    };

    try {
        /*
         * 1. Levelergebnis speichern.
         */
        result = await saveCampaignResult(
            movesUsed,
            filledCells
        );

        /*
         * 2. Spielstatistik speichern.
         *    Hier werden keine XP vergeben.
         */
        if (result.saved) {
            statsResult = await saveCampaignModeStats(
                movesUsed,
                filledCells,
                result
            );
        }

        /*
         * 3. Nur bei erfolgreichem, gespeichertem
         *    Abschluss Level freischalten und XP anfordern.
         */
        if (result.saved && result.completed) {
            try {
                await unlockCampaignLevels(LEVEL.id);

                unlockResult.saved = true;
            } catch (error) {
                unlockResult.error = getErrorMessage(error);

                console.error(
                    "[Campaign] Freischaltung fehlgeschlagen:",
                    error
                );
            }

            try {
                rewardResult = await awardCampaignLevelXP(
                    LEVEL.id
                );

                if (rewardResult.awarded) {
                    console.info(
                        `[Campaign] ${rewardResult.xpAwarded} XP ` +
                        `für Level ${LEVEL.id} vergeben.`
                    );
                } else {
                    console.info(
                        `[Campaign] Keine neuen XP für Level ${LEVEL.id}:`,
                        rewardResult.message
                    );
                }
            } catch (error) {
                rewardResult.error = getErrorMessage(error);

                console.error(
                    "[Campaign] XP konnten nicht vergeben werden:",
                    error
                );
            }
        }

        /*
         * 4. Spieler-Levelaufstieg prüfen.
         */
        if (
            statsResult.saved &&
            window.LevelSystem &&
            typeof window.LevelSystem.checkForLevelUp === "function"
        ) {
            try {
                await window.LevelSystem.checkForLevelUp();
            } catch (error) {
                console.error(
                    "[Campaign] Levelaufstieg konnte nicht geprüft werden:",
                    error
                );
            }
        }

        /*
         * 5. Ergebnis darstellen.
         */
        const completed =
            result.saved &&
            result.completed === true;

        const xpEarned = rewardResult.awarded
            ? rewardResult.xpAwarded
            : 0;

        renderResultStars(result.stars);

        setResultText(
            "result-icon",
            completed ? "🏆" : "🎨"
        );

        setResultText(
            "result-title",
            completed ? "Level geschafft!" : "Versuch beendet"
        );

        setResultText(
            "result-description",
            `${percent.toLocaleString("de-DE", {
                maximumFractionDigits: 1
            })} % der erreichbaren Karte gefüllt.`
        );

        setResultText(
            "result-moves",
            movesUsed
        );

        setResultText(
            "result-xp",
            `+${xpEarned} XP`
        );

        /*
         * 6. Statusmeldung erstellen.
         */
        let message;

        if (!result.saved) {
            message =
                "Kampagnenfortschritt konnte nicht gespeichert werden: " +
                (result.error || "Unbekannter Fehler");
        } else if (!statsResult.saved) {
            message =
                "Level-Ergebnis gespeichert, aber die Spielstatistik " +
                "konnte nicht gespeichert werden: " +
                (statsResult.error || "Unbekannter Fehler");
        } else if (!completed) {
            message =
                `${result.stars} von 3 Sternen · ` +
                `${percent.toLocaleString("de-DE", {
                    maximumFractionDigits: 1
                })} % gefüllt.`;
        } else if (rewardResult.error) {
            message =
                `${result.stars} von 3 Sternen. ` +
                "Die XP-Vergabe konnte nicht bestätigt werden.";
        } else if (rewardResult.awarded) {
            message =
                `${result.stars} von 3 Sternen · ` +
                `+${xpEarned} XP erhalten!`;
        } else {
            message =
                `${result.stars} von 3 Sternen · ` +
                "Die XP für dieses Level wurden bereits vergeben.";
        }

        if (completed && !unlockResult.saved) {
            message +=
                " Die nächsten Level konnten nicht freigeschaltet werden.";
        }

        setResultText(
            "result-message",
            message
        );

        /*
         * 7. Nächster-Level-Button.
         */
        const nextButton = getElement("next-level-button");
        const hasNextLevel = LEVEL.id < TOTAL_CAMPAIGN_LEVELS;

        if (nextButton) {
            const canGoNext = completed && hasNextLevel;

            nextButton.hidden = !canGoNext;
            nextButton.disabled = !canGoNext;
        }

        showResultOverlay();

        console.info(
            "[Campaign] Spielabschluss verarbeitet:",
            {
                level: LEVEL.id,
                filledCells,
                totalFillableCells: totalCells,
                percent,
                stars: result.stars,
                configuredXpReward: LEVEL.xp,
                newlyAwardedXp: xpEarned,
                campaignSaved: result.saved,
                completed: result.completed,
                statsSaved: statsResult.saved,
                unlockSaved: unlockResult.saved,
                rewardAwarded: rewardResult.awarded,
                rewardError: rewardResult.error
            }
        );
    } catch (error) {
        console.error(
            "[Campaign] Fehler beim Abschließen:",
            error
        );

        setResultText(
            "result-message",
            "Beim Speichern ist ein Fehler aufgetreten: " +
            getErrorMessage(error)
        );

        showResultOverlay();
    } finally {
        isSavingResult = false;
        updateColorPickerSelection();
    }
}


/* =========================================================
   28. RESET UND NAVIGATION
   ========================================================= */

async function resetLevel() {
    if (isSavingResult || !LEVEL) return;

    isGameOver = false;
    movesUsed = 0;
    selectedColor = null;

    switchActivated = false;

    hideResultOverlay();
    initializeBoard();

    await recordCampaignStart();
}

function navigateToMenu() {
    window.location.href = "campaign.html";
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
        element.addEventListener("click", callback);
    }
}


/* =========================================================
   29. INITIALISIERUNG
   ========================================================= */

async function initializeCampaignGame() {
    if (isInitialized) return;

    isInitialized = true;

    gameBoardElement = getElement("game-board");
    colorPickerElement = getElement("color-picker");

    movesCounterElement = getElement("moves-counter");
    moveLimitElement = getElement("move-limit");

    filledCounterElement = getElement("filled-counter");
    levelTitleElement = getElement("level-title");

    resultOverlayElement = getElement("game-result");

    /*
     * Navigation und Schaltflächen verbinden.
     */
    bindButton("back-button", navigateToMenu);
    bindButton("result-menu-button", navigateToMenu);

    bindButton("reset-button", resetLevel);
    bindButton("restart-button", resetLevel);
    bindButton("restart-result-button", resetLevel);

    bindButton("next-level-button", navigateToNextLevel);

    /*
     * Füllstand umschalten: Felder / Prozent.
     */
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

    /*
     * Spielfeld und Farbauswahl müssen vorhanden sein.
     */
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

    const client = getSupabaseClient();

    if (!client || !client.auth) {
        showMessage(
            "Supabase ist nicht initialisiert."
        );

        return;
    }

    try {
        /*
         * Benutzer laden.
         */
        currentUser = await getAuthenticatedUser();

        if (!currentUser) {
            showMessage(
                "Bitte melde dich an, um die Kampagne zu spielen."
            );

            window.location.href = "login.html";
            return;
        }

        /*
         * Level anhand der URL laden.
         */
        const levelId = getLevelIdFromUrl();

        LEVEL = await loadCampaignLevel(levelId);

        /*
         * Teleporterpaare werden vor Spielstart geprüft.
         */
        teleportTargets = buildTeleportTargets();

        document.title =
            `${LEVEL.name} – Filler: Color Fill`;

        /*
         * Status zurücksetzen und Spiel darstellen.
         */
        isGameOver = false;
        isSavingResult = false;
        switchActivated = false;

        hideResultOverlay();
        initializeBoard();

        /*
         * Spielstart registrieren.
         */
        await recordCampaignStart();

        console.info(
            `[Campaign] Level ${LEVEL.id} geladen.`,
            {
                name: LEVEL.name,
                size: LEVEL.size,
                colors: LEVEL.colors,
                moveLimit: LEVEL.moveLimit,
                xp: LEVEL.xp,
                fillableCells: getTotalCells(),
                wallCells:
                    LEVEL.size * LEVEL.size - getTotalCells(),
                specialFields: countSpecialFields()
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
   30. SPEZIALFELDER ZÄHLEN
   ========================================================= */

function countSpecialFields() {
    if (!LEVEL) {
        return {};
    }

    const counts = {};

    for (const row of LEVEL.map) {
        for (const tile of row) {
            if (typeof tile === "string") {
                counts[tile] = (counts[tile] || 0) + 1;
            }
        }
    }

    return counts;
}


/* =========================================================
   31. START
   ========================================================= */

if (document.readyState === "loading") {
    document.addEventListener(
        "DOMContentLoaded",
        initializeCampaignGame,
        { once: true }
    );
} else {
    void initializeCampaignGame();
}