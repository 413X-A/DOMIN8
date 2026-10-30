/* =====================================================
   FILLER: COLOR FILL
   Levelsystem – XP, Levelaufstieg und Overlay
   Datei: js/levelsystem.js
   ===================================================== */

(function () {
    "use strict";

    const CONFIG = {
        overlayId: "level-up-overlay",
        levelId: "level-up-number",
        messageId: "level-up-message",
        closeId: "level-up-close",
        table: "player_progress"
    };

    let previousLevel = null;
    let initialized = false;
    let checkInProgress = false;

    /*
     * LEVELBERECHNUNG
     *
     * Level 1:     0–99 XP
     * Level 2:   100–249 XP
     * Level 3:   250–449 XP
     * Level 4:   450–699 XP
     * Level 5:   700–999 XP
     * Level 6: 1000–1399 XP
     * Danach jeweils 400 XP pro Level.
     */
    function getLevelFromXP(totalXP) {
        const xp = Math.max(0, Number(totalXP) || 0);

        if (xp < 100) return 1;
        if (xp < 250) return 2;
        if (xp < 450) return 3;
        if (xp < 700) return 4;
        if (xp < 1000) return 5;

        return 6 + Math.floor((xp - 1000) / 400);
    }

    /*
     * VORHANDENEN SUPABASE-CLIENT VERWENDEN
     */
    function getSupabaseClient() {
        const client = window.supabaseClient;

        if (
            client &&
            client.auth &&
            typeof client.from === "function"
        ) {
            return client;
        }

        return null;
    }

    /*
     * ANGEMELDETEN SPIELER UND XP LADEN
     */
    async function getPlayerProgress() {
        const supabase = getSupabaseClient();

        if (!supabase) return null;

        try {
            const {
                data: { user },
                error: authError
            } = await supabase.auth.getUser();

            if (authError) {
                return null;
            }

            if (!user) {
                return null;
            }

            const { data, error } = await supabase
                .from(CONFIG.table)
                .select("total_xp, current_level")
                .eq("user_id", user.id)
                .maybeSingle();

            if (error) {
                return null;
            }

            if (!data) {
                return {
                    totalXP: 0,
                    level: 1,
                    userId: user.id
                };
            }

            const totalXP = Math.max(
                0,
                Number(data.total_xp) || 0
            );

            return {
                totalXP: totalXP,
                level: getLevelFromXP(totalXP),
                userId: user.id
            };
        } catch (error) {
            return null;
        }
    }

    /*
     * OVERLAY-CSS
     */
    function addStyles() {
        if (document.getElementById("level-system-styles")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "level-system-styles";

        style.textContent = `
            #${CONFIG.overlayId} {
                position: fixed;
                inset: 0;
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
                background: rgba(5, 8, 25, .86);
                backdrop-filter: blur(10px);
                opacity: 0;
                visibility: hidden;
                pointer-events: none;
                transition:
                    opacity .3s ease,
                    visibility .3s ease;
            }

            #${CONFIG.overlayId}.ls-visible {
                opacity: 1;
                visibility: visible;
                pointer-events: auto;
            }

            #${CONFIG.overlayId} .level-up-card {
                position: relative;
                width: min(420px, 100%);
                padding: 36px 24px;
                border: 1px solid rgba(255,255,255,.22);
                border-radius: 24px;
                background: linear-gradient(
                    145deg,
                    #29205f,
                    #10152e
                );
                color: #fff;
                text-align: center;
                box-shadow: 0 0 70px rgba(124,92,255,.4);
                animation: ls-pop .45s ease;
            }

            #${CONFIG.overlayId} .level-up-sparkle {
                font-size: 64px;
                color: #ffe66d;
                animation: ls-glow 1.6s ease-in-out infinite;
            }

            #${CONFIG.overlayId} .level-up-label {
                margin-top: 10px;
                color: #c6bcff;
                font-size: 14px;
                font-weight: 900;
                letter-spacing: 3px;
            }

            #${CONFIG.overlayId} .level-up-number {
                margin: 18px 0;
                color: #ffe66d;
                font-size: clamp(38px, 10vw, 56px);
                font-weight: 900;
                overflow-wrap: anywhere;
                text-shadow: 0 0 25px rgba(255,230,109,.35);
            }

            #${CONFIG.overlayId} #${CONFIG.messageId} {
                color: #e6e5ff;
                line-height: 1.5;
            }

            #${CONFIG.overlayId} #${CONFIG.closeId} {
                margin-top: 20px;
                padding: 14px 28px;
                border: 0;
                border-radius: 12px;
                background: #ffe66d;
                color: #17142f;
                font-weight: 900;
                cursor: pointer;
            }

            #${CONFIG.overlayId} #${CONFIG.closeId}:focus-visible {
                outline: 3px solid #fff;
                outline-offset: 4px;
            }

            @keyframes ls-pop {
                from {
                    transform: scale(.75) translateY(20px);
                    opacity: 0;
                }
                to {
                    transform: scale(1) translateY(0);
                    opacity: 1;
                }
            }

            @keyframes ls-glow {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.14) rotate(8deg); }
            }

            @media (prefers-reduced-motion: reduce) {
                #${CONFIG.overlayId},
                #${CONFIG.overlayId} .level-up-sparkle,
                #${CONFIG.overlayId} .level-up-card {
                    animation: none;
                    transition: none;
                }
            }
        `;

        document.head.appendChild(style);
    }

    /*
     * OVERLAY ERSTELLEN ODER VORHANDENES VERWENDEN
     */
    function createOverlay() {
        addStyles();

        let overlay = document.getElementById(
            CONFIG.overlayId
        );

        if (!overlay) {
            overlay = document.createElement("div");
            overlay.id = CONFIG.overlayId;
            overlay.className = "level-up-overlay";
            overlay.setAttribute("aria-hidden", "true");

            overlay.innerHTML = `
                <section
                    class="level-up-card"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="${CONFIG.levelId}"
                >
                    <div class="level-up-sparkle" aria-hidden="true">
                        ✦
                    </div>

                    <div class="level-up-label">
                        LEVEL AUFGESTIEGEN!
                    </div>

                    <div
                        class="level-up-number"
                        id="${CONFIG.levelId}"
                    >
                        LEVEL 2
                    </div>

                    <p id="${CONFIG.messageId}">
                        Weiter so! Du wirst immer besser.
                    </p>

                    <button
                        id="${CONFIG.closeId}"
                        type="button"
                    >
                        Weiter spielen
                    </button>
                </section>
            `;

            document.body.appendChild(overlay);
        }

        const closeButton = document.getElementById(
            CONFIG.closeId
        );

        if (closeButton && !closeButton.dataset.lsBound) {
            closeButton.dataset.lsBound = "true";
            closeButton.addEventListener("click", hideOverlay);
        }

        if (!overlay.dataset.lsBound) {
            overlay.dataset.lsBound = "true";

            overlay.addEventListener("click", function (event) {
                if (event.target === overlay) {
                    hideOverlay();
                }
            });
        }

        if (!document.documentElement.dataset.lsEscapeBound) {
            document.documentElement.dataset.lsEscapeBound = "true";

            document.addEventListener("keydown", function (event) {
                if (
                    event.key === "Escape" &&
                    document.getElementById(CONFIG.overlayId)
                        ?.classList.contains("ls-visible")
                ) {
                    hideOverlay();
                }
            });
        }

        return overlay;
    }

    /*
     * LEVEL-UP ANZEIGEN
     */
    function showLevelUp(newLevel, oldLevel) {
        const overlay = createOverlay();

        const levelElement = document.getElementById(
            CONFIG.levelId
        );

        const messageElement = document.getElementById(
            CONFIG.messageId
        );

        if (!overlay || !levelElement || !messageElement) {
            return;
        }

        levelElement.textContent = `LEVEL ${newLevel}`;

        messageElement.textContent =
            `Glückwunsch! Du bist von Level ${oldLevel} ` +
            `auf Level ${newLevel} aufgestiegen.`;

        overlay.classList.add("ls-visible");
        overlay.setAttribute("aria-hidden", "false");

        const closeButton = document.getElementById(
            CONFIG.closeId
        );

        if (closeButton) {
            closeButton.focus();
        }
    }

    /*
     * OVERLAY SCHLIESSEN
     */
    function hideOverlay() {
        const overlay = document.getElementById(
            CONFIG.overlayId
        );

        if (!overlay) return;

        overlay.classList.remove("ls-visible");
        overlay.setAttribute("aria-hidden", "true");
    }

    /*
     * BEIM LADEN DES SPIELS DAS ALTE LEVEL MERKEN
     */
    async function initialize() {
        createOverlay();

        const supabase = getSupabaseClient();
        if (!supabase) return null;

        const progress = await getPlayerProgress();
        if (!progress) return null;

        const { data: userData, error: authError } =
            await supabase.auth.getUser();

        if (authError || !userData.user) return null;

        const userId = userData.user.id;

        const { data, error } = await supabase
            .from("player_progress")
            .select("last_seen_level")
            .eq("user_id", userId)
            .maybeSingle();

        if (error || !data) {
            return null;
        }

        const lastSeenLevel = Number(data.last_seen_level) || 1;

        if (progress.level > lastSeenLevel) {
            showLevelUp(progress.level, lastSeenLevel);

            const { error: updateError } = await supabase
                .from("player_progress")
                .update({ last_seen_level: progress.level })
                .eq("user_id", userId);

            if (updateError) {
                // Fehler beim Speichern des Levelstatus
            }
        }

        previousLevel = progress.level;
        initialized = true;

        return progress;
    }


    /*
     * NACH DEM SPEICHERN NEUER XP AUFRUFEN
     */
    async function checkForLevelUp() {
        if (checkInProgress) return null;

        checkInProgress = true;

        try {
            const progress = await getPlayerProgress();

            if (!progress) return null;

            const newLevel = progress.level;

            // Beim ersten erfolgreichen Laden nur das Startlevel merken.
            if (previousLevel === null) {
                previousLevel = newLevel;
                initialized = true;
                return progress;
            }

            const oldLevel = previousLevel;

            if (newLevel > oldLevel) {
                showLevelUp(newLevel, oldLevel);
            }

            previousLevel = newLevel;

            return progress;
        } finally {
            checkInProgress = false;
        }
    }

    /*
     * LEVEL NEU LADEN, OHNE EIN OVERLAY AUSZULÖSEN
     */
    async function refresh() {
        const progress = await getPlayerProgress();

        if (progress) {
            previousLevel = progress.level;
            initialized = true;
        }

        return progress;
    }

    /*
     * ÖFFENTLICHE API
     */
    window.LevelSystem = {
        initialize,
        getPlayerProgress,
        getCurrentLevel: async function () {
            const progress = await getPlayerProgress();
            return progress ? progress.level : null;
        },
        getTotalXP: async function () {
            const progress = await getPlayerProgress();
            return progress ? progress.totalXP : null;
        },
        getLevelFromXP,
        checkForLevelUp,
        showLevelUp,
        hideOverlay,
        refresh
    };

    /*
     * STARTEN
     */
    if (document.readyState === "loading") {
        document.addEventListener(
            "DOMContentLoaded",
            initialize,
            { once: true }
        );
    } else {
        initialize();
    }
})();