"use strict";

/* =========================================================
   FILLER: COLOR FILL — RANKED
   Supabase matchmaking + Realtime + Elo rating
   ========================================================= */

(() => {
    const BOARD_SIZE = 10;
    const COLOR_COUNT = 6;
    const MOVE_LIMIT = 25;
    const POLL_INTERVAL_MS = 2500;

    const COLORS = [
        "#ef476f",
        "#ffd166",
        "#06d6a0",
        "#118ab2",
        "#9b5de5",
        "#f15bb5"
    ];

    const $ = id => document.getElementById(id);

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

    let db = null;
    let user = null;
    let displayName = "Spieler";

    let currentMatch = null;
    let matchChannel = null;

    let searching = false;
    let resultSubmitted = false;
    let gameEnded = false;
    let resultShown = false;

    let queueTimer = null;
    let matchTimer = null;
    let clockTimer = null;

    let board = [];
    let ownedCells = new Set();

    let movesUsed = 0;
    let matchStartedAt = 0;
    let currentOpponentProgress = null;

    // -----------------------------------------------------
    // UI-HILFSFUNKTIONEN
    // -----------------------------------------------------

    function setText(id, value) {
        const element = $(id);

        if (element) {
            element.textContent = String(value ?? "");
        }
    }

    function setStatus(message, isError = false) {
        const element = $("ranked-global-status");

        if (!element) return;

        element.textContent = message;
        element.classList.toggle("is-error", isError);
    }

    function show(element, visible = true) {
        if (element) {
            element.hidden = !visible;
        }
    }

    function formatNumber(value) {
        const number = Number(value ?? 0);

        return Number.isFinite(number)
            ? Math.round(number).toLocaleString("de-DE")
            : "0";
    }

    function formatSigned(value) {
        const number = Number(value ?? 0);

        if (!Number.isFinite(number)) {
            return "—";
        }

        if (number > 0) return `+${number}`;
        return String(number);
    }

    function formatTime(milliseconds) {
        const totalSeconds = Math.max(
            0,
            Math.floor(milliseconds / 1000)
        );

        const minutes = Math.floor(totalSeconds / 60);
        const seconds = totalSeconds % 60;

        return (
            String(minutes).padStart(2, "0") +
            ":" +
            String(seconds).padStart(2, "0")
        );
    }

    function getOpponentId(match) {
        if (!match || !user) return null;

        return match.player1_id === user.id
            ? match.player2_id
            : match.player1_id;
    }

    function isPlayerOne() {
        return currentMatch?.player1_id === user?.id;
    }

    function getOpponentSubmitted(match) {
        return match.player1_id === user.id
            ? match.player2_moves !== null
            : match.player1_moves !== null;
    }

    function getOwnSubmitted(match) {
        return match.player1_id === user.id
            ? match.player1_moves !== null
            : match.player2_moves !== null;
    }

    function stopQueueTimer() {
        if (queueTimer) {
            clearTimeout(queueTimer);
            queueTimer = null;
        }
    }

    function stopMatchTimer() {
        if (matchTimer) {
            clearInterval(matchTimer);
            matchTimer = null;
        }
    }

    function stopClockTimer() {
        if (clockTimer) {
            clearInterval(clockTimer);
            clockTimer = null;
        }
    }

    async function removeMatchChannel() {
        if (!matchChannel || !db) return;

        const channel = matchChannel;
        matchChannel = null;

        try {
            await db.removeChannel(channel);
        } catch (error) {
            console.warn(
                "[Ranked] Realtime-Kanal konnte nicht geschlossen werden:",
                error
            );
        }
    }

    // -----------------------------------------------------
    // PROFIL UND RATING LADEN
    // -----------------------------------------------------

    async function loadOwnName() {
        const fallback =
            user?.user_metadata?.username ||
            user?.user_metadata?.display_name ||
            user?.email?.split("@")[0] ||
            "Spieler";

        displayName = fallback;

        try {
            const { data, error } = await db
                .from("profiles")
                .select("username")
                .eq("id", user.id)
                .maybeSingle();

            if (!error && data?.username) {
                displayName = data.username;
            }
        } catch (error) {
            console.warn(
                "[Ranked] Profilname konnte nicht geladen werden:",
                error
            );
        }
    }

    async function loadPlayerStats() {
        const { data, error } = await db
            .from("ranked_player_stats")
            .select(
                "rating, games_played, wins, losses, draws"
            )
            .eq("user_id", user.id)
            .maybeSingle();

        if (error) {
            console.error(
                "[Ranked] Rating konnte nicht geladen werden:",
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

    async function loadOpponentName(opponentId) {
        const fallback = opponentId
            ? `Spieler ${opponentId.slice(0, 6)}`
            : "Gegner";

        try {
            const { data, error } = await db
                .from("profiles")
                .select("username")
                .eq("id", opponentId)
                .maybeSingle();

            if (!error && data?.username) {
                return data.username;
            }
        } catch (error) {
            console.warn(
                "[Ranked] Gegnername konnte nicht geladen werden:",
                error
            );
        }

        return fallback;
    }

    // -----------------------------------------------------
    // LEADERBOARD
    // -----------------------------------------------------

    async function loadLeaderboard() {
        const container = $("ranked-leaderboard");

        if (!container) return;

        container.replaceChildren();

        const { data, error } = await db.rpc(
            "get_ranked_leaderboard"
        );

        if (error) {
            const paragraph = document.createElement("p");

            paragraph.className = "ranked-leaderboard-empty";
            paragraph.textContent =
                "Die Rangliste ist noch nicht verfügbar. " +
                "Prüfe die SQL-Funktion get_ranked_leaderboard.";

            container.appendChild(paragraph);

            console.warn(
                "[Ranked] Leaderboard konnte nicht geladen werden:",
                error
            );

            return;
        }

        const rows = Array.isArray(data) ? data : [];

        if (rows.length === 0) {
            const paragraph = document.createElement("p");

            paragraph.className = "ranked-leaderboard-empty";
            paragraph.textContent =
                "Noch keine Ranked-Spieler vorhanden.";

            container.appendChild(paragraph);
            return;
        }

        rows.forEach((player, index) => {
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

    // -----------------------------------------------------
    // MATCHMAKING
    // -----------------------------------------------------

    async function startSearch() {
        if (searching || currentMatch?.status === "active") {
            return;
        }

        searching = true;
        stopQueueTimer();

        show($("ranked-search-indicator"), true);
        show($("ranked-cancel-search"), true);

        const button = $("ranked-find-button");

        if (button) {
            button.disabled = true;
        }

        setText("ranked-search-title", "Suche läuft");
        setText(
            "ranked-search-detail",
            "Wir suchen einen echten Spieler."
        );

        setStatus("Du bist in der Ranked-Warteschlange.");

        await queryQueue();
    }

    async function queryQueue() {
        if (!searching) return;

        try {
            const { data, error } = await db.rpc(
                "join_ranked_queue"
            );

            if (error) {
                throw error;
            }

            if (data?.status === "matched" && data.match) {
                searching = false;
                stopQueueTimer();

                const button = $("ranked-find-button");

                if (button) {
                    button.disabled = false;
                }

                show($("ranked-cancel-search"), false);
                show($("ranked-search-indicator"), false);

                await startMatch(data.match);
                return;
            }

            setText(
                "ranked-search-title",
                "Warte auf einen Gegner"
            );

            setText(
                "ranked-search-detail",
                "Sobald ein anderer Spieler sucht, startet das Match."
            );

            setStatus("Wartet auf einen zweiten Spieler …");
        } catch (error) {
            console.error(
                "[Ranked] Matchmaking fehlgeschlagen:",
                error
            );

            setStatus(
                `Matchmaking-Fehler: ${error.message || error}`,
                true
            );
        }

        if (searching) {
            queueTimer = setTimeout(
                queryQueue,
                POLL_INTERVAL_MS
            );
        }
    }

    async function cancelSearch() {
        if (!searching) return;

        searching = false;
        stopQueueTimer();

        const button = $("ranked-find-button");

        if (button) {
            button.disabled = false;
        }

        show($("ranked-cancel-search"), false);
        show($("ranked-search-indicator"), false);

        try {
            const { error } = await db.rpc(
                "leave_ranked_queue"
            );

            if (error) {
                throw error;
            }

            setStatus("Matchmaking abgebrochen.");
        } catch (error) {
            console.error(
                "[Ranked] Warteschlange konnte nicht verlassen werden:",
                error
            );

            setStatus(
                "Die Warteschlange konnte nicht verlassen werden. " +
                "Bitte erneut versuchen.",
                true
            );
        }
    }

    // -----------------------------------------------------
    // LAUFENDES MATCH WIEDERHERSTELLEN
    // -----------------------------------------------------

    async function restoreActiveMatch() {
        try {
            const { data, error } = await db.rpc(
                "get_current_ranked_match"
            );

            if (error) {
                throw error;
            }

            if (data?.status === "active") {
                await startMatch(data);
                setStatus("Dein laufendes Ranked-Match wurde geladen.");
                return true;
            }
        } catch (error) {
            console.warn(
                "[Ranked] Kein Match wiederhergestellt:",
                error
            );
        }

        return false;
    }

    // -----------------------------------------------------
    // MATCH STARTEN
    // -----------------------------------------------------

    async function startMatch(match) {
        if (!match?.id || !user) {
            setStatus(
                "Das Match konnte nicht geladen werden.",
                true
            );
            return;
        }

        if (
            currentMatch &&
            currentMatch.id === match.id &&
            currentMatch.status === "active"
        ) {
            return;
        }

        await removeMatchChannel();
        stopQueueTimer();
        stopMatchTimer();
        stopClockTimer();

        currentMatch = match;

        resultSubmitted = getOwnSubmitted(match);
        gameEnded = resultSubmitted;
        resultShown = false;

        movesUsed = 0;
        currentOpponentProgress = null;

        const startTime = Date.parse(match.started_at);

        matchStartedAt = Number.isFinite(startTime)
            ? startTime
            : Date.now();

        show($("ranked-search-panel"), false);
        show($("ranked-match-panel"), true);
        show($("ranked-match-result"), false);
        show($("ranked-waiting-result"), resultSubmitted);

        setText("ranked-match-title", "Match läuft");
        setText("ranked-me-name", displayName);
        setText(
            "ranked-me-rating",
            `Rating ${$("ranked-rating")?.textContent || "1000"}`
        );

        setText(
            "ranked-move-limit",
            match.move_limit || MOVE_LIMIT
        );

        const opponentId = getOpponentId(match);

        const opponentName = await loadOpponentName(opponentId);

        if (!currentMatch || currentMatch.id !== match.id) {
            return;
        }

        setText("ranked-opponent-name", opponentName);
        setText("ranked-opponent-rating", "Ranked-Spieler");

        if (isPlayerOne()) {
            setText("ranked-me-name", displayName);
            setText("ranked-opponent-name", opponentName);
        } else {
            setText("ranked-me-name", displayName);
            setText("ranked-opponent-name", opponentName);
        }

        try {
            initializeBoardFromMatch(match);
            renderBoard();
            renderColorPicker();
            updateGameStats();
        } catch (error) {
            console.error(
                "[Ranked] Board konnte nicht initialisiert werden:",
                error
            );

            setStatus(
                `Ungültige Ranked-Karte: ${error.message || error}`,
                true
            );

            return;
        }

        setStatus("Du spielst jetzt gegen einen echten Gegner.");

        if (resultSubmitted) {
            disableGameControls();
            show($("ranked-waiting-result"), true);

            setText(
                "ranked-waiting-detail",
                "Dein Ergebnis wurde bereits abgegeben. " +
                "Wir warten auf den Gegner."
            );
        } else {
            setText(
                "ranked-game-status",
                "Fülle die Karte, bevor dein Gegner fertig ist."
            );
        }

        startRealtime(match.id);
        startMatchPolling(match.id);
        startClock();

        sendLiveProgress();
    }

    function initializeBoardFromMatch(match) {
        let raw = match.map_data;

        if (typeof raw === "string") {
            raw = JSON.parse(raw);
        }

        if (
            !Array.isArray(raw) ||
            raw.length !== Number(match.board_size)
        ) {
            throw new Error("Die Kartenhöhe stimmt nicht.");
        }

        board = raw.map(row => {
            const values = typeof row === "string"
                ? Array.from(row).map(Number)
                : row.map(Number);

            if (values.length !== Number(match.board_size)) {
                throw new Error("Eine Kartenzeile ist ungültig.");
            }

            if (
                values.some(value =>
                    !Number.isInteger(value) ||
                    value < 0 ||
                    value >= Number(match.color_count)
                )
            ) {
                throw new Error("Die Karte enthält ungültige Farben.");
            }

            return values;
        });

        ownedCells = new Set(["0,0"]);
    }

    // -----------------------------------------------------
    // SPIELBRETT
    // -----------------------------------------------------

    function renderBoard() {
        const element = $("ranked-board");

        if (!element || !currentMatch) return;

        const size = Number(currentMatch.board_size);

        element.replaceChildren();

        element.style.gridTemplateColumns =
            `repeat(${size}, minmax(0, 1fr))`;

        element.style.gridTemplateRows =
            `repeat(${size}, minmax(0, 1fr))`;

        const fragment = document.createDocumentFragment();

        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const cell = document.createElement("div");
                const key = `${row},${col}`;
                const color = board[row][col];

                cell.className = "ranked-cell";

                cell.style.backgroundColor =
                    COLORS[color] || "#6c757d";

                if (ownedCells.has(key)) {
                    cell.classList.add("owned");
                }

                cell.setAttribute(
                    "aria-label",
                    `Zeile ${row + 1}, Spalte ${col + 1}`
                );

                fragment.appendChild(cell);
            }
        }

        element.appendChild(fragment);
    }

    function renderColorPicker() {
        const element = $("ranked-color-picker");

        if (!element || !currentMatch || !board.length) {
            return;
        }

        element.replaceChildren();

        const count = Number(currentMatch.color_count);

        for (let color = 0; color < count; color++) {
            const button = document.createElement("button");

            button.type = "button";
            button.className = "ranked-color-button";
            button.style.backgroundColor = COLORS[color];
            button.title = `Farbe ${color + 1}`;
            button.setAttribute(
                "aria-label",
                `Farbe ${color + 1}`
            );

            button.addEventListener("click", () => {
                selectColor(color);
            });

            element.appendChild(button);
        }

        updateColorPickerSelection();
    }

    function updateColorPickerSelection() {
        const element = $("ranked-color-picker");

        if (!element || !board.length) return;

        const currentColor = board[0][0];

        element
            .querySelectorAll(".ranked-color-button")
            .forEach((button, index) => {
                const selected = index === currentColor;

                button.classList.toggle("selected", selected);
                button.disabled =
                    gameEnded ||
                    resultSubmitted ||
                    selected;
            });
    }

    // -----------------------------------------------------
    // FLOOD FILL
    // -----------------------------------------------------

    function selectColor(color) {
        if (
            !currentMatch ||
            currentMatch.status !== "active" ||
            gameEnded ||
            resultSubmitted
        ) {
            return;
        }

        if (
            !Number.isInteger(color) ||
            color < 0 ||
            color >= currentMatch.color_count
        ) {
            return;
        }

        if (color === board[0][0]) {
            return;
        }

        movesUsed++;

        floodFill(color);
        renderBoard();
        updateGameStats();
        updateColorPickerSelection();
        sendLiveProgress();

        const total = board.length * board.length;

        if (
            ownedCells.size >= total ||
            movesUsed >= Number(currentMatch.move_limit)
        ) {
            void submitRankedResult();
        }
    }

    function floodFill(color) {
        const size = board.length;
        const queue = [];
        const visited = new Set();

        /*
         * Das bisherige Gebiet wird auf die neue Farbe gesetzt.
         */
        for (const key of ownedCells) {
            const [row, col] = key.split(",").map(Number);

            board[row][col] = color;
            queue.push({ row, col });
            visited.add(key);
        }

        let index = 0;

        while (index < queue.length) {
            const current = queue[index++];

            const neighbors = [
                { row: current.row - 1, col: current.col },
                { row: current.row + 1, col: current.col },
                { row: current.row, col: current.col - 1 },
                { row: current.row, col: current.col + 1 }
            ];

            for (const neighbor of neighbors) {
                const row = neighbor.row;
                const col = neighbor.col;

                if (
                    row < 0 ||
                    col < 0 ||
                    row >= size ||
                    col >= size
                ) {
                    continue;
                }

                const key = `${row},${col}`;

                if (visited.has(key)) continue;

                visited.add(key);

                if (board[row][col] !== color) {
                    continue;
                }

                ownedCells.add(key);
                board[row][col] = color;

                queue.push({ row, col });
            }
        }

        /*
         * Alle beanspruchten Felder auf die neue Farbe setzen.
         */
        for (const key of ownedCells) {
            const [row, col] = key.split(",").map(Number);

            board[row][col] = color;
        }
    }

    // -----------------------------------------------------
    // LIVE-FORTSCHRITT
    // -----------------------------------------------------

    function getFilledPercent() {
        if (!board.length) return 0;

        const total = board.length * board.length;

        return total > 0
            ? ownedCells.size / total * 100
            : 0;
    }

    function updateGameStats() {
        if (!currentMatch) return;

        const total = board.length * board.length;
        const percent = getFilledPercent();

        setText("ranked-moves", movesUsed);
        setText("ranked-filled", ownedCells.size);
        setText("ranked-total", total);

        const ownPercent = $("ranked-me-progress");
        const ownBar = $("ranked-me-progress-bar");

        if (ownPercent) {
            ownPercent.textContent =
                `${percent.toLocaleString("de-DE", {
                    maximumFractionDigits: 1
                })} % gefüllt`;
        }

        if (ownBar) {
            ownBar.style.width = `${percent}%`;
        }
    }

    function sendLiveProgress() {
        if (!currentMatch || !matchChannel) return;

        const payload = {
            userId: user.id,
            moves: movesUsed,
            percent: Number(getFilledPercent().toFixed(2)),
            completed: ownedCells.size >=
                board.length * board.length
        };

        matchChannel.send({
            type: "broadcast",
            event: "progress",
            payload
        }).catch(error => {
            console.warn(
                "[Ranked] Live-Fortschritt konnte nicht gesendet werden:",
                error
            );
        });
    }

    function handleOpponentProgress(payload) {
        if (
            !payload ||
            payload.userId === user.id ||
            !currentMatch
        ) {
            return;
        }

        currentOpponentProgress = payload;

        const percent = Math.max(
            0,
            Math.min(100, Number(payload.percent) || 0)
        );

        setText(
            "ranked-opponent-progress",
            `${percent.toLocaleString("de-DE", {
                maximumFractionDigits: 1
            })} % · ${formatNumber(payload.moves)} Züge`
        );

        const bar = $("ranked-opponent-progress-bar");

        if (bar) {
            bar.style.width = `${percent}%`;
        }
    }

    // -----------------------------------------------------
    // ERGEBNIS ABGEBEN
    // -----------------------------------------------------

    async function submitRankedResult() {
        if (
            !currentMatch ||
            resultSubmitted ||
            currentMatch.status !== "active"
        ) {
            return;
        }

        resultSubmitted = true;
        gameEnded = true;

        disableGameControls();

        show($("ranked-waiting-result"), true);

        setText(
            "ranked-waiting-detail",
            "Dein Ergebnis wird gespeichert. " +
            "Danach warten wir auf deinen Gegner."
        );

        setText(
            "ranked-game-status",
            "Du hast dein Ergebnis abgegeben."
        );

        const total = board.length * board.length;
        const completed = ownedCells.size >= total;
        const percent = Number(getFilledPercent().toFixed(2));

        /*
         * Zeit seit dem serverseitigen Matchstart.
         */
        const durationMs = Math.max(
            0,
            Date.now() - matchStartedAt
        );

        try {
            const { data, error } = await db.rpc(
                "submit_ranked_result",
                {
                    p_match_id: currentMatch.id,
                    p_moves: Math.max(1, movesUsed),
                    p_duration_ms: Math.min(
                        1800000,
                        Math.floor(durationMs)
                    ),
                    p_completed: completed,
                    p_filled_percent: percent
                }
            );

            if (error) {
                throw error;
            }

            if (data?.id === currentMatch.id) {
                handleMatchUpdate(data);
            }

            if (data?.status === "completed") {
                handleMatchUpdate(data);
            } else {
                setText(
                    "ranked-waiting-detail",
                    "Ergebnis gespeichert. Wenn dein Gegner sein " +
                    "Ergebnis abgibt, wird das Match ausgewertet. " +
                    "Bei ausbleibender Abgabe greift der 90-Sekunden-Timeout."
                );
            }
        } catch (error) {
            console.error(
                "[Ranked] Ergebnis konnte nicht gespeichert werden:",
                error
            );

            /*
             * Wiederholungsmöglichkeit erzeugen.
             */
            resultSubmitted = false;
            gameEnded = true;

            setText(
                "ranked-waiting-detail",
                `Speichern fehlgeschlagen: ${error.message || error}`
            );

            let retry = $("ranked-retry-submit");

            if (!retry) {
                retry = document.createElement("button");
                retry.id = "ranked-retry-submit";
                retry.type = "button";
                retry.className = "ranked-secondary-button";
                retry.textContent = "ERGEBNIS ERNEUT SENDEN";

                $("ranked-waiting-result")?.appendChild(retry);
            }

            retry.hidden = false;
            retry.onclick = () => {
                retry.hidden = true;
                void submitRankedResult();
            };
        }

        sendLiveProgress();
    }

    function disableGameControls() {
        const picker = $("ranked-color-picker");

        if (picker) {
            picker
                .querySelectorAll("button")
                .forEach(button => {
                    button.disabled = true;
                });
        }
    }

    // -----------------------------------------------------
    // REALTIME UND MATCH-POLLING
    // -----------------------------------------------------

    function startRealtime(matchId) {
        if (!db || !matchId) return;

        const channel = db.channel(
            `ranked-${matchId}-${user.id}`,
            {
                config: {
                    broadcast: {
                        self: false
                    }
                }
            }
        );

        channel
            .on(
                "broadcast",
                { event: "progress" },
                message => {
                    handleOpponentProgress(message.payload);
                }
            )
            .on(
                "postgres_changes",
                {
                    event: "UPDATE",
                    schema: "public",
                    table: "ranked_matches",
                    filter: `id=eq.${matchId}`
                },
                payload => {
                    if (payload.new) {
                        handleMatchUpdate(payload.new);
                    }
                }
            )
            .subscribe(status => {
                if (status === "SUBSCRIBED") {
                    console.info(
                        "[Ranked] Realtime verbunden:",
                        matchId
                    );
                }
            });

        matchChannel = channel;
    }

    function startMatchPolling(matchId) {
        stopMatchTimer();

        /*
         * Auch ohne Realtime-Ereignis wird der Matchstatus geprüft.
         * Die RPC prüft zugleich, ob ein Ergebnis-Timeout abgelaufen ist.
         */
        matchTimer = setInterval(async () => {
            if (
                !currentMatch ||
                currentMatch.id !== matchId ||
                currentMatch.status !== "active"
            ) {
                return;
            }

            try {
                const { data, error } = await db.rpc(
                    "get_ranked_match",
                    {
                        p_match_id: matchId
                    }
                );

                if (error) {
                    throw error;
                }

                if (data) {
                    handleMatchUpdate(data);
                }
            } catch (error) {
                console.warn(
                    "[Ranked] Matchstatus konnte nicht aktualisiert werden:",
                    error
                );
            }
        }, POLL_INTERVAL_MS);
    }

    function startClock() {
        stopClockTimer();

        const update = () => {
            if (!currentMatch) return;

            setText(
                "ranked-match-time",
                formatTime(Date.now() - matchStartedAt)
            );
        };

        update();

        clockTimer = setInterval(update, 1000);
    }

    // -----------------------------------------------------
    // MATCHSTATUS UND ENDERGEBNIS
    // -----------------------------------------------------

    function handleMatchUpdate(match) {
        if (
            !match ||
            !currentMatch ||
            match.id !== currentMatch.id
        ) {
            return;
        }

        currentMatch = {
            ...currentMatch,
            ...match
        };

        if (currentMatch.status === "completed") {
            void showCompletedMatch(currentMatch);
            return;
        }

        if (currentMatch.status !== "active") {
            return;
        }

        const ownSubmitted = getOwnSubmitted(currentMatch);
        const opponentSubmitted = getOpponentSubmitted(currentMatch);

        if (ownSubmitted) {
            resultSubmitted = true;
            gameEnded = true;

            disableGameControls();

            show($("ranked-waiting-result"), true);

            setText(
                "ranked-waiting-detail",
                opponentSubmitted
                    ? "Beide Ergebnisse liegen vor. Das Match wird ausgewertet."
                    : "Dein Ergebnis ist gespeichert. Wir warten auf den Gegner."
            );
        } else if (opponentSubmitted) {
            setText(
                "ranked-game-status",
                "Dein Gegner hat sein Ergebnis abgegeben. " +
                "Beende dein Spiel, um das Match auszuwerten."
            );
        }
    }

    async function showCompletedMatch(match) {
        if (resultShown) return;

        resultShown = true;
        currentMatch = match;

        stopMatchTimer();
        stopClockTimer();
        stopQueueTimer();

        await removeMatchChannel();

        show($("ranked-match-result"), true);
        show($("ranked-waiting-result"), false);

        disableGameControls();

        const winnerId = match.winner_id;
        const draw = match.is_draw === true;

        const won = winnerId === user.id;

        const myMoves = isPlayerOne()
            ? match.player1_moves
            : match.player2_moves;

        const opponentMoves = isPlayerOne()
            ? match.player2_moves
            : match.player1_moves;

        const myFill = isPlayerOne()
            ? match.player1_fill_percent
            : match.player2_fill_percent;

        const opponentFill = isPlayerOne()
            ? match.player2_fill_percent
            : match.player1_fill_percent;

        const myRatingChange = isPlayerOne()
            ? match.player1_rating_change
            : match.player2_rating_change;

        let title;
        let icon;

        if (draw) {
            title = "Unentschieden";
            icon = "🤝";
        } else if (won) {
            title = "Du hast gewonnen!";
            icon = "🏆";
        } else {
            title = "Match verloren";
            icon = "🎮";
        }

        setText("ranked-result-title", title);
        setText("ranked-result-icon", icon);

        setText(
            "ranked-result-description",
            `Dein Füllstand: ${Number(myFill ?? 0).toLocaleString(
                "de-DE",
                { maximumFractionDigits: 1 }
            )} %. ` +
            `Füllstand des Gegners: ${Number(
                opponentFill ?? 0
            ).toLocaleString("de-DE", {
                maximumFractionDigits: 1
            })} %.`
        );

        setText(
            "ranked-result-my-moves",
            myMoves == null ? "—" : myMoves
        );

        setText(
            "ranked-result-opponent-moves",
            opponentMoves == null ? "—" : opponentMoves
        );

        setText(
            "ranked-result-rating",
            formatSigned(myRatingChange)
        );

        setStatus(
            draw
                ? "Ranked-Match beendet: Unentschieden."
                : won
                    ? "Ranked-Match beendet: Sieg!"
                    : "Ranked-Match beendet: Niederlage."
        );

        setText("ranked-match-title", "Match beendet");

        await loadPlayerStats();
        await loadLeaderboard();
    }

    // -----------------------------------------------------
    // NAVIGATION / NEUES MATCH
    // -----------------------------------------------------

    async function playAgain() {
        await removeMatchChannel();

        stopMatchTimer();
        stopClockTimer();
        stopQueueTimer();

        currentMatch = null;
        board = [];
        ownedCells = new Set();

        movesUsed = 0;
        resultSubmitted = false;
        gameEnded = false;
        resultShown = false;

        searching = false;

        show($("ranked-match-panel"), false);
        show($("ranked-search-panel"), true);
        show($("ranked-match-result"), false);
        show($("ranked-waiting-result"), false);

        const button = $("ranked-find-button");

        if (button) {
            button.disabled = false;
        }

        await loadPlayerStats();
        await startSearch();
    }

    // -----------------------------------------------------
    // INITIALISIERUNG
    // -----------------------------------------------------

    async function initialize() {
        db = getClient();

        if (!db || !db.auth) {
            setStatus(
                "Supabase ist nicht initialisiert. " +
                "Prüfe config.js und supabase.js.",
                true
            );

            return;
        }

        try {
            const { data, error } = await db.auth.getUser();

            if (error) throw error;

            user = data?.user || null;

            if (!user) {
                setStatus(
                    "Bitte melde dich an, um Ranked zu spielen.",
                    true
                );

                window.location.href = "../index.html";
                return;
            }

            await loadOwnName();
            await loadPlayerStats();
            await loadLeaderboard();

            const foundMatch = await restoreActiveMatch();

            if (!foundMatch) {
                setStatus(
                    "Bereit für Ranked. Suche einen Gegner, um zu starten."
                );
            }
        } catch (error) {
            console.error(
                "[Ranked] Initialisierung fehlgeschlagen:",
                error
            );

            setStatus(
                `Ranked konnte nicht geladen werden: ${error.message || error}`,
                true
            );
        }
    }

    // -----------------------------------------------------
    // EVENTS
    // -----------------------------------------------------

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
        () => {
            window.location.href = "menu.html";
        }
    );

    $("ranked-result-menu")?.addEventListener(
        "click",
        () => {
            window.location.href = "menu.html";
        }
    );

    $("ranked-play-again")?.addEventListener(
        "click",
        () => void playAgain()
    );

    window.addEventListener("beforeunload", () => {
        stopQueueTimer();
        stopMatchTimer();
        stopClockTimer();

        /*
         * Ein aktives Match wird beim Verlassen NICHT automatisch
         * abgebrochen. Ein Wiederaufruf kann es wiederherstellen.
         */
    });

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