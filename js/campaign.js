"use strict";

/*
 * FILLER: COLOR FILL — CAMPAIGN SELECTOR
 *
 * Lädt Level aus public.campaign_levels
 * Lädt Spielstände aus public.campaign_progress
 * Lädt Freischaltungen aus public.campaign_level_unlocks
 * Unterstützt 120 Level
 * Behält das bestehende Kartendesign bei
 */

// =========================================
// KONSTANTEN
// =========================================

const TOTAL_CAMPAIGN_LEVELS = 210;
const MAX_STARS_PER_LEVEL = 3;

// =========================================
// HTML-ELEMENTE
// =========================================

const campaignElements = {
    back: document.getElementById("campaign-back-button"),
    progressText: document.getElementById("campaign-progress-text"),
    progressBar: document.getElementById("campaign-progress-bar"),
    levels: document.getElementById("campaign-levels"),
    starsTotal: document.getElementById("campaign-stars-total"),
    message: document.getElementById("campaign-message")
};

let campaignUser = null;
let CAMPAIGN_LEVELS = [];
let campaignUnlockedLevels = new Set();

// =========================================
// SUPABASE
// =========================================

function getCampaignClient() {
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

// =========================================
// ANGEMELDETEN BENUTZER LADEN
// =========================================

async function getUser() {
    const client = getCampaignClient();

    if (!client || !client.auth) {
        throw new Error(
            "Supabase wurde nicht initialisiert. " +
            "Prüfe config.js und supabase.js."
        );
    }

    const { data, error } = await client.auth.getUser();

    if (error) {
        throw error;
    }

    if (!data || !data.user) {
        window.location.replace("../index.html");
        return null;
    }

    return data.user;
}

// =========================================
// LEVEL AUS DER DATENBANK LADEN
// =========================================

async function fetchCampaignLevels() {
    const client = getCampaignClient();

    if (!client) {
        throw new Error("Supabase-Client nicht gefunden.");
    }

    const { data, error } = await client
        .from("campaign_levels")
        .select(`
            level_number,
            name,
            section,
            board_size,
            color_count,
            move_limit,
            xp_reward,
            difficulty,
            is_active
        `)
        .eq("is_active", true)
        .order("level_number", { ascending: true });

    if (error) {
        throw error;
    }

    if (!Array.isArray(data) || data.length === 0) {
        throw new Error(
            "Keine aktiven Level in campaign_levels gefunden."
        );
    }

    const levels = data.map(row => ({
        id: Number(row.level_number),
        name: row.name,
        section: Number(row.section),
        size: Number(row.board_size),
        colors: Number(row.color_count),
        moves: Number(row.move_limit),
        xp: Number(row.xp_reward),
        difficulty: Number(row.difficulty)
    }));

    validateCampaignLevels(levels);

    return levels;
}

// =========================================
// LEVEL-KONFIGURATION PRÜFEN
// =========================================

function validateCampaignLevels(levels) {
    const seenIds = new Set();

    for (const level of levels) {
        if (
            !Number.isInteger(level.id) ||
            level.id < 1 ||
            level.id > TOTAL_CAMPAIGN_LEVELS
        ) {
            throw new Error(
                `Ungültige Levelnummer: ${level.id}. ` +
                `Erlaubt sind Level 1–${TOTAL_CAMPAIGN_LEVELS}.`
            );
        }

        if (seenIds.has(level.id)) {
            throw new Error(
                `Level ${level.id} ist mehrfach vorhanden.`
            );
        }

        seenIds.add(level.id);

        if (!level.name || typeof level.name !== "string") {
            throw new Error(
                `Level ${level.id} hat keinen gültigen Namen.`
            );
        }

        if (
            !Number.isInteger(level.size) ||
            level.size < 1 ||
            level.size > 18
        ) {
            throw new Error(
                `Ungültige Board-Größe bei Level ${level.id}.`
            );
        }

        if (
            !Number.isInteger(level.colors) ||
            level.colors < 1 ||
            level.colors > 8
        ) {
            throw new Error(
                `Ungültige Farbanzahl bei Level ${level.id}.`
            );
        }

        if (
            !Number.isInteger(level.moves) ||
            level.moves < 1
        ) {
            throw new Error(
                `Ungültiges Zuglimit bei Level ${level.id}.`
            );
        }

        if (
            !Number.isFinite(level.xp) ||
            level.xp < 0
        ) {
            throw new Error(
                `Ungültige XP-Belohnung bei Level ${level.id}.`
            );
        }
    }

    // Fehlende Levelnummern ermitteln
    const missingLevels = [];

    for (let id = 1; id <= TOTAL_CAMPAIGN_LEVELS; id++) {
        if (!seenIds.has(id)) {
            missingLevels.push(id);
        }
    }

    if (missingLevels.length > 0) {
        // Keine Konsolenausgabe
    }
}

// =========================================
// SCHWIERIGKEIT ANZEIGEN
// =========================================

function getDifficultyLabel(level) {
    const difficulty = level.difficulty;

    if (difficulty <= 10) return "Sehr leicht";
    if (difficulty <= 20) return "Leicht";
    if (difficulty <= 40) return "Normal";
    if (difficulty <= 60) return "Anspruchsvoll";
    if (difficulty <= 80) return "Schwer";
    if (difficulty <= 100) return "Experte";
    if (difficulty <= 120) return "Meister";
    if (difficulty <= 140) return "Legendär";
    if (difficulty <= 160) return "Albtraum";
    if (difficulty <= 180) return "Extrem";
    if (difficulty <= 200) return "Meisterpfade";

    return "Finale";
}

// =========================================
// SPIELFORTSCHRITT LADEN
// =========================================

async function fetchProgress(userId) {
    const client = getCampaignClient();

    const { data, error } = await client
        .from("campaign_progress")
        .select(`
            level_id,
            completed,
            attempts,
            best_moves,
            best_score,
            best_stars,
            completed_at
        `)
        .eq("user_id", userId);

    if (error) {
        throw error;
    }

    return Array.isArray(data) ? data : [];
}

// =========================================
// FREISCHALTUNGEN INITIALISIEREN
// =========================================

async function initializeCampaignUnlocks() {
    const client = getCampaignClient();

    if (!client) {
        throw new Error("Supabase-Client nicht gefunden.");
    }

    const { error: initError } = await client.rpc(
        "initialize_campaign_unlocks"
    );

    if (initError) {
        throw initError;
    }

    await fetchCampaignUnlocks();
}

// =========================================
// FREISCHALTUNGEN AUS SUPABASE LADEN
// =========================================

async function fetchCampaignUnlocks() {
    const client = getCampaignClient();

    if (!client) {
        throw new Error("Supabase-Client nicht gefunden.");
    }

    const { data, error } = await client
        .from("campaign_level_unlocks")
        .select("level_id")
        .order("level_id", { ascending: true });

    if (error) {
        throw error;
    }

    campaignUnlockedLevels = new Set(
        (Array.isArray(data) ? data : [])
            .map(row => Number(row.level_id))
            .filter(id =>
                Number.isInteger(id) &&
                id >= 1 &&
                id <= TOTAL_CAMPAIGN_LEVELS
            )
    );

    // Level 1 bleibt in der Anzeige immer zugänglich.
    // Die Datenbankinitialisierung sollte es ebenfalls speichern.
    campaignUnlockedLevels.add(1);

    return campaignUnlockedLevels;
}

// =========================================
// FREISCHALTUNGEN IN SUPABASE SPEICHERN
// Nach erfolgreichem Levelabschluss aufrufen
// =========================================

async function saveCampaignUnlocks(completedLevel) {
    const client = getCampaignClient();

    if (!client) {
        throw new Error("Supabase-Client nicht gefunden.");
    }

    const levelId = Number(completedLevel);

    if (
        !Number.isInteger(levelId) ||
        levelId < 1 ||
        levelId > TOTAL_CAMPAIGN_LEVELS
    ) {
        throw new Error("Ungültiges Kampagnenlevel.");
    }

    const { error } = await client.rpc(
        "unlock_campaign_levels",
        {
            p_completed_level: levelId
        }
    );

    if (error) {
        throw error;
    }

    return await fetchCampaignUnlocks();
}

// =========================================
// PRÜFEN, OB EIN LEVEL FREIGESCHALTET IST
// =========================================

function isLevelUnlocked(levelId) {
    return campaignUnlockedLevels.has(Number(levelId));
}

// =========================================
// HILFSFUNKTIONEN
// =========================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function normalizeStars(value) {
    const number = Number(value ?? 0);

    if (!Number.isFinite(number)) {
        return 0;
    }

    return Math.max(0, Math.min(3, Math.floor(number)));
}

