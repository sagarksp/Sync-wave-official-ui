import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    const details = {
      scope: this.props.name || "Unknown",
      message: error?.message || String(error),
      stack: error?.stack || "",
      componentStack: info?.componentStack || "",
      userAgent: navigator.userAgent,
      time: new Date().toISOString(),
    };
    if ((this.props.name || "").toLowerCase() === "chat") {
      console.error("CHAT_RENDER_ERROR", details);
    }
    console.error("[SyncWave Render Crash]", details);
    try {
      localStorage.setItem("syncwave_last_render_crash", JSON.stringify(details));
    } catch (err) {
      // Logging must never cause another render failure.
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="route-error">
        <span className="eyebrow">Screen Error</span>
        <h2>{this.props.name || "This screen"} failed to render</h2>
        <p>{this.state.error.message || "Unexpected render error"}</p>
        <button className="primary-action" onClick={() => this.setState({ error: null, info: null })}>Try Again</button>
      </div>
    );
  }
}
