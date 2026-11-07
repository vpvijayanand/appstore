package com.worldline.wltestapp

import android.app.Activity
import android.graphics.Color
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView

class MainActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val rootLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#0B1F3A"))
            setPadding(64, 64, 64, 64)
        }

        val cardLayout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setBackgroundColor(Color.parseColor("#152E58"))
            setPadding(48, 64, 48, 64)
        }

        val badge = TextView(this).apply {
            text = "✓ VERIFIED INSTALL"
            textSize = 12f
            setTextColor(Color.parseColor("#34D399"))
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 24)
        }

        val title = TextView(this).apply {
            text = "WL Test APP"
            textSize = 28f
            setTextColor(Color.WHITE)
            typeface = Typeface.DEFAULT_BOLD
            gravity = Gravity.CENTER
        }

        val subtitle = TextView(this).apply {
            text = "You have successfully downloaded the WL Test APP"
            textSize = 16f
            setTextColor(Color.parseColor("#93C5FD"))
            gravity = Gravity.CENTER
            setPadding(0, 32, 0, 24)
        }

        val details = TextView(this).apply {
            text = "Package: com.worldline.wltestapp\nVersion: 1.0.0 (Build 1)\nPlatform: WL BizStore Enterprise"
            textSize = 12f
            setTextColor(Color.parseColor("#94A3B8"))
            gravity = Gravity.CENTER
            setPadding(0, 0, 0, 48)
        }

        val exitButton = Button(this).apply {
            text = "Exit App"
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#2563EB"))
            setOnClickListener {
                finish()
            }
        }

        cardLayout.addView(badge)
        cardLayout.addView(title)
        cardLayout.addView(subtitle)
        cardLayout.addView(details)
        cardLayout.addView(exitButton)

        rootLayout.addView(cardLayout)
        setContentView(rootLayout)
    }
}

