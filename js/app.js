// =========================================================
// ELEMENTS
// =========================================================

const introScreen =
    document.getElementById("intro-screen");

const loginScreen =
    document.getElementById("login-screen");

const menuScreen =
    document.getElementById("menu-screen");

const loginForm =
    document.getElementById("login-form");

const loginEmail =
    document.getElementById("login-email");

const loginPassword =
    document.getElementById("login-password");

const loginButton =
    document.getElementById("login-button");

const loginMessage =
    document.getElementById("login-message");

const logoutButton =
    document.getElementById("logout-button");

const playerName =
    document.getElementById("player-name");

const notification =
    document.getElementById("coming-soon");

const notificationText =
    document.getElementById("notification-text");


// =========================================================
// SCREEN MANAGEMENT
// =========================================================

function hideAllScreens() {
    document
        .querySelectorAll(".screen")
        .forEach(screen => {
            screen.classList.remove("active");
        });
}


function showScreen(screen) {
    if (!screen) {
        console.error(
            "Screen does not exist."
        );

        return;
    }

    hideAllScreens();

    screen.classList.add("active");
}


function showIntroScreen() {
    console.log(
        "Showing intro screen."
    );

    showScreen(introScreen);
}


function showLoginScreen() {
    console.log(
        "Showing login screen."
    );

    showScreen(loginScreen);
}


function showMenuScreen() {
    console.log(
        "Showing menu screen."
    );

    showScreen(menuScreen);
}


// =========================================================
// NOTIFICATION
// =========================================================

let notificationTimeout = null;


function showNotification(text) {
    if (!notification || !notificationText) {
        return;
    }

    notificationText.textContent = text;

    notification.classList.add("show");

    clearTimeout(
        notificationTimeout
    );

    notificationTimeout = setTimeout(() => {
        notification.classList.remove(
            "show"
        );
    }, 2200);
}


// =========================================================
// LOAD PLAYER
// =========================================================

async function loadPlayer(user) {
    if (!user) {
        console.error(
            "loadPlayer() called without user."
        );

        return null;
    }


    // -----------------------------------------------------
    // PROFILE
    // -----------------------------------------------------

    const {
        data: profile,
        error: profileError
    } = await supabaseClient
        .from("profiles")
        .select(
            "username, display_name"
        )
        .eq(
            "id",
            user.id
        )
        .single();


    if (profileError) {
        console.error(
            "Could not load profile:",
            profileError
        );

        return null;
    }


    // -----------------------------------------------------
    // PLAYER PROGRESS
    // -----------------------------------------------------

    const {
        data: progress,
        error: progressError
    } = await supabaseClient
        .from("player_progress")
        .select("*")
        .eq(
            "user_id",
            user.id
        )
        .single();


    if (progressError) {
        console.error(
            "Could not load player progress:",
            progressError
        );

        return null;
    }


    return {
        profile,
        progress
    };
}


// =========================================================
// UPDATE PLAYER UI
// =========================================================

function updatePlayerUI(player) {
    if (!player) {
        return;
    }

    const profile =
        player.profile;

    const name =
        profile.display_name ||
        profile.username ||
        "Player";

    if (playerName) {
        playerName.textContent =
            name;
    }
}


// =========================================================
// SHOW MAIN MENU
// =========================================================

async function showMainMenu(user) {
    console.log(
        "Loading main menu..."
    );


    const player =
        await loadPlayer(user);


    if (!player) {
        console.error(
            "Could not load player."
        );

        showLoginScreen();

        return;
    }


    updatePlayerUI(player);

    showMenuScreen();
}


// =========================================================
// LOGIN
// =========================================================

async function handleLogin(event) {
    event.preventDefault();


    const email =
        loginEmail.value.trim();

    const password =
        loginPassword.value;


    if (!email || !password) {
        loginMessage.textContent =
            "Bitte E-Mail und Passwort eingeben.";

        return;
    }


    loginButton.disabled = true;

    loginMessage.textContent =
        "LOGIN...";


    console.log(
        "Trying to login:",
        email
    );


    const {
        data,
        error
    } = await supabaseClient.auth
        .signInWithPassword({
            email,
            password
        });


    if (error) {
        console.error(
            "Login failed:",
            error
        );

        loginMessage.textContent =
            "Login fehlgeschlagen.";

        loginButton.disabled = false;

        return;
    }


    console.log(
        "Login successful."
    );


    loginMessage.textContent = "";


    if (data?.user) {
        await showMainMenu(
            data.user
        );
    }


    loginButton.disabled = false;
}


