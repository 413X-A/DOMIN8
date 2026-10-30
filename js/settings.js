"use strict";

/* =========================================================
   FILLER – COLOR FILL
   SETTINGS.JS

   Verantwortlich für:
   - Settings aus Supabase laden
   - Settings in Supabase speichern
   - Standardwerte erstellen
   - Lokalen Cache verwalten
   - UI-Switches synchronisieren
   - Darstellungseinstellungen anwenden
   - Logout
========================================================= */


/* =========================================================
   STANDARD-EINSTELLUNGEN
========================================================= */

const DEFAULT_SETTINGS = {

    /* SPIEL */
    animations: true,
    sound: true,
    vibration: true,
    auto_restart: false,

    /* DARSTELLUNG */
    reduced_motion: false,
    high_contrast: false,

    /* SPIELBRETT */
    show_grid: true,
    move_highlight: true,

    /* KONTO */
    language: "de"

};


/* =========================================================
   CACHE
========================================================= */

const SETTINGS_CACHE_KEY =
    "filler_user_settings";


/* =========================================================
   AKTUELLE EINSTELLUNGEN
========================================================= */

let currentSettings = {
    ...DEFAULT_SETTINGS
};


/* =========================================================
   SUPABASE CLIENT
========================================================= */

function getSettingsSupabaseClient() {

    if (
        typeof getSupabaseClient === "function"
    ) {

        const client =
            getSupabaseClient();


        if (client) {
            return client;
        }

    }


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


/* =========================================================
   CACHE LADEN
========================================================= */

function loadSettingsFromCache() {

    try {

        const cached =
            localStorage.getItem(
                SETTINGS_CACHE_KEY
            );


        if (!cached) {

            return null;

        }


        const parsed =
            JSON.parse(cached);


        if (
            !parsed ||
            typeof parsed !== "object"
        ) {

            return null;

        }


        return {
            ...DEFAULT_SETTINGS,
            ...parsed
        };


    } catch (error) {

        return null;

    }

}


/* =========================================================
   CACHE SPEICHERN
========================================================= */

function saveSettingsToCache(settings) {

    try {

        localStorage.setItem(
            SETTINGS_CACHE_KEY,
            JSON.stringify(settings)
        );


    } catch (error) {

    }

}


/* =========================================================
   EINSTELLUNGEN AUS SUPABASE LADEN
========================================================= */

async function loadUserSettings() {

    const client =
        getSettingsSupabaseClient();


    /*
     * Erst Cache laden.
     * Dadurch reagieren die Schalter sofort.
     */
    const cachedSettings =
        loadSettingsFromCache();


    if (cachedSettings) {

        currentSettings = {
            ...DEFAULT_SETTINGS,
            ...cachedSettings
        };


        applySettings(
            currentSettings
        );

    }


    /*
     * Supabase Client prüfen
     */
    if (!client) {

        /*
         * Falls kein Cache existiert,
         * Standardwerte verwenden.
         */
        if (!cachedSettings) {

            currentSettings = {
                ...DEFAULT_SETTINGS
            };


            applySettings(
                currentSettings
            );

        }


        return currentSettings;

    }


    try {

        /*
         * Aktuellen Benutzer laden
         */
        const {
            data: {
                user
            },
            error: authError
        } =
            await client.auth.getUser();


        if (authError) {

            throw authError;

        }


        /*
         * Kein Benutzer
         */
        if (!user) {

            if (!cachedSettings) {

                currentSettings = {
                    ...DEFAULT_SETTINGS
                };


                applySettings(
                    currentSettings
                );

            }


            return currentSettings;

        }


        /*
         * Einstellungen aus Datenbank laden
         */
        const {
            data,
            error
        } =
            await client
                .from("user_settings")
                .select(
                    `
                    user_id,
                    animations,
                    sound,
                    vibration,
                    auto_restart,
                    reduced_motion,
                    high_contrast,
                    show_grid,
                    move_highlight,
                    language
                    `
                )
                .eq(
                    "user_id",
                    user.id
                )
                .maybeSingle();


        if (error) {

            throw error;

        }


        /*
         * Noch keine Einstellungen vorhanden
         */
        if (!data) {

            const createdSettings =
                await createDefaultUserSettings(
                    client,
                    user.id
                );


            currentSettings = {
                ...DEFAULT_SETTINGS,
                ...createdSettings
            };


        } else {

            /*
             * Datenbankwerte mit Defaults kombinieren
             */
            currentSettings = {
                ...DEFAULT_SETTINGS,
                ...data
            };

        }


        /*
         * Sprache validieren
         */
        if (
            currentSettings.language !== "de" &&
            currentSettings.language !== "en"
        ) {

            currentSettings.language =
                DEFAULT_SETTINGS.language;

        }


        /*
         * Cache aktualisieren
         */
        saveSettingsToCache(
            currentSettings
        );


        /*
         * UI aktualisieren
         */
        applySettings(
            currentSettings
        );


        return currentSettings;


    } catch (error) {

        /*
         * Cache weiterverwenden,
         * falls vorhanden.
         */
        if (!cachedSettings) {

            currentSettings = {
                ...DEFAULT_SETTINGS
            };


            applySettings(
                currentSettings
            );

        }


        return currentSettings;

    }

}


/* =========================================================
   STANDARD-EINSTELLUNGEN IN SUPABASE ERSTELLEN
========================================================= */

async function createDefaultUserSettings(
    client,
    userId
) {

    const settingsToInsert = {

        user_id: userId,

        ...DEFAULT_SETTINGS

    };


    const {
        data,
        error
    } =
        await client
            .from("user_settings")
            .insert(
                settingsToInsert
            )
            .select(
                `
                user_id,
                animations,
                sound,
                vibration,
                auto_restart,
                reduced_motion,
                high_contrast,
                show_grid,
                move_highlight,
                language
                `
            )
            .single();


    if (error) {

        throw error;

    }


    return data;

}


/* =========================================================
   EINSTELLUNG SPEICHERN
========================================================= */

async function saveUserSettings(
    settings = currentSettings
) {

    const client =
        getSettingsSupabaseClient();


    /*
     * Lokalen Zustand aktualisieren
     */
    currentSettings = {
        ...DEFAULT_SETTINGS,
        ...settings
    };


    /*
     * Immer zuerst lokal speichern.
     */
    saveSettingsToCache(
        currentSettings
    );


    /*
     * Kein Supabase Client
     */
    if (!client) {

        return false;

    }


    try {

        /*
         * Benutzer laden
         */
        const {
            data: {
                user
            },
            error: authError
        } =
            await client.auth.getUser();


        if (authError) {

            throw authError;

        }


        if (!user) {

            return false;

        }


        /*
         * Nur Daten speichern,
         * die zur Tabelle gehören.
         */
        const dataToSave = {

            user_id: user.id,

            animations:
                Boolean(
                    currentSettings.animations
                ),

            sound:
                Boolean(
                    currentSettings.sound
                ),

            vibration:
                Boolean(
                    currentSettings.vibration
                ),

            auto_restart:
                Boolean(
                    currentSettings.auto_restart
                ),

            reduced_motion:
                Boolean(
                    currentSettings.reduced_motion
                ),

            high_contrast:
                Boolean(
                    currentSettings.high_contrast
                ),

            show_grid:
                Boolean(
                    currentSettings.show_grid
                ),

            move_highlight:
                Boolean(
                    currentSettings.move_highlight
                ),

            language:
                currentSettings.language === "en"
                    ? "en"
                    : "de"

        };


        /*
         * Upsert:
         *
         * Wenn Benutzer noch keine Zeile besitzt:
         * → INSERT
         *
         * Wenn Benutzer bereits eine Zeile besitzt:
         * → UPDATE
         */
        const {
            data,
            error
        } =
            await client
                .from("user_settings")
                .upsert(
                    dataToSave,
                    {
                        onConflict: "user_id"
                    }
                )
                .select(
                    `
                    user_id,
                    animations,
                    sound,
                    vibration,
                    auto_restart,
                    reduced_motion,
                    high_contrast,
                    show_grid,
                    move_highlight,
                    language
                    `
                )
                .single();


        if (error) {

            throw error;

        }


        /*
         * Serverwerte übernehmen
         */
        currentSettings = {
            ...DEFAULT_SETTINGS,
            ...data
        };


        /*
         * Cache aktualisieren
         */
        saveSettingsToCache(
            currentSettings
        );


        return true;


    } catch (error) {

        /*
         * Lokaler Cache bleibt erhalten.
         */
        return false;

    }

}


/* =========================================================
   EINZELNE EINSTELLUNG ÄNDERN
========================================================= */

async function updateUserSetting(
    key,
    value
) {

    /*
     * Prüfen, ob Einstellung existiert.
     */
    if (
        !Object.prototype.hasOwnProperty.call(
            DEFAULT_SETTINGS,
            key
        )
    ) {

        return false;

    }


    /*
     * Sprache validieren
     */
    if (
        key === "language"
    ) {

        value =
            value === "en"
                ? "en"
                : "de";

    }


    /*
     * Boolean-Einstellungen normalisieren
     */
    if (
        typeof DEFAULT_SETTINGS[key] === "boolean"
    ) {

        value =
            Boolean(value);

    }


    /*
     * Lokalen Zustand aktualisieren
     */
    currentSettings[key] =
        value;


    /*
     * Einstellungen sofort anwenden
     */
    applySettings(
        currentSettings
    );


    /*
     * Lokal speichern
     */
    saveSettingsToCache(
        currentSettings
    );


    /*
     * In Supabase speichern
     */
    return await saveUserSettings(
        currentSettings
    );

}


/* =========================================================
   UI MIT EINSTELLUNGEN SYNCHRONISIEREN
========================================================= */

function syncSettingsUI() {

    const mappings = {

        "setting-animations":
            "animations",

        "setting-sound":
            "sound",

        "setting-vibration":
            "vibration",

        "setting-auto-restart":
            "auto_restart",

        "setting-reduced-motion":
            "reduced_motion",

        "setting-high-contrast":
            "high_contrast",

        "setting-grid":
            "show_grid",

        "setting-move-highlight":
            "move_highlight"

    };


    Object.entries(
        mappings
    ).forEach(
        ([elementId, settingKey]) => {

            const element =
                document.getElementById(
                    elementId
                );


            if (!element) {

                return;

            }


            element.checked =
                Boolean(
                    currentSettings[settingKey]
                );

        }
    );


    /*
     * Sprache
     */
    const languageElement =
        document.getElementById(
            "setting-language"
        );


    if (languageElement) {

        languageElement.value =
            currentSettings.language;

    }


    /*
     * Falls Sprache nicht als Select,
     * sondern nur als Text angezeigt wird.
     */
    const languageValue =
        document.querySelector(
            "[data-setting-value='language']"
        );


    if (languageValue) {

        languageValue.textContent =
            currentSettings.language.toUpperCase();

    }

}


/* =========================================================
   EINSTELLUNGEN ANWENDEN
========================================================= */

function applySettings(
    settings = currentSettings
) {

    /*
     * HTML Root
     */
    const root =
        document.documentElement;


    /*
     * =====================================================
     * ANIMATIONEN
     * =====================================================
     */

    root.classList.toggle(
        "settings-no-animations",
        settings.animations === false
    );


    /*
     * =====================================================
     * REDUCED MOTION
     * =====================================================
     */

    root.classList.toggle(
        "settings-reduced-motion",
        settings.reduced_motion === true
    );


    /*
     * =====================================================
     * HIGH CONTRAST
     * =====================================================
     */

    root.classList.toggle(
        "settings-high-contrast",
        settings.high_contrast === true
    );


    /*
     * =====================================================
     * GITTER
     * =====================================================
     */

    root.classList.toggle(
        "settings-hide-grid",
        settings.show_grid === false
    );


    /*
     * =====================================================
     * MOVE HIGHLIGHT
     * =====================================================
     */

    root.classList.toggle(
        "settings-hide-move-highlight",
        settings.move_highlight === false
    );


    /*
     * =====================================================
     * GLOBALER ZUGRIFF
     *
     * Andere Game-Dateien können:
     *
     * window.fillerSettings.sound
     * window.fillerSettings.vibration
     *
     * verwenden.
     * =====================================================
     */

    window.fillerSettings = {
        ...settings
    };


    /*
     * Accessibility
     */
    root.setAttribute(
        "data-animations",
        settings.animations
            ? "on"
            : "off"
    );


    root.setAttribute(
        "data-reduced-motion",
        settings.reduced_motion
            ? "on"
            : "off"
    );


    root.setAttribute(
        "data-high-contrast",
        settings.high_contrast
            ? "on"
            : "off"
    );


    root.setAttribute(
        "data-grid",
        settings.show_grid
            ? "on"
            : "off"
    );


    root.setAttribute(
        "data-move-highlight",
        settings.move_highlight
            ? "on"
            : "off"
    );

}


/* =========================================================
   SETTINGS-SWITCHES INITIALISIEREN
========================================================= */

function initSettingsSwitches() {

    const mappings = {

        "setting-animations":
            "animations",

        "setting-sound":
            "sound",

        "setting-vibration":
            "vibration",

        "setting-auto-restart":
            "auto_restart",

        "setting-reduced-motion":
            "reduced_motion",

        "setting-high-contrast":
            "high_contrast",

        "setting-grid":
            "show_grid",

        "setting-move-highlight":
            "move_highlight"

    };


    Object.entries(
        mappings
    ).forEach(
        ([elementId, settingKey]) => {

            const element =
                document.getElementById(
                    elementId
                );


            if (!element) {

                return;

            }


            /*
             * Doppelte Listener verhindern
             */
            if (
                element.dataset.settingsInitialized === "true"
            ) {

                return;

            }


            element.dataset.settingsInitialized =
                "true";


            element.addEventListener(
                "change",
                async () => {

                    const value =
                        element.checked;


                    /*
                     * Sofort anwenden
                     */
                    currentSettings[settingKey] =
                        value;


                    applySettings(
                        currentSettings
                    );


                    /*
                     * Sofort lokal speichern
                     */
                    saveSettingsToCache(
                        currentSettings
                    );


                    /*
                     * In Supabase speichern
                     */
                    const saved =
                        await saveUserSettings(
                            currentSettings
                        );


                    if (!saved) {

                    }

                }
            );

        }
    );

}


/* =========================================================
   SPRACHE
========================================================= */

function initLanguageSetting() {

    const languageElement =
        document.getElementById(
            "setting-language"
        );


    if (!languageElement) {

        return;

    }


    /*
     * Doppelte Listener verhindern
     */
    if (
        languageElement.dataset.settingsInitialized === "true"
    ) {

        return;

    }


    languageElement.dataset.settingsInitialized =
        "true";


    languageElement.addEventListener(
        "change",
        async () => {

            const language =
                languageElement.value;


            await updateUserSetting(
                "language",
                language
            );

        }
    );

}


/* =========================================================
   LOGOUT BUTTON
========================================================= */

function initSettingsLogout() {

    const logoutButton =
        document.getElementById(
            "settings-logout"
        );


    if (!logoutButton) {

        return;

    }


    /*
     * Doppelte Listener verhindern
     */
    if (
        logoutButton.dataset.settingsInitialized === "true"
    ) {

        return;

    }


    logoutButton.dataset.settingsInitialized =
        "true";


    logoutButton.addEventListener(
        "click",
        async () => {

            /*
             * globale Logout-Funktion verwenden
             */
            if (
                typeof globalLogout === "function"
            ) {

                await globalLogout();

                return;

            }


            /*
             * Fallback
             */
            const client =
                getSettingsSupabaseClient();


            if (!client) {

                window.location.href =
                    "../index.html";

                return;

            }


            try {

                const {
                    error
                } =
                    await client.auth.signOut();


                if (error) {

                    alert(
                        "Abmelden fehlgeschlagen."
                    );


                    return;

                }


                window.location.href =
                    "../index.html";


            } catch (error) {

                alert(
                    "Beim Abmelden ist ein Fehler aufgetreten."
                );

            }

        }
    );

}


/* =========================================================
   DATENSCHUTZ / IMPRESSUM
========================================================= */

function initSettingsInformationButtons() {

    const buttons =
        document.querySelectorAll(
            ".settings-link-button"
        );


    buttons.forEach(button => {

        if (
            button.dataset.settingsInitialized === "true"
        ) {

            return;

        }


        button.dataset.settingsInitialized =
            "true";


        button.addEventListener(
            "click",
            () => {

                const row =
                    button.closest(
                        ".settings-row"
                    );


                if (!row) {

                    return;

                }


                const title =
                    row.querySelector(
                        "strong"
                    );


                const name =
                    title
                        ? title.textContent.trim()
                        : "";


                /*
                 * Datenschutz und Impressum
                 * können später auf eigene Seiten
                 * weitergeleitet werden.
                 */

                alert(
                    `${name} ist noch nicht verfügbar.`
                );

            }
        );

    });

}


/* =========================================================
   SETTINGS SEITE INITIALISIEREN
========================================================= */

async function initSettingsPage() {

    /*
     * Cache / Datenbank laden
     */
    await loadUserSettings();


    /*
     * UI mit Datenbankwerten synchronisieren
     */
    syncSettingsUI();


    /*
     * Switches aktivieren
     */
    initSettingsSwitches();


    /*
     * Sprache aktivieren
     */
    initLanguageSetting();


    /*
     * Logout aktivieren
     */
    initSettingsLogout();


    /*
     * Datenschutz / Impressum
     */
    initSettingsInformationButtons();


    /*
     * Noch einmal anwenden
     */
    applySettings(
        currentSettings
    );

}


/* =========================================================
   ÖFFENTLICHE FUNKTIONEN
========================================================= */

/*
 * Andere JavaScript-Dateien können diese Funktionen
 * ebenfalls verwenden:
 *
 * loadUserSettings();
 *
 * saveUserSettings();
 *
 * updateUserSetting("sound", false);
 *
 * applySettings();
 *
 * getCurrentSettings();
 */


/* =========================================================
   AKTUELLE EINSTELLUNGEN ABFRAGEN
========================================================= */

function getCurrentSettings() {

    return {
        ...currentSettings
    };

}


/* =========================================================
   AUTOMATISCHER START
========================================================= */

function startSettingsScript() {

    /*
     * Nur auf Seiten initialisieren,
     * die tatsächlich Settings-Elemente besitzen.
     */
    const settingsPage =
        document.querySelector(
            ".settings-page"
        );


    if (!settingsPage) {

        return;

    }


    initSettingsPage();

}


/* =========================================================
   DOM READY
========================================================= */

if (
    document.readyState === "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        startSettingsScript,
        {
            once: true
        }
    );

} else {

    startSettingsScript();

}