function starsMarkup(count) {
    const stars = normalizeStars(count);

    return `
        <div class="campaign-stars"
             aria-label="${stars} von 3 Sternen">
            ${[1, 2, 3].map(index => `
                <span class="${
                    index <= stars
                        ? "star-active"
                        : "star-inactive"
                }">
                    ${index <= stars ? "★" : "☆"}
                </span>
            `).join("")}
        </div>
    `;
}

// =========================================
// FORTSCHRITT BERECHNEN
// =========================================

function buildProgress(rows) {
    const byLevel = new Map();
    const completed = new Set();

    const validLevelIds = new Set(
        CAMPAIGN_LEVELS.map(level => level.id)
    );

    for (const rawRow of rows) {
        const id = Number(rawRow.level_id);

        if (!validLevelIds.has(id)) {
            continue;
        }

        const row = {
            ...rawRow,
            level_id: id,
            completed: Boolean(rawRow.completed),

            attempts:
                rawRow.attempts == null
                    ? 0
                    : Math.max(
                        0,
                        Math.floor(Number(rawRow.attempts) || 0)
                    ),

            best_moves:
                rawRow.best_moves == null
                    ? null
                    : Number(rawRow.best_moves),

            best_score:
                rawRow.best_score == null
                    ? 0
                    : Number(rawRow.best_score),

            best_stars: normalizeStars(rawRow.best_stars)
        };

        const previous = byLevel.get(id);

        if (!previous) {
            byLevel.set(id, row);
            continue;
        }

        const previousStars = normalizeStars(
            previous.best_stars
        );

        const currentStars = normalizeStars(
            row.best_stars
        );

        const previousMoves =
            previous.best_moves == null
                ? Infinity
                : Number(previous.best_moves);

        const currentMoves =
            row.best_moves == null
                ? Infinity
                : Number(row.best_moves);

        /*
         * Den besseren Spielstand behalten:
         *
         * 1. abgeschlossen schlägt nicht abgeschlossen
         * 2. mehr Sterne schlägt weniger Sterne
         * 3. bei gleichen Sternen gewinnt weniger Züge
         */
        const currentIsBetter =
            (row.completed && !previous.completed) ||
            (
                row.completed === previous.completed &&
                (
                    currentStars > previousStars ||
                    (
                        currentStars === previousStars &&
                        currentMoves < previousMoves
                    )
                )
            );

        if (currentIsBetter) {
            byLevel.set(id, row);
        }
    }

    for (const [id, row] of byLevel) {
        if (row.completed === true) {
            completed.add(id);
        }
    }

    let totalStars = 0;

    // Sterne für ALLE gespeicherten Level zählen,
    // nicht nur für Level mit completed = true.
    for (const row of byLevel.values()) {
        totalStars += normalizeStars(row.best_stars);
    }

    const completedCount = completed.size;
    const totalLevels = CAMPAIGN_LEVELS.length;

    const percentage =
        totalLevels > 0
            ? Math.round(
                (completedCount / totalLevels) * 100
            )
            : 0;

    return {
        byLevel,
        completed,
        completedCount,
        totalStars,
        percentage
    };
}

