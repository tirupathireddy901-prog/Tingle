package com.tingle.app.ui.theme

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Mirrors apps/web/tailwind.config.js — keep these in sync if the web
// design tokens ever change.
val Midnight = Color(0xFF0B0C10)
val Graphite = Color(0xFF1A1C22)
val Charcoal = Color(0xFF232630)
val Violet = Color(0xFF7C5CFC)
val Indigo = Color(0xFF5B4BDB)
val Cyan = Color(0xFF3CD3F0)
val StatusConnected = Color(0xFF22C55E)
val StatusConnecting = Color(0xFFF59E0B)
val StatusError = Color(0xFFEF4444)

private val TingleColorScheme = darkColorScheme(
    background = Midnight,
    surface = Graphite,
    surfaceVariant = Charcoal,
    primary = Violet,
    secondary = Indigo,
    tertiary = Cyan,
    error = StatusError,
)

@Composable
fun TingleTheme(content: @Composable () -> Unit) {
    // Dark-first by design (spec section 6) — Tingle doesn't offer a
    // light theme, regardless of system setting, so isSystemInDarkTheme()
    // is deliberately not consulted here.
    MaterialTheme(colorScheme = TingleColorScheme, content = content)
}
