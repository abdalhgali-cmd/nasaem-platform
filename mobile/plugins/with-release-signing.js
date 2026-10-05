// Config plugin: sign the Android RELEASE build with a real release keystore.
//
// `expo prebuild` generates android/app/build.gradle with
// `signingConfig signingConfigs.debug` on the release build type — an app signed
// with the public debug key must never be distributed. This plugin adds a
// `release` signing config that reads its keystore from the environment
// (ANDROID_KEYSTORE_PATH / _PASSWORD, ANDROID_KEY_ALIAS / _PASSWORD) and uses it
// for the release build whenever it is configured. Without those variables the
// build still works (debug-signed) so pull-request CI can compile, but the
// workflow refuses to publish such an APK as a production artifact.
//
// The plugin fails LOUDLY if the generated Gradle file no longer has the shape it
// expects, so a template change can never silently ship a debug-signed release.
const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "NASAEM_RELEASE_SIGNING";

const RELEASE_SIGNING = `
        release { // ${MARKER}
            if (System.getenv("ANDROID_KEYSTORE_PATH")) {
                storeFile file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias System.getenv("ANDROID_KEY_ALIAS")
                keyPassword System.getenv("ANDROID_KEY_PASSWORD")
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (mod) => {
    let gradle = mod.modResults.contents;
    if (gradle.includes(MARKER)) return mod;

    // 1. add a `release` entry to the existing signingConfigs { ... } block
    const signingBlock = /signingConfigs\s*\{\s*debug\s*\{[\s\S]*?\n\s{8}\}/;
    if (!signingBlock.test(gradle)) {
      throw new Error("with-release-signing: could not find the signingConfigs.debug block in android/app/build.gradle");
    }
    gradle = gradle.replace(signingBlock, (match) => match + RELEASE_SIGNING);

    // 2. use it for the release build type when a keystore is configured
    const releaseBuildType = /(buildTypes\s*\{[\s\S]*?release\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug/;
    if (!releaseBuildType.test(gradle)) {
      throw new Error("with-release-signing: could not find signingConfig signingConfigs.debug in the release build type");
    }
    gradle = gradle.replace(
      releaseBuildType,
      '$1signingConfig System.getenv("ANDROID_KEYSTORE_PATH") ? signingConfigs.release : signingConfigs.debug'
    );

    mod.modResults.contents = gradle;
    return mod;
  });
};
