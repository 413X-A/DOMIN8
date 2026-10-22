// =========================================================
// INTRO
// =========================================================

const introStart = document.getElementById("intro-start");


// =========================================================
// COMPLETE INTRO
// =========================================================

async function completeIntro() {
    console.log("START button clicked");

    // Aktuelle Session holen
    const {
        data: { session },
        error: sessionError
    } = await supabaseClient.auth.getSession();

    if (sessionError) {
        console.error(
            "Could not get session:",
            sessionError
        );
    }

    // -----------------------------------------------------
    // Benutzer ist eingeloggt
    // -----------------------------------------------------

    if (session?.user) {
        console.log(
            "Logged in user:",
            session.user.id
        );

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
            console.error(
                "Could not save intro progress:",
                error
            );

            return;
        }

        console.log(
            "Intro progress saved."
        );

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

    console.log(
        "No logged in user. Showing login screen."
    );

    if (
        typeof showLoginScreen === "function"
    ) {
        showLoginScreen();
    } else {
        console.error(
            "showLoginScreen() does not exist."
        );
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
    console.error(
        "Could not find #intro-start"
    );
}