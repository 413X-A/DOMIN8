
/* =========================================================
   FILLER – COLOR FILL
   Profile page – Supabase database integration
   ========================================================= */

(() => {
    "use strict";

    // -----------------------------------------------------
    // 1. SUPABASE CLIENT
    // -----------------------------------------------------

    function getProfileClient() {
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

    const $ = (id) => document.getElementById(id);

    const setText = (id, value) => {
        const element = $(id);
        if (element) {
            element.textContent = value ?? "—";
        }
    };

    const setWidth = (id, value) => {
        const element = $(id);
        if (!element) return;

        const percentage = Math.max(
            0,
            Math.min(100, Number(value) || 0)
        );

        element.style.width = `${percentage}%`;
    };

    const toNumber = (value) => {
        const result = Number(value ?? 0);
        return Number.isFinite(result) ? result : 0;
    };

    const formatNumber = (value) =>
        toNumber(value).toLocaleString("de-DE", {
            maximumFractionDigits: 1
        });

    const formatPercent = (value) =>
        `${toNumber(value).toLocaleString("de-DE", {
            maximumFractionDigits: 1
        })}%`;

    const formatDate = (value) => {
        if (!value) return "—";

        const date = new Date(value);

        if (Number.isNaN(date.getTime())) return "—";

        return date.toLocaleDateString("de-DE");
    };

    function setStatus(message, isError = false) {
        const element = $("profileStatus");
        if (!element) return;

        element.textContent = message;
        element.style.color = isError ? "#ff6868" : "";
    }

    function logDatabaseError(table, error) {
        console.error(`[Supabase: ${table}]`, error);
    }

    // -----------------------------------------------------
    // 2. AVATAR
    // Unterstützt sowohl <img> als auch <div>
    // -----------------------------------------------------

    function setAvatar(profile, user) {
        const avatar = $("profileAvatar");
        if (!avatar) return;

        const url = profile?.avatar_url;
        const name =
            profile?.display_name ||
            profile?.username ||
            user?.email?.split("@")[0] ||
            "Spieler";

        if (avatar.tagName === "IMG") {
            avatar.alt = name;

            if (url) {
                avatar.src = url;
                avatar.onerror = () => {
                    avatar.onerror = null;
                    avatar.removeAttribute("src");
                    avatar.alt = name;
                };
            } else {
                avatar.removeAttribute("src");
            }

            return;
        }

        // Dein HTML verwendet möglicherweise ein <div>.
        if (url) {
            avatar.style.backgroundImage =
                `url("${url.replace(/["\\\n\r]/g, "")}")`;
            avatar.style.backgroundSize = "cover";
            avatar.style.backgroundPosition = "center";
            avatar.textContent = "";
            avatar.setAttribute("aria-label", name);
        } else {
            avatar.style.backgroundImage = "none";
            avatar.textContent = name.charAt(0).toUpperCase();
            avatar.setAttribute("aria-label", name);
        }
    }


    // -----------------------------------------------------
    // 4. MODUS SUCHEN
    // -----------------------------------------------------

    function findMode(modes, ...terms) {
        return modes.find((item) => {
            const mode = String(item.game_mode || "")
                .toLowerCase()
                .replace(/[-_\s]/g, "");

            return terms.some((term) => mode.includes(term));
        });
    }

    // -----------------------------------------------------
    // 5. DATENBANKABFRAGEN
    // -----------------------------------------------------

    async function loadProfile() {
    const db = getProfileClient();

    if (!db) {
        console.error(
            "Supabase nicht initialisiert. " +
            "Prüfe config.js und supabase.js."
        );

        setStatus("Supabase-Verbindung fehlt.", true);
        return;
    }

        setStatus("Profil wird geladen …");

        try {
            // Aktuell angemeldeten Benutzer abrufen.
            const {
                data: authData,
                error: authError
            } = await db.auth.getUser();

            if (authError) throw authError;

            const user = authData?.user;

            if (!user) {
                setStatus("Bitte melde dich zuerst an.", true);
                window.location.href = "../index.html";
                return;
            }

            const userId = user.id;

            console.log("Profil wird geladen für:", userId);

            /*
             * Die Datenbankabfragen werden parallel ausgeführt.
             * Jede Abfrage verwendet die tatsächliche Benutzer-ID.
             */

            const [
    profileResult,
    playerResult,
    playResult,
    modesResult,
    levelsResult,
    campaignResult,
    unlocksResult
] = await Promise.all([
    db.from("profiles")
        .select("*")
        .eq("id", userId)
        .maybeSingle(),

    db.from("player_progress")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),

    db.from("play_progress")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle(),

    db.from("play_mode_progress")
        .select("*")
        .eq("user_id", userId),

    db.from("campaign_levels")
        .select("*")
        .eq("is_active", true)
        .order("level_number", { ascending: true }),

    db.from("campaign_progress")
        .select("*")
        .eq("user_id", userId),

    // Gespeicherte Level-Freischaltungen
    db.from("campaign_level_unlocks")
        .select("level_id")
        .eq("user_id", userId)
]);

            const queryResults = [
                ["profiles", profileResult],
                ["player_progress", playerResult],
                ["play_progress", playResult],
                ["play_mode_progress", modesResult],
                ["campaign_levels", levelsResult],
                ["campaign_progress", campaignResult],
                ["campaign_level_unlocks", unlocksResult]
            ];

            // Abfragefehler dürfen nicht als Nullwerte erscheinen.
            for (const [table, result] of queryResults) {
                if (result.error) {
                    logDatabaseError(table, result.error);
                    throw new Error(
                        `Fehler beim Laden der Tabelle "${table}".`
                    );
                }
            }

            const profile = profileResult.data;
            const player = playerResult.data;
            const play = playResult.data;
            const modes = modesResult.data || [];
            const levels = levelsResult.data || [];
            const campaign = campaignResult.data || [];
            const unlocks = unlocksResult.data || [];


            // -------------------------------------------------
            // 6. PROFILKOPF
            // -------------------------------------------------

            const displayName =
                profile?.display_name ||
                profile?.username ||
                user.user_metadata?.display_name ||
                user.user_metadata?.username ||
                user.email?.split("@")[0] ||
                "Spieler";

            setText("profileUsername", displayName);
            setText("profileEmail", user.email || "Keine E-Mail");
            setAvatar(profile, user);

            // Optional: Registrierungsdatum, falls HTML vorhanden.
            setText(
                "profileJoined",
                profile?.created_at
                    ? formatDate(profile.created_at)
                    : "—"
            );

            
            
            // -------------------------------------------------
            // 7. LEVELSYSTEM
            // -------------------------------------------------

            const totalXP = Math.max(
                0,
                toNumber(player?.total_xp ?? play?.total_xp)
            );

            // Gleiche XP-Schwellen wie in SQL: get_player_level()
            const xpForLevel = (level) => {
                if (level <= 1) return 0;
                if (level === 2) return 100;
                if (level === 3) return 250;
                if (level === 4) return 450;
                if (level === 5) return 700;
                if (level === 6) return 1000;

                return 1000 + (level - 6) * 400;
            };

            // Aktuelles Level anhand der SQL-Schwellen bestimmen
            let currentLevel = 1;

            while (totalXP >= xpForLevel(currentLevel + 1)) {
                currentLevel++;
            }

            const xpCurrentLevel = xpForLevel(currentLevel);
            const xpNextLevel = xpForLevel(currentLevel + 1);

            const xpIntoLevel = totalXP - xpCurrentLevel;
            const xpNeeded = xpNextLevel - xpCurrentLevel;
            const xpRemaining = Math.max(0, xpNextLevel - totalXP);

            const levelPercent = xpNeeded > 0
                ? Math.min(100, (xpIntoLevel / xpNeeded) * 100)
                : 0;

            setText("playerLevel", formatNumber(currentLevel));
            setText("totalXP", formatNumber(totalXP));

            setText(
                "xpProgressText",
                `${formatNumber(xpRemaining)} XP bis Level ${currentLevel + 1}`
            );

            setWidth("xpProgressBar", levelPercent);

            const xpBar = $("xpProgressBar");

            if (xpBar) {
                xpBar.setAttribute(
                    "aria-valuenow",
                    String(Math.round(levelPercent))
                );
                xpBar.setAttribute("aria-valuemin", "0");
                xpBar.setAttribute("aria-valuemax", "100");
            }

            const totalScore = toNumber(player?.total_score);
            setText("totalScore", formatNumber(totalScore));



            
            // -------------------------------------------------
            // 8. GESAMTSTATISTIK
            // -------------------------------------------------

            const started = toNumber(play?.boards_started);
            const completed = toNumber(play?.boards_completed);
            const wins = toNumber(play?.boards_won);
            const losses = toNumber(play?.boards_lost);
            const moves = toNumber(play?.total_moves);
            const stars = toNumber(play?.total_stars);

            setText("totalGames", formatNumber(started));
            setText("totalWins", formatNumber(wins));
            setText("totalStars", formatNumber(stars));

            // Globale Züge aus allen Spielmodi
            setText("totalMoves", formatNumber(moves));

            const winRate = completed > 0
                ? (wins / completed) * 100
                : 0;

            setText("overallWinRate", formatPercent(winRate));
            setText("totalCompleted", formatNumber(completed));
            setText("totalLost", formatNumber(losses));

            setText(
                "lastPlayed",
                formatDate(play?.last_played_at)
            );


            // -------------------------------------------------
            // 9. INFINITE-MODUS
            // -------------------------------------------------

            const infinite = findMode(
                modes,
                "infinite",
                "endless",
                "endlos"
            );

            setText(
                "infiniteStarted",
                formatNumber(infinite?.boards_started)
            );
            setText(
                "infiniteCompleted",
                formatNumber(infinite?.boards_completed)
            );
            setText(
                "infiniteLost",
                formatNumber(infinite?.boards_lost)
            );
            setText(
                "infiniteMoves",
                formatNumber(infinite?.total_moves)
            );
            setText(
                "infiniteBestMoves",
                infinite?.best_moves == null
                    ? "—"
                    : formatNumber(infinite.best_moves)
            );
            setText("infiniteXP", formatNumber(infinite?.total_xp));
            setText(
                "infiniteStars",
                formatNumber(infinite?.total_stars)
            );
            setText(
                "infiniteBestFill",
                formatPercent(infinite?.best_fill_percent)
            );

            const infiniteWins = toNumber(infinite?.boards_won);
            const infiniteCompletedCount =
                toNumber(infinite?.boards_completed);

            setText(
                "infiniteWinRate",
                formatPercent(
                    infiniteCompletedCount > 0
                        ? infiniteWins / infiniteCompletedCount * 100
                        : 0
                )
            );

            
            // -------------------------------------------------
            // 10. KAMPAGNENSTATISTIK
            // -------------------------------------------------

            const MAX_CAMPAIGN_LEVELS = 120;

            // Abgeschlossene Kampagnenlevel
            const completedCampaign = campaign.filter(
                item => item.completed === true
            );

            const completedLevelIds = new Set(
                completedCampaign
                    .map(item => Number(item.level_id))
                    .filter(id =>
                        Number.isInteger(id) &&
                        id >= 1 &&
                        id <= MAX_CAMPAIGN_LEVELS
                    )
            );

            const completedCount = completedLevelIds.size;
            const totalLevels = levels.length;

            const campaignPercent = totalLevels > 0
                ? Math.min(100, completedCount / totalLevels * 100)
                : 0;

            // Sterne aller abgeschlossenen Level
            const campaignStars = completedCampaign.reduce(
                (sum, item) => sum + toNumber(item.best_stars),
                0
            );

            // Level anhand ihrer Levelnummer zuordnen
            const levelByNumber = new Map(
                levels.map(level => [
                    Number(level.level_number),
                    level
                ])
            );

            // Gesamte XP aus abgeschlossenen Kampagnenleveln
            const campaignXP = completedCampaign.reduce(
                (sum, item) => {
                    if (item.xp_awarded !== true) {
                        return sum;
                    }

                    const level = levelByNumber.get(
                        Number(item.level_id)
                    );

                    return sum + toNumber(level?.xp_reward);
                },
                0
            );

            // Durchschnittliche Züge
            const validMoveRecords = completedCampaign.filter(
                item => item.best_moves != null
            );

            const campaignMoves = validMoveRecords.reduce(
                (sum, item) => sum + toNumber(item.best_moves),
                0
            );

            const averageMoves = validMoveRecords.length > 0
                ? campaignMoves / validMoveRecords.length
                : null;

            // -------------------------------------------------
            // FREIGESCHALTETE LEVEL
            // -------------------------------------------------

            // Freischaltungen aus campaign_level_unlocks
            const unlockedLevelIds = new Set(
                unlocks
                    .map(item => Number(item.level_id))
                    .filter(id =>
                        Number.isInteger(id) &&
                        id >= 1 &&
                        id <= MAX_CAMPAIGN_LEVELS
                    )
            );

            // Level 1 ist immer freigeschaltet
            unlockedLevelIds.add(1);

            // Gesamtzahl freigeschalteter Level,
            // einschließlich bereits abgeschlossener Level
            const unlockedLevels = unlockedLevelIds.size;

            console.info("[Profil] Kampagnenstatus:", {
                totalLevels,
                completedCount,
                unlockedLevels,
                unlockedLevelIds: [...unlockedLevelIds]
                    .sort((a, b) => a - b),
                completedLevelIds: [...completedLevelIds]
                    .sort((a, b) => a - b)
            });

            // -------------------------------------------------
            // ANZEIGEN AKTUALISIEREN
            // -------------------------------------------------

            setText(
                "campaignProgress",
                `${completedCount} / ${totalLevels}`
            );

            setText(
                "campaignProgressDetail",
                `${completedCount} / ${totalLevels} Level`
            );

            setWidth("campaignProgressBar", campaignPercent);

            setText("campaignCompleted", formatNumber(completedCount));
            setText("campaignTotalLevels", formatNumber(totalLevels));
            setText("campaignUnlocked", formatNumber(unlockedLevels));

            setText(
                "campaignCompletedCard",
                formatNumber(completedCount)
            );

            setText("campaignStars", formatNumber(campaignStars));
            setText("campaignXP", formatNumber(campaignXP));
            setText("campaignMoves", formatNumber(campaignMoves));

            setText(
                "campaignAverageMoves",
                averageMoves == null
                    ? "—"
                    : formatNumber(averageMoves)
            );

            // Freischaltungen auch an die Levelanzeige übergeben.
            // renderCampaignLevels muss den dritten Parameter
            // unterstützen, damit die Levelkarten danach
            // tatsächlich als freigeschaltet dargestellt werden.
            renderCampaignLevels(
                levels,
                campaign,
                unlockedLevelIds
            );


            // -------------------------------------------------
            // 11. CHALLENGES
            // -------------------------------------------------
            // Für Challenges gibt es in deinem genannten Schema
            // keine eigene Tabelle. Nicht mit Nullen vortäuschen.

            const unavailable = "Nicht verfügbar";

            setText("challengeStarted", unavailable);
            setText("challengeCompleted", unavailable);
            setText("challengeWinRate", unavailable);
            setText("challengeBestMoves", unavailable);
            setText("challengeBestTime", unavailable);
            setText("challengeXP", unavailable);
            setText("challengeStars", unavailable);

            // -------------------------------------------------
            // 12. RANKED
            // -------------------------------------------------
            // Kein Ranked-Rating ohne entsprechende Datenquelle.

            setText("rankedRank", unavailable);
            setText("rankBadge", "—");
            setText("rankedRankDetail", unavailable);
            setText("rankedRating", unavailable);
            setText("rankedPlayed", unavailable);
            setText("rankedWins", unavailable);
            setText("rankedLosses", unavailable);
            setText("rankedWinRate", unavailable);
            setText("rankedCurrentStreak", unavailable);
            setText("rankedBestStreak", unavailable);
            setText("rankedSeasonWins", unavailable);
            setText("rankedSeasonLosses", unavailable);

            // -------------------------------------------------
            // 13. ABSCHLUSS UND DEBUG
            // -------------------------------------------------

            console.info("Profil erfolgreich geladen.", {
                userId,
                profile,
                player,
                play,
                modes,
                campaignCompleted: completedCount,
                campaignTotal: totalLevels,
                overallWinRate: winRate
            });

            setStatus("Profil erfolgreich geladen.");

        } catch (error) {
            console.error(
                "Fehler beim Laden des Profils:",
                error
            );

            setStatus(
                error?.message ||
                    "Beim Laden des Profils ist ein Fehler aufgetreten.",
                true
            );
        }
    }

    // -----------------------------------------------------
    // 14. ABMELDEN
    // -----------------------------------------------------

    const logoutButton = $("logout-button");

    if (logoutButton) {
        logoutButton.addEventListener("click", async () => {
            const db = getProfileClient();

            if (!db) {
                setStatus("Supabase-Client fehlt.", true);
                return;
            }

            logoutButton.disabled = true;

            try {
                const { error } = await db.auth.signOut();

                if (error) throw error;

                window.location.href = "../index.html";
            } catch (error) {
                console.error("Abmelden fehlgeschlagen:", error);

                setStatus("Abmelden fehlgeschlagen.", true);
                logoutButton.disabled = false;
            }
        });
    }

    // -----------------------------------------------------
    // 15. PROFIL LADEN
    // -----------------------------------------------------

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            loadProfile,
            { once: true }
        );
    } else {
        loadProfile();
    }
})();
