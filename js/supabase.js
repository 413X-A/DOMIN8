// =========================================================
// SUPABASE CLIENT
// =========================================================

(function () {
    "use strict";

    console.log("[SUPABASE] Initialisierung gestartet.");

    if (!window.supabase) {
        console.error(
            "[SUPABASE] Supabase CDN wurde nicht geladen."
        );

        window.supabaseClient = null;
        return;
    }

    if (
        typeof SUPABASE_URL !== "string" ||
        !SUPABASE_URL
    ) {
        console.error(
            "[SUPABASE] SUPABASE_URL fehlt."
        );

        window.supabaseClient = null;
        return;
    }

    if (
        typeof SUPABASE_KEY !== "string" ||
        !SUPABASE_KEY
    ) {
        console.error(
            "[SUPABASE] SUPABASE_KEY fehlt."
        );

        window.supabaseClient = null;
        return;
    }

    try {

        const client = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_KEY
        );

        window.supabaseClient = client;

        console.log(
            "[SUPABASE] Client erfolgreich erstellt."
        );

    } catch (error) {

        console.error(
            "[SUPABASE] Client konnte nicht erstellt werden:",
            error
        );

        window.supabaseClient = null;
    }
})();