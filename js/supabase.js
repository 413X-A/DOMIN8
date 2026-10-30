// =========================================================
// SUPABASE CLIENT
// =========================================================

(function () {
    "use strict";

    if (!window.supabase) {

        window.supabaseClient = null;
        return;
    }

    if (
        typeof SUPABASE_URL !== "string" ||
        !SUPABASE_URL
    ) {

        window.supabaseClient = null;
        return;
    }

    if (
        typeof SUPABASE_KEY !== "string" ||
        !SUPABASE_KEY
    ) {

        window.supabaseClient = null;
        return;
    }

    try {

        const client = window.supabase.createClient(
            SUPABASE_URL,
            SUPABASE_KEY
        );

        window.supabaseClient = client;

    } catch (error) {

        window.supabaseClient = null;
    }
})();