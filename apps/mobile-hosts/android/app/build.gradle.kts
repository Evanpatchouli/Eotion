plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

val eotionVersion = rootProject.extra["eotionVersion"] as String
val eotionBuildNumber = rootProject.extra["eotionBuildNumber"] as Int
val allowCleartext = providers.gradleProperty("eotionAllowCleartext").orElse("false").get()
require(allowCleartext == "true" || allowCleartext == "false") {
    "eotionAllowCleartext must be either true or false."
}

android {
    namespace = "space.evanpatchouli.eotion"
    compileSdk = 36
    buildToolsVersion = "36.0.0"

    defaultConfig {
        applicationId = "space.evanpatchouli.eotion"
        minSdk = 26
        targetSdk = 36
        versionCode = eotionBuildNumber
        versionName = eotionVersion
    }

    sourceSets {
        getByName("main") {
            assets.srcDir(layout.buildDirectory.dir("generated/eotion/assets"))
            res.srcDir(layout.buildDirectory.dir("generated/eotion/res"))
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildTypes {
        getByName("debug") {
            manifestPlaceholders["eotionAllowCleartext"] = allowCleartext
        }
        getByName("release") {
            manifestPlaceholders["eotionAllowCleartext"] = allowCleartext
        }
    }
}

dependencies {
    implementation("androidx.activity:activity-ktx:1.10.1")

    implementation("org.lynxsdk.lynx:lynx:4.1.0")
    implementation("org.lynxsdk.lynx:lynx-jssdk:4.1.0")
    implementation("org.lynxsdk.lynx:lynx-trace:4.1.0")
    implementation("org.lynxsdk.lynx:primjs:4.1.1")
    implementation("org.lynxsdk.lynx:xelement-webview:4.1.0")
}
