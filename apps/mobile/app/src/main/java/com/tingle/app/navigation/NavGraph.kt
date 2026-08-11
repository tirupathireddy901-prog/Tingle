package com.tingle.app.navigation

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import androidx.navigation.NavType
import com.tingle.app.TingleApplication
import com.tingle.app.signaling.CallMode
import com.tingle.app.ui.screens.*
import com.tingle.app.viewmodel.AuthViewModel
import com.tingle.app.viewmodel.CallViewModel

object Routes {
    const val SPLASH = "splash"
    const val LOGIN = "login"
    const val SIGNUP = "signup"
    const val VERIFY_EMAIL = "verify_email/{email}"
    const val RESTRICTED = "restricted"
    const val HOME = "home"
    const val CALL = "call/{mode}"

    fun verifyEmail(email: String) = "verify_email/${java.net.URLEncoder.encode(email, "UTF-8")}"
    fun call(mode: CallMode) = "call/${mode.value}"
}

@Composable
fun TingleNavGraph(application: TingleApplication) {
    val navController: NavHostController = rememberNavController()
    val authViewModel: AuthViewModel = viewModel(
        factory = AuthViewModel.Factory(application, application.authRepository)
    )
    val authState by authViewModel.state.collectAsState()

    NavHost(navController = navController, startDestination = Routes.SPLASH) {
        composable(Routes.SPLASH) {
            SplashScreen(authState = authState) { destination ->
                val target = when (destination) {
                    SplashDestination.Login -> Routes.LOGIN
                    // CurrentUser deliberately has no email field (the
                    // backend's /auth/me never returns it) — there's no
                    // real email to prefill here, so route with it blank;
                    // VerifyEmailScreen's resend form lets the user type
                    // it in, same fallback the web app uses.
                    SplashDestination.VerifyEmail -> Routes.verifyEmail("")
                    SplashDestination.Restricted -> Routes.RESTRICTED
                    SplashDestination.Home -> Routes.HOME
                }
                navController.navigate(target) { popUpTo(Routes.SPLASH) { inclusive = true } }
            }
        }

        composable(Routes.LOGIN) {
            LoginScreen(
                authViewModel = authViewModel,
                onLoggedIn = { requiresVerification ->
                    val target = if (requiresVerification) Routes.verifyEmail("") else Routes.HOME
                    navController.navigate(target) { popUpTo(Routes.LOGIN) { inclusive = true } }
                },
                onNavigateSignup = { navController.navigate(Routes.SIGNUP) },
            )
        }

        composable(Routes.SIGNUP) {
            SignupScreen(
                authViewModel = authViewModel,
                onSignedUp = { email ->
                    navController.navigate(Routes.verifyEmail(email)) {
                        popUpTo(Routes.SIGNUP) { inclusive = true }
                    }
                },
                onNavigateLogin = { navController.popBackStack() },
            )
        }

        composable(
            Routes.VERIFY_EMAIL,
            arguments = listOf(navArgument("email") { type = NavType.StringType }),
        ) { backStackEntry ->
            val email = backStackEntry.arguments?.getString("email") ?: ""
            VerifyEmailScreen(
                authViewModel = authViewModel,
                email = email,
                onBackToLogin = { navController.navigate(Routes.LOGIN) { popUpTo(Routes.SPLASH) } },
            )
        }

        composable(Routes.RESTRICTED) {
            RestrictedScreen(
                authViewModel = authViewModel,
                onLoggedOut = { navController.navigate(Routes.LOGIN) { popUpTo(Routes.SPLASH) } },
            )
        }

        composable(Routes.HOME) {
            HomeScreen(
                authState = authState,
                onLogout = {
                    authViewModel.logout()
                    navController.navigate(Routes.LOGIN) { popUpTo(Routes.SPLASH) { inclusive = true } }
                },
                onStartCall = { mode -> navController.navigate(Routes.call(mode)) },
            )
        }

        composable(
            Routes.CALL,
            arguments = listOf(navArgument("mode") { type = NavType.StringType }),
        ) { backStackEntry ->
            val modeValue = backStackEntry.arguments?.getString("mode") ?: CallMode.VIDEO.value
            val mode = CallMode.entries.first { it.value == modeValue }
            val selfUserId = authState.user?.id
            val accessToken = authState.accessToken

            if (selfUserId == null || accessToken == null) {
                androidx.compose.runtime.LaunchedEffect(Unit) {
                    navController.navigate(Routes.LOGIN) { popUpTo(Routes.SPLASH) { inclusive = true } }
                }
            } else {
                val callViewModel: CallViewModel = viewModel(
                    factory = CallViewModel.Factory(application, application.authRepository, selfUserId, accessToken)
                )
                CallScreen(
                    callViewModel = callViewModel,
                    initialMode = mode,
                    onExitToHome = { navController.navigate(Routes.HOME) { popUpTo(Routes.HOME) { inclusive = true } } },
                )
            }
        }
    }
}
