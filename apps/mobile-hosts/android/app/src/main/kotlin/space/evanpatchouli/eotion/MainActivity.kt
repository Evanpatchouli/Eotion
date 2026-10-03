package space.evanpatchouli.eotion

import android.os.Bundle
import android.util.Log
import androidx.activity.ComponentActivity
import com.lynx.tasm.LynxView
import com.lynx.tasm.LynxViewBuilder
import com.lynx.tasm.LynxViewClient
import com.lynx.tasm.LynxError
import com.lynx.xelement.webview.BehaviorGenerator

class MainActivity : ComponentActivity() {
    private var lynxView: LynxView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val viewBuilder = LynxViewBuilder()
        viewBuilder.addBehaviors(BehaviorGenerator.getBehaviors())
        viewBuilder.setTemplateProvider(AssetTemplateProvider(this))
        val view = viewBuilder.build(this)
        view.addLynxViewClient(object : LynxViewClient() {
            override fun onReceivedError(error: LynxError) {
                Log.e("EotionHost", "Lynx error ${error.errorCode}: ${error.summaryMessage}")
            }
            override fun onLoadSuccess() {
                Log.i("EotionHost", "Lynx template loaded")
            }
            override fun onFirstScreen() {
                Log.i("EotionHost", "Lynx first screen")
            }
        })
        lynxView = view
        setContentView(view)
        view.renderTemplateUrl("main.lynx.bundle", "")
    }

    override fun onDestroy() {
        lynxView?.destroy()
        lynxView = null
        super.onDestroy()
    }
}
