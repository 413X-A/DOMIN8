"use strict";

/* =========================================================
   FILLER – COLOR FILL
   GLOBAL.JS

   Globale Funktionen für alle Seiten:
   - Globale Navigation
   - Footer Navigation
   - Header Navigation
   - Zurück zum Menü
   - Rating laden
   - Logout
   - Reload
========================================================= */


/* =========================================================
   SUPABASE CLIENT
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


/* =========================================================
   NAVIGATION
========================================================= */

function navigateToPage(page) {

    const destinations = {

        /*
         * Hauptseiten
         */
        menu: "menu.html",

        game: "game.html?mode=play",

        campaign: "campaign.html",

        challenges: "challenges.html",

        ranked: "ranked.html",

        profile: "profile.html",

        settings: "settings.html"

    };


    /*
     * Prüfen, ob Ziel existiert
     */
    const destination =
        destinations[page];


    if (!destination) {

        return;
    }


    /* =====================================================
       NOCH NICHT VERFÜGBARE BEREICHE
    ===================================================== */

    if (
        page === "challenges"
    ) {

        alert(
            "Dieser Bereich ist noch nicht verfügbar."
        );

        return;
    }


    /* =====================================================
       NAVIGATION
    ===================================================== */

    window.location.href =
        destination;
}


/* =========================================================
   FOOTER / DATA-PAGE BUTTONS
========================================================= */

function initGlobalNavigation() {

    const pageButtons =
        document.querySelectorAll(
            "[data-page]"
        );


    if (!pageButtons.length) {

        return;
    }


    pageButtons.forEach(button => {

        /*
         * Verhindert doppelte Listener,
         * falls initGlobalNavigation() erneut
         * ausgeführt wird.
         */
        if (
            button.dataset.globalNavigationInitialized === "true"
        ) {
            return;
        }


        button.dataset.globalNavigationInitialized =
            "true";


        button.addEventListener(
            "click",
            () => {

                const page =
                    button.dataset.page;


                if (!page) {

                    return;
                }


                navigateToPage(page);

            }
        );

    });

}


/* =========================================================
   SEITE NEU LADEN
========================================================= */

function globalReloadPage() {

    window.location.reload();

}


/* =========================================================
   ZURÜCK ZUM MENÜ
========================================================= */

function globalGoBackToMenu() {

    window.location.href =
        "menu.html";

}


/* =========================================================
   LOGOUT
========================================================= */

async function globalLogout() {

    const client =
        getSupabaseClient();


    /*
     * Falls Supabase nicht verfügbar ist,
     * trotzdem zur Startseite zurück.
     */
    if (!client) {

        window.location.href =
            "../index.html";


        return;
    }


    try {

        const {
            error
        } = await client.auth.signOut();


        /*
         * Logout fehlgeschlagen
         */
        if (error) {

            alert(
                "Abmelden fehlgeschlagen."
            );


            return;
        }


        /*
         * Erfolgreich abgemeldet
         */

        window.location.href =
            "../index.html";


    } catch (error) {

        alert(
            "Beim Abmelden ist ein Fehler aufgetreten."
        );

    }

}


/* =========================================================
   HEADER BUTTON
========================================================= */

function initGlobalHeader() {

    const backButton =
        document.getElementById(
            "global-back-button"
        );


    /*
     * Seite besitzt keinen globalen Header
     */
    if (!backButton) {

        /*
         * Rating trotzdem laden,
         * falls auf der Seite vorhanden.
         */
        loadGlobalRating();

        return;
    }


    /*
     * Aktuelle HTML-Datei ermitteln
     */
    const currentPage =
        window.location.pathname
            .split("/")
            .pop()
            .toLowerCase();


    /* =====================================================
       MENÜ
    ===================================================== */

    if (
        currentPage === "menu.html"
    ) {

        /*
         * Im Menü:
         *
         * ⏻ = Abmelden
         */
        backButton.addEventListener(
            "click",
            globalLogout
        );


        backButton.setAttribute(
            "aria-label",
            "Abmelden"
        );


        backButton.setAttribute(
            "title",
            "Abmelden"
        );


    }

    /* =====================================================
       ALLE ANDEREN SEITEN
    ===================================================== */

    else {

        /*
         * Auf allen anderen Seiten:
         *
         * ← = zurück zum Menü
         */
        backButton.addEventListener(
            "click",
            globalGoBackToMenu
        );


        backButton.setAttribute(
            "aria-label",
            "Zurück zum Menü"
        );


        backButton.setAttribute(
            "title",
            "Zurück zum Menü"
        );

    }


    /*
     * Rating laden
     */
    loadGlobalRating();

}


/* =========================================================
   RATING LADEN
========================================================= */

async function loadGlobalRating() {

    const ratingElement =
        document.getElementById(
            "global-rating"
        );


    /*
     * Seite besitzt kein Rating
     */
    if (!ratingElement) {

        return;
    }


    const client =
        getSupabaseClient();


    /*
     * Supabase nicht verfügbar
     */
    if (!client) {

        ratingElement.textContent =
            "100";


        return;
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


        /*
         * Auth-Fehler
         */
        if (authError) {

            ratingElement.textContent =
                "100";


            return;
        }


        /*
         * Kein Benutzer
         */
        if (!user) {

            ratingElement.textContent =
                "100";


            return;
        }


        /*
         * Ranked Stats laden
         */
        const {
            data,
            error
        } =
            await client
                .from("ranked_player_stats")
                .select(
                    "user_id, rating"
                )
                .eq(
                    "user_id",
                    user.id
                )
                .maybeSingle();


        /*
         * Datenbankfehler
         */
        if (error) {

            ratingElement.textContent =
                "100";


            return;
        }


        /*
         * Noch kein Ranked-Eintrag
         */
        if (!data) {

            ratingElement.textContent =
                "100";


            return;
        }


        /*
         * Rating in Zahl umwandeln
         */
        const rating =
            Number(data.rating);


        /*
         * Ungültiger Wert
         */
        if (
            !Number.isFinite(rating)
        ) {

            ratingElement.textContent =
                "100";


            return;
        }


        /*
         * Rating anzeigen
         */
        ratingElement.textContent =
            String(
                Math.round(rating)
            );


    } catch (error) {

        ratingElement.textContent =
            "100";

    }

}


/* =========================================================
   GLOBALE FUNKTIONEN
========================================================= */

/*
 * Diese Funktionen können auch von anderen
 * JavaScript-Dateien verwendet werden:
 *
 * globalGoBackToMenu();
 *
 * globalReloadPage();
 *
 * loadGlobalRating();
 *
 * navigateToPage("menu");
 *
 * navigateToPage("profile");
 *
 * navigateToPage("settings");
 *
 * navigateToPage("game");
 *
 * navigateToPage("campaign");
 *
 * navigateToPage("ranked");
 *
 * globalLogout();
 */


/* =========================================================
   INITIALISIERUNG
========================================================= */

function initGlobal() {

    /*
     * Footer- und sonstige
     * data-page Navigation
     */
    initGlobalNavigation();


    /*
     * Header Navigation
     */
    initGlobalHeader();

}


/* =========================================================
   DOM READY
========================================================= */

if (
    document.readyState === "loading"
) {

    document.addEventListener(
        "DOMContentLoaded",
        initGlobal,
        {
            once: true
        }
    );

} else {

    initGlobal();

}