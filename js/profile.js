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
        // Fehler wird bewusst nicht mehr in die Console geschrieben.
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

    // -----------------------------------------------------
    // PROFILNAME BEARBEITEN
    // -----------------------------------------------------

    async function saveProfileName() {
        const db = getProfileClient();

        if (!db) {
            setStatus("Supabase-Verbindung fehlt.", true);
            return;
        }

        const input = $("profileNameInput");

        if (!input) return;

        const newName = input.value.trim();

        if (!newName) {
            setStatus("Bitte gib einen Spielernamen ein.", true);
            input.focus();
            return;
        }

        if (newName.length < 3) {
            setStatus(
                "Der Spielername muss mindestens 3 Zeichen lang sein.",
                true
            );
            input.focus();
            return;
        }

        if (newName.length > 24) {
            setStatus(
                "Der Spielername darf maximal 24 Zeichen lang sein.",
                true
            );
            input.focus();
            return;
        }

        const saveButton = $("saveProfileNameButton");

        if (saveButton) {
            saveButton.disabled = true;
            saveButton.textContent = "Speichern …";
        }

        try {
            const {
                data: authData,
                error: authError
            } = await db.auth.getUser();

            if (authError) throw authError;

            const user = authData?.user;

            if (!user) {
                throw new Error(
                    "Du bist nicht angemeldet."
                );
            }

            const {
                data,
                error
            } = await db
                .from("profiles")
                .update({
                    username: newName,
                    display_name: newName
                })
                .eq("id", user.id)
                .select("id, username, display_name")
                .maybeSingle();

            if (error) {
                throw new Error(
                    error.message ||
                    "Der Spielername konnte nicht gespeichert werden."
                );
            }

            if (!data) {
                throw new Error(
                    "Das Profil konnte nicht aktualisiert werden."
                );
            }

            // Anzeige sofort aktualisieren
            setText(
                "profileUsername",
                data.username ||
                data.display_name ||
                newName
            );

            // Eingabefeld schließen
            closeProfileNameEditor();

            setStatus(
                "Spielername erfolgreich gespeichert."
            );

        } catch (error) {

            setStatus(
                error?.message ||
                "Spielername konnte nicht gespeichert werden.",
                true
            );

        } finally {
            if (saveButton) {
                saveButton.disabled = false;
                saveButton.textContent = "Speichern";
            }
        }
    }


    function openProfileNameEditor() {
        const editor = $("profileNameEditor");
        const input = $("profileNameInput");

        if (!editor || !input) return;

        const currentName =
            $("profileUsername")?.textContent?.trim() ||
            "";

        input.value = currentName;

        editor.hidden = false;

        setTimeout(() => {
            input.focus();
            input.select();
        }, 0);
    }


    function closeProfileNameEditor() {
        const editor = $("profileNameEditor");

        if (!editor) return;

        editor.hidden = true;
    }


    function setupProfileNameEditor() {
        const editButton =
            $("editProfileNameButton");

        const saveButton =
            $("saveProfileNameButton");

        const cancelButton =
            $("cancelProfileNameButton");

        const input =
            $("profileNameInput");

        if (editButton) {
            editButton.addEventListener(
                "click",
                openProfileNameEditor
            );
        }

        if (saveButton) {
            saveButton.addEventListener(
                "click",
                saveProfileName
            );
        }

        if (cancelButton) {
            cancelButton.addEventListener(
                "click",
                closeProfileNameEditor
            );
        }

        if (input) {
            input.addEventListener(
                "keydown",
                event => {
                    if (event.key === "Enter") {
                        event.preventDefault();
                        saveProfileName();
                    }

                    if (event.key === "Escape") {
                        event.preventDefault();
                        closeProfileNameEditor();
                    }
                }
            );
        }
    }

    async function loadProfile() {
        const db = getProfileClient();

        if (!db) {
            setStatus("Supabase-Verbindung fehlt.", true);
            return;
        }

        setStatus("Profil wird geladen …");

        try {
            // -------------------------------------------------
            // 1. BENUTZER LADEN
            // -------------------------------------------------

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

            // -------------------------------------------------
            // 2. DATENBANKABFRAGEN
            // -------------------------------------------------

            const [
                profileResult,
                playerResult,
                playResult,
                modesResult,
                levelsResult,
                campaignResult,
                unlocksResult,
                rankedProfileResult,
                rankedStatsResult,
                rankedPlayerMatchesResult
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

                db.from("campaign_level_unlocks")
                    .select("level_id")
                    .eq("user_id", userId),

                // Rangposition und Ranked-Gesamtstatistik
                db.rpc("get_my_ranked_profile"),

                // Ranked-Rating und Spielbilanz
                db.from("ranked_player_stats")
                    .select(
                        "rating, games_played, wins, losses, draws"
                    )
                    .eq("user_id", userId)
                    .maybeSingle(),

                // Letzte 100 Ranked-Matches des Spielers
                db.from("ranked_live_players")
                    .select("match_id, joined_at")
                    .eq("user_id", userId)
                    .order("joined_at", { ascending: false })
                    .limit(100)
            ]);

            // -------------------------------------------------
            // 3. ERFORDERLICHE ABFRAGEN PRÜFEN
            // -------------------------------------------------

            const queryResults = [
                ["profiles", profileResult],
                ["player_progress", playerResult],
                ["play_progress", playResult],
                ["play_mode_progress", modesResult],
                ["campaign_levels", levelsResult],
                ["campaign_progress", campaignResult],
                ["campaign_level_unlocks", unlocksResult]
            ];

            for (const [table, result] of queryResults) {
                if (result.error) {
                    logDatabaseError(table, result.error);

                    throw new Error(
                        `Fehler beim Laden der Tabelle "${table}".`
                    );
                }
            }

            // Ranked-Abfragen sind optional und dürfen das
            // Laden des restlichen Profils nicht verhindern.
            if (rankedProfileResult.error) {
                // Ranked-Rang nicht verfügbar
            }

            if (rankedStatsResult.error) {
                // Ranked-Statistik nicht verfügbar
            }

            if (rankedPlayerMatchesResult.error) {
                // Ranked-Historie nicht verfügbar
            }

            const profile = profileResult.data;
            const player = playerResult.data;
            const play = playResult.data;
            const modes = modesResult.data || [];
            const levels = levelsResult.data || [];
            const campaign = campaignResult.data || [];
            const unlocks = unlocksResult.data || [];

            const rankedProfile = rankedProfileResult.error
                ? null
                : rankedProfileResult.data;

            const rankedStats = rankedStatsResult.error
                ? null
                : rankedStatsResult.data;

            const rankedPlayerMatches =
                rankedPlayerMatchesResult.error
                    ? []
                    : rankedPlayerMatchesResult.data || [];

            // -------------------------------------------------
            // 4. PROFILKOPF
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

            setText(
                "profileJoined",
                profile?.created_at
                    ? formatDate(profile.created_at)
                    : "—"
            );

            // -------------------------------------------------
            // 5. LEVELSYSTEM
            // -------------------------------------------------

            const totalXP = Math.max(
                0,
                toNumber(player?.total_xp ?? play?.total_xp)
            );

            // Gleiche XP-Schwellen wie get_player_level() in SQL.
            const xpForLevel = level => {
                if (level <= 1) return 0;
                if (level === 2) return 100;
                if (level === 3) return 250;
                if (level === 4) return 450;
                if (level === 5) return 700;
                if (level === 6) return 1000;

                return 1000 + (level - 6) * 400;
            };

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

            setText(
                "totalScore",
                formatNumber(player?.total_score)
            );

            // -------------------------------------------------
            // 6. GESAMTSTATISTIK
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
            setText("totalMoves", formatNumber(moves));

            const winRate = completed > 0
                ? wins / completed * 100
                : 0;

            setText("overallWinRate", formatPercent(winRate));
            setText("totalCompleted", formatNumber(completed));
            setText("totalLost", formatNumber(losses));

            setText(
                "lastPlayed",
                formatDate(play?.last_played_at)
            );

            // -------------------------------------------------
            // 7. INFINITE-MODUS
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
            // 8. KAMPAGNENSTATISTIK — 210 LEVEL
            // -------------------------------------------------

            const MAX_CAMPAIGN_LEVELS = 210;

            const activeLevelIds = new Set(
                levels
                    .map(item => Number(item.level_number))
                    .filter(id =>
                        Number.isInteger(id) &&
                        id >= 1 &&
                        id <= MAX_CAMPAIGN_LEVELS
                    )
            );

            // Je Level nur einen Datensatz verwenden.
            // Bei mehreren Einträgen gewinnt die beste Leistung.
            const campaignByLevel = new Map();

            for (const item of campaign) {
                const id = Number(item.level_id);

                if (
                    !Number.isInteger(id) ||
                    !activeLevelIds.has(id)
                ) {
                    continue;
                }

                const previous = campaignByLevel.get(id);

                if (!previous) {
                    campaignByLevel.set(id, item);
                    continue;
                }

                const currentCompleted = item.completed === true;
                const previousCompleted = previous.completed === true;

                const currentStars = Math.min(
                    3,
                    Math.max(0, Math.floor(toNumber(item.best_stars)))
                );

                const previousStars = Math.min(
                    3,
                    Math.max(0, Math.floor(toNumber(previous.best_stars)))
                );

                const currentMoves = item.best_moves == null
                    ? Infinity
                    : toNumber(item.best_moves);

                const previousMoves = previous.best_moves == null
                    ? Infinity
                    : toNumber(previous.best_moves);

                if (
                    (currentCompleted && !previousCompleted) ||
                    (
                        currentCompleted === previousCompleted &&
                        (
                            currentStars > previousStars ||
                            (
                                currentStars === previousStars &&
                                currentMoves < previousMoves
                            )
                        )
                    )
                ) {
                    campaignByLevel.set(id, item);
                }
            }

            const campaignRecords = [...campaignByLevel.values()];

            const completedCampaign = campaignRecords.filter(
                item => item.completed === true
            );

            const completedLevelIds = new Set(
                completedCampaign.map(item => Number(item.level_id))
            );

            const completedCount = completedLevelIds.size;
            const totalLevels = activeLevelIds.size;

            const campaignPercent = totalLevels > 0
                ? Math.min(100, completedCount / totalLevels * 100)
                : 0;

            // Gespeicherte Sterne je abgeschlossenem Level.
            const campaignStars = completedCampaign.reduce(
                (sum, item) =>
                    sum + Math.min(
                        3,
                        Math.max(0, Math.floor(toNumber(item.best_stars)))
                    ),
                0
            );

            const campaignMaxStars = totalLevels * 3;

            const levelByNumber = new Map(
                levels.map(level => [
                    Number(level.level_number),
                    level
                ])
            );

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

            const validMoveRecords = completedCampaign.filter(
                item =>
                    item.best_moves != null &&
                    Number.isFinite(Number(item.best_moves)) &&
                    Number(item.best_moves) >= 0
            );

            const campaignMoves = validMoveRecords.reduce(
                (sum, item) => sum + toNumber(item.best_moves),
                0
            );

            const averageMoves = validMoveRecords.length > 0
                ? campaignMoves / validMoveRecords.length
                : null;

            const unlockedLevelIds = new Set(
                unlocks
                    .map(item => Number(item.level_id))
                    .filter(id => activeLevelIds.has(id))
            );

            if (activeLevelIds.has(1)) {
                unlockedLevelIds.add(1);
            }

            // Bereits abgeschlossene Level gelten als zugänglich.
            for (const id of completedLevelIds) {
                unlockedLevelIds.add(id);
            }

            const unlockedLevels = unlockedLevelIds.size;

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
            setText("campaignCompletedCard", formatNumber(completedCount));
            setText("campaignStars", formatNumber(campaignStars));
            setText("campaignXP", formatNumber(campaignXP));
            setText("campaignMoves", formatNumber(campaignMoves));

            setText(
                "campaignAverageMoves",
                averageMoves == null
                    ? "—"
                    : formatNumber(averageMoves)
            );

            setText("campaignStarsMax", formatNumber(campaignMaxStars));

            setWidth(
                "campaignStarsProgressBar",
                campaignMaxStars > 0
                    ? campaignStars / campaignMaxStars * 100
                    : 0
            );

            if (typeof renderCampaignLevels === "function") {
                renderCampaignLevels(
                    levels,
                    campaignRecords,
                    unlockedLevelIds
                );
            }

            // -------------------------------------------------
            // 9. CHALLENGES
            // -------------------------------------------------

            const unavailable = "Nicht verfügbar";

            setText("challengeStarted", unavailable);
            setText("challengeCompleted", unavailable);
            setText("challengeWinRate", unavailable);
            setText("challengeBestMoves", unavailable);
            setText("challengeBestTime", unavailable);
            setText("challengeXP", unavailable);
            setText("challengeStars", unavailable);

            // -------------------------------------------------
            // 10. RANKED — RATING UND STATISTIK
            // -------------------------------------------------

            const rankedData = rankedStats || rankedProfile || {};

            const rankedRating = Math.max(
                0,
                toNumber(rankedData.rating ?? 1000)
            );

            const rankedPlayed = Math.max(
                0,
                toNumber(rankedData.games_played)
            );

            const rankedWins = Math.max(
                0,
                toNumber(rankedData.wins)
            );

            const rankedLosses = Math.max(
                0,
                toNumber(rankedData.losses)
            );

            const rankedDraws = Math.max(
                0,
                toNumber(rankedData.draws)
            );

            const rankedWinRate = rankedPlayed > 0
                ? rankedWins / rankedPlayed * 100
                : 0;

            const parsedRank = Number(rankedProfile?.rank_position);

            const rankPosition =
                Number.isInteger(parsedRank) && parsedRank > 0
                    ? parsedRank
                    : null;

            const rankedPlayers = Math.max(
                0,
                toNumber(rankedProfile?.ranked_players)
            );

            // Liga anhand des Ratings.
            function getRankedTier(rating, gamesPlayed) {
                if (gamesPlayed <= 0) return "Unranked";
                if (rating < 1000) return "Bronze";
                if (rating < 1200) return "Silber";
                if (rating < 1400) return "Gold";
                if (rating < 1600) return "Platin";
                if (rating < 1800) return "Diamant";

                return "Meister";
            }

            const rankedTier = getRankedTier(
                rankedRating,
                rankedPlayed
            );

            // -------------------------------------------------
            // 11. RANKED-HISTORIE LADEN
            // -------------------------------------------------

            const rankedMatchIds = [
                ...new Set(
                    rankedPlayerMatches
                        .map(item => item.match_id)
                        .filter(Boolean)
                )
            ];

            let rankedMatches = [];

            let rankedHistoryAvailable =
                !rankedPlayerMatchesResult.error;

            if (rankedMatchIds.length > 0) {
                const {
                    data: matchRows,
                    error: matchHistoryError
                } = await db
                    .from("ranked_live_matches")
                    .select(`
                        id,
                        status,
                        winner_id,
                        is_draw,
                        finished_at,
                        started_at
                    `)
                    .in("id", rankedMatchIds)
                    .eq("status", "completed")
                    .order("finished_at", {
                        ascending: false
                    });

                if (matchHistoryError) {
                    rankedHistoryAvailable = false;
                } else {
                    rankedMatches = Array.isArray(matchRows)
                        ? matchRows
                        : [];
                }
            }

            // -------------------------------------------------
            // 12. RANKED-SIEGESSERIEN
            // -------------------------------------------------

            let rankedCurrentStreak = 0;
            let rankedBestStreak = 0;

            if (rankedHistoryAvailable) {
                const getMatchDate = match =>
                    new Date(
                        match.finished_at || match.started_at
                    ).getTime();

                const matchesNewestFirst = [...rankedMatches].sort(
                    (a, b) => getMatchDate(b) - getMatchDate(a)
                );

                let currentStreakOpen = true;

                for (const match of matchesNewestFirst) {
                    const isWin =
                        match.winner_id === userId &&
                        match.is_draw !== true;

                    if (currentStreakOpen) {
                        if (isWin) {
                            rankedCurrentStreak++;
                        } else {
                            currentStreakOpen = false;
                        }
                    }
                }

                const matchesOldestFirst = [...matchesNewestFirst].reverse();

                let runningStreak = 0;

                for (const match of matchesOldestFirst) {
                    const isWin =
                        match.winner_id === userId &&
                        match.is_draw !== true;

                    if (isWin) {
                        runningStreak++;

                        rankedBestStreak = Math.max(
                            rankedBestStreak,
                            runningStreak
                        );
                    } else {
                        runningStreak = 0;
                    }
                }
            }

            // -------------------------------------------------
            // 13. RANKED-MONATSSTATISTIK
            // -------------------------------------------------

            let rankedSeasonWins = 0;
            let rankedSeasonLosses = 0;

            if (rankedHistoryAvailable) {
                const now = new Date();

                const monthStart = new Date(
                    now.getFullYear(),
                    now.getMonth(),
                    1
                );

                for (const match of rankedMatches) {
                    const date = new Date(
                        match.finished_at || match.started_at
                    );

                    if (
                        Number.isNaN(date.getTime()) ||
                        date < monthStart ||
                        match.is_draw === true
                    ) {
                        continue;
                    }

                    if (match.winner_id === userId) {
                        rankedSeasonWins++;
                    } else {
                        rankedSeasonLosses++;
                    }
                }
            }

            // -------------------------------------------------
            // 14. RANKED-ANZEIGE
            // -------------------------------------------------

            if (rankedPlayed <= 0) {
                setText("rankedRank", "Unranked");
                setText("rankBadge", "Unranked");

                setText(
                    "rankedRankDetail",
                    "Spiele dein erstes Ranked-Match für eine Platzierung."
                );
            } else if (rankPosition !== null) {
                setText(
                    "rankedRank",
                    `#${formatNumber(rankPosition)}`
                );

                setText("rankBadge", rankedTier);

                setText(
                    "rankedRankDetail",
                    rankedPlayers > 0
                        ? `Platz ${formatNumber(rankPosition)} von ${formatNumber(rankedPlayers)}`
                        : `Platz ${formatNumber(rankPosition)}`
                );
            } else {
                setText("rankedRank", "—");
                setText("rankBadge", rankedTier);

                setText(
                    "rankedRankDetail",
                    "Die Rangposition ist derzeit nicht verfügbar."
                );
            }

            setText("rankedRating", formatNumber(rankedRating));
            setText("rankedPlayed", formatNumber(rankedPlayed));
            setText("rankedWins", formatNumber(rankedWins));
            setText("rankedLosses", formatNumber(rankedLosses));
            setText("rankedWinRate", formatPercent(rankedWinRate));

            setText(
                "rankedCurrentStreak",
                rankedHistoryAvailable
                    ? formatNumber(rankedCurrentStreak)
                    : "—"
            );

            setText(
                "rankedBestStreak",
                rankedHistoryAvailable
                    ? formatNumber(rankedBestStreak)
                    : "—"
            );

            setText(
                "rankedSeasonWins",
                rankedHistoryAvailable
                    ? formatNumber(rankedSeasonWins)
                    : "—"
            );

            setText(
                "rankedSeasonLosses",
                rankedHistoryAvailable
                    ? formatNumber(rankedSeasonLosses)
                    : "—"
            );

            setStatus("Profil erfolgreich geladen.");

        } catch (error) {

            setStatus(
                error?.message ||
                    "Beim Laden des Profils ist ein Fehler aufgetreten.",
                true
            );
        }
    }

    function openProfileNameEditor() {
        const nameElement = document.getElementById("profileUsername");
        const editor = document.getElementById("profileNameEditor");
        const input = document.getElementById("profileNameInput");

        if (!nameElement || !editor || !input) return;

        input.value = nameElement.textContent.trim();
        editor.hidden = false;

        requestAnimationFrame(() => {
            input.focus();
            input.select();
        });
    }


    function closeProfileNameEditor() {
        const editor = document.getElementById("profileNameEditor");

        if (!editor) return;

        editor.hidden = true;
    }


    async function saveProfileName() {
        const db = getProfileClient();

        const input = document.getElementById("profileNameInput");
        const nameElement = document.getElementById("profileUsername");

        if (!input || !nameElement) return;

        const newName = input.value.trim();

        if (newName.length < 3) {
            setStatus(
                "Der Profilname muss mindestens 3 Zeichen lang sein.",
                true
            );
            return;
        }

        if (newName.length > 24) {
            setStatus(
                "Der Profilname darf maximal 24 Zeichen lang sein.",
                true
            );
            return;
        }

        const {
            data: {
                user
            },
            error: userError
        } = await db.auth.getUser();

        if (userError || !user) {
            setStatus("Du bist nicht eingeloggt.", true);
            return;
        }

        const {
            data,
            error
        } = await db
            .from("profiles")
            .update({
                username: newName,
                display_name: newName
            })
            .eq("id", user.id)
            .select("id, username, display_name")
            .maybeSingle();

        if (error) {
            setStatus(
                `Profilname konnte nicht gespeichert werden: ${error.message}`,
                true
            );

            return;
        }

        const savedName =
            data?.display_name ||
            data?.username ||
            newName;

        nameElement.textContent = savedName;

        closeProfileNameEditor();

        setStatus("Profilname wurde gespeichert.");
    }


    function setupProfileNameEditor() {
        const editButton = document.getElementById(
            "editProfileNameButton"
        );

        const saveButton = document.getElementById(
            "saveProfileNameButton"
        );

        const cancelButton = document.getElementById(
            "cancelProfileNameButton"
        );

        const input = document.getElementById(
            "profileNameInput"
        );

        editButton?.addEventListener(
            "click",
            openProfileNameEditor
        );

        saveButton?.addEventListener(
            "click",
            saveProfileName
        );

        cancelButton?.addEventListener(
            "click",
            closeProfileNameEditor
        );

        input?.addEventListener("keydown", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                saveProfileName();
            }

            if (event.key === "Escape") {
                event.preventDefault();
                closeProfileNameEditor();
            }
        });
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
            () => {
                setupProfileNameEditor();
                loadProfile();
            },
            { once: true }
        );
    } else {
        setupProfileNameEditor();
        loadProfile();
    }
})();