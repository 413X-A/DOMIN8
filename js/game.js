"use strict";

/* =========================================
   FILLER: COLOR FILL — PLAY-MODUS
   Mit XP- und Levelsystem
   ========================================= */

// =========================================
// GRUNDEINSTELLUNGEN
// =========================================

const BOARD_SIZE = 18;
const COLOR_COUNT = 12;
const MOVE_LIMIT = 70;

const COLORS = [
    "#ef4444", "#3b82f6", "#22c55e", "#eab308",
    "#a855f7", "#f97316", "#ec4899", "#06b6d4",
    "#84cc16", "#8b5e3c", "#64748b", "#f43f5e"
];

// =========================================
// HTML-ELEMENTE
// =========================================

const elements = {
    backButton: document.getElementById("back-button"),
    levelTitle: document.getElementById("level-title"),
    resetButton: document.getElementById("reset-button"),
    movesCounter: document.getElementById("moves-counter"),
    moveLimit: document.getElementById("move-limit"),
    filledCounter: document.getElementById("filled-counter"),
    gameBoard: document.getElementById("game-board"),
    colorPicker: document.getElementById("color-picker"),
    restartButton: document.getElementById("restart-button"),
    gameResult: document.getElementById("game-result"),
    resultIcon: document.getElementById("result-icon"),
    resultTitle: document.getElementById("result-title"),
    resultDescription: document.getElementById("result-description"),
    resultStar1: document.getElementById("result-star-1"),
    resultStar2: document.getElementById("result-star-2"),
    resultStar3: document.getElementById("result-star-3"),
    resultMoves: document.getElementById("result-moves"),
    resultXp: document.getElementById("result-xp"),
    resultMessage: document.getElementById("result-message"),
    restartResultButton: document.getElementById("restart-result-button"),
    nextLevelButton: document.getElementById("next-level-button"),
    resultMenuButton: document.getElementById("result-menu-button")
};

// =========================================
// SPIELZUSTAND
// =========================================

let board = [];
let moves = 0;
let gameOver = false;
let currentColor = 0;
let colorButtons = [];
let ownedCells = new Set();

let currentUser = null;
let activeBoardId = null;
let savedProgress = null;

let isSavingResult = false;
let boardResultSaved = false;
let isStartingBoard = false;
let showFilledPercent = false;

// =========================================
// SUPABASE
// =========================================

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


/* =========================================
   GESAMTZÜGE SOFORT SPEICHERN
   ========================================= */


async function recordTotalMove() {
    const client = getSupabaseClient();

    if (!client || !currentUser) {
        return;
    }

    const { error } = await client.rpc("record_play_move", {
        p_game_mode: "infinite"
    });

    if (error) {
        return;
    }
}



// =========================================
// LEVELSYSTEM
// Level 1 = 0 XP
// Level 2 = 100 XP
// Level 3 = 300 XP
// Level 4 = 600 XP
// =========================================

function getXPForLevel(level) {
    const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
    return 50 * (safeLevel - 1) * safeLevel;
}

function getLevelFromXP(xp) {
    const safeXP = Math.max(0, Number(xp) || 0);

    // Inverse der Formel: XP = 50 * Level * (Level - 1)
    return Math.max(
        1,
        Math.floor((1 + Math.sqrt(1 + safeXP / 12.5)) / 2)
    );
}

function getLevelProgress(xp) {
    const safeXP = Math.max(0, Number(xp) || 0);
    const level = getLevelFromXP(safeXP);
    const currentLevelXP = getXPForLevel(level);
    const nextLevelXP = getXPForLevel(level + 1);
    const xpIntoLevel = safeXP - currentLevelXP;
    const xpNeeded = nextLevelXP - currentLevelXP;

    return {
        level,
        totalXP: safeXP,
        currentLevelXP,
        nextLevelXP,
        xpIntoLevel,
        xpNeeded,
        percent: xpNeeded > 0
            ? Math.min(100, Math.max(0, xpIntoLevel / xpNeeded * 100))
            : 0
    };
}

// =========================================
// FORTSCHRITT LADEN
// =========================================

