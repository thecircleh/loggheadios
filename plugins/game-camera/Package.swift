// swift-tools-version: 5.9
import PackageDescription

// The package and product name must equal the Capacitor CLI's name for the npm package
// ("loggerhead-game-camera" -> "LoggerheadGameCamera"), or CapApp-SPM can't find it.
let package = Package(
    name: "LoggerheadGameCamera",
    platforms: [.iOS(.v15)],
    products: [
        .library(
            name: "LoggerheadGameCamera",
            targets: ["GameCameraPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0")
    ],
    targets: [
        .target(
            name: "GameCameraPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm")
            ],
            path: "ios/Sources/GameCameraPlugin")
    ]
)
