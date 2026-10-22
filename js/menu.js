// =========================================================
// FILLER: COLOR FILL — MENU
// =========================================================

const playerNameElement = document.getElementById("player-name");
const logoutButton = document.getElementById("logout-button");

let menuUser = null;


// =========================================================
// AUTH CHECK
// =========================================================

async function getMenuUser() {
    const {
        data: { user },
        error
    } = await supabaseClient.auth.getUser();

    if (error) {
        console.error("Could not get user:", error);
        return null;
    }

    return user;
}


// =========================================================
// LOAD PLAYER PROFILE
// =========================================================

async function loadPlayerProfile(user) {
    if (!user) return;

    const fallbackName =
        user.user_metadata?.username ||
        user.user_metadata?.display_name ||
        user.email?.split("@")[0] ||
        "Player";

    if (playerNameElement) {
        playerNameElement.textContent = fallbackName;
    }

    // Try the common profiles schema: id + username.
    // If your schema uses different column names, the fallback
    // above still lets the menu work.
    const {
        data: profile,
        error
    } = await supabaseClient
        .from("profiles")
        .select("username")
        .eq("id", user.id)
        .maybeSingle();

    if (error) {
        console.warn("Could not load profile:", error.message);
        return;
    }

    if (profile?.username && playerNameElement) {
        playerNameElement.textContent = profile.username;
    }
}


// =========================================================
// NAVIGATION
// =========================================================


function navigateToPage(page) {
    const destinations = {
        game: "game.html?mode=play",
        campaign: "campaign.html",
        challenges: "challenges.html",
        ranked: "ranked.html",
        profile: "profile.html",
        settings: "settings.html"
    };

    const destination = destinations[page];

    if (!destination) {
        console.warn("Unknown menu destination:", page);
        return;
    }

    
if (["challenges", "ranked", "settings"].includes(page)) {
    alert("Dieser Bereich ist noch nicht verfügbar.");
    return;
}


    window.location.href = destination;
}



// =========================================================
// MENU BUTTON EVENTS
// =========================================================

document.querySelectorAll("[data-page]").forEach(button => {
    button.addEventListener("click", () => {
        navigateToPage(button.dataset.page);
    });
});


// =========================================================
// LOGOUT
// =========================================================

if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;

        try {
            const { error } = await supabaseClient.auth.signOut();

            if (error) {
                console.error("Logout failed:", error);
                alert("Abmelden fehlgeschlagen. Bitte erneut versuchen.");
                return;
            }

            window.location.href = "../index.html";

        } catch (error) {
            console.error("Unexpected logout error:", error);
            alert("Es ist ein Fehler beim Abmelden aufgetreten.");

        } finally {
            logoutButton.disabled = false;
        }
    });
}


// =========================================================
// INITIALIZE MENU
// =========================================================

async function initializeMenu() {
    try {
        menuUser = await getMenuUser();

        if (!menuUser) {
            window.location.href = "../index.html";
            return;
        }

        await loadPlayerProfile(menuUser);

    } catch (error) {
        console.error("Could not initialize menu:", error);
    }
}

initializeMenu();