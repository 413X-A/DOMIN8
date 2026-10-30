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
        return;
    }

    if (profile?.username && playerNameElement) {
        playerNameElement.textContent = profile.username;
    }
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
        // Fehler bei der Initialisierung des Menüs
    }
}

initializeMenu();