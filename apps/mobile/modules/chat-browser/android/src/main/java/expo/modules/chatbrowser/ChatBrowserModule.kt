package expo.modules.chatbrowser

import android.app.ActivityOptions
import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.widget.RemoteViews
import androidx.browser.customtabs.CustomTabsIntent
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class ChatBrowserModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ChatBrowser")

    AsyncFunction("open") { url: String, title: String ->
      val activity = appContext.currentActivity ?: throw Exceptions.MissingActivity()
      // The tab runs in the app's task; relaunching the app with CLEAR_TOP closes it and shows the same room.
      val back = activity.packageManager.getLaunchIntentForPackage(activity.packageName)!!
        .addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
      val options = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE)
        ActivityOptions.makeBasic().setPendingIntentCreatorBackgroundActivityStartMode(ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED).toBundle()
      else null
      val pending = PendingIntent.getActivity(activity, 0, back, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT, options)
      val bar = RemoteViews(activity.packageName, R.layout.chat_browser_bar).apply {
        setTextViewText(R.id.chat_browser_title, title)
        setContentDescription(R.id.chat_browser_bar, "Back to chat, $title")
      }
      CustomTabsIntent.Builder()
        .setSecondaryToolbarViews(bar, intArrayOf(R.id.chat_browser_bar), pending)
        .build()
        .launchUrl(activity, Uri.parse(url))
    }.runOnQueue(expo.modules.kotlin.functions.Queues.MAIN)
  }
}
