import { useEffect, useState } from "react";

const styles = {
  page: {
    padding: "20px 20px 8px",
    background: "#ffffff",
    color: "#1c1e23",
  },
  shell: {
    maxWidth: "540px",
    margin: "0 auto",
    textAlign: "center",
  },
  title: {
    margin: "0 0 34px",
    fontSize: "2.75rem",
    fontWeight: 400,
    letterSpacing: "-0.06em",
    lineHeight: 1,
  },
  googleButton: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
    padding: "0 14px",
    height: "42px",
    border: "1.5px solid #9b9b9b",
    borderRadius: "8px",
    background: "#ffffff",
    cursor: "pointer",
  },
  googleLogo: {
    width: "18px",
    height: "18px",
    flexShrink: 0,
  },
  googleText: {
    flex: 1,
    textAlign: "center",
    fontSize: "0.82rem",
    fontWeight: 400,
    color: "#111111",
    marginRight: "18px",
  },
  dividerRow: {
    display: "flex",
    alignItems: "center",
    gap: "14px",
    margin: "24px 0 24px",
  },
  dividerLine: {
    flex: 1,
    height: "1.5px",
    background: "#1d1d1d",
  },
  dividerText: {
    fontSize: "0.82rem",
    color: "#484848",
    letterSpacing: "0.08em",
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: "14px",
    alignItems: "stretch",
  },
  input: {
    width: "100%",
    height: "56px",
    padding: "0 22px",
    border: "1.5px solid #9b9b9b",
    borderRadius: "14px",
    fontSize: "0.9rem",
    color: "#111111",
    outline: "none",
    background: "#ffffff",
  },
  helperLink: {
    alignSelf: "flex-start",
    marginTop: "-2px",
    background: "transparent",
    border: "none",
    padding: 0,
    color: "#3b3d42",
    fontSize: "0.82rem",
    textDecoration: "underline",
    textUnderlineOffset: "6px",
    cursor: "pointer",
  },
  consentRow: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    marginTop: "2px",
    color: "#666666",
    fontSize: "0.82rem",
    lineHeight: 1.5,
    textAlign: "left",
  },
  checkbox: {
    width: "16px",
    height: "16px",
    margin: 0,
    accentColor: "#1e73ff",
    flexShrink: 0,
  },
  submitWrap: {
    marginTop: "12px",
    display: "flex",
    justifyContent: "center",
  },
  submitButton: {
    minWidth: "148px",
    height: "48px",
    borderRadius: "14px",
    border: "1.5px solid #23252a",
    background: "#7fa8df",
    color: "#ffffff",
    fontSize: "0.92rem",
    fontWeight: 500,
    cursor: "pointer",
  },
  createLinkWrap: {
    marginTop: "10px",
  },
  createLink: {
    color: "#3b3d42",
    fontSize: "0.82rem",
    textDecoration: "underline",
    textUnderlineOffset: "6px",
  },
  message: {
    marginTop: "12px",
    color: "#4b5563",
    fontSize: "0.82rem",
  },
  hiddenGoogleMount: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    opacity: 0,
    pointerEvents: "none",
  },
};

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={styles.googleLogo}>
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
      const res = await fetch("http://127.0.0.1:5000/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password, marketing_opt_in: marketingOptIn }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage("Login successful");
        localStorage.setItem("token", data.token);
        setTimeout(() => {
          window.location.href = "/imperial-site/";
        }, 600);
      } else {
        setMessage(data.error || "Login failed");
      }
    } catch (err) {
      setMessage("Server error");
    }
  };

  const handleGoogleLogin = async (credentialResponse) => {
    try {
      const res = await fetch("http://127.0.0.1:5000/google-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          token: credentialResponse.credential,
          marketing_opt_in: marketingOptIn,
        }),
      });

      const raw = await res.text();
      let data = {};

      try {
        data = raw ? JSON.parse(raw) : {};
      } catch {
        data = { error: raw || "Unexpected server response" };
      }

      if (res.ok) {
        setMessage("Google login successful");
        localStorage.setItem("token", data.token);
        setTimeout(() => {
          window.location.href = "/imperial-site/";
        }, 600);
      } else {
        setMessage(data.error || "Google login failed");
      }
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
    <div style={styles.page}>
      <div style={styles.shell}>
        <h1 style={styles.title}>Login</h1>

        <button type="button" onClick={handleGoogleButtonClick} style={styles.googleButton}>
          <GoogleLogo />
          <span style={styles.googleText}>Sign in with Google</span>
        </button>

        <div style={styles.hiddenGoogleMount}>
          <div id="google_signin_button"></div>
        </div>

        <div style={styles.dividerRow}>
          <div style={styles.dividerLine}></div>
          <span style={styles.dividerText}>OR</span>
          <div style={styles.dividerLine}></div>
        </div>

        <form onSubmit={handleLogin} style={styles.form}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={styles.input}
            required
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={styles.input}
            required
          />

          <a href="/imperial-site/forgot-password" style={styles.helperLink}>
            Forgot your password?
          </a>

          <label style={styles.consentRow}>
            <input
              type="checkbox"
              checked={marketingOptIn}
              onChange={(e) => setMarketingOptIn(e.target.checked)}
              style={styles.checkbox}
            />
            <span>Please tick if you agreed to receive marketing emails.</span>
          </label>

          <div style={styles.submitWrap}>
            <button type="submit" style={styles.submitButton}>
              Sign in
            </button>
          </div>
        </form>

        <div style={styles.createLinkWrap}>
          <a href="/imperial-site/register" style={styles.createLink}>
            Create account
          </a>
        </div>

        {message ? <p style={styles.message}>{message}</p> : null}
      </div>
    </div>
  );
}
