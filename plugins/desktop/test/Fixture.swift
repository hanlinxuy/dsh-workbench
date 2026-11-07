import Cocoa
let app = NSApplication.shared
app.setActivationPolicy(.accessory)
class Handler: NSObject {
    let input = NSTextField(frame: NSRect(x: 20, y: 100, width: 300, height: 28))
    let output = NSTextField(labelWithString: "Waiting")
    @objc func save(_ sender: Any?) { output.stringValue = "Saved: " + input.stringValue }
}
let handler = Handler()
let window = NSWindow(contentRect: NSRect(x: 50, y: 50, width: 360, height: 180), styleMask: [.titled, .closable], backing: .buffered, defer: false)
window.title = "Workbench Desktop Test"
handler.input.setAccessibilityIdentifier("test-input")
handler.input.setAccessibilityLabel("Test input")
handler.output.frame = NSRect(x: 20, y: 20, width: 320, height: 28)
let button = NSButton(title: "Save test", target: handler, action: #selector(Handler.save(_:)))
button.frame = NSRect(x: 20, y: 60, width: 120, height: 30)
window.contentView!.addSubview(handler.input)
window.contentView!.addSubview(button)
window.contentView!.addSubview(handler.output)
window.orderFrontRegardless()
app.run()
