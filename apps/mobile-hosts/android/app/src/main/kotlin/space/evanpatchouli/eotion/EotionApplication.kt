package space.evanpatchouli.eotion

import android.app.Application
import android.util.Log
import com.lynx.tasm.LynxEnv

class EotionApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        LynxEnv.inst().init(this, null, null, null)
        Log.i("EotionHost", "Lynx initialized=${LynxEnv.inst().isInitCompleted} nativeLoaded=${LynxEnv.inst().isNativeLibraryLoaded}")
    }
}