// =========================================
// FORTSCHRITT ANZEIGEN
// =========================================

function renderProgress(progress) {
    const totalLevels = CAMPAIGN_LEVELS.length;
    const maximumStars = totalLevels * MAX_STARS_PER_LEVEL;

    if (campaignElements.progressText) {
        campaignElements.progressText.textContent =
            `${progress.completedCount} / ${totalLevels} Level abgeschlossen`;
    }

    if (campaignElements.progressBar) {
        campaignElements.progressBar.style.width =
            `${progress.percentage}%`;

        const track = campaignElements.progressBar.parentElement;

        if (track) {
            track.setAttribute("role", "progressbar");
            track.setAttribute("aria-valuemin", "0");
            track.setAttribute("aria-valuemax", "100");
            track.setAttribute(
                "aria-valuenow",
                String(progress.percentage)
            );
        }
    }

    if (campaignElements.starsTotal) {
        campaignElements.starsTotal.textContent =
            `${progress.totalStars} / ${maximumStars}`;
    }

    if (campaignElements.message) {
        if (progress.completedCount === totalLevels) {
            campaignElements.message.textContent =
                "Glückwunsch! Du hast alle 210 Kampagnenlevel abgeschlossen!";
        } else {
            campaignElements.message.textContent =
                "Schließe ein Level ab, um weitere Level freizuschalten.";
        }
    }
}

// =========================================
// LEVELKARTE ERSTELLEN
// Bestehendes Kartendesign beibehalten
// =========================================

