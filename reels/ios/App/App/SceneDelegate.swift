import UIKit
import Capacitor
import FirebaseAuth

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)

        // Screen recording and mirroring would hand out unexported reels for free, so the app hides itself while captured.
        NotificationCenter.default.addObserver(forName: UIScreen.capturedDidChangeNotification, object: nil, queue: .main) { [weak self] _ in
            self?.updateCaptureShield()
        }
        updateCaptureShield()
    }

    private var captureShield: UIView?

    private func updateCaptureShield() {
        guard let window = window else { return }
        let captured = window.windowScene?.screen.isCaptured ?? false
        if captured && captureShield == nil {
            let shield = UIVisualEffectView(effect: UIBlurEffect(style: .systemUltraThinMaterialDark))
            shield.frame = window.bounds
            shield.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            let label = UILabel()
            label.text = NSLocalizedString("Screen recording is on. Editless is hidden while the screen is recorded.", comment: "")
            label.textColor = .white
            label.numberOfLines = 0
            label.textAlignment = .center
            label.font = .systemFont(ofSize: 17, weight: .semibold)
            label.translatesAutoresizingMaskIntoConstraints = false
            shield.contentView.addSubview(label)
            NSLayoutConstraint.activate([
                label.centerXAnchor.constraint(equalTo: shield.contentView.centerXAnchor),
                label.centerYAnchor.constraint(equalTo: shield.contentView.centerYAnchor),
                label.widthAnchor.constraint(equalTo: shield.contentView.widthAnchor, multiplier: 0.8),
            ])
            window.addSubview(shield)
            captureShield = shield
        } else if !captured, let shield = captureShield {
            shield.removeFromSuperview()
            captureShield = nil
        }
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Firebase sign-in callbacks (the reCAPTCHA fallback of phone verification) are Firebase's; the rest go to Capacitor.
        let rest = URLContexts.filter { !Auth.auth().canHandle($0.url) }
        if rest.isEmpty { return }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: rest)
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
