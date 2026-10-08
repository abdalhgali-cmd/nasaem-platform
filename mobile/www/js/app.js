import { icon } from "./icons.js";
import { offlineBanner, confirmDialog } from "./ui.js";
import { registerScreen, initRouter, go, goToTab, back, stackDepth, currentTab } from "./router.js";
import * as auth from "./auth.js";

import { renderWelcomeScreen, renderLoginScreen, renderRegisterScreen, renderForgotPasswordScreen, renderResetPasswordScreen, setOnAuthenticated } from "./screens/auth-screens.js";
import { renderHomeScreen } from "./screens/home.js";
import { renderServicesScreen, renderVisasHubScreen, renderServiceDetailScreen } from "./screens/services.js";
import { renderUmrahScreen } from "./screens/umrah.js";
import { renderFlightsScreen } from "./screens/flights.js";
import { renderFerriesScreen } from "./screens/ferries.js";
import { renderHotelsScreen } from "./screens/hotels.js";
import { renderEgyptClearanceScreen } from "./screens/egypt-clearance.js";
import { renderSaudiFamilyVisitScreen } from "./screens/saudi-family-visit.js";
import { renderRequestSubmittedScreen } from "./screens/intake.js";
import { renderMyRequestsScreen, renderRequestDetailScreen, renderOrderDetailScreen } from "./screens/requests.js";
import { renderNotificationsScreen } from "./screens/notifications.js";
import { renderAccountScreen, renderEditProfileScreen, renderChangePasswordScreen, renderMyDocumentsScreen, setOnLoggedOut, setOnReplayOnboarding } from "./screens/account.js";
import { renderSecurityScreen } from "./screens/security.js";
import { renderOnboardingScreen, isOnboardingDone, markOnboardingDone } from "./screens/onboarding.js";
import { renderAboutScreen } from "./screens/about.js";
import { launchRoute } from "./experience-core.js";
import { tapFeedback } from "./motion.js";
import { renderSessionCheckScreen, renderSessionOfflineScreen, renderBiometricLockScreen } from "./screens/session-screens.js";

const screenEl = document.getElementById("screen");
const navEl = document.getElementById("bottomNav");

function registerAllScreens() {
  registerScreen("onboarding", renderOnboardingScreen, { chrome: false });
  registerScreen("welcome", renderWelcomeScreen, { chrome: false });
  registerScreen("about", renderAboutScreen);
  registerScreen("login", renderLoginScreen);
  registerScreen("register", renderRegisterScreen);
  registerScreen("forgotPassword", renderForgotPasswordScreen);
  registerScreen("resetPassword", renderResetPasswordScreen);

  registerScreen("home", renderHomeScreen, { chrome: false });
  registerScreen("services", renderServicesScreen);
  registerScreen("visasHub", renderVisasHubScreen);
  registerScreen("serviceDetail", renderServiceDetailScreen);
  registerScreen("umrah", renderUmrahScreen);
  registerScreen("flights", renderFlightsScreen);
  registerScreen("ferries", renderFerriesScreen);
  registerScreen("hotels", renderHotelsScreen);
  registerScreen("egyptClearance", renderEgyptClearanceScreen);
  registerScreen("saudiFamilyVisit", renderSaudiFamilyVisitScreen);
  registerScreen("requestSubmitted", renderRequestSubmittedScreen);

  registerScreen("requests", renderMyRequestsScreen);
  registerScreen("requestDetail", renderRequestDetailScreen);
  registerScreen("orderDetail", renderOrderDetailScreen);

  registerScreen("notifications", renderNotificationsScreen);

  registerScreen("account", renderAccountScreen);
  registerScreen("editProfile", renderEditProfileScreen);
  registerScreen("changePassword", renderChangePasswordScreen);
  registerScreen("myDocuments", renderMyDocumentsScreen);
  registerScreen("security", renderSecurityScreen);

  registerScreen("sessionCheck", renderSessionCheckScreen, { chrome: false });
  registerScreen("sessionOffline", renderSessionOfflineScreen, { chrome: false });
  registerScreen("biometricLock", renderBiometricLockScreen, { chrome: false });
}

async function enterAuthenticatedShell() {
  navEl.hidden = false;
  await goToTab("home", "home", { title: "" });
}

async function enterAuthFlow({ notice = "" } = {}) {
  navEl.hidden = true;
  await go("welcome", { notice }, { root: true });
}

const SESSION_ENDED_NOTICE = "انتهت جلستك أو تم إنهاؤها. يرجى تسجيل الدخول مجددًا.";

// Launch: what is stored → (fingerprint, if enabled) → server check.
// Only a server "session over" (401) leads to the login screen; anything
// temporary leads to the offline screen with the session kept.
async function verifyAndEnter() {
  navEl.hidden = true;
  await go("sessionCheck", {}, { root: true });
  const result = await auth.verifySession();
  if (result.state === auth.SessionState.VALID) {
    await enterAuthenticatedShell();
  } else if (result.state === auth.SessionState.EXPIRED) {
    await enterAuthFlow({ notice: SESSION_ENDED_NOTICE });
  } else if (result.state === auth.SessionState.OFFLINE) {
    await go("sessionOffline", {
      message: result.error?.message,
      onRetry: verifyAndEnter,
      onUsePassword: switchAccount,
    }, { root: true });
  } else {
    await enterAuthFlow();
  }
}