function createLevelCard(level, progress) {
    const saved = progress.byLevel.get(level.id);
    const completed = progress.completed.has(level.id);

    const unlocked = isLevelUnlocked(level.id);

    // Gespeicherte Sterne immer anzeigen,
    // auch wenn das Level noch nicht mit 3 Sternen abgeschlossen wurde.
    const stars = normalizeStars(saved?.best_stars);

    const bestMoves = saved?.best_moves != null
        ? `${Number(saved.best_moves)} Züge`
        : "Noch kein Bestwert";

    const attempts = Math.max(
        0,
        Math.floor(
            Number(saved?.attempts) || 0
        )
    );

    const card = document.createElement("article");

    card.className = [
        "level-card",
        completed ? "completed" : "",
        unlocked ? "unlocked" : "locked"
    ].filter(Boolean).join(" ");

    // Levelnummer für das automatische Scrollen speichern.
    card.dataset.levelId = String(level.id);

    const status = completed
        ? "Abgeschlossen"
        : unlocked
            ? "Freigeschaltet"
            : "Gesperrt";

    const difficultyLabel = getDifficultyLabel(level);

    card.innerHTML = `
    <div class="level-card-header">
        <h3>Level ${level.id}: ${escapeHTML(level.name)}</h3>
        <span class="level-status">${status}</span>
    </div>

    ${starsMarkup(stars)}

    <p class="level-difficulty">
        ${escapeHTML(difficultyLabel)}
    </p>

    <div class="level-details">
        <span>Board: ${level.size} × ${level.size}</span>
        <span>Farben: ${level.colors}</span>
        <span>Zuglimit: ${level.moves}</span>
        <span>Belohnung: ${level.xp} XP</span>
    </div>

    <div class="level-best">
        <span>Bestleistung: ${escapeHTML(bestMoves)}</span>
    </div>

    ${unlocked ? `
        <div class="level-best">
            <span>Versuche: ${attempts}</span>
        </div>
    ` : ""}

    <button
        class="level-button"
        type="button"
        ${unlocked ? "" : "disabled"}
    >
        ${
            completed
                ? "ERNEUT SPIELEN"
                : unlocked
                    ? "LEVEL STARTEN"
                    : "GESPERRT"
        }
    </button>
`;

    const button = card.querySelector(".level-button");

    if (unlocked && button) {
        button.addEventListener("click", () => {
            window.location.href =
                `campaign_game.html?level=${level.id}`;
        });
    }

    return card;
}

// =========================================
// KAMPAGNE RENDERN
// =========================================

function renderCampaign(rows) {
    const container = campaignElements.levels;

    if (!container) {
        throw new Error(
            "Das Element #campaign-levels fehlt in campaign.html."
        );
    }

    const progress = buildProgress(rows);

    renderProgress(progress);

    container.innerHTML = "";

    const fragment = document.createDocumentFragment();

    for (const level of CAMPAIGN_LEVELS) {
        fragment.appendChild(
            createLevelCard(level, progress)
        );
    }

    container.appendChild(fragment);
}

// =========================================
// ZUM NEUESTEN FREIGESCHALTETEN LEVEL SCROLLEN
// =========================================

function scrollToLatestUnlockedLevel() {
    if (
        !campaignElements.levels ||
        campaignUnlockedLevels.size === 0
    ) {
        return;
    }

    // Höchste freigeschaltete Levelnummer ermitteln.
    const latestLevelId = Math.max(
        ...campaignUnlockedLevels
    );

    const latestLevelCard =
        campaignElements.levels.querySelector(
            `.level-card[data-level-id="${latestLevelId}"]`
        );

    if (!latestLevelCard) {
        return;
    }

    // Warten, bis der Browser die Karten dargestellt hat.
    requestAnimationFrame(() => {
        latestLevelCard.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });
    });
}

// =========================================
// FEHLERANZEIGE
// =========================================

function showError(error) {
    if (campaignElements.message) {
        campaignElements.message.textContent =
            "Die Kampagne konnte nicht geladen werden. Bitte prüfe die Verbindung und deine Datenbankberechtigungen.";
    }

    if (campaignElements.levels) {
        campaignElements.levels.innerHTML = "";

        const paragraph = document.createElement("p");

        paragraph.className = "campaign-error";
        paragraph.textContent =
            "Laden fehlgeschlagen. Prüfe campaign_levels, campaign_progress, campaign_level_unlocks und die Supabase-RLS-Regeln.";

        campaignElements.levels.appendChild(paragraph);
    }
}

// =========================================
// NAVIGATION
// =========================================

if (campaignElements.back) {
    campaignElements.back.addEventListener("click", () => {
        window.location.href = "menu.html";
    });
}

// =========================================
// INITIALISIERUNG
// =========================================

async function initializeCampaign() {
    try {
        campaignUser = await getUser();

        if (!campaignUser) {
            return;
        }

        // Erst die Levelkonfiguration laden.
        CAMPAIGN_LEVELS = await fetchCampaignLevels();

        // Level 1 initialisieren und Freischaltungen laden.
        await initializeCampaignUnlocks();

        // Spielstände laden und Kampagne darstellen.
        const rows = await fetchProgress(campaignUser.id);

        renderCampaign(rows);

        // Automatisch zum neuesten freigeschalteten Level scrollen.
        scrollToLatestUnlockedLevel();

    } catch (error) {
        showError(error);
    }
}

initializeCampaign();