package com.pdfmaster.app

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Starts the real app (real dependency injection, database, settings and navigation) in a simulated
 * Android runtime and walks through the main screens. It proves the app launches and the screens build
 * without crashing. It cannot replace testing on a phone: page rendering, the camera and touch feel are not covered.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = PdfMasterApp::class, sdk = [34], qualifiers = "w411dp-h891dp-xxhdpi")
class AppLaunchTest {
    @get:Rule val rule = createAndroidComposeRule<MainActivity>()

    @Test fun launches_andEveryTabAndToolScreenOpens() {
        rule.onNodeWithText("PDFMASTER").assertIsDisplayed()
        rule.onNodeWithText("Welcome").assertIsDisplayed()
        rule.onNodeWithText("Import PDF").assertIsDisplayed()
        rule.onNodeWithText("Quick actions").assertIsDisplayed()
        rule.onNodeWithText("No documents yet").performScrollTo().assertIsDisplayed()

        rule.onNodeWithText("Tools").performClick()
        rule.onNodeWithText("Find a tool").assertIsDisplayed()
        rule.onNodeWithText("Edit and sign").assertIsDisplayed()
        assertTrue(rule.onAllNodesWithText("Merge PDF").fetchSemanticsNodes().isNotEmpty())

        // A standard tool screen: options are shown and Start is there.
        rule.onAllNodesWithText("Merge PDF")[0].performClick()
        rule.onNodeWithText("PDFs to join, in order").assertIsDisplayed()
        rule.onNodeWithText("Start").assertIsDisplayed()
        rule.onNodeWithText("Choose file").performClick()          // document picker sheet
        rule.onNodeWithText("Import from this phone").assertIsDisplayed()
        rule.activityRule.scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
        rule.activityRule.scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()

        rule.onNodeWithText("Documents").performClick()
        rule.onNodeWithText("Your library is empty").assertExists()
        rule.onNodeWithText("Converted").assertExists()   // a filter chip further along the scrolling row

        rule.onNodeWithText("AI").performClick()
        rule.onNodeWithText("AI Assistant").assertIsDisplayed()
        rule.onNodeWithText("Choose a PDF to work with").assertIsDisplayed()

        rule.onNodeWithText("Profile").performClick()
        rule.onNodeWithText("Theme").assertIsDisplayed()
        rule.onNodeWithText("AI assistant settings").performScrollTo().performClick()
        rule.onNodeWithText("Use cloud AI").assertIsDisplayed()
        rule.activityRule.scenario.onActivity { it.onBackPressedDispatcher.onBackPressed() }
        rule.waitForIdle()
        rule.onNodeWithText("Privacy policy").performScrollTo().performClick()
        rule.onNodeWithText("Your documents").assertIsDisplayed()
    }
}