async function initializePlayProgress() {
    const client = getSupabaseClient();

    if (!client) {
        showProgressMessage(
            "Offline-Modus: Statistiken werden nicht gespeichert."
        );
        return;
    }

    try {
        const {
            data: { user },
            error: authError
        } = await client.auth.getUser();

        if (authError) {
            showProgressMessage("Anmeldung konnte nicht geprüft werden.");
            return;
        }

        currentUser = user || null;

        if (!currentUser) {
            showProgressMessage(
                "Melde dich an, damit deine PLAY-Statistiken gespeichert werden."
            );
            return;
        }

        const { data, error } = await client
            .from("play_progress")
            .select("*")
            .eq("user_id", currentUser.id)
            .maybeSingle();

        if (error) {
            showProgressMessage(
                "Deine bisherigen Statistiken konnten nicht geladen werden."
            );
            return;
        }

        savedProgress = data;

        if (savedProgress) {
            displayProgress(savedProgress);
        } else {
            showProgressMessage("Dein PLAY-Fortschritt startet bei 0.");
        }
    } catch (error) {
        showProgressMessage("Fortschritt konnte nicht geladen werden.");
    }
}

// =========================================
// STATISTIKEN ANZEIGEN
// =========================================

function showProgressMessage(message) {
    const element = document.getElementById("play-progress-summary");

    if (element) {
        element.textContent = message;
    }
}

function displayProgress(progress) {
    if (!progress) return;

    const totalXP = Math.max(0, Number(progress.total_xp) || 0);
    const levelData = getLevelProgress(totalXP);

    const summary = [
        `Gespielt: ${Number(progress.boards_started) || 0}`,
        `Beendet: ${Number(progress.boards_completed) || 0}`,
        `Siege: ${Number(progress.boards_won) || 0}`,
        `Beste Züge: ${progress.best_moves ?? "–"}`,
        `Gesamt-XP: ${totalXP}`,
        `Level: ${levelData.level}`,
        `Level-Fortschritt: ${levelData.xpIntoLevel}/${levelData.xpNeeded} XP`,
        `Gesamtsterne: ${Number(progress.total_stars) || 0}`
    ].join(" | ");

    showProgressMessage(summary);
}

// =========================================
// SPIEL INITIALISIEREN
// =========================================

async function initGame() {
    if (!elements.gameBoard || !elements.colorPicker) {
        return;
    }

    if (elements.levelTitle) {
        elements.levelTitle.textContent = "PLAY";
    }

    if (elements.moveLimit) {
        elements.moveLimit.textContent = String(MOVE_LIMIT);
    }

    if (elements.nextLevelButton) {
        elements.nextLevelButton.hidden = true;
    }

    elements.gameBoard.classList.add("play-board");
    elements.colorPicker.classList.add("play-color-picker");

    bindEvents();
    hideResult();
    createColorPicker();

    await initializePlayProgress();
    await restartGame();
}

// =========================================
// EVENTS
// =========================================

function bindEvents() {
    elements.backButton?.addEventListener("click", goBackToMenu);
    elements.resetButton?.addEventListener("click", restartGame);
    elements.restartButton?.addEventListener("click", restartGame);
    elements.restartResultButton?.addEventListener("click", restartGame);
    elements.resultMenuButton?.addEventListener("click", goToMainMenu);

    elements.filledCounter?.addEventListener("click", toggleFilledDisplay);

    elements.filledCounter?.addEventListener("keydown", event => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            toggleFilledDisplay();
        }
    });
}

function toggleFilledDisplay() {
    showFilledPercent = !showFilledPercent;
    updateStats();
}

// =========================================
// NEUES BOARD STARTEN
// =========================================

async function restartGame() {
    if (isSavingResult || isStartingBoard) return;

    isStartingBoard = true;

    [
        elements.resetButton,
        elements.restartButton,
        elements.restartResultButton
    ].forEach(button => {
        if (button) button.disabled = true;
    });

    hideResult();

    try {
        activeBoardId = null;

        const client = getSupabaseClient();

        if (client && currentUser) {
            const { data, error } = await client.rpc("start_play_board");

            if (error) {
                showProgressMessage(
                    "Board läuft, aber der Start konnte nicht gespeichert werden."
                );
            } else {
                savedProgress = data;
                activeBoardId = data?.board_id || null;
                displayProgress(savedProgress);
            }
        }

        createBoard();
    } catch (error) {
        createBoard();
    } finally {
        isStartingBoard = false;

        [
            elements.resetButton,
            elements.restartButton,
            elements.restartResultButton
        ].forEach(button => {
            if (button) button.disabled = false;
        });
    }
}

// =========================================
// BOARD ERSTELLEN
// =========================================

function createBoard() {
    board = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
        const boardRow = [];

        for (let col = 0; col < BOARD_SIZE; col++) {
            boardRow.push(Math.floor(Math.random() * COLOR_COUNT));
        }

        board.push(boardRow);
    }

    moves = 0;
    gameOver = false;
    isSavingResult = false;
    boardResultSaved = false;

    ownedCells = new Set(["0,0"]);
    currentColor = board[0][0];

    renderBoard();
    updateColorPicker();
    updateStats();
}

