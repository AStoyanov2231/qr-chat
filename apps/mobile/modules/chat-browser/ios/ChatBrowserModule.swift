import ExpoModulesCore
import SafariServices
import UIKit

public class ChatBrowserModule: Module {
  private var session: ChatBrowserSession?

  public func definition() -> ModuleDefinition {
    Name("ChatBrowser")

    AsyncFunction("open") { (url: String, title: String) in
      guard self.session == nil else { return }
      guard let target = URL(string: url), let presenter = self.appContext?.utilities?.currentViewController() else {
        throw Exception(name: "ERR_CHAT_BROWSER", description: "Could not open the browser.")
      }
      self.session = ChatBrowserSession(url: target, title: title, presenter: presenter) { [weak self] in self?.session = nil }
    }.runOnQueue(.main)
  }
}

/// SFSafariViewController can't host app UI, so the bar lives in a pass-through window above it.
final class ChatBrowserSession: NSObject, SFSafariViewControllerDelegate, UIAdaptivePresentationControllerDelegate {
  private static let barHeight: CGFloat = 56
  private let safari: SFSafariViewController
  private var window: UIWindow?
  private let onClose: () -> Void

  init(url: URL, title: String, presenter: UIViewController, onClose: @escaping () -> Void) {
    safari = SFSafariViewController(url: url)
    self.onClose = onClose
    super.init()
    safari.modalPresentationStyle = .fullScreen
    safari.delegate = self
    presenter.present(safari, animated: true) { [weak self] in self?.showBar(title: title) }
  }

  private func showBar(title: String) {
    guard let scene = safari.view.window?.windowScene else { return }
    var config = UIButton.Configuration.filled()
    config.title = title
    config.subtitle = "Back to chat"
    config.image = UIImage(systemName: "bubble.left.and.bubble.right.fill")
    config.imagePadding = 12
    config.titleLineBreakMode = .byTruncatingTail
    config.cornerStyle = .capsule
    config.baseBackgroundColor = UIColor(red: 0.08, green: 0.17, blue: 0.25, alpha: 1)
    config.baseForegroundColor = .white
    config.contentInsets = NSDirectionalEdgeInsets(top: 8, leading: 18, bottom: 8, trailing: 18)
    let bar = UIButton(configuration: config, primaryAction: UIAction { [weak self] _ in self?.backToChat() })
    bar.contentHorizontalAlignment = .leading
    bar.accessibilityLabel = "Back to chat, \(title)"
    bar.translatesAutoresizingMaskIntoConstraints = false

    let root = UIViewController()
    root.view.addSubview(bar)
    NSLayoutConstraint.activate([
      bar.leadingAnchor.constraint(equalTo: root.view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
      bar.trailingAnchor.constraint(equalTo: root.view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
      // ponytail: fixed clearance for Safari's bottom toolbar (~50pt on iOS 16–27); re-measure if Apple resizes it.
      bar.bottomAnchor.constraint(equalTo: root.view.safeAreaLayoutGuide.bottomAnchor, constant: -60),
      bar.heightAnchor.constraint(equalToConstant: Self.barHeight),
    ])
    let window = PassThroughWindow(windowScene: scene)
    window.windowLevel = .normal + 1
    window.rootViewController = root
    window.isHidden = false // Not key: Safari keeps keyboard focus.
    self.window = window
  }

  private func backToChat() {
    removeBar()
    safari.dismiss(animated: true) { [weak self] in self?.onClose() }
  }

  private func removeBar() {
    window?.isHidden = true
    window = nil
  }

  func safariViewControllerDidFinish(_ controller: SFSafariViewController) {
    removeBar()
    onClose()
  }
}

private final class PassThroughWindow: UIWindow {
  override func hitTest(_ point: CGPoint, with event: UIEvent?) -> UIView? {
    let view = super.hitTest(point, with: event)
    return view === self || view === rootViewController?.view ? nil : view
  }
}
