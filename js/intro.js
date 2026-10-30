// =========================================================
// INTRO
// =========================================================

const introStart = document.getElementById("intro-start");


// =========================================================
// COMPLETE INTRO
// =========================================================

async function completeIntro() {

    // Aktuelle Session holen
    const {
        data: { session },
        error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
        // Fehler beim Abrufen der Session
    }

    // -----------------------------------------------------
    // Benutzer ist eingeloggt
    // -----------------------------------------------------

    if (session?.user) {

        const {
            error
        } = await supabaseClient
            .from("player_progress")
            .update({
                intro_completed: true,
                updated_at: new Date().toISOString()
            })
            .eq(
                "user_id",
                session.user.id
            );

        if (error) {
            return;
        }

        // Main App neu initialisieren
        if (
            typeof initializeApp === "function"
        ) {
            await initializeApp();
        }

        return;
    }


    // -----------------------------------------------------
    // Kein Benutzer eingeloggt
    // -----------------------------------------------------

    if (
        typeof showLoginScreen === "function"
    ) {
        showLoginScreen();
    } else {
        // showLoginScreen() existiert nicht
    }
}


// =========================================================
// START BUTTON
// =========================================================

if (introStart) {
    introStart.addEventListener(
        "click",
        completeIntro
    );
} else {
    // #intro-start wurde nicht gefunden
}