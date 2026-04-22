import { useState, useEffect } from "react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (window.google) {
      window.google.accounts.id.initialize({
        client_id: "573360926782-a3pfuc99v6r1tbpk70gj5ru3cip4rl4s.apps.googleusercontent.com",
        callback: handleGoogleLogin,
      });
      window.google.accounts.id.renderButton(
        document.getElementById("google_signin_button"),
        { theme: "outline", size: "large" }
      );
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
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage("Login successful ✔");
        localStorage.setItem("token", data.token);
      } else {
        setMessage(data.error || "Login failed ❌");
      }
    } catch (err) {
      setMessage("Server error ❌");
    }
  };

  const handleGoogleLogin = async (credentialResponse) => {
    try {
      const res = await fetch("http://127.0.0.1:5000/google-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: credentialResponse.credential }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessage("Google login successful ✔");
        localStorage.setItem("token", data.token);
        setTimeout(() => window.location.href = "/imperial-site/", 1000);
      } else {
        setMessage(data.error || "Google login failed ❌");
      }
    } catch (err) {
      setMessage("Server error ❌");
    }
  };

  return (
    <div style={{ maxWidth: "400px", margin: "50px auto", textAlign: "center", padding: "20px" }}>
      <h2>Login</h2>

      <form onSubmit={handleLogin} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: "10px" }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: "10px" }}
        />

        <button
          type="submit"
          style={{
            background: "#1e40af",
            color: "white",
            padding: "10px",
            border: "none",
            borderRadius: "5px",
          }}
        >
          Login
        </button>
      </form>

      <div style={{ margin: "20px 0", textAlign: "center" }}>
        <div id="google_signin_button" style={{ display: "flex", justifyContent: "center" }}></div>
      </div>

      <p style={{ marginTop: "15px" }}>
        <a href="/imperial-site/register" style={{ textDecoration: "underline", color: "#1e40af" }}>
          Create an account
        </a>
      </p>

      <p style={{ marginTop: "15px" }}>{message}</p>
    </div>
  );
}