// =========================================
// SPIELFELD ZEICHNEN
// =========================================

function renderBoard() {
    if (!elements.gameBoard) return;

    elements.gameBoard.innerHTML = "";
    elements.gameBoard.style.display = "grid";
    elements.gameBoard.style.gridTemplateColumns =
        `repeat(${BOARD_SIZE}, minmax(0, 1fr))`;
    elements.gameBoard.style.gridTemplateRows =
        `repeat(${BOARD_SIZE}, minmax(0, 1fr))`;

    const fragment = document.createDocumentFragment();

    for (let row = 0; row < BOARD_SIZE; row++) {
        for (let col = 0; col < BOARD_SIZE; col++) {
            const cell = document.createElement("div");
            const key = getCellKey(row, col);

            cell.className = "game-cell";
            cell.style.backgroundColor = COLORS[board[row][col]];
            cell.dataset.row = String(row);
            cell.dataset.col = String(col);
            cell.setAttribute("aria-hidden", "true");
            cell.style.border = "1px solid rgba(8, 8, 12, 0.7)";
            cell.style.boxSizing = "border-box";

            if (ownedCells.has(key)) cell.classList.add("owned");

            if (row === 0 && col === 0) {
                cell.classList.add("start-cell");
            }

            fragment.appendChild(cell);
        }
    }

    elements.gameBoard.appendChild(fragment);
}

function getCellKey(row, col) {
    return `${row},${col}`;
}

// =========================================
// FARBWAHL
// =========================================

function createColorPicker() {
    if (!elements.colorPicker) return;

    elements.colorPicker.innerHTML = "";
    colorButtons = [];

    COLORS.forEach((color, index) => {
        const button = document.createElement("button");

        button.type = "button";
        button.className = "color-option";
        button.style.backgroundColor = color;
        button.dataset.color = String(index);
        button.setAttribute("aria-label", `Farbe ${index + 1}`);
        button.setAttribute("aria-pressed", "false");

        // Keine Farbe beim Erstellen sperren.
        button.disabled = false;

        button.addEventListener("click", () => chooseColor(index));

        elements.colorPicker.appendChild(button);
        colorButtons.push(button);
    });

    updateColorPicker();
}

function updateColorPicker() {
    colorButtons.forEach((button, index) => {
        const selected = index === currentColor;

        button.classList.toggle("selected", selected);
        button.disabled = gameOver || isSavingResult;
        button.setAttribute("aria-pressed", String(selected));
    });
}

// =========================================
// FARBE WÄHLEN
// =========================================

// =========================================
// FARBE WÄHLEN
// =========================================

function chooseColor(newColor) {
    if (gameOver || isSavingResult) return;
    if (!Number.isInteger(newColor)) return;
    if (newColor < 0 || newColor >= COLOR_COUNT) return;

    /*
     * Beim ersten Zug darf auch die Anfangsfarbe gewählt werden.
     * Ab dem zweiten Zug werden Züge mit derselben Farbe ignoriert.
     */
    if (newColor === currentColor && moves > 0) return;

    moves++;

    // Gesamtzug sofort in Supabase speichern
    void recordTotalMove();

    currentColor = newColor;

    // Auch bei der Anfangsfarbe zusammenhängende Felder erobern.
    floodFill(newColor);

    renderBoard();
    updateColorPicker();
    updateStats();

    if (isBoardFilled() || moves >= MOVE_LIMIT) {
        finishGame();
    }
}

// =========================================
// FLOOD FILL
// =========================================

function floodFill(newColor) {
    if (!board.length || !ownedCells) return;

    const rows = board.length;

    // Startfeld sicherstellen, falls noch kein Feld beansprucht wurde.
    if (ownedCells.size === 0) {
        ownedCells.add(getCellKey(0, 0));
    }

    // Bereits eigene Felder auf die neue Farbe setzen.
    for (const key of ownedCells) {
        const [row, col] = key.split(",").map(Number);
        board[row][col] = newColor;
    }

    const queue = [];
    const visited = new Set();

    for (const key of ownedCells) {
        const [row, col] = key.split(",").map(Number);
        queue.push([row, col]);
        visited.add(key);
    }

    let queueIndex = 0;

    // Zusammenhängende Felder der gewählten Farbe erobern.
    while (queueIndex < queue.length) {
        const [row, col] = queue[queueIndex++];

        const neighbors = [
            [row - 1, col],
            [row + 1, col],
            [row, col - 1],
            [row, col + 1]
        ];

        for (const [nextRow, nextCol] of neighbors) {
            if (
                nextRow < 0 ||
                nextRow >= rows ||
                nextCol < 0 ||
                nextCol >= board[nextRow].length
            ) {
                continue;
            }

            const key = getCellKey(nextRow, nextCol);

            if (visited.has(key)) continue;
            visited.add(key);

            if (board[nextRow][nextCol] !== newColor) continue;

            ownedCells.add(key);
            queue.push([nextRow, nextCol]);
        }
    }

    // Alle eigenen Felder abschließend einfärben.
    for (const key of ownedCells) {
        const [row, col] = key.split(",").map(Number);
        board[row][col] = newColor;
    }
}

// =========================================
// STATISTIKEN AKTUALISIEREN
// =========================================

function updateStats() {
    if (elements.movesCounter) {
        elements.movesCounter.textContent = String(moves);
    }

    if (elements.moveLimit) {
        elements.moveLimit.textContent = String(MOVE_LIMIT);
    }

    if (elements.filledCounter) {
        const totalCells = BOARD_SIZE * BOARD_SIZE;
        const filledCells = countFilledCells();
        const percent = getFilledPercent();

        elements.filledCounter.textContent = showFilledPercent
            ? `${percent.toLocaleString("de-DE", {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1
            })} %`
            : `${filledCells} / ${totalCells}`;

        elements.filledCounter.style.cursor = "pointer";
        elements.filledCounter.style.userSelect = "none";
        elements.filledCounter.style.webkitTapHighlightColor = "transparent";
        elements.filledCounter.title =
            "Antippen, um zwischen Feldern und Prozent zu wechseln";
        elements.filledCounter.setAttribute("role", "button");
        elements.filledCounter.setAttribute("tabindex", "0");
        elements.filledCounter.setAttribute(
            "aria-pressed",
            String(showFilledPercent)
        );
        elements.filledCounter.setAttribute(
            "aria-label",
            showFilledPercent
                ? "Füllstand in Prozent. Antippen für Feldanzahl."
                : "Füllstand als Feldanzahl. Antippen für Prozent."
        );
    }
}

function countFilledCells() {
    return ownedCells.size;
}

function getFilledPercent() {
    return countFilledCells() / (BOARD_SIZE * BOARD_SIZE) * 100;
}

function isBoardFilled() {
    return countFilledCells() >= BOARD_SIZE * BOARD_SIZE;
}

// =========================================
// STERNE UND XP
// =========================================

// =========================================
// STERNE UND XP
// =========================================

function calculateStars(filledPercent) {
    const percent = Number(filledPercent) || 0;

    if (percent >= 100) {
        return 3;
    }

    if (percent >= 75) {
        return 2;
    }

    if (percent >= 50) {
        return 1;
    }

    return 0;
}

function calculateXP(filledPercent) {
    return Math.floor(filledPercent / 5);
}

function setStars(stars) {
    const safeStars = Math.max(
        0,
        Math.min(3, Number(stars) || 0)
    );

    [
        elements.resultStar1,
        elements.resultStar2,
        elements.resultStar3
    ].forEach((star, index) => {
        if (!star) return;

        const active = index < safeStars;

        star.textContent = active ? "★" : "☆";

        star.classList.toggle(
            "star-active",
            active
        );

        star.classList.toggle(
            "star-inactive",
            !active
        );

        star.style.color =
            active ? "#ffd166" : "#777777";

        star.style.opacity =
            active ? "1" : "0.55";
    });
}

// =========================================
// ERGEBNIS-OVERLAY
// =========================================

function showResult() {
    const overlay = elements.gameResult;
    if (!overlay) return;

    overlay.hidden = false;
    overlay.classList.remove("hidden");
    overlay.classList.add("active", "show");
    overlay.setAttribute("aria-hidden", "false");
    overlay.style.display = "grid";
    overlay.style.visibility = "visible";
    overlay.style.opacity = "1";
}

function hideResult() {
    const overlay = elements.gameResult;
    if (!overlay) return;

    overlay.classList.remove("active", "show");
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.display = "none";
    overlay.style.visibility = "hidden";
    overlay.style.opacity = "0";
    overlay.hidden = true;
}

// =========================================
// ERGEBNIS SPEICHERN
// =========================================

