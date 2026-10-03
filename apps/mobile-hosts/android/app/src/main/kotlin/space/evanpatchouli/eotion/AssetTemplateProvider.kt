package space.evanpatchouli.eotion

import android.content.Context
import android.util.Log
import com.lynx.tasm.provider.AbsTemplateProvider
import java.io.ByteArrayOutputStream
import java.io.IOException

class AssetTemplateProvider(context: Context) : AbsTemplateProvider() {
    private val appContext = context.applicationContext

    override fun loadTemplate(uri: String, callback: Callback) {
        Thread {
            try {
                appContext.assets.open(uri).use { input ->
                    ByteArrayOutputStream().use { output ->
                        input.copyTo(output)
                        Log.i("EotionHost", "Bundled template read: ${output.size()} bytes")
                        callback.onSuccess(output.toByteArray())
                    }
                }
            } catch (error: IOException) {
                Log.e("EotionHost", "Bundled template read failed", error)
                callback.onFailed(error.message)
            }
        }.start()
    }
}