// =========================================================
// LOGIN FORM EVENT
// =========================================================

if (loginForm) {
    loginForm.addEventListener(
        "submit",
        handleLogin
    );
} else {
    console.error(
        "Could not find #login-form"
    );
}


// =========================================================
// LOGOUT
// =========================================================

async function handleLogout() {
    console.log(
        "Logging out..."
    );


    const {
        error
    } = await supabaseClient.auth
        .signOut();


    if (error) {
        console.error(
            "Logout failed:",
            error
        );

        return;
    }


    console.log(
        "Logout successful."
    );


    if (loginEmail) {
        loginEmail.value = "";
    }

    if (loginPassword) {
        loginPassword.value = "";
    }

    if (loginMessage) {
        loginMessage.textContent = "";
    }


    showLoginScreen();
}


// =========================================================
// LOGOUT BUTTON
// =========================================================

if (logoutButton) {
    logoutButton.addEventListener(
        "click",
        handleLogout
    );
} else {
    console.error(
        "Could not find #logout-button"
    );
}


// =========================================================
// MENU BUTTONS
// =========================================================

document
    .querySelectorAll("[data-action]")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                const action =
                    button.dataset.action;


                switch (action) {

                    case "play":

                        showNotification(
                            "Das Color-Fill-Spiel kommt als Nächstes."
                        );

                        break;


                    case "campaign":

                        showNotification(
                            "CAMPAIGN – COMING SOON"
                        );

                        break;


                    case "challenges":

                        showNotification(
                            "CHALLENGES – COMING SOON"
                        );

                        break;


                    case "ranked":

                        showNotification(
                            "RANKED – COMING SOON"
                        );

                        break;


                    case "profile":

                        showNotification(
                            "PROFILE – COMING SOON"
                        );

                        break;


                    case "settings":

                        showNotification(
                            "SETTINGS – COMING SOON"
                        );

                        break;


                    default:

                        console.warn(
                            "Unknown menu action:",
                            action
                        );
                }
            }
        );
    });


// =========================================================
// INITIALIZE APP
// =========================================================

async function initializeApp() {
    console.log(
        "Initializing app..."
    );


    // -----------------------------------------------------
    // GET SESSION
    // -----------------------------------------------------

    const {
        data: { session },
        error
    } = await supabaseClient.auth
        .getSession();


    if (error) {
        console.error(
            "Could not get session:",
            error
        );

        showLoginScreen();

        return;
    }


    // -----------------------------------------------------
    // NO SESSION
    // -----------------------------------------------------

    if (!session) {
        console.log(
            "No session."
        );

        showIntroScreen();

        return;
    }


    // -----------------------------------------------------
    // SESSION EXISTS
    // -----------------------------------------------------

    console.log(
        "Session found:",
        session.user.email
    );


    const player =
        await loadPlayer(
            session.user
        );


    if (!player) {
        showLoginScreen();

        return;
    }


    // -----------------------------------------------------
    // INTRO NOT COMPLETED
    // -----------------------------------------------------

    if (
        !player.progress.intro_completed
    ) {
        console.log(
            "Intro not completed."
        );

        showIntroScreen();

        return;
    }


    // -----------------------------------------------------
    // INTRO COMPLETED
    // -----------------------------------------------------

    console.log(
        "Intro already completed."
    );


    await showMainMenu(
        session.user
    );
}


// =========================================================
// AUTH STATE
// =========================================================

supabaseClient.auth.onAuthStateChange(
    async (
        event,
        session
    ) => {

        console.log(
            "Auth event:",
            event
        );


        if (
            event === "SIGNED_OUT"
        ) {
            showLoginScreen();

            return;
        }


        if (
            event === "SIGNED_IN" &&
            session
        ) {
            await showMainMenu(
                session.user
            );

            return;
        }
    }
);


// =========================================================
// START APPLICATION
// =========================================================

initializeApp();