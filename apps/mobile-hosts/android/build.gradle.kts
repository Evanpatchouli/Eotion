plugins {
    id("com.android.application") version "8.11.1" apply false
    id("org.jetbrains.kotlin.android") version "2.2.10" apply false
}

val packageJson = groovy.json.JsonSlurper().parse(file("../../../package.json")) as Map<*, *>
val eotionMetadata = packageJson["eotion"] as Map<*, *>

extra["eotionVersion"] = packageJson["version"] as String
extra["eotionBuildNumber"] = (eotionMetadata["buildNumber"] as Number).toInt()
