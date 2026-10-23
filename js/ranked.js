"use strict";

/* =========================================================
   FILLER — LIVE RANKED
   Gemeinsames Spielfeld, 1v1, 120 Sekunden

   Serverfunktionen:
   - join_ranked_live_queue
   - leave_ranked_live_queue
   - get_current_ranked_live_match
   - get_ranked_live_match
   - submit_ranked_live_move
   - get_ranked_leaderboard

   Besitzregel:
   Eine eroberte Zelle hat dauerhaft einen Besitzer.
   Fremde Gebiete können nicht zurückerobert werden.
   ========================================================= */

(() => {
    const POLL_INTERVAL_MS = 1000;
    const QUEUE_INTERVAL_MS = 2200;
    const TOTAL_MATCH_MS = 120000;

    const $ = id => document.getElementById(id);

    const COLORS = [
        "#ef476f",
        "#ffd166",
        "#06d6a0",
        "#118ab2",
        "#9b5de5",
        "#f15bb5",
        "#ff7b00",
        "#80ed99"
    ];

    const FALLBACK_BORDER_COLORS = [
        "#56e0ff",
        "#ff66c4",
        "#ffd166",
        "#80ed99",
        "#c4b5fd"
    ];

    let db = null;
    let user = null;
    let playerName = "Spieler";

    let searching = false;
    let movePending = false;
    let resultShown = false;

    let currentMatch = null;
    let currentPlayers = [];
    let matchChannel = null;

    let queueTimer = null;
    let pollTimer = null;
    let clockTimer = null;

    let boardColors = [];
    let boardOwners = [];

    let stateVersion = -1;
    let lastRenderedVersion = -1;

    let refreshPending = false;
    let lastRefreshAt = 0;
    let countdownTriggered = false;

    // =====================================================
    // 1. SUPABASE
    // =====================================================

    function getClient() {
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

    function getErrorMessage(error) {
        return error?.message ||
            String(error || "Unbekannter Fehler");
    }

    // =====================================================
    // 2. UI-HILFSFUNKTIONEN
    // =====================================================

    function setText(id, value) {
        const element = $(id);

        if (element) {
            element.textContent = String(value ?? "");
        }
    }

    function show(id, visible) {
        const element = $(id);

        if (element) {
            element.hidden = !visible;
        }
    }

    function setGlobalStatus(message, isError = false) {
        const element = $("ranked-global-status");

        if (!element) return;

        element.textContent = message;
        element.classList.toggle("is-error", isError);
    }

    function formatNumber(value) {
        const number = Number(value ?? 0);

        return Number.isFinite(number)
            ? Math.round(number).toLocaleString("de-DE")
            : "0";
    }

    function formatPercent(value) {
        const number = Number(value ?? 0);

        return `${(
            Number.isFinite(number) ? number : 0
        ).toLocaleString("de-DE", {
            maximumFractionDigits: 1
        })} %`;
    }

    function formatSigned(value) {
        const number = Number(value ?? 0);

        if (!Number.isFinite(number)) {
            return "—";
        }

        if (number > 0) return `+${number}`;

        return String(number);
    }

    function formatClock(milliseconds) {
        const seconds = Math.max(
            0,
            Math.ceil(milliseconds / 1000)
        );

        const minutes = Math.floor(seconds / 60);
        const rest = seconds % 60;

        return (
            String(minutes).padStart(2, "0") +
            ":" +
            String(rest).padStart(2, "0")
        );
    }

    function stopTimer(name) {
        if (name === "queue" && queueTimer !== null) {
            clearTimeout(queueTimer);
            queueTimer = null;
        }

        if (name === "poll" && pollTimer !== null) {
            clearInterval(pollTimer);
            pollTimer = null;
        }

        if (name === "clock" && clockTimer !== null) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
    }

    function stopAllTimers() {
        stopTimer("queue");
        stopTimer("poll");
        stopTimer("clock");
    }

    async function removeMatchChannel() {
        const channel = matchChannel;

        matchChannel = null;

        if (!channel || !db) return;

        try {
            await db.removeChannel(channel);
        } catch (error) {
            console.warn(
                "[Ranked] Realtime-Kanal konnte nicht entfernt werden:",
                error
            );
        }
    }

    // =====================================================
    // 3. SPIELER UND PROFIL
    // =====================================================

    async function loadPlayerIdentity() {
        const {
            data,
            error
        } = await db.auth.getUser();

        if (error) throw error;

        user = data?.user || null;

        if (!user) {
            window.location.href = "../index.html";
            return false;
        }

        playerName =
            user.user_metadata?.username ||
            user.user_metadata?.display_name ||
            user.email?.split("@")[0] ||
            "Spieler";

        try {
            const { data: profile, error: profileError } =
                await db
                    .from("profiles")
                    .select("username")
                    .eq("id", user.id)
                    .maybeSingle();

            if (!profileError && profile?.username) {
                playerName = profile.username;
            }
        } catch (error) {
            console.warn(
                "[Ranked] Profilname konnte nicht geladen werden:",
                error
            );
        }

        return true;
    }

    // =====================================================
    // 4. RATING-STATISTIK
    // =====================================================

    async function loadPlayerStats() {
        if (!user) return;

        const { data, error } = await db
            .from("ranked_player_stats")
            .select(
                "rating, games_played, wins, losses, draws"
            )
            .eq("user_id", user.id)
            .maybeSingle();

        if (error) {
            console.error(
                "[Ranked] Statistik konnte nicht geladen werden:",
                error
            );

            return;
        }

        const stats = data || {
            rating: 1000,
            games_played: 0,
            wins: 0,
            losses: 0,
            draws: 0
        };

        setText("ranked-rating", stats.rating);
        setText("ranked-games", stats.games_played);
        setText("ranked-wins", stats.wins);
        setText("ranked-losses", stats.losses);
        setText("ranked-draws", stats.draws);
    }

    // =====================================================
    // 5. LEADERBOARD
    // =====================================================

    async function loadLeaderboard() {
        const container = $("ranked-leaderboard");

        if (!container) return;

        const { data, error } = await db.rpc(
            "get_ranked_leaderboard"
        );

        container.replaceChildren();

        if (error) {
            const message = document.createElement("p");

            message.className = "muted";
            message.textContent =
                "Die Rangliste ist momentan nicht verfügbar.";

            container.appendChild(message);

            console.warn(
                "[Ranked] Leaderboard-Fehler:",
                error
            );

            return;
        }

        if (!Array.isArray(data) || data.length === 0) {
            const message = document.createElement("p");

            message.className = "muted";
            message.textContent =
                "Noch keine Ranked-Spieler vorhanden.";

            container.appendChild(message);

            return;
        }

        data.forEach((player, index) => {
            const row = document.createElement("div");

            row.className = "ranked-leaderboard-row";

            const place = document.createElement("div");

            place.className = "ranked-leaderboard-place";
            place.textContent = `#${index + 1}`;

            const identity = document.createElement("div");

            const name = document.createElement("div");

            name.className = "ranked-leaderboard-name";
            name.textContent = player.username || "Spieler";

            const record = document.createElement("div");

            record.className = "ranked-leaderboard-record";
            record.textContent =
                `${formatNumber(player.wins)} Siege · ` +
                `${formatNumber(player.losses)} Niederlagen · ` +
                `${formatNumber(player.draws)} Remis`;

            identity.append(name, record);

            const rating = document.createElement("div");

            rating.className = "ranked-leaderboard-rating";
            rating.textContent = formatNumber(player.rating);

            row.append(place, identity, rating);

            container.appendChild(row);
        });
    }

    // =====================================================
    // 6. SPIELER DES MATCHES
    // =====================================================

    function getSelfParticipant() {
        if (!user) return null;

        return currentPlayers.find(
            item => item.user_id === user.id
        ) || null;
    }

    function getOpponentParticipant() {
        if (!user) return null;

        return currentPlayers.find(
            item => item.user_id !== user.id
        ) || null;
    }

    function getOwnerDisplayClass(ownerId) {
        if (!ownerId) return "owner-empty";

        return ownerId === user.id
            ? "owner-self"
            : "owner-opponent";
    }

    function getSpawnClass(row, col) {
        const self = getSelfParticipant();
        const opponent = getOpponentParticipant();

        if (
            self &&
            Number(self.spawn_row) === row &&
            Number(self.spawn_col) === col
        ) {
            return "spawn-self";
        }

        if (
            opponent &&
            Number(opponent.spawn_row) === row &&
            Number(opponent.spawn_col) === col
        ) {
            return "spawn-opponent";
        }

        return "";
    }

    function getPlayerBorderColor(player) {
        if (player?.player_border_color) {
            return player.player_border_color;
        }

        const slot = Math.max(
            1,
            Number(player?.slot) || 1
        );

        return FALLBACK_BORDER_COLORS[
            (slot - 1) % FALLBACK_BORDER_COLORS.length
        ];
    }

    // =====================================================
    // 7. BOARD AUS SERVERZUSTAND
    // =====================================================

    function validateBoardState(match) {
        let colors = match.board_colors;
        let owners = match.board_owners;

        if (typeof colors === "string") {
            colors = JSON.parse(colors);
        }

        if (typeof owners === "string") {
            owners = JSON.parse(owners);
        }

        const size = Number(match.board_size);
        const colorCount = Number(match.color_count);

        if (
            !Number.isInteger(size) ||
            size < 2 ||
            size > 18
        ) {
            throw new Error("Ungültige Board-Größe.");
        }

        if (
            !Number.isInteger(colorCount) ||
            colorCount < 2 ||
            colorCount > COLORS.length
        ) {
            throw new Error("Ungültige Farbanzahl.");
        }

        if (
            !Array.isArray(colors) ||
            colors.length !== size ||
            !Array.isArray(owners) ||
            owners.length !== size
        ) {
            throw new Error("Das gemeinsame Board ist ungültig.");
        }

        for (let row = 0; row < size; row++) {
            if (
                !Array.isArray(colors[row]) ||
                colors[row].length !== size ||
                !Array.isArray(owners[row]) ||
                owners[row].length !== size
            ) {
                throw new Error(
                    `Zeile ${row + 1} ist unvollständig.`
                );
            }

            for (let col = 0; col < size; col++) {
                const color = Number(colors[row][col]);

                if (
                    !Number.isInteger(color) ||
                    color < 0 ||
                    color >= colorCount
                ) {
                    throw new Error(
                        `Ungültige Farbe in Feld ${row + 1}/${col + 1}.`
                    );
                }

                const owner = owners[row][col];

                if (
                    owner !== null &&
                    typeof owner !== "string"
                ) {
                    throw new Error(
                        `Ungültiger Besitzer in Feld ${row + 1}/${col + 1}.`
                    );
                }
            }
        }

        return {
            colors,
            owners
        };
    }

    // =====================================================
    // 8. MATCHMAKING
    // =====================================================

    async function startSearch() {
        if (searching || currentMatch?.status === "active") {
            return;
        }

        searching = true;

        stopTimer("queue");

        show("ranked-search-indicator", true);
        show("ranked-cancel-search", true);
        show("ranked-match-panel", false);
        show("ranked-search-panel", true);

        const button = $("ranked-find-button");

        if (button) {
            button.disabled = true;
        }

        setText("ranked-search-title", "Suche läuft");
        setText(
            "ranked-search-detail",
            "Warte auf einen anderen Spieler …"
        );

        setGlobalStatus("Du bist in der Ranked-Warteschlange.");

        await queryQueue();
    }

    async function queryQueue() {
        if (!searching) return;

        try {
            const { data, error } = await db.rpc(
                "join_ranked_live_queue",
                { p_mode: "1v1" }
            );

            if (error) throw error;

            if (data?.status === "matched" && data.match) {
                searching = false;

                stopTimer("queue");

                show("ranked-search-indicator", false);
                show("ranked-cancel-search", false);

                const button = $("ranked-find-button");

                if (button) {
                    button.disabled = false;
                }

                await acceptMatchPayload(data);
                return;
            }

            setText(
                "ranked-search-title",
                "Warte auf einen Gegner"
            );

            setText(
                "ranked-search-detail",
                "Das Match startet, sobald ein zweiter Spieler gefunden wird."
            );

            setGlobalStatus("Suche nach einem echten Gegner …");
        } catch (error) {
            console.error(
                "[Ranked] Matchmaking fehlgeschlagen:",
                error
            );

            setGlobalStatus(
                `Matchmaking fehlgeschlagen: ${getErrorMessage(error)}`,
                true
            );
        }

        if (searching) {
            queueTimer = setTimeout(
                queryQueue,
                QUEUE_INTERVAL_MS
            );
        }
    }

    async function cancelSearch() {
        if (!searching) return;

        searching = false;

        stopTimer("queue");

        show("ranked-search-indicator", false);
        show("ranked-cancel-search", false);

        const button = $("ranked-find-button");

        if (button) {
            button.disabled = false;
        }

        try {
            const { error } = await db.rpc(
                "leave_ranked_live_queue"
            );

            if (error) throw error;

            setGlobalStatus("Ranked-Suche abgebrochen.");
        } catch (error) {
            console.error(
                "[Ranked] Warteschlange konnte nicht verlassen werden:",
                error
            );

            setGlobalStatus(
                `Warteschlange: ${getErrorMessage(error)}`,
                true
            );
        }
    }

    // =====================================================
    // 9. MATCH WIEDERHERSTELLEN
    // =====================================================

    async function restoreCurrentMatch() {
        const { data, error } = await db.rpc(
            "get_current_ranked_live_match"
        );

        if (error) {
            throw error;
        }

        if (data?.status === "active" && data.match) {
            await acceptMatchPayload(data);
            return true;
        }

        return false;
    }

    async function acceptMatchPayload(payload) {
        if (!payload?.match) {
            throw new Error("Das Match enthält keine Kartendaten.");
        }

        await applyServerState(payload);

        if (currentMatch?.status === "active") {
            show("ranked-search-panel", false);
            show("ranked-match-panel", true);

            await startRealtime();
            startPolling();
            startClock();

            setGlobalStatus("Du spielst live gegen deinen Gegner.");
        } else if (currentMatch?.status === "completed") {
            await displayCompletedResult();
        }
    }

    // =====================================================
    // 10. SERVERZUSTAND ANWENDEN
    // =====================================================

    async function applyServerState(payload) {
        const incomingMatch = payload?.match || payload;

        if (!incomingMatch?.id) {
            throw new Error("Ungültiger Matchstatus.");
        }

        const incomingVersion = Number(
            incomingMatch.state_version ?? 0
        );

        /*
         * Veraltete Antworten dürfen einen neueren Spielstand
         * nicht überschreiben.
         */
        if (
            currentMatch?.id === incomingMatch.id &&
            incomingVersion < stateVersion
        ) {
            return;
        }

        const newMatch =
            !currentMatch ||
            currentMatch.id !== incomingMatch.id;

        if (newMatch) {
            currentMatch = null;

            stateVersion = -1;
            lastRenderedVersion = -1;

            resultShown = false;
            movePending = false;

            await removeMatchChannel();
            stopTimer("poll");
            stopTimer("clock");
        }

        currentMatch = incomingMatch;

        if (Array.isArray(payload?.players)) {
            currentPlayers = payload.players;
        }

        const parsed = validateBoardState(currentMatch);

        boardColors = parsed.colors;
        boardOwners = parsed.owners;

        const versionChanged =
            incomingVersion !== lastRenderedVersion;

        stateVersion = incomingVersion;

        if (newMatch || versionChanged) {
            renderBoard();
            renderColorPicker();

            lastRenderedVersion = incomingVersion;
        }

        updatePlayerCards();
        updateGameCounters();
        updateColorPickerSelection();

        if (newMatch) {
            const self = getSelfParticipant();

            setText("ranked-match-title", "Gebietskampf");

            setText("ranked-match-time", "02:00");

            setText("ranked-game-status", "Wähle deine nächste Farbe.");

            show("ranked-search-panel", false);
            show("ranked-match-panel", true);
        }

        if (currentMatch.status === "completed") {
            await displayCompletedResult();
        } else {
            show("ranked-match-result", false);
        }
    }

    // =====================================================
    // 11. SPIELERKARTEN
    // =====================================================

    function updatePlayerCards() {
        const self = getSelfParticipant();
        const opponent = getOpponentParticipant();

        if (!self) return;

        const size = Number(currentMatch?.board_size) || 12;
        const total = size * size;

        const selfOwned = Number(self.owned_cells) || 0;
        const opponentOwned = Number(opponent?.owned_cells) || 0;

        setText("ranked-me-name", playerName);

        setText(
            "ranked-opponent-name",
            opponent?.username || "Gegner"
        );

        setText(
            "ranked-me-rating",
            `Rating ${formatNumber(self.rating_before)}`
        );

        setText(
            "ranked-opponent-rating",
            `Rating ${formatNumber(opponent?.rating_before)}`
        );

        setText("ranked-me-owned", selfOwned);
        setText("ranked-opponent-owned", opponentOwned);

        setText(
            "ranked-me-progress",
            `${formatPercent(selfOwned / total * 100)} des Boards`
        );

        setText(
            "ranked-opponent-progress",
            `${formatPercent(opponentOwned / total * 100)} des Boards`
        );

        const meBar = $("ranked-me-progress-bar");
        const opponentBar = $("ranked-opponent-progress-bar");

        if (meBar) {
            meBar.style.width =
                `${Math.min(100, selfOwned / total * 100)}%`;
        }

        if (opponentBar) {
            opponentBar.style.width =
                `${Math.min(100, opponentOwned / total * 100)}%`;
        }

        $("ranked-me-name")?.closest(".ranked-player-card")
            ?.classList.add("player-self");

        $("ranked-opponent-name")?.closest(".ranked-player-card")
            ?.classList.add("player-opponent");
    }

    // =====================================================
    // 12. SPIELFELD RENDERN
    // =====================================================

    function renderBoard() {
        const container = $("ranked-board");

        if (!container || !currentMatch) return;

        const size = Number(currentMatch.board_size);

        container.replaceChildren();

        container.style.setProperty(
            "--ranked-board-size",
            String(size)
        );

        const fragment = document.createDocumentFragment();

        const self = getSelfParticipant();
        const opponent = getOpponentParticipant();

        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const cell = document.createElement("div");

                const color = Number(boardColors[row][col]);
                const owner = boardOwners[row][col];

                cell.className = "ranked-cell";
                cell.style.backgroundColor =
                    COLORS[color] || "#6c757d";

                cell.classList.add(
                    getOwnerDisplayClass(owner)
                );

                const spawnClass = getSpawnClass(row, col);

                if (spawnClass) {
                    cell.classList.add(spawnClass);
                }

                if (owner && self && owner === self.user_id) {
                    cell.style.borderColor =
                        getPlayerBorderColor(self);
                } else if (
                    owner &&
                    opponent &&
                    owner === opponent.user_id
                ) {
                    cell.style.borderColor =
                        getPlayerBorderColor(opponent);
                }

                cell.setAttribute(
                    "aria-label",
                    `Zeile ${row + 1}, Spalte ${col + 1}, ` +
                    `Farbe ${color + 1}, ` +
                    (owner
                        ? owner === user.id
                            ? "dein Gebiet"
                            : "Gebiet des Gegners"
                        : "freies Feld")
                );

                fragment.appendChild(cell);
            }
        }

        container.appendChild(fragment);
    }

    // =====================================================
    // 13. FARBWAHL
    // =====================================================

    function renderColorPicker() {
        const container = $("ranked-color-picker");

        if (!container || !currentMatch) return;

        container.replaceChildren();

        const count = Number(currentMatch.color_count);

        for (let color = 0; color < count; color++) {
            const button = document.createElement("button");

            button.type = "button";
            button.className = "ranked-color-button";

            button.style.backgroundColor =
                COLORS[color] || "#6c757d";

            button.dataset.color = String(color);

            button.title = `Farbe ${color + 1}`;

            button.setAttribute(
                "aria-label",
                `Farbe ${color + 1} auswählen`
            );

            button.addEventListener("click", () => {
                void submitMove(color);
            });

            container.appendChild(button);
        }

        updateColorPickerSelection();
    }

    function updateColorPickerSelection() {
        const container = $("ranked-color-picker");

        if (!container) return;

        const self = getSelfParticipant();

        const currentColor = self
            ? Number(self.current_color)
            : -1;

        container
            .querySelectorAll(".ranked-color-button")
            .forEach(button => {
                const color = Number(button.dataset.color);

                button.classList.toggle(
                    "selected",
                    color === currentColor
                );

                button.disabled =
                    movePending ||
                    !currentMatch ||
                    currentMatch.status !== "active" ||
                    color === currentColor;
            });
    }

    // =====================================================
    // 14. ECHTEN ZUG AUF DEM SERVER AUSFÜHREN
    // =====================================================

    async function submitMove(color) {
        if (
            movePending ||
            !currentMatch ||
            currentMatch.status !== "active"
        ) {
            return;
        }

        const self = getSelfParticipant();

        if (!self) {
            setGlobalStatus(
                "Dein Spielerstatus wurde nicht geladen.",
                true
            );

            return;
        }

        if (Number(color) === Number(self.current_color)) {
            return;
        }

        const remaining =
            Date.parse(currentMatch.ends_at) - Date.now();

        if (remaining <= 0) {
            await refreshMatch();
            return;
        }

        movePending = true;
        updateColorPickerSelection();

        try {
            const { data, error } = await db.rpc(
                "submit_ranked_live_move",
                {
                    p_match_id: currentMatch.id,
                    p_color: color
                }
            );

            if (error) {
                throw error;
            }

            await applyServerState(data);

            if (currentMatch?.status === "active") {
                setText(
                    "ranked-game-status",
                    "Gebiet aktualisiert. Du kannst die nächste Farbe wählen."
                );
            }
        } catch (error) {
            console.error(
                "[Ranked] Zug konnte nicht verarbeitet werden:",
                error
            );

            setText(
                "ranked-game-status",
                `Zug nicht angenommen: ${getErrorMessage(error)}`
            );

            /*
             * Bei einem Konflikt oder Zeitablauf aktuellen
             * Zustand neu vom Server laden.
             */
            await refreshMatch();
        } finally {
            movePending = false;
            updateColorPickerSelection();
        }
    }

    // =====================================================
    // 15. BOARD- UND MATCHSTATUS AKTUALISIEREN
    // =====================================================

    async function refreshMatch() {
        if (
            refreshPending ||
            !currentMatch?.id
        ) {
            return;
        }

        refreshPending = true;

        try {
            const { data, error } = await db.rpc(
                "get_ranked_live_match",
                {
                    p_match_id: currentMatch.id
                }
            );

            if (error) throw error;

            if (data) {
                await applyServerState(data);
            }
        } catch (error) {
            console.warn(
                "[Ranked] Spielstatus konnte nicht aktualisiert werden:",
                error
            );
        } finally {
            refreshPending = false;
            lastRefreshAt = Date.now();
        }
    }

    // =====================================================
    // 16. REALTIME
    // =====================================================

    async function startRealtime() {
        if (!db || !currentMatch?.id || matchChannel) {
            return;
        }

        const matchId = currentMatch.id;

        const channel = db.channel(
            `ranked-live-${matchId}-${user.id}`
        );

        channel.on(
            "postgres_changes",
            {
                event: "UPDATE",
                schema: "public",
                table: "ranked_live_matches",
                filter: `id=eq.${matchId}`
            },
            () => {
                /*
                 * Das Event signalisiert eine Änderung.
                 * Der komplette autoritative Zustand wird
                 * über die geprüfte RPC abgefragt.
                 */
                void refreshMatch();
            }
        );

        channel.subscribe(status => {
            if (status === "SUBSCRIBED") {
                console.info(
                    "[Ranked] Realtime verbunden.",
                    matchId
                );
            }

            if (status === "CHANNEL_ERROR") {
                console.warn(
                    "[Ranked] Realtime-Verbindung fehlgeschlagen. " +
                    "Polling bleibt aktiv."
                );
            }
        });

        matchChannel = channel;
    }

    // =====================================================
    // 17. LIVE-POLLING
    // Serverzeit entscheidet über das Ende nach 120s.
    // =====================================================

    function startPolling() {
        stopTimer("poll");

        pollTimer = setInterval(() => {
            if (!currentMatch || currentMatch.status !== "active") {
                return;
            }

            void refreshMatch();
        }, POLL_INTERVAL_MS);
    }

    function startClock() {
        stopTimer("clock");

        const update = () => {
            if (!currentMatch) return;

            const endTime = Date.parse(currentMatch.ends_at);

            const remaining = Number.isFinite(endTime)
                ? Math.max(0, endTime - Date.now())
                : 0;

            setText(
                "ranked-match-time",
                formatClock(remaining)
            );

            if (remaining <= 0 && !countdownTriggered) {
                countdownTriggered = true;
                void refreshMatch();
            }
        };

        countdownTriggered = false;

        update();

        clockTimer = setInterval(update, 200);
    }

    // =====================================================
    // 18. MATCH ERGEBNIS
    // =====================================================

    async function displayCompletedResult() {
        if (resultShown || !currentMatch) return;

        resultShown = true;

        stopTimer("poll");
        stopTimer("clock");
        stopTimer("queue");

        await removeMatchChannel();

        show("ranked-search-panel", false);
        show("ranked-match-panel", true);
        show("ranked-match-result", true);
        show("ranked-waiting-result", false);

        const self = getSelfParticipant();
        const opponent = getOpponentParticipant();

        const draw = currentMatch.is_draw === true;

        const myWon =
            !draw &&
            currentMatch.winner_id === user.id;

        let title;
        let icon;

        if (draw) {
            title = "Unentschieden";
            icon = "🤝";
        } else if (myWon) {
            title = "Du hast gewonnen!";
            icon = "🏆";
        } else {
            title = "Du hast verloren";
            icon = "🎮";
        }

        setText("ranked-result-title", title);
        setText("ranked-result-icon", icon);

        setText(
            "ranked-result-description",
            currentMatch.finish_reason === "board_full"
                ? "Alle Felder wurden erobert."
                : "Die 120 Sekunden sind abgelaufen."
        );

        setText(
            "ranked-result-my-owned",
            self?.owned_cells ?? 0
        );

        setText(
            "ranked-result-opponent-owned",
            opponent?.owned_cells ?? 0
        );

        setText(
            "ranked-result-rating",
            formatSigned(self?.rating_change)
        );

        setText(
            "ranked-match-title",
            "Match beendet"
        );

        setGlobalStatus(
            draw
                ? "Ranked beendet: Unentschieden."
                : myWon
                    ? "Ranked beendet: Sieg!"
                    : "Ranked beendet: Niederlage."
        );

        await loadPlayerStats();
        await loadLeaderboard();

        const playAgainButton = $("ranked-play-again");

        if (playAgainButton) {
            playAgainButton.disabled = false;
        }
    }

    // =====================================================
    // 19. NEUES MATCH
    // =====================================================

    async function playAgain() {
        if (searching) return;

        await removeMatchChannel();

        stopAllTimers();

        currentMatch = null;
        currentPlayers = [];

        boardColors = [];
        boardOwners = [];

        stateVersion = -1;
        lastRenderedVersion = -1;

        movePending = false;
        resultShown = false;
        countdownTriggered = false;

        show("ranked-match-panel", false);
        show("ranked-match-result", false);
        show("ranked-waiting-result", false);
        show("ranked-search-panel", true);

        const button = $("ranked-find-button");

        if (button) {
            button.disabled = false;
        }

        await loadPlayerStats();
        await startSearch();
    }

    // =====================================================
    // 20. MENÜ
    // =====================================================

    async function backToMenu() {
        if (searching) {
            await cancelSearch();
        }

        window.location.href = "menu.html";
    }

    // =====================================================
    // 21. INITIALISIERUNG
    // =====================================================

    async function initialize() {
        db = getClient();

        if (!db?.auth) {
            setGlobalStatus(
                "Supabase wurde nicht initialisiert. " +
                "Prüfe config.js und supabase.js.",
                true
            );

            return;
        }

        try {
            const authenticated = await loadPlayerIdentity();

            if (!authenticated) return;

            await loadPlayerStats();
            await loadLeaderboard();

            /*
             * Falls der Spieler die Seite im laufenden Match
             * erneut öffnet, wird dasselbe gemeinsame Board geladen.
             */
            const restored = await restoreCurrentMatch();

            if (!restored) {
                setGlobalStatus(
                    "Bereit. Suche einen Gegner, um ein Ranked-Match zu starten."
                );
            }
        } catch (error) {
            console.error(
                "[Ranked] Initialisierung fehlgeschlagen:",
                error
            );

            setGlobalStatus(
                `Ranked konnte nicht geladen werden: ${getErrorMessage(error)}`,
                true
            );
        }
    }

    // =====================================================
    // 22. EVENTS
    // =====================================================

    $("ranked-find-button")?.addEventListener(
        "click",
        () => void startSearch()
    );

    $("ranked-cancel-search")?.addEventListener(
        "click",
        () => void cancelSearch()
    );

    $("ranked-back-button")?.addEventListener(
        "click",
        () => void backToMenu()
    );

    $("ranked-result-menu")?.addEventListener(
        "click",
        () => void backToMenu()
    );

    $("ranked-play-again")?.addEventListener(
        "click",
        () => void playAgain()
    );

    window.addEventListener("beforeunload", () => {
        stopAllTimers();
        /*
         * Kein automatischer Spielabbruch:
         * Das Match kann bei erneuter Anmeldung wiederhergestellt
         * werden.
         */
    });

    // =====================================================
    // 23. START
    // =====================================================

    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            () => void initialize(),
            { once: true }
        );
    } else {
        void initialize();
    }
})();
