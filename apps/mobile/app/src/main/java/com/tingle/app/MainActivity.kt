package com.tingle.app

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Surface
import androidx.compose.ui.Modifier
import com.tingle.app.navigation.TingleNavGraph
import com.tingle.app.ui.theme.Midnight
import com.tingle.app.ui.theme.TingleTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TingleTheme {
                Surface(modifier = Modifier.fillMaxSize(), color = Midnight) {
                    TingleNavGraph(application = application as TingleApplication)
                }
            }
        }
    }
}