async function switchAccount() {
  if (!confirmDialog("سيتم تسجيل الخروج من الحساب المحفوظ على هذا الجهاز. هل تريد المتابعة؟")) return;
  await auth.logout();
  await enterAuthFlow();
}

async function showBiometricLock() {
  navEl.hidden = true;
  await go("biometricLock", {
    unlock: auth.unlockWithBiometric,
    onUnlocked: verifyAndEnter,
    // Password fallback: the stored biometric session stays until a password
    // login replaces it (auth.login turns biometrics off then), unless the
    // key is gone for good (enrollment changed), which already wiped it.
    onUsePassword: () => go("login", {}, { title: "تسجيل الدخول" }),
  }, { root: true });
}

// First launch: the introduction, then the login/register choice. A stored
// session always goes straight to the session / biometric flow, so the
// introduction can never stand in front of (or around) authentication.
async function showOnboarding({ replay = false } = {}) {
  navEl.hidden = true;
  await go("onboarding", {
    onFinish: replay ? () => enterAuthenticatedShellAt("account") : () => enterAuthFlow(),
  }, { root: true });
}

async function enterAuthenticatedShellAt(tab) {
  navEl.hidden = false;
  await goToTab(tab, tab, { title: tab === "account" ? "حسابي" : "" });
}

async function startFromStoredSession() {
  const stored = await auth.loadStoredSession();
  const onboardingDone = await isOnboardingDone();
  // Customers who already had a session before this version never need the intro.
  if (stored.kind !== "none" && !onboardingDone) markOnboardingDone();
  const route = launchRoute({ storedKind: stored.kind, onboardingDone });
  if (route === "biometric") return showBiometricLock();
  if (route === "verify") return verifyAndEnter();
  if (route === "onboarding") return showOnboarding();
  return enterAuthFlow();
}

// Light status-bar icons over the navy strip, on every Android version (see
// capacitor.config.ts). Both plugins write the same window flag; setting it
// from here wins over any default applied while the bridge started.
function applySystemBarStyle() {
  const plugins = window.Capacitor?.Plugins || {};
  plugins.SystemBars?.setStyle?.({ style: "DARK" })?.catch?.(() => {});
  plugins.StatusBar?.setStyle?.({ style: "DARK" })?.catch?.(() => {});
}

function wireBottomNav() {
  navEl.querySelectorAll("button[data-tab]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      tapFeedback();
      const tab = btn.dataset.tab;
      if (currentTab() === tab && stackDepth() === 1) return; // already at tab root
      const titleByTab = { home: "", requests: "طلباتي", notifications: "الإشعارات", account: "حسابي" };
      const screenByTab = { home: "home", requests: "requests", notifications: "notifications", account: "account" };
      await goToTab(tab, screenByTab[tab], { title: titleByTab[tab] });
    });
  });
}

function wireBackButton() {
  const AppPlugin = window.Capacitor?.Plugins?.App;
  if (!AppPlugin) return;
  AppPlugin.addListener("backButton", () => {
    if (stackDepth() > 1) {
      back();
      return;
    }
    // At a tab root (or the auth flow's first screen): confirm exit rather
    // than leaving the Android back button feeling broken or silently
    // backgrounding without feedback.
    if (confirmDialog("هل تريد إغلاق التطبيق؟")) {
      AppPlugin.exitApp();
    }
  });
}

function wireConnectivity() {
  const update = () => offlineBanner(!navigator.onLine);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  update();
}

async function boot() {
  registerAllScreens();
  initRouter({ screenElement: screenEl, navElement: navEl, emptyStackHandler: () => {} });
  wireBottomNav();
  wireBackButton();
  wireConnectivity();
  applySystemBarStyle();
  window.Capacitor?.Plugins?.App?.addListener?.("resume", applySystemBarStyle);

  setOnAuthenticated(enterAuthenticatedShell);
  setOnLoggedOut(() => enterAuthFlow());
  setOnReplayOnboarding(() => showOnboarding({ replay: true }));
  auth.setOnSessionEnded(() => enterAuthFlow({ notice: SESSION_ENDED_NOTICE }));

  await startFromStoredSession();

  window.Capacitor?.Plugins?.SplashScreen?.hide();
}

boot().catch((error) => {
  console.error("[app] boot failed", error);
  screenEl.innerHTML = `
    <div class="boot-error">
      ${icon("alert", { size: 32 })}
      <h2>تعذر تشغيل التطبيق</h2>
      <p>${error.message || "حدث خطأ غير متوقع"}</p>
      <button class="primary" onclick="location.reload()">إعادة المحاولة</button>
    </div>`;
  window.Capacitor?.Plugins?.SplashScreen?.hide();
});
