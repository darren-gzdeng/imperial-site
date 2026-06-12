import { useEffect, useState } from "react";
import { googleLogin, login } from "../api/authApi";
import { setAuthToken } from "../api/client";

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="auth-google-logo">
      <path
        fill="#EA4335"
        d="M12.24 10.285v3.888h5.414c-.234 1.26-.938 2.327-2 3.043l3.234 2.51c1.886-1.74 2.972-4.302 2.972-7.351 0-.716-.064-1.404-.182-2.09H12.24z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.964-.894 6.619-2.418l-3.234-2.51c-.9.604-2.05.96-3.385.96-2.602 0-4.806-1.756-5.592-4.115H3.065v2.585A9.997 9.997 0 0 0 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6.408 13.917A5.997 5.997 0 0 1 6.095 12c0-.666.115-1.312.313-1.917V7.498H3.065A9.997 9.997 0 0 0 2 12c0 1.61.384 3.135 1.065 4.502l3.343-2.585z"
      />
      <path
        fill="#4285F4"
        d="M12 5.968c1.468 0 2.786.505 3.823 1.496l2.868-2.868C16.959 2.98 14.695 2 12 2A9.997 9.997 0 0 0 3.065 7.498l3.343 2.585C7.194 7.724 9.398 5.968 12 5.968z"
      />
    </svg>
  );
}

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [marketingOptIn, setMarketingOptIn] = useState(true);

  useEffect(() => {
    if (window.google) {
      window.google.accounts.id.initialize({
        client_id: "573360926782-a3pfuc99v6r1tbpk70gj5ru3cip4rl4s.apps.googleusercontent.com",
        callback: handleGoogleLogin,
      });
      window.google.accounts.id.renderButton(document.getElementById("google_signin_button"), {
        theme: "outline",
        size: "large",
        text: "signin_with",
      });
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const data = await login({ email, password, marketing_opt_in: marketingOptIn });
      setMessage("Login successful");
      setAuthToken(data.token);
      setTimeout(() => {
        window.location.href = "/imperial-site/account";
      }, 600);
    } catch (err) {
      setMessage(err.message || "Server error");
    }
  };

  const handleGoogleLogin = async (credentialResponse) => {
    try {
      const data = await googleLogin({
        token: credentialResponse.credential,
        marketing_opt_in: marketingOptIn,
      });

      setMessage("Google login successful");
      setAuthToken(data.token);
      setTimeout(() => {
        window.location.href = "/imperial-site/account";
      }, 600);
    } catch (err) {
      setMessage(`Server error: ${err.message}`);
    }
  };

  const handleGoogleButtonClick = () => {
    const googleContainer = document.getElementById("google_signin_button");
    const googleTrigger = googleContainer?.querySelector('div[role="button"], iframe');

    if (googleTrigger instanceof HTMLElement) {
      googleTrigger.click();
      return;
    }

    if (window.google?.accounts?.id) {
      window.google.accounts.id.prompt();
      return;
    }

    setMessage("Google sign-in is not available right now");
  };

  return (
    <div className="auth-page">
      <div className="auth-shell">
        <h1 className="auth-title">Login</h1>

        <button type="button" onClick={handleGoogleButtonClick} className="auth-google-button">
          <GoogleLogo />
          <span className="auth-google-text">Sign in with Google</span>
        </button>

        <div className="auth-hidden-google">
          <div id="google_signin_button"></div>
        </div>

        <div className="auth-divider">
          <div className="auth-divider__line"></div>
          <span className="auth-divider__text">OR</span>
          <div className="auth-divider__line"></div>
        </div>

        <form onSubmit={handleLogin} className="auth-form">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            required
          />

          <a href="/imperial-site/forgot-password" className="auth-helper-link">
            Forgot your password?
          </a>

          <label className="auth-consent">
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              className="auth-checkbox"
            />
            <span>Please tick if you agreed to receive marketing emails.</span>
          </label>

          <div className="auth-submit-row auth-submit-row--spaced">
            <button type="submit" className="auth-submit-button">
              Sign in
            </button>
          </div>
        </form>

        <div className="auth-link-row">
          <a href="/imperial-site/register" className="auth-link">
            Create account
          </a>
        </div>

        {message ? <p className="auth-message">{message}</p> : null}
      </div>
    </div>
  );
}