async function savePlayResult({ moves: moveCount, filledCells, totalCells }) {
    const client = getSupabaseClient();

    if (!client || !currentUser) {
        return {
            saved: false,
            message: "Nicht angemeldet – Ergebnis nicht online gespeichert."
        };
    }

    if (!activeBoardId) {
        return {
            saved: false,
            message: "Der Board-Start wurde nicht registriert."
        };
    }

    const { data, error } = await client.rpc("save_play_result", {
        p_board_id: activeBoardId,
        p_moves: moveCount,
        p_filled_cells: filledCells,
        p_total_cells: totalCells
    });

    if (error) {
        return {
            saved: false,
            message: `Speichern fehlgeschlagen: ${error.message}`
        };
    }

    savedProgress = data;
    activeBoardId = null;
    displayProgress(savedProgress);

    const filledPercent = Number(
        ((filledCells / totalCells) * 100).toFixed(2)
    );

    const stars = Number(data?.stars ?? calculateStars(filledPercent));
    const xp = Number(data?.xp_earned ?? calculateXP(filledPercent));
    const won = filledCells >= totalCells;

    const { error: profileError } = await client.rpc(
        "save_play_result_by_mode",
        {
            p_game_mode: "infinite",
            p_moves: moveCount,
            p_filled_percent: filledPercent,
            p_won: won,
            p_xp: xp,
            p_stars: stars
        }
    );

    if (profileError) {
        return {
            saved: true,
            profileSaved: false,
            stars,
            xp,
            message: "PLAY-Ergebnis gespeichert, Profilstatistik jedoch nicht."
        };
    }

    return {
        saved: true,
        profileSaved: true,
        data,
        stars,
        xp,
        message: "PLAY-Ergebnis und Profilstatistik gespeichert."
    };
}

// =========================================
// SPIEL BEENDEN
// =========================================




async function finishGame() {
    if (gameOver || isSavingResult || boardResultSaved) return;

    gameOver = true;
    isSavingResult = true;
    boardResultSaved = true;

    updateColorPicker();

    const totalCells = BOARD_SIZE * BOARD_SIZE;
    const filledCells = countFilledCells();

    const filledPercent = Number(
        ((filledCells / totalCells) * 100).toFixed(2)
    );

    const won = filledCells >= totalCells;
    const stars = calculateStars(filledPercent);
    const xp = calculateXP(filledPercent);

    if (elements.nextLevelButton) {
        elements.nextLevelButton.hidden = true;
    }

    if (elements.resultIcon) {
        elements.resultIcon.textContent = won
            ? "🏆"
            : stars > 0
                ? "⭐"
                : "↻";
    }

    if (elements.resultTitle) {
        elements.resultTitle.textContent = won
            ? "Geschafft!"
            : "Board beendet";
    }

    if (elements.resultDescription) {
        elements.resultDescription.textContent =
            `Du hast ${filledPercent.toFixed(2)} % des Boards gefüllt.`;
    }

    if (elements.resultMoves) {
        elements.resultMoves.textContent = String(moves);
    }

    if (elements.resultXp) {
        elements.resultXp.textContent = `+${xp} XP`;
    }

    if (elements.resultMessage) {
        elements.resultMessage.textContent =
            `${stars} von 3 Sternen · ${xp} XP`;
    }

    setStars(stars);
    showResult();

    try {
        // 1. Spielergebnis und XP speichern.
        const result = await savePlayResult({
            moves,
            filledCells,
            totalCells
        });

        if (elements.resultMessage) {
            if (result.saved) {
                setStars(result.stars);

                if (elements.resultXp) {
                    elements.resultXp.textContent = `+${result.xp} XP`;
                }

                elements.resultMessage.textContent =
                    `${result.stars} von 3 Sternen · +${result.xp} XP · ` +
                    (result.profileSaved
                        ? "Gespeichert!"
                        : result.message);
            } else {
                elements.resultMessage.textContent =
                    `${stars} von 3 Sternen · +${xp} XP. ${result.message}`;
            }
        }

        // 2. Nach dem Speichern prüfen, ob ein neues Level erreicht wurde.
        if (
            result.saved &&
            result.profileSaved &&
            window.LevelSystem &&
            typeof window.LevelSystem.checkForLevelUp === "function"
        ) {
            const progress =
                await window.LevelSystem.checkForLevelUp();
        }

    } catch (error) {
        if (elements.resultMessage) {
            elements.resultMessage.textContent =
                `${stars} von 3 Sternen · +${xp} XP. ` +
                "Beim Speichern oder Prüfen des Levels ist ein Fehler aufgetreten.";
        }

    } finally {
        isSavingResult = false;
        updateColorPicker();
        showResult();
    }
}



// =========================================
// NAVIGATION
// =========================================

function goBackToMenu() {
    window.location.href = "menu.html";
}

function goToMainMenu() {
    window.location.href = "menu.html";
}

// =========================================
// START
// =========================================

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGame, { once: true });
} else {
    initGame();